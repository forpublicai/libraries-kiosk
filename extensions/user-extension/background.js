import { DEFAULT_SERVER_BASE_URL, API_TIMEOUT_MS } from "./config.js";
import { generateIdentity, encryptPayload, decryptPayload, serializeCipher, deserializeCipher } from "./lib/crypto.js";

const DEFAULT_SETTINGS = {
  serverBaseUrl: DEFAULT_SERVER_BASE_URL,
  currentUsername: "",
  ttlSeconds: 600,
  acceptPrompt: "on"
};

const LOCAL_STATE_DEFAULT = {
  identityPrivateKey: null,
  identityPublicKey: null,
  authSecret: null,
  registeredUsername: null
};

const processedTokens = new Set();
const processedInboxIds = new Set();

async function getSettings() {
  return chrome.storage.sync.get(DEFAULT_SETTINGS);
}

async function getLocalState() {
  return chrome.storage.local.get(LOCAL_STATE_DEFAULT);
}

async function saveLocalState(partial) {
  return chrome.storage.local.set(partial);
}

async function ensureIdentity() {
  const state = await getLocalState();
  if (state.identityPrivateKey && state.identityPublicKey) {
    return state;
  }
  const keys = await generateIdentity();
  const nextState = {
    identityPrivateKey: keys.privateJwk,
    identityPublicKey: keys.publicJwk,
    registeredUsername: state.registeredUsername || null,
    authSecret: state.authSecret || null
  };
  await saveLocalState(nextState);
  return nextState;
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    timeoutPromise
  ]);
}

async function apiFetch(baseUrl, path, options = {}) {
  const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
  const mergedOptions = Object.assign(
    {
      headers: { "Content-Type": "application/json" }
    },
    options
  );
  const response = await withTimeout(fetch(url, mergedOptions), API_TIMEOUT_MS, "API request timed out.");
  const contentType = response.headers.get("content-type") || "";
  const parseJson = () => (contentType.includes("application/json") ? response.json() : response.text());
  if (!response.ok) {
    const errorPayload = await parseJson();
    const message = typeof errorPayload === "string"
      ? errorPayload
      : (errorPayload?.error || errorPayload?.message || (Array.isArray(errorPayload?.errors) ? errorPayload.errors.join(", ") : undefined));
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  if (response.status === 204) return null;
  return parseJson();
}

async function registerIdentityIfNeeded() {
  const settings = await getSettings();
  const username = settings.currentUsername?.trim();
  if (!username) throw new Error("Set your username in extension options.");
  const state = await ensureIdentity();
  if (state.registeredUsername === username && state.authSecret) return state;
  const baseUrl = settings.serverBaseUrl || DEFAULT_SERVER_BASE_URL;
  const body = { publicKey: state.identityPublicKey };
  if (state.authSecret && state.registeredUsername === username) body.authSecret = state.authSecret;
  const response = await apiFetch(baseUrl, `/v1/users/${encodeURIComponent(username)}`, { method: "POST", body: JSON.stringify(body) });
  const nextState = {
    identityPrivateKey: state.identityPrivateKey,
    identityPublicKey: state.identityPublicKey,
    registeredUsername: username,
    authSecret: response.authSecret || state.authSecret || null
  };
  await saveLocalState(nextState);
  return nextState;
}

async function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error("Timed out waiting for tab to load.")); }, 20000);
    function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === "complete") { clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve(); }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function setCookies(cookies, referenceOrigin) {
  if (!Array.isArray(cookies)) return;
  const referenceUrl = referenceOrigin ? new URL(referenceOrigin) : null;
  for (const cookie of cookies) {
    try {
      const domain = cookie.domain ? cookie.domain.replace(/^\./, "") : referenceUrl?.hostname;
      const path = cookie.path || "/";
      const scheme = cookie.secure ? "https" : "http";
      const host = domain || referenceUrl?.hostname;
      if (!host) continue;
      const url = `${scheme}://${host}${path.startsWith("/") ? path : `/${path}`}`;
      const setOptions = { url, name: cookie.name, value: cookie.value, path, secure: !!cookie.secure, httpOnly: !!cookie.httpOnly };
      if (cookie.domain) setOptions.domain = cookie.domain;
      if (cookie.expirationDate) setOptions.expirationDate = cookie.expirationDate;
      if (cookie.sameSite && cookie.sameSite !== "unspecified") setOptions.sameSite = cookie.sameSite;
      if (cookie.storeId) setOptions.storeId = cookie.storeId;
      await chrome.cookies.set(setOptions);
    } catch (_) {}
  }
}

