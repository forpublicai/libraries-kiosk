import { DEFAULT_SERVER_BASE_URL } from "../config.js";

const DEFAULT_SETTINGS = {
  serverBaseUrl: DEFAULT_SERVER_BASE_URL,
  currentUsername: '',
  acceptPrompt: 'on'
};

const LOCAL_DEFAULT = {
  identityPrivateKey: null,
  identityPublicKey: null,
  registeredUsername: null
};

function setStatus(message, isError = false) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
  if (message) setTimeout(() => { if (statusEl.textContent === message) { statusEl.textContent = ''; statusEl.classList.remove('error'); } }, 3000);
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  document.getElementById('current-username').value = stored.currentUsername;
}

async function loadIdentity() {
  const state = await chrome.storage.local.get(LOCAL_DEFAULT);
  const el = document.getElementById('identity-status');
  el.textContent = state.identityPublicKey ? `Identity ready (${state.registeredUsername || 'not registered'})` : 'Identity not yet generated.';
}

async function saveSettings(e) {
  e.preventDefault();
  // Preserve stored serverBaseUrl; field removed from UI
  const prev = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const currentUsername = document.getElementById('current-username').value.trim();
  if (!currentUsername) { setStatus('Please enter a Kiosk Name.', true); return; }
  await chrome.storage.sync.set({ serverBaseUrl: prev.serverBaseUrl, currentUsername });
  setStatus('Settings saved.');
  chrome.runtime.sendMessage({ type: 'register-identity' }, (res) => {
    if (chrome.runtime.lastError) {
      setStatus(chrome.runtime.lastError.message || 'Failed to register identity', true);
      return;
    }
    if (res && res.error) {
      setStatus(res.error, true);
      return;
    }
    setStatus('Identity registered.');
    loadIdentity().catch(() => {});
  });
}

async function init() {
  try {
    await loadSettings();
    await loadIdentity();
    const form = document.getElementById('settings-form');
    if (form) form.addEventListener('submit', saveSettings);
    // Auto-refresh identity text when background updates local storage
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes.identityPublicKey || changes.registeredUsername)) {
        loadIdentity().catch(() => {});
      }
    });
  } catch (e) {
    try { setStatus(e?.message || 'Failed to initialize settings', true); } catch (_) {}
    console.error(e);
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
