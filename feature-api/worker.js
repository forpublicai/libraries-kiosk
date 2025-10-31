// Minimal Feature Tracker API for Cloudflare Workers
// Endpoints:
//  - GET  /v1/features?sort=score|new
//  - POST /v1/features { title, desc }
//  - POST /v1/vote     { id, delta: -1|+1, clientId }
// Storage: Cloudflare KV (binding: FEATURES_KV)
// No secrets; CORS open to any origin (safe for public read/write community board).

const PREFIX_FEATURE = 'feature:';   // value: { id, title, desc, score, createdAt }
const PREFIX_VOTE    = 'vote:';      // key: vote:<featureId>:<clientId> -> value in {-1,0,1}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Credentials': 'false'
  };
}

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } });
}

function rid(){ return Math.random().toString(36).slice(2) + Date.now().toString(36); }

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');
    const headers = cors(origin);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    // robust body parser: works even if Content-Type header is omitted
    const parseBody = async () => {
      try { return await req.json(); } catch (_) {}
      try { const t = await req.text(); return t ? JSON.parse(t) : null; } catch { return null; }
    };

    try {
      if (url.pathname === '/v1/features' && req.method === 'GET') {
        const sort = (url.searchParams.get('sort') || 'score');
        const list = await env.FEATURES_KV.list({ prefix: PREFIX_FEATURE });
        const items = [];
        for (const k of list.keys) {
          const it = await env.FEATURES_KV.get(k.name, 'json');
          if (it) items.push(it);
        }
        items.sort((a,b) => sort==='new' ? (b.createdAt - a.createdAt) : (b.score - a.score));
        return json(200, { items }, headers);
      }

  if (url.pathname === '/v1/features' && req.method === 'POST') {
        const body = await parseBody();
        const title = (body?.title || '').trim();
        const desc  = (body?.desc || '').trim();
        if (!title) return json(400, { error: 'title is required' }, headers);
        const id = rid();
        const feature = { id, title, desc, score: 0, createdAt: Date.now() };
        await env.FEATURES_KV.put(PREFIX_FEATURE + id, JSON.stringify(feature));
        return json(201, feature, headers);
      }

  if (url.pathname === '/v1/vote' && req.method === 'POST') {
        const body = await parseBody();
        const id = (body?.id || '').trim();
        const clientId = (body?.clientId || '').trim();
        const rawVote = body?.vote;
        const rawDelta = body?.delta;
  const hasVote = rawVote !== undefined && rawVote !== null && Number.isFinite(Number(rawVote));
  const hasDelta = rawDelta !== undefined && rawDelta !== null && Number.isFinite(Number(rawDelta));
  if (!id || !clientId || (!hasVote && !hasDelta)) return json(400, { error: 'bad request' }, headers);

        const voteKey = `${PREFIX_VOTE}${id}:${clientId}`;
        const prevStr = await env.FEATURES_KV.get(voteKey);
        const prev = prevStr == null ? 0 : Number(prevStr); // -1,0,1
        const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
        const target = hasVote
          ? clamp(Number(rawVote), -1, 1)
          : clamp(prev + (Number(rawDelta) > 0 ? 1 : -1), -1, 1);
        const change = target - prev; // -1,0,1
        if (change !== 0) {
          const fKey = PREFIX_FEATURE + id;
          const f = await env.FEATURES_KV.get(fKey, 'json');
          if (!f) return json(404, { error: 'feature not found' }, headers);
          const currentScore = Number(f.score);
          f.score = (Number.isFinite(currentScore) ? currentScore : 0) + change;
          await env.FEATURES_KV.put(fKey, JSON.stringify(f));
          await env.FEATURES_KV.put(voteKey, String(target));
          return json(200, { ok: true, score: f.score, userVote: target }, headers);
        }
        // no change
        const fKey = PREFIX_FEATURE + id;
        const f = await env.FEATURES_KV.get(fKey, 'json');
        if (!f) return json(404, { error: 'feature not found' }, headers);
        return json(200, { ok: true, score: Number(f.score)||0, userVote: prev }, headers);
      }

      return json(404, { error: 'not found' }, headers);
    } catch (e) {
      return json(500, { error: 'internal', message: e?.message || String(e) }, headers);
    }
  }
}