async function restoreStorage(tabId, storageData) {
  if (!storageData) return;
  await chrome.scripting.executeScript({
    target: { tabId },
    func: ({ localEntries, sessionEntries }) => {
      if (Array.isArray(localEntries)) localEntries.forEach(([k, v]) => { try { localStorage.setItem(k, v); } catch(_){} });
      if (Array.isArray(sessionEntries)) sessionEntries.forEach(([k, v]) => { try { sessionStorage.setItem(k, v); } catch(_){} });
    },
    args: [{ localEntries: storageData.localStorage || [], sessionEntries: storageData.sessionStorage || [] }]
  });
}

async function notify(title, message) {
  try {
    const iconUrl = chrome.runtime.getURL("icons/icon128.png");
    await chrome.notifications.create({ type: "basic", iconUrl, title, message });
  } catch (_) {}
}

async function maybeScheduleLogout(bundle, sessionData, idOverride) {
  const duration = Number(bundle?.meta?.sessionDurationSec || bundle?.sessionDurationSec || 0);
  if (!duration || duration <= 0) return;
  const jobId = idOverride || (bundle?.token || `${Date.now()}`);
  const cleanup = {
    id: jobId,
    targetOrigin: sessionData.targetOrigin || new URL(sessionData.url).origin,
    cookies: (sessionData.cookies || []).map(c => ({ name: c.name, domain: c.domain, path: c.path || '/', secure: !!c.secure })),
    localStorageKeys: (sessionData.localStorage || []).map(([k]) => k),
    sessionStorageKeys: (sessionData.sessionStorage || []).map(([k]) => k)
  };
  const key = 'logoutJobs';
  const stored = (await chrome.storage.local.get({ [key]: [] }))[key] || [];
  stored.push(cleanup);
  await chrome.storage.local.set({ [key]: stored });
  const when = Date.now() + duration * 1000;
  await chrome.alarms.create(`logout:${jobId}`, { when });
}

async function logoutOriginNow(targetOrigin) {
  try {
    const u = new URL(targetOrigin);
    const host = u.hostname;
    const all = await chrome.cookies.getAll({ domain: host });
    for (const c of all) {
      const scheme = c.secure ? 'https' : 'http';
      const url = `${scheme}://${(c.domain || host).replace(/^\./,'')}${c.path || '/'}`;
      try { await chrome.cookies.remove({ url, name: c.name }); } catch (_) {}
    }
    const temp = await chrome.tabs.create({ url: targetOrigin, active: false });
    await waitForTabComplete(temp.id);
    await chrome.scripting.executeScript({ target: { tabId: temp.id }, func: () => { try { localStorage.clear(); } catch(_){} try { sessionStorage.clear(); } catch(_){} } });
    await chrome.tabs.remove(temp.id);
  } catch (_) {}
}

