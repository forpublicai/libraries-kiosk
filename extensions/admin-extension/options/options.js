import { DEFAULT_SERVER_BASE_URL } from "../config.js";

const DEFAULT_SETTINGS = {
  serverBaseUrl: DEFAULT_SERVER_BASE_URL,
  currentUsername: "",
  ttlSeconds: 600,
  acceptPrompt: "on"
};

const LOCAL_DEFAULT = {
  identityPrivateKey: null,
  identityPublicKey: null,
  authSecret: null,
  registeredUsername: null
};

const HISTORY_KEY = "adminHistory";

async function getLocalHistory() {
  const obj = await chrome.storage.local.get({ [HISTORY_KEY]: [] });
  return Array.isArray(obj[HISTORY_KEY]) ? obj[HISTORY_KEY] : [];
}

async function saveLocalHistory(items) {
  await chrome.storage.local.set({ [HISTORY_KEY]: items });
}

function mergeHistory(localItems, serverItems) {
  const map = new Map(localItems.map((s) => [s.id, s]));
  for (const s of serverItems || []) {
    const prev = map.get(s.id) || {};
    map.set(s.id, {
      ...prev,
      ...s,
    });
  }
  // Return newest first
  return Array.from(map.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function formatRelativeTime(isoDate) {
  if (!isoDate) {
    return "unknown time";
  }
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const units = [
    { unit: "day", ms: 86400000 },
    { unit: "hour", ms: 3600000 },
    { unit: "minute", ms: 60000 },
    { unit: "second", ms: 1000 }
  ];
  for (const { unit, ms } of units) {
    const value = Math.round(diffMs / ms);
    if (Math.abs(value) >= 1) {
      return formatter.format(-value, unit);
    }
  }
  return "just now";
}

function renderHistory(items) {
  const container = document.getElementById("history-list");
  container.innerHTML = "";
  if (!items?.length) {
    container.textContent = "No shares yet.";
    return;
  }
  const list = document.createElement("ul");
  list.style.listStyle = "none";
  list.style.padding = "0";
  list.style.margin = "12px 0 0";
  items.forEach((session) => {
    const li = document.createElement("li");
    li.style.padding = "6px 0";
    li.style.borderBottom = "1px dashed #dadce0";
    const isExpired = session.expiresAt && (new Date(session.expiresAt).getTime() < Date.now());
    const status = session.revokedAt ? "revoked" : (isExpired ? "expired" : (session.acceptedAt ? "accepted" : "pending"));
    const link = session.url || (session.targetOrigin ? `${session.targetOrigin}${session.targetPath || '/'}` : '');
    const linkHtml = link ? ` • <a href="${link}" target="_blank" class="mono">${link}</a>` : '';
    const terminateBtn = session.revokedAt ? '' : ` <button class="small terminate" data-id="${session.id}">Terminate</button>`;
    const deleteBtn = ` <button class="small delete" data-id="${session.id}">Remove</button>`;
    li.innerHTML = `<strong>${session.recipient}</strong>${linkHtml} • ${formatRelativeTime(session.createdAt)} • <span class="hint">${status}</span>${terminateBtn}${deleteBtn}`;
    list.appendChild(li);
  });
  container.appendChild(list);
}

function setStatus(message, isError = false) {
  const statusEl = document.getElementById("status");
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
  if (message) {
    setTimeout(() => {
      if (statusEl.textContent === message) {
        statusEl.textContent = "";
        statusEl.classList.remove("error");
      }
    }, 3000);
  }
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  document.getElementById("current-username").value = stored.currentUsername;
  document.getElementById("ttl-seconds").value = Number(stored.ttlSeconds) || 600;
  document.getElementById("accept-prompt").value = stored.acceptPrompt || "on";
}

async function loadIdentity() {
  const state = await chrome.storage.local.get(LOCAL_DEFAULT);
  const statusEl = document.getElementById("identity-status");
  if (state.identityPublicKey) {
    const username = state.registeredUsername || "not registered";
    statusEl.textContent = `Identity ready (${username}).`;
  } else {
    statusEl.textContent = "Identity not yet generated.";
  }
}

async function loadHistory() {
  try {
    const local = await getLocalHistory();
    // Render local first for instant UI
    renderHistory(local);

    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    const username = settings.currentUsername?.trim();
    if (!username) return; // Keep local only if no username yet
    const base = settings.serverBaseUrl || DEFAULT_SERVER_BASE_URL;
    const authSecret = (await chrome.storage.local.get({ authSecret: null }))?.authSecret;
    const url = `${base.replace(/\/+$/, '')}/v1/sessions?sender=${encodeURIComponent(username)}&authSecret=${encodeURIComponent(authSecret || '')}&limit=100`;
    const resp = await fetch(url);
    if (!resp.ok) return; // Keep local if server fails
    const data = await resp.json();
    const merged = mergeHistory(local, data.sessions || []);
    await saveLocalHistory(merged);
    renderHistory(merged);
  } catch (error) {
    console.error("Failed to load history", error);
    const container = document.getElementById("history-list");
    container.textContent = error?.message || "Failed to load history.";
  }
}

async function saveSettings(event) {
  event.preventDefault();
  // Preserve previously stored serverBaseUrl; field removed from UI
  const prev = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const currentUsername = document.getElementById("current-username").value.trim();
  const ttlSeconds = Math.max(60, Math.min(3600, Number(document.getElementById("ttl-seconds").value) || 600));
  const acceptPrompt = document.getElementById("accept-prompt").value;

  await chrome.storage.sync.set({ serverBaseUrl: prev.serverBaseUrl, currentUsername, ttlSeconds, acceptPrompt });
  setStatus("Settings saved.");

  chrome.runtime.sendMessage({ type: "register-identity" }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus(chrome.runtime.lastError.message, true);
      return;
    }
    if (response?.error) {
      setStatus(response.error, true);
      return;
    }
    setStatus("Identity registered.");
    loadIdentity().catch((error) => console.error("Failed to refresh identity", error));
    loadHistory().catch((error) => console.error("Failed to refresh history", error));
  });
}

