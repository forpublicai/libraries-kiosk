import { DEFAULT_SERVER_BASE_URL } from "../config.js";

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

document.getElementById('check-inbox').addEventListener('click', () => {
  const b = document.getElementById('check-inbox');
  if (b) { b.disabled = true; const prev = b.textContent; b.textContent = 'Checking…'; }
  chrome.runtime.sendMessage({ type: 'check-inbox-now' }, () => {
    if (b) { b.textContent = 'Done'; setTimeout(() => { b.textContent = 'Check now'; b.disabled = false; }, 700); }
  });
});

document.getElementById('request-access').addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab?.url?.startsWith('http')) return;
  const url = new URL(tab.url);
  const stored = await chrome.storage.sync.get({ serverBaseUrl: DEFAULT_SERVER_BASE_URL, currentUsername: '' });
  const state = await chrome.storage.local.get({ authSecret: null });
  const adminUsername = document.getElementById('admin-username').value.trim();
  const statusEl = document.getElementById('request-status');
  if (!adminUsername) {
    if (statusEl) { statusEl.textContent = 'Enter an admin username.'; }
    return;
  }
  const body = {
    username: stored.currentUsername,
    authSecret: state.authSecret || '',
    origin: url.origin,
    url: tab.url,
    targetAdmin: adminUsername || null
  };
  try {
    const btn = document.getElementById('request-access');
    if (btn) { btn.disabled = true; const prev = btn.textContent; btn.textContent = 'Sending…'; setTimeout(() => {}, 0); }
    const resp = await fetch(`${(stored.serverBaseUrl || DEFAULT_SERVER_BASE_URL).replace(/\/+$/, '')}/v1/requests`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!resp.ok) {
      let msg = 'Request failed';
      try { const err = await resp.json(); if (err && err.error) msg = err.error; } catch (_) {}
      throw new Error(msg);
    }
    if (statusEl) { statusEl.textContent = 'Request sent.'; setTimeout(() => { statusEl.textContent = ''; }, 2000); }
    if (btn) { btn.textContent = 'Sent'; setTimeout(() => { btn.textContent = 'Request access for this page'; btn.disabled = false; }, 1200); }
  } catch (e) {
    if (statusEl) { statusEl.textContent = e && e.message ? e.message : 'Failed to send request'; }
    const btn = document.getElementById('request-access'); if (btn) { btn.textContent = 'Request access for this page'; btn.disabled = false; }
  }
});

document.getElementById('open-options').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

async function refreshPendingIndicator() {
  try {
    const stored = await chrome.storage.sync.get({ serverBaseUrl: DEFAULT_SERVER_BASE_URL, currentUsername: '' });
    const base = stored.serverBaseUrl || DEFAULT_SERVER_BASE_URL;
    const username = stored.currentUsername?.trim();
    if (!username) return;
    const res = await fetch(`${base.replace(/\/+$/, '')}/v1/inbox/poll?recipient=${encodeURIComponent(username)}&limit=10`);
    if (!res.ok) return;
    const data = await res.json();
    const hasPending = Array.isArray(data.items) && data.items.length > 0;
    const ind = document.getElementById('pending-indicator');
    if (ind) ind.style.display = hasPending ? 'block' : 'none';
  } catch (_) {}
}

refreshPendingIndicator().catch(() => {});