async function handleSessionAcceptance(details) {
  const settings = await getSettings();
  let baseUrl;
  try { baseUrl = new URL(details.url).origin; } catch (_) { baseUrl = settings.serverBaseUrl || DEFAULT_SERVER_BASE_URL; }
  const username = settings.currentUsername?.trim();
  if (!username) { await notify("PublicPass", "Set your username in extension options before accepting sessions."); return; }

  const state = await ensureIdentity();
  const url = new URL(details.url);
  const token = url.pathname.split("/").pop();
  if (!token || processedTokens.has(token)) return;

  try {
    processedTokens.add(token);
    const shareResponse = await apiFetch(baseUrl, `/v1/shares/${encodeURIComponent(token)}`);
    const bundle = deserializeCipher(shareResponse.cipher);
    const sessionData = await decryptPayload({ bundle, recipientPrivateJwk: state.identityPrivateKey, targetOrigin: shareResponse.meta?.targetOrigin || bundle.targetOrigin });
    await setCookies(sessionData.cookies, sessionData.targetOrigin || sessionData.url);
    const targetUrl = sessionData.url || `${sessionData.targetOrigin}${sessionData.targetPath || '/'}`;
    const newTab = await chrome.tabs.create({ url: targetUrl, active: true });
    await waitForTabComplete(newTab.id);
    try { await restoreStorage(newTab.id, { localStorage: sessionData.localStorage, sessionStorage: sessionData.sessionStorage }); }
    catch (_) { try { await notify('PublicPass', 'Storage restore failed; cookies applied'); } catch(_){} }
    await apiFetch(baseUrl, `/v1/shares/${encodeURIComponent(token)}/consume`, { method: "POST" });
    await maybeScheduleLogout(bundle, sessionData);
    await notify("PublicPass", "Session accepted. You should be logged in.");
    try { await chrome.tabs.remove(details.tabId); } catch (_) {}
  } catch (error) {
    await notify("PublicPass", `Failed to accept session: ${error.message}`);
    processedTokens.delete(token);
  }
}

async function pollInboxOnce() {
  const settings = await getSettings();
  const baseUrl = settings.serverBaseUrl || DEFAULT_SERVER_BASE_URL;
  const username = settings.currentUsername?.trim();
  if (!username) return;
  try {
    const res = await apiFetch(baseUrl, `/v1/inbox/poll?recipient=${encodeURIComponent(username)}&limit=10`);
    const toAck = [];
    for (const item of res.items || []) {
      if (processedInboxIds.has(item.id)) continue;
      try {
        const type = (item.meta?.type || 'share');
        if (type === 'revoke') {
          const origin = item.meta?.targetOrigin;
          if (origin) { await logoutOriginNow(origin); await notify('PublicPass', 'Session revoked by admin. You have been logged out.'); }
          processedInboxIds.add(item.id);
          toAck.push(item.id);
          continue;
        }
        const bundle = deserializeCipher(item.cipher);
        const state = await ensureIdentity();
        const sessionData = await decryptPayload({ bundle, recipientPrivateJwk: state.identityPrivateKey, targetOrigin: item.meta?.targetOrigin || bundle.targetOrigin });
        await setCookies(sessionData.cookies, sessionData.targetOrigin || sessionData.url);
        const targetUrl = sessionData.url || `${sessionData.targetOrigin}${sessionData.targetPath || '/'}`;
        const newTab = await chrome.tabs.create({ url: targetUrl, active: true });
        await waitForTabComplete(newTab.id);
        await restoreStorage(newTab.id, { localStorage: sessionData.localStorage, sessionStorage: sessionData.sessionStorage });
        await maybeScheduleLogout({ meta: { sessionDurationSec: item.meta?.sessionDurationSec || 0 }, token: `inbox:${item.id}` }, sessionData, `inbox:${item.id}`);
        if (item.meta?.sessionId) { try { await apiFetch(baseUrl, `/v1/sessions/${encodeURIComponent(item.meta.sessionId)}/accepted`, { method: 'POST' }); } catch(_){} }
        processedInboxIds.add(item.id);
        toAck.push(item.id);
        await notify('PublicPass', `Session received from ${item.meta?.sender || 'someone'}`);
      } catch (e) {
        console.warn('Failed to process inbox item', item.id, e);
      }
    }
    if (toAck.length) await apiFetch(baseUrl, '/v1/inbox/ack', { method: 'POST', body: JSON.stringify({ recipient: username, ids: toAck }) });
  } catch (e) {
    console.warn('Inbox poll failed', e);
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('logout:')) {
    const id = alarm.name.substring('logout:'.length);
    const key = 'logoutJobs';
    const stored = (await chrome.storage.local.get({ [key]: [] }))[key] || [];
    const job = stored.find(j => j.id === id);
    const remaining = stored.filter(j => j.id !== id);
    await chrome.storage.local.set({ [key]: remaining });
    if (!job) return;
    try {
      for (const c of job.cookies || []) {
        const scheme = c.secure ? 'https' : 'http';
        const host = c.domain ? c.domain.replace(/^\./, '') : new URL(job.targetOrigin).hostname;
        const url = `${scheme}://${host}${c.path || '/'}`;
        try { await chrome.cookies.remove({ url, name: c.name }); } catch (e) {}
      }
      const temp = await chrome.tabs.create({ url: job.targetOrigin, active: false });
      await waitForTabComplete(temp.id);
      await chrome.scripting.executeScript({ target: { tabId: temp.id }, func: ({ localKeys, sessionKeys }) => {
        try { localKeys.forEach(k => window.localStorage.removeItem(k)); } catch (_) {}
        try { sessionKeys.forEach(k => window.sessionStorage.removeItem(k)); } catch (_) {}
      }, args: [{ localKeys: job.localStorageKeys || [], sessionKeys: job.sessionStorageKeys || [] }] });
      await chrome.tabs.remove(temp.id);
      await notify('PublicPass', 'Session auto-logout complete');
    } catch (e) { console.warn('Auto-logout failed', e); }
  }
});