window.addEventListener("DOMContentLoaded", () => {
  loadSettings().catch((error) => console.error("Failed to load settings", error));
  loadIdentity().catch((error) => console.error("Failed to load identity", error));
  loadHistory().catch((error) => console.error("Failed to load history", error));
  document.getElementById("settings-form").addEventListener("submit", saveSettings);
  document.getElementById("refresh-history").addEventListener("click", () => {
    loadHistory().catch((error) => console.error("Failed to load history", error));
  });
  document.getElementById("history-list").addEventListener("click", async (e) => {
    const tbtn = e.target.closest('button.terminate');
    if (tbtn) {
      const id = tbtn.getAttribute('data-id');
      if (!id) return;
      try {
        // Button state
        const prev = tbtn.textContent; tbtn.disabled = true; tbtn.textContent = 'Terminating…';
        const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
        const base = settings.serverBaseUrl || DEFAULT_SERVER_BASE_URL;
        const username = settings.currentUsername?.trim();
        const authSecret = (await chrome.storage.local.get({ authSecret: null }))?.authSecret;
        const resp = await fetch(`${base.replace(/\/+$/, '')}/v1/sessions/${encodeURIComponent(id)}/revoke`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, authSecret })
        });
        // Even if server fails (404/410), we still keep the item locally; just refresh view
        if (!resp.ok) console.warn('Terminate failed with status', resp.status);
        // Update local status to revoked
        const local = await getLocalHistory();
        const next = local.map((s) => s.id === id ? { ...s, revokedAt: (new Date()).toISOString() } : s);
        await saveLocalHistory(next);
        renderHistory(next);
        tbtn.textContent = 'Terminated';
        setTimeout(() => { tbtn.textContent = prev; tbtn.disabled = false; }, 800);
      } catch (err) {
        console.error('Terminate failed', err);
        alert(err?.message || 'Terminate failed');
        tbtn.disabled = false;
      }
      return;
    }

    const dbtn = e.target.closest('button.delete');
    if (dbtn) {
      const id = dbtn.getAttribute('data-id');
      if (!id) return;
      try {
        const prev = dbtn.textContent; dbtn.disabled = true; dbtn.textContent = 'Removing…';
        // Remove locally first
        const local = await getLocalHistory();
        const next = local.filter((s) => s.id !== id);
        await saveLocalHistory(next);
        renderHistory(next);
        // Best-effort server delete (ignore errors)
        try {
          const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
          const base = settings.serverBaseUrl || DEFAULT_SERVER_BASE_URL;
          const username = settings.currentUsername?.trim();
          const authSecret = (await chrome.storage.local.get({ authSecret: null }))?.authSecret;
          await fetch(`${base.replace(/\/+$/, '')}/v1/sessions/${encodeURIComponent(id)}/delete`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, authSecret })
          });
        } catch (_) {}
        dbtn.textContent = 'Removed';
        setTimeout(() => { dbtn.textContent = prev; dbtn.disabled = false; }, 600);
      } catch (err) {
        console.error('Remove failed', err);
        alert(err?.message || 'Remove failed');
        dbtn.disabled = false;
      }
    }
  });
});
