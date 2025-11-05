const cryptoObj = crypto || self.crypto;

function generateToken(byteLength = 24) {
  const bytes = new Uint8Array(byteLength);
  cryptoObj.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const DEFAULT_MAX_PAYLOAD = 8 * 1024 * 1024; // 8 MB
const DEFAULT_MAX_TTL = 60 * 60; // 1 hour
const DEFAULT_TTL = 10 * 60; // 10 minutes

function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...extraHeaders,
    },
  });
}

function corsHeaders(env, origin) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
  if (allowed.includes('*')) {
    return {
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Credentials': 'true',
    };
  }
  if (origin && allowed.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    };
  }
  return {};
}

async function hashSecret(secret) {
  const data = new TextEncoder().encode(secret);
  const digest = await cryptoObj.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function validateUsername(username) {
  return /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,63})$/.test(username || '');
}

function parseJSON(request) {
  return request.json().catch(() => null);
}

async function randomSecret(bytes = 32) {
  const array = new Uint8Array(bytes);
  cryptoObj.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replace(/=+$/, '');
}

function parseAdmins(env) {
  return (env.ADMIN_USERS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

async function verifyAuth(env, username, authSecret) {
  if (!validateUsername(username) || !authSecret) return false;
  const record = await env.USERS_KV.get(username, 'json');
  if (!record || !record.authHash) return false;
  const hashed = await hashSecret(authSecret);
  return hashed === record.authHash;
}

async function requireAdmin(env, user, secret) {
  const admins = parseAdmins(env);
  // Dev-friendly wildcard: if ADMIN_USERS is empty or contains '*',
  // treat any valid, authenticated user as an admin.
  const wildcard = admins.length === 0 || admins.includes('*');
  if (!wildcard && !admins.includes(user)) return false;
  return verifyAuth(env, user, secret);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(env, origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || 'content-type',
          ...cors,
        },
      });
    }

    const send = (status, body) => jsonResponse(status, body, cors);

    try {
      // Human-friendly landing page for one-time session links
      if (url.pathname.startsWith('/session/')) {
        const token = url.pathname.split('/')[2];
        const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PublicPass Session</title>
  <style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Ubuntu,sans-serif;margin:0;padding:48px;background:#f8f9fb;color:#202124}main{max-width:560px;margin:0 auto;background:#fff;border:1px solid #e0e3e7;border-radius:8px;padding:24px;box-shadow:0 1px 2px rgba(0,0,0,.04)}h1{font-size:20px;margin:0 0 8px}p{margin:8px 0;color:#444}code{background:#f1f3f4;padding:.2em .4em;border-radius:4px}.hint{font-size:13px;color:#5f6368}</style>
</head>
<body>
  <main>
    <h1>PublicPass</h1>
    <p>Ready to import this session.</p>
    <p class="hint">If nothing happens, make sure the PublicPass extension is installed and configured with your username. You may also click the extension icon to accept.</p>
    <p>Token: <code>${token ? token.slice(0, 8) + '…' : 'unknown'}</code></p>
  </main>
</body>
</html>`;
        return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
      }

      if (url.pathname.startsWith('/v1/users/')) {
        const username = decodeURIComponent(url.pathname.replace('/v1/users/', ''));
        if (!validateUsername(username)) {
          return send(400, { error: 'Invalid username' });
        }
        if (request.method === 'GET') {
          const entry = await env.USERS_KV.get(username, 'json');
          if (!entry) {
            return send(404, { error: 'Not found' });
          }
          return send(200, { username, publicKey: entry.publicKey });
        }
        if (request.method === 'POST') {
          const body = await parseJSON(request);
          if (!body || !body.publicKey) {
            return send(400, { error: 'publicKey is required' });
          }
          const existing = await env.USERS_KV.get(username, 'json');
          let authSecret = body.authSecret || '';
          if (existing) {
            if (!authSecret) {
              return send(403, { error: 'authSecret required to update key' });
            }
            const hashed = await hashSecret(authSecret);
            if (hashed !== existing.authHash) {
              return send(403, { error: 'authSecret mismatch' });
            }
          } else {
            authSecret = await randomSecret();
          }

          const authHash = await hashSecret(authSecret);
          await env.USERS_KV.put(
            username,
            JSON.stringify({
              username,
              publicKey: body.publicKey,
              authHash,
              updatedAt: new Date().toISOString(),
            }),
          );

          const response = { ok: true, username };
          if (!existing) {
            response.authSecret = authSecret;
          }
          return send(200, response);
        }
        return send(405, { error: 'Method not allowed' });
      }

  if (url.pathname === '/v1/shares' && request.method === 'POST') {
        const body = await parseJSON(request);
        if (!body) {
          return send(400, { error: 'Invalid JSON body' });
        }
        const { recipient, cipher, cmp, alg, meta = {}, ttlSec } = body;
        if (!validateUsername(recipient)) {
          return send(400, { error: 'Invalid recipient' });
        }
        const payload = typeof cipher === 'string' ? cipher : '';
        if (!payload) {
          return send(400, { error: 'Cipher is required' });
        }
        const maxPayload = Number(env.MAX_PAYLOAD_BYTES || DEFAULT_MAX_PAYLOAD);
        if (payload.length * 0.75 > maxPayload) {
          return send(400, { error: 'Cipher exceeds maximum size' });
        }
        const ttl = Math.min(Math.max(Number(ttlSec || DEFAULT_TTL), 60), Number(env.MAX_TTL || DEFAULT_MAX_TTL));

        const recipientRecord = await env.USERS_KV.get(recipient, 'json');
        if (!recipientRecord) {
          return send(404, { error: 'Recipient not registered' });
        }

  const token = generateToken(24);
        const shareMeta = {
          token,
          recipient,
          alg: alg || 'ecdh-hkdf-aesgcm',
          cmp: cmp || null,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
          meta: {
            targetOrigin: meta.targetOrigin || null,
            targetPath: meta.targetPath || '/',
            comment: meta.comment || null,
            sender: meta.sender || null,
          },
        };

        await env.SHARES_KV.put(token, JSON.stringify({ cipher: payload, alg: shareMeta.alg, cmp: shareMeta.cmp, meta: shareMeta.meta }), { expirationTtl: ttl });

        const id = env.SHARE_MANAGER.idFromName(token);
        const stub = env.SHARE_MANAGER.get(id);
        await stub.fetch('https://share.manager/init', {
          method: 'POST',
          body: JSON.stringify({ ...shareMeta, ttl }),
          headers: { 'content-type': 'application/json' },
        });

        return send(201, {
          token,
          shareUrl: `${env.BASE_URL || url.origin}/session/${token}`,
          expiresAt: shareMeta.expiresAt,
        });
      }

      // Inbox endpoints for direct delivery
      if (url.pathname === '/v1/inbox' && request.method === 'POST') {
        const body = await parseJSON(request);
        if (!body) return send(400, { error: 'Invalid JSON body' });
        const { recipient, cipher, cmp, alg, meta = {}, ttlSec } = body;
        if (!validateUsername(recipient)) return send(400, { error: 'Invalid recipient' });
        const payload = typeof cipher === 'string' ? cipher : '';
        if (!payload) return send(400, { error: 'Cipher is required' });
        const maxPayload = Number(env.MAX_PAYLOAD_BYTES || DEFAULT_MAX_PAYLOAD);
        if (payload.length * 0.75 > maxPayload) return send(400, { error: 'Cipher exceeds maximum size' });
        const ttl = Math.min(Math.max(Number(ttlSec || DEFAULT_TTL), 60), Number(env.MAX_TTL || DEFAULT_MAX_TTL));

        const recipientRecord = await env.USERS_KV.get(recipient, 'json');
        if (!recipientRecord) return send(404, { error: 'Recipient not registered' });

        const inboxKV = env.INBOX_KV || env.SHARES_KV; // fallback if separate KV not bound
        const id = generateToken(20);
        const sessionId = generateToken(20);
        const sender = (meta.sender || '').trim() || null;
        const key = `inbox:${recipient}:${id}`;
        const entry = {
          cipher: payload,
          alg: alg || 'ecdh-hkdf-aesgcm',
          cmp: cmp || null,
          meta: {
            targetOrigin: meta.targetOrigin || null,
            targetPath: meta.targetPath || '/',
            comment: meta.comment || null,
            sender,
            sessionDurationSec: Number(meta.sessionDurationSec || 0) || 0,
            sessionId,
            type: 'share'
          },
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
        };
        await inboxKV.put(key, JSON.stringify(entry), { expirationTtl: ttl });

        // Create a session record and an index by sender for admin listing
        if (sender) {
          const sessionRecord = {
            id: sessionId,
            sender,
            recipient,
            targetOrigin: meta.targetOrigin || null,
            targetPath: meta.targetPath || '/',
            createdAt: entry.createdAt,
            durationSec: Number(meta.sessionDurationSec || 0) || 0,
            expiresAt: entry.expiresAt,
            acceptedAt: null,
            revokedAt: null,
            restoredAt: null,
            // Store original payload to enable restore after revoke
            cipher: payload,
            alg: alg || 'ecdh-hkdf-aesgcm',
            cmp: cmp || null
          };
          await env.SHARES_KV.put(`session:${sessionId}`, JSON.stringify(sessionRecord), { expirationTtl: ttl });
          if (sender) {
            await env.SHARES_KV.put(`sessionBySender:${sender}:${sessionId}`, '1', { expirationTtl: ttl });
          }
        }

        return send(201, { id, sessionId });
      }

      if (url.pathname === '/v1/inbox/poll' && request.method === 'GET') {
        const recipient = (url.searchParams.get('recipient') || '').trim();
        const limit = Math.max(1, Math.min(25, Number(url.searchParams.get('limit') || 10)));
        if (!validateUsername(recipient)) return send(400, { error: 'Invalid recipient' });
        const inboxKV = env.INBOX_KV || env.SHARES_KV;
        const prefix = `inbox:${recipient}:`;
        const list = await inboxKV.list({ prefix, limit });
        const items = [];
        for (const k of list.keys) {
          const stored = await inboxKV.get(k.name, 'json');
          if (!stored) continue;
          const id = k.name.substring(prefix.length);
          items.push({ id, cipher: stored.cipher, alg: stored.alg, cmp: stored.cmp, meta: stored.meta, expiresAt: stored.expiresAt });
        }
        return send(200, { items });
      }

      if (url.pathname === '/v1/inbox/ack' && request.method === 'POST') {
        const body = await parseJSON(request);
        const recipient = (body?.recipient || '').trim();
        const ids = Array.isArray(body?.ids) ? body.ids : [];
        if (!validateUsername(recipient)) return send(400, { error: 'Invalid recipient' });
        if (!ids.length) return send(400, { error: 'ids is required' });
        const inboxKV = env.INBOX_KV || env.SHARES_KV;
        const prefix = `inbox:${recipient}:`;
        let deleted = 0;
        for (const id of ids) {
          const key = `${prefix}${id}`;
          await inboxKV.delete(key);
          deleted += 1;
        }
        return send(200, { ok: true, deleted });
      }

      // Sessions admin APIs
      if (url.pathname === '/v1/sessions' && request.method === 'GET') {
        const sender = (url.searchParams.get('sender') || '').trim();
        const authSecret = (url.searchParams.get('authSecret') || '').trim();
        const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 50)));
        if (!validateUsername(sender)) return send(400, { error: 'Invalid sender' });
        const isAdmin = await requireAdmin(env, sender, authSecret);
        if (!isAdmin) return send(403, { error: 'Forbidden' });
        const prefix = `sessionBySender:${sender}:`;
        const list = await env.SHARES_KV.list({ prefix, limit });
        const sessions = [];
        for (const k of list.keys) {
          const id = k.name.substring(prefix.length);
          const rec = await env.SHARES_KV.get(`session:${id}`, 'json');
          if (rec) sessions.push(rec);
        }
        return send(200, { sessions });
      }

      if (url.pathname.startsWith('/v1/sessions/') && request.method === 'POST' && url.pathname.endsWith('/revoke')) {
        const parts = url.pathname.split('/');
        const sessionId = parts[3];
        const body = await parseJSON(request);
        const adminUser = (body?.username || '').trim();
        const authSecret = (body?.authSecret || '').trim();
        if (!sessionId || !validateUsername(adminUser)) return send(400, { error: 'Bad request' });
        const isAdmin = await requireAdmin(env, adminUser, authSecret);
        if (!isAdmin) return send(403, { error: 'Forbidden' });
        const session = await env.SHARES_KV.get(`session:${sessionId}`, 'json');
        if (!session) return send(404, { error: 'Not found' });
        if (session.sender !== adminUser) return send(403, { error: 'Forbidden' });
        // Send a revoke message to recipient inbox
        const inboxKV = env.INBOX_KV || env.SHARES_KV;
        const inboxId = generateToken(16);
        const inboxKey = `inbox:${session.recipient}:${inboxId}`;
        const ttlLeftSec = Math.max(60, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
        const entry = {
          cipher: '', // no cipher needed for revoke
          alg: null,
          cmp: null,
          meta: {
            type: 'revoke',
            sessionId,
            targetOrigin: session.targetOrigin || null,
            sender: adminUser
          },
          createdAt: new Date().toISOString(),
          expiresAt: session.expiresAt
        };
        await inboxKV.put(inboxKey, JSON.stringify(entry), { expirationTtl: ttlLeftSec });
        session.revokedAt = new Date().toISOString();
        await env.SHARES_KV.put(`session:${sessionId}`, JSON.stringify(session), { expirationTtl: ttlLeftSec });
        return send(200, { ok: true });
      }

      if (url.pathname.startsWith('/v1/sessions/') && request.method === 'POST' && url.pathname.endsWith('/restore')) {
        const parts = url.pathname.split('/');
        const sessionId = parts[3];
        const body = await parseJSON(request);
        const adminUser = (body?.username || '').trim();
        const authSecret = (body?.authSecret || '').trim();
        if (!sessionId || !validateUsername(adminUser)) return send(400, { error: 'Bad request' });
        const isAdmin = await requireAdmin(env, adminUser, authSecret);
        if (!isAdmin) return send(403, { error: 'Forbidden' });
        const session = await env.SHARES_KV.get(`session:${sessionId}`, 'json');
        if (!session) return send(404, { error: 'Not found' });
        if (session.sender !== adminUser) return send(403, { error: 'Forbidden' });
        const ttlLeftSec = Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000);
        if (!(ttlLeftSec > 60)) return send(410, { error: 'Session expired' });
        if (!session.cipher) return send(409, { error: 'Original payload unavailable' });
        // Re-enqueue original share to recipient's inbox
        const inboxKV = env.INBOX_KV || env.SHARES_KV;
        const inboxId = generateToken(16);
        const inboxKey = `inbox:${session.recipient}:${inboxId}`;
        const entry = {
          cipher: session.cipher,
          alg: session.alg || 'ecdh-hkdf-aesgcm',
          cmp: session.cmp || null,
          meta: {
            targetOrigin: session.targetOrigin || null,
            targetPath: session.targetPath || '/',
            comment: null,
            sender: session.sender,
            sessionDurationSec: Number(session.durationSec || 0) || 0,
            sessionId: session.id,
            type: 'share'
          },
          createdAt: new Date().toISOString(),
          expiresAt: session.expiresAt
        };
        await inboxKV.put(inboxKey, JSON.stringify(entry), { expirationTtl: ttlLeftSec });
        session.restoredAt = new Date().toISOString();
        await env.SHARES_KV.put(`session:${sessionId}`, JSON.stringify(session), { expirationTtl: ttlLeftSec });
        return send(200, { ok: true });
      }

      if (url.pathname.startsWith('/v1/sessions/') && request.method === 'POST' && url.pathname.endsWith('/accepted')) {
        const parts = url.pathname.split('/');
        const sessionId = parts[3];
        if (!sessionId) return send(400, { error: 'Bad request' });
        const session = await env.SHARES_KV.get(`session:${sessionId}`, 'json');
        if (!session) return send(404, { error: 'Not found' });
        if (!session.acceptedAt) {
          session.acceptedAt = new Date().toISOString();
          const ttlLeftSec = Math.max(60, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
          await env.SHARES_KV.put(`session:${sessionId}`, JSON.stringify(session), { expirationTtl: ttlLeftSec });
        }
        return send(200, { ok: true });
      }

      if (url.pathname.startsWith('/v1/sessions/') && request.method === 'POST' && url.pathname.endsWith('/delete')) {
        const parts = url.pathname.split('/');
        const sessionId = parts[3];
        const body = await parseJSON(request);
        const adminUser = (body?.username || '').trim();
        const authSecret = (body?.authSecret || '').trim();
        if (!sessionId || !validateUsername(adminUser)) return send(400, { error: 'Bad request' });
        const isAdmin = await requireAdmin(env, adminUser, authSecret);
        if (!isAdmin) return send(403, { error: 'Forbidden' });
        const session = await env.SHARES_KV.get(`session:${sessionId}`, 'json');
        if (!session) return send(404, { error: 'Not found' });
        if (session.sender !== adminUser) return send(403, { error: 'Forbidden' });
        await env.SHARES_KV.delete(`session:${sessionId}`);
        await env.SHARES_KV.delete(`sessionBySender:${session.sender}:${sessionId}`);
        return send(200, { ok: true });
      }

      // Requests: users can request credentials for current page
      if (url.pathname === '/v1/requests' && request.method === 'POST') {
  const body = await parseJSON(request);
  const requester = (body?.username || '').trim();
  const authSecret = (body?.authSecret || '').trim();
  const origin = (body?.origin || '').trim();
  const pageUrl = (body?.url || '').trim();
  const targetAdmin = (body?.targetAdmin || '').trim();
  if (!validateUsername(requester) || !origin) return send(400, { error: 'Bad request' });
  // Enforce explicit, valid target admin and allowlist check
  if (!validateUsername(targetAdmin)) return send(400, { error: 'targetAdmin is required and must be a valid username' });
  const allowedAdmins = parseAdmins(env);
  const wildcardAdmins = allowedAdmins.length === 0 || allowedAdmins.includes('*');
  if (!wildcardAdmins && !allowedAdmins.includes(targetAdmin)) return send(403, { error: 'Admin not allowed' });
        const ok = await verifyAuth(env, requester, authSecret);
        if (!ok) return send(403, { error: 'Forbidden' });
        const id = generateToken(16);
        const ttl = 15 * 60; // 15 minutes
  const rec = { id, requester, origin, url: pageUrl || null, createdAt: new Date().toISOString(), targetAdmin: targetAdmin || null };
        await env.SHARES_KV.put(`request:${id}`, JSON.stringify(rec), { expirationTtl: ttl });
        return send(201, { id });
      }

      if (url.pathname === '/v1/requests/poll' && request.method === 'GET') {
        const adminUser = (url.searchParams.get('username') || '').trim();
        const authSecret = (url.searchParams.get('authSecret') || '').trim();
        const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 25)));
        const isAdmin = await requireAdmin(env, adminUser, authSecret);
        if (!isAdmin) return send(403, { error: 'Forbidden' });
        const list = await env.SHARES_KV.list({ prefix: 'request:', limit });
        const items = [];
        for (const k of list.keys) {
          const rec = await env.SHARES_KV.get(k.name, 'json');
          if (!rec) continue;
          if (rec.targetAdmin && rec.targetAdmin !== adminUser) continue;
          items.push(rec);
        }
        return send(200, { items });
      }

      if (url.pathname === '/v1/requests/ack' && request.method === 'POST') {
        const body = await parseJSON(request);
        const adminUser = (body?.username || '').trim();
        const authSecret = (body?.authSecret || '').trim();
        const ids = Array.isArray(body?.ids) ? body.ids : [];
        const isAdmin = await requireAdmin(env, adminUser, authSecret);
        if (!isAdmin) return send(403, { error: 'Forbidden' });
        if (!ids.length) return send(400, { error: 'ids is required' });
        for (const id of ids) {
          await env.SHARES_KV.delete(`request:${id}`);
        }
        return send(200, { ok: true, deleted: ids.length });
      }

      if (url.pathname.startsWith('/v1/shares/')) {
        const token = url.pathname.split('/')[3];
        if (!token) {
          return send(400, { error: 'Token required' });
        }
        const id = env.SHARE_MANAGER.idFromName(token);
        const stub = env.SHARE_MANAGER.get(id);

        if (request.method === 'GET') {
          const doResp = await stub.fetch('https://share.manager/status', { method: 'POST', body: JSON.stringify({ token }), headers: { 'content-type': 'application/json' } });
          if (doResp.status !== 200) {
            return send(doResp.status, await doResp.json());
          }
          const stored = await env.SHARES_KV.get(token, 'json');
          if (!stored) {
            return send(404, { error: 'Not found' });
          }
          return send(200, { token, cipher: stored.cipher, alg: stored.alg, cmp: stored.cmp, meta: stored.meta });
        }

        if (request.method === 'POST' && url.pathname.endsWith('/consume')) {
          const doResp = await stub.fetch('https://share.manager/consume', { method: 'POST', body: JSON.stringify({ token }), headers: { 'content-type': 'application/json' } });
          if (doResp.status !== 200) {
            return send(doResp.status, await doResp.json());
          }
          await env.SHARES_KV.delete(token);
          // 204 responses must not include a body; returning a body can cause runtime errors
          return new Response(null, { status: 204, headers: { ...cors } });
        }
        return send(405, { error: 'Method not allowed' });
      }

      return send(404, { error: 'Not found' });
    } catch (error) {
      console.error('Worker error', error);
      return send(500, { error: 'Internal error', message: (error && (error.message || String(error))) });
    }
  },
};

export class ShareManager {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    if (url.pathname === '/init' && request.method === 'POST') {
      const existing = await this.state.storage.get(body.token);
      if (existing) {
        return jsonResponse(409, { error: 'Token already exists' });
      }
      await this.state.storage.put(body.token, {
        consumed: false,
        expiresAt: body.expiresAt,
        recipient: body.recipient,
      }, { expiration: Math.floor(Date.now() / 1000) + (body.ttl || DEFAULT_TTL) });
      return jsonResponse(200, { ok: true });
    }

    if (url.pathname === '/status' && request.method === 'POST') {
      const record = await this.state.storage.get(body.token);
      if (!record) {
        return jsonResponse(404, { error: 'Not found' });
      }
      if (record.consumed) {
        return jsonResponse(410, { error: 'Already consumed' });
      }
      return jsonResponse(200, { ok: true, recipient: record.recipient });
    }

    if (url.pathname === '/consume' && request.method === 'POST') {
      const record = await this.state.storage.get(body.token);
      if (!record) {
        return jsonResponse(404, { error: 'Not found' });
      }
      if (record.consumed) {
        return jsonResponse(410, { error: 'Already consumed' });
      }
      record.consumed = true;
      await this.state.storage.put(body.token, record);
      return jsonResponse(200, { ok: true });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  }
}