// Periodic inbox polling to auto-apply incoming shares and revokes
chrome.alarms.create('pp-inbox-poll', { periodInMinutes: 3 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pp-inbox-poll') {
    pollInboxOnce().catch(() => {});
  }
});

// Also poll immediately on startup/installed for quicker reaction to revokes
try {
  chrome.runtime.onStartup.addListener(() => { pollInboxOnce().catch(() => {}); });
} catch (_) {}
try {
  chrome.runtime.onInstalled.addListener(() => { pollInboxOnce().catch(() => {}); });
} catch (_) {}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'check-inbox-now') {
    pollInboxOnce().then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  if (message?.type === 'register-identity') {
    registerIdentityIfNeeded().then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  return undefined;
});

chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId !== 0) return;
  getSettings().then(async (settings) => {
    let targetUrl; try { targetUrl = new URL(details.url); } catch (_) { return; }
    if (!/^https?:$/.test(targetUrl.protocol)) return;
    if (!targetUrl.pathname.startsWith('/session/')) return;
    const token = targetUrl.pathname.split('/').pop();
    if (!token || processedTokens.has(token)) return;
    if (settings.acceptPrompt === 'on') {
      // For simplicity, auto-accept if prompt is off; otherwise show a minimal notification
      const iconUrl = chrome.runtime.getURL('icons/icon128.png');
      chrome.notifications.create(`accept:${token}`, { type: 'basic', iconUrl, title: 'PublicPass', message: 'Incoming session link. Accept?', buttons: [{ title: 'Accept' }, { title: 'Dismiss' }] });
      const map = (self.__pendingAccepts = self.__pendingAccepts || new Map());
      map.set(token, details);
    } else {
      handleSessionAcceptance(details).catch(console.error);
    }
  }).catch(() => {});
}, { url: [{ urlMatches: ".*" }] });

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (!notificationId.startsWith('accept:')) return;
  const token = notificationId.substring('accept:'.length);
  const map = (self.__pendingAccepts = self.__pendingAccepts || new Map());
  const details = map.get(token);
  map.delete(token);
  chrome.notifications.clear(notificationId);
  if (!details) return;
  if (buttonIndex === 0) handleSessionAcceptance(details).catch(console.error);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes.currentUsername || changes.serverBaseUrl)) {
    registerIdentityIfNeeded().catch(() => {});
  }
});
