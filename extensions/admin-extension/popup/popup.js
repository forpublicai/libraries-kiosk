import { DEFAULT_SERVER_BASE_URL } from "../config.js";

const DEFAULT_SETTINGS = {
  serverBaseUrl: DEFAULT_SERVER_BASE_URL,
  currentUsername: "",
  ttlSeconds: 600,
  acceptPrompt: "on"
};

async function getSettings() {
  return chrome.storage.sync.get(DEFAULT_SETTINGS);
}

function el(id) { return document.getElementById(id); }

function renderList(container, items, renderRow) {
  container.innerHTML = "";
  if (!items || !items.length) {
    container.textContent = "No items.";
    return;
  }
  items.forEach((it) => container.appendChild(renderRow(it)));
}

function row(html) {
  const div = document.createElement('div');
  div.className = 'row';
  div.innerHTML = html;
  return div;
}

async function sendShare(e) {
  e.preventDefault();
  const btn = el('send-btn');
  const recipientUsername = el('recipient-username').value.trim();
  const sessionDurationSec = Number(el('session-duration').value) || 0;
  const payload = { recipientUsername, deliveryMethod: 'direct', sessionDurationSec };
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    const res = await chrome.runtime.sendMessage({ type: 'share-session', payload });
    if (res?.error) throw new Error(res.error);
    if (btn) { btn.textContent = 'Sent'; setTimeout(() => { btn.textContent = 'Send Session'; btn.disabled = false; }, 1500); }
  } catch (err) {
    if (btn) { btn.textContent = 'Send Session'; btn.disabled = false; }
    alert(err?.message || 'Failed to send');
  }
}

async function refreshRequests() {
  const settings = await getSettings();
  const base = settings.serverBaseUrl || DEFAULT_SERVER_BASE_URL;
  const user = settings.currentUsername;
  const authSecret = (await chrome.storage.local.get({ authSecret: null }))?.authSecret;
  const url = `${base.replace(/\/+$/, '')}/v1/requests/poll?username=${encodeURIComponent(user)}&authSecret=${encodeURIComponent(authSecret || '')}&limit=50`;
  const resp = await fetch(url);
  const data = resp.ok ? await resp.json() : { items: [] };
  const list = el('requests');
  renderList(list, data.items || [], (it) => {
    const when = new Date(it.createdAt).toLocaleTimeString();
    const link = it.url || it.origin;
    const linkHtml = link ? `<a href="${link}" target="_blank" class=\"mono\">${link}</a>` : '';
    const target = it.targetAdmin ? `<div class=\"hint\">For ${it.targetAdmin}</div>` : '';
    const delBtn = `<button class=\"small delete-request\" data-id=\"${it.id}\">Delete</button>`;
    const d = row(`<div><strong>${it.requester}</strong> — ${linkHtml}${target}</div><div>${delBtn}<div class=\"hint\" style=\"text-align:right\">${when}</div></div>`);
    return d;
  });
  list.querySelectorAll('button.delete-request').forEach((b) => {
    b.addEventListener('click', async () => {
      const id = b.getAttribute('data-id');
      if (!id) return;
      try {
        b.disabled = true; const prev = b.textContent; b.textContent = 'Deleting…';
        const settings = await getSettings();
        const base = settings.serverBaseUrl || DEFAULT_SERVER_BASE_URL;
        const user = settings.currentUsername;
        const authSecret = (await chrome.storage.local.get({ authSecret: null }))?.authSecret;
        const body = { username: user, authSecret, ids: [id] };
        const resp2 = await fetch(`${base.replace(/\/+$/, '')}/v1/requests/ack`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        if (!resp2.ok) throw new Error('Failed to delete');
        b.textContent = 'Deleted';
        setTimeout(() => { refreshRequests().catch(() => {}); }, 400);
      } catch (e) { alert(e?.message || 'Delete failed'); }
    });
  });
}

el('share-form').addEventListener('submit', sendShare);

el('refresh-requests').addEventListener('click', async () => {
  const btn = el('refresh-requests');
  try {
    if (btn) { btn.disabled = true; const prev = btn.textContent; btn.textContent = 'Refreshing…'; await refreshRequests(); btn.textContent = 'Done'; setTimeout(() => { btn.textContent = prev; btn.disabled = false; }, 700); }
    else { await refreshRequests(); }
  } catch (e) {
    if (btn) { btn.textContent = 'Refresh'; btn.disabled = false; }
  }
});

el('open-options').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

// Initial load
refreshRequests().catch(console.error);
