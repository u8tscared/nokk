// API Nokk : comptes (Firebase Auth), équipes et sauvegarde des tournées (Cloudflare D1).
// Aucune dépendance : vérification des jetons Firebase par WebCrypto.

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const KINDS = new Set(['org', 'members', 'sectors', 'doors', 'visits', 'handovers', 'stock']);
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PAGE = 1000;
const MAX_CHANGES = 500;
const MAX_BODY = 3 * 1024 * 1024;

class HttpError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}

// ——— CORS ———
function allowedOrigin(origin, env) {
  if (!origin) return null;
  const list = (env.ORIGINS || 'https://u8tscared.github.io').split(',').map((s) => s.trim());
  if (list.includes(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}
function cors(req, env) {
  const o = allowedOrigin(req.headers.get('origin'), env);
  const h = { 'vary': 'origin' };
  if (o) {
    h['access-control-allow-origin'] = o;
    h['access-control-allow-headers'] = 'authorization, content-type';
    h['access-control-allow-methods'] = 'GET, POST, OPTIONS';
    h['access-control-max-age'] = '86400';
  }
  return h;
}
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

// ——— Jetons Firebase ———
let jwksCache = null;
let jwksUntil = 0;
async function getKeys(env) {
  if (env.JWKS) return env.JWKS; // tests
  if (jwksCache && Date.now() < jwksUntil) return jwksCache;
  const r = await fetch(JWKS_URL);
  if (!r.ok) throw new HttpError(503, 'keys_unavailable');
  const j = await r.json();
  const m = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  jwksCache = j.keys || [];
  jwksUntil = Date.now() + (m ? +m[1] * 1000 : 3600_000);
  return jwksCache;
}
const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const dec = (s) => JSON.parse(new TextDecoder().decode(b64u(s)));

export async function verifyToken(token, env, now = Date.now()) {
  const parts = (token || '').split('.');
  if (parts.length !== 3) throw new HttpError(401, 'bad_token');
  let header, p;
  try { header = dec(parts[0]); p = dec(parts[1]); } catch { throw new HttpError(401, 'bad_token'); }
  if (header.alg !== 'RS256') throw new HttpError(401, 'bad_token');
  const jwk = (await getKeys(env)).find((k) => k.kid === header.kid);
  if (!jwk) throw new HttpError(401, 'unknown_key');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new HttpError(401, 'bad_signature');
  const t = Math.floor(now / 1000);
  const project = env.PROJECT_ID;
  if (!project || p.aud !== project || p.iss !== 'https://securetoken.google.com/' + project) throw new HttpError(401, 'wrong_project');
  if (typeof p.exp !== 'number' || p.exp < t - 30) throw new HttpError(401, 'expired');
  if (typeof p.iat !== 'number' || p.iat > t + 300) throw new HttpError(401, 'bad_token');
  if (!p.sub || typeof p.sub !== 'string') throw new HttpError(401, 'bad_token');
  return { uid: p.sub, email: p.email || null, name: p.name || null };
}

// ——— Aides ———
function rid(prefix, n = 12) {
  const a = crypto.getRandomValues(new Uint8Array(n));
  return prefix + [...a].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function newCode() {
  const a = crypto.getRandomValues(new Uint8Array(6));
  return [...a].map((x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
}
async function body(req) {
  const len = +(req.headers.get('content-length') || 0);
  if (len > MAX_BODY) throw new HttpError(413, 'too_large');
  const t = await req.text();
  if (t.length > MAX_BODY) throw new HttpError(413, 'too_large');
  try { return t ? JSON.parse(t) : {}; } catch { throw new HttpError(400, 'bad_json'); }
}
async function membership(env, teamId, uid) {
  if (typeof teamId !== 'string') throw new HttpError(400, 'bad_team');
  const m = await env.DB.prepare('SELECT m.role, m.member_id, t.name, t.code FROM memberships m JOIN teams t ON t.id = m.team_id WHERE m.team_id = ?1 AND m.uid = ?2').bind(teamId, uid).first();
  if (!m) throw new HttpError(403, 'not_member');
  return m;
}
const teamOut = (r) => ({ id: r.id, name: r.name, code: r.code, role: r.role, memberId: r.member_id || null, createdAt: r.created_at });

// ——— Routes ———
async function me(env, user) {
  const now = Date.now();
  await env.DB.prepare('INSERT INTO accounts (uid, email, name, created_at, seen_at) VALUES (?1, ?2, ?3, ?4, ?4) ON CONFLICT(uid) DO UPDATE SET email = excluded.email, name = COALESCE(excluded.name, accounts.name), seen_at = excluded.seen_at')
    .bind(user.uid, user.email, user.name, now).run();
  const { results } = await env.DB.prepare('SELECT t.id, t.name, t.code, t.created_at, m.role, m.member_id FROM memberships m JOIN teams t ON t.id = m.team_id WHERE m.uid = ?1 ORDER BY m.joined_at DESC').bind(user.uid).all();
  return { uid: user.uid, email: user.email, name: user.name, teams: results.map(teamOut) };
}

async function createTeam(env, user, b) {
  const name = String(b.name || 'Amicale').trim().slice(0, 80) || 'Amicale';
  const id = rid('t_', 9);
  const now = Date.now();
  for (let tries = 0; tries < 6; tries++) {
    const code = newCode();
    try {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO teams (id, name, code, owner, created_at, seq) VALUES (?1, ?2, ?3, ?4, ?5, 0)').bind(id, name, code, user.uid, now),
        env.DB.prepare('INSERT INTO memberships (team_id, uid, member_id, role, joined_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(id, user.uid, b.memberId || null, 'owner', now),
      ]);
      return { id, name, code, role: 'owner', memberId: b.memberId || null, createdAt: now };
    } catch (e) {
      if (!/UNIQUE/i.test(String(e?.message))) throw e;
    }
  }
  throw new HttpError(500, 'code_collision');
}

async function joinTeam(env, user, b) {
  const code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) throw new HttpError(400, 'bad_code');
  const t = await env.DB.prepare('SELECT id, name, code, created_at FROM teams WHERE code = ?1').bind(code).first();
  if (!t) throw new HttpError(404, 'unknown_code');
  await env.DB.prepare('INSERT INTO memberships (team_id, uid, member_id, role, joined_at) VALUES (?1, ?2, NULL, ?3, ?4) ON CONFLICT(team_id, uid) DO NOTHING')
    .bind(t.id, user.uid, 'member', Date.now()).run();
  const m = await membership(env, t.id, user.uid);
  return teamOut({ ...t, role: m.role, member_id: m.member_id });
}

async function link(env, user, teamId, b) {
  await membership(env, teamId, user.uid);
  const memberId = b.memberId == null ? null : String(b.memberId).slice(0, 120);
  await env.DB.prepare('UPDATE memberships SET member_id = ?3 WHERE team_id = ?1 AND uid = ?2').bind(teamId, user.uid, memberId).run();
  return { ok: true, memberId };
}

function cleanChanges(list, now) {
  if (!Array.isArray(list)) throw new HttpError(400, 'bad_changes');
  if (list.length > MAX_CHANGES) throw new HttpError(413, 'too_many_changes');
  const seen = new Map();
  for (const c of list) {
    if (!c || !KINDS.has(c.k) || typeof c.i !== 'string' || !c.i || c.i.length > 160) throw new HttpError(400, 'bad_change');
    const del = !!c.x;
    if (!del && (c.d == null || typeof c.d !== 'object')) throw new HttpError(400, 'bad_change');
    const u = Math.min(Number.isFinite(c.u) ? Math.floor(c.u) : now, now); // une horloge en avance ne gagne pas toujours
    const prev = seen.get(c.k + '|' + c.i);
    if (prev && prev.u > u) continue;
    seen.set(c.k + '|' + c.i, { k: c.k, i: c.i, d: del ? null : JSON.stringify(c.d), u, x: del ? 1 : 0 });
  }
  return [...seen.values()];
}
const rowOut = (r) => ({ k: r.kind, i: r.id, d: r.deleted ? null : JSON.parse(r.data), u: r.updated_at, x: !!r.deleted, s: r.seq });

async function sync(env, user, b) {
  const teamId = b.teamId;
  await membership(env, teamId, user.uid);
  const since = Math.max(0, Math.floor(+b.since || 0));
  const changes = cleanChanges(b.changes || [], Date.now());
  let fix = [];
  if (changes.length) {
    const n = changes.length;
    const row = await env.DB.prepare('UPDATE teams SET seq = seq + ?2 WHERE id = ?1 RETURNING seq').bind(teamId, n).first();
    const base = row.seq - n;
    const payload = JSON.stringify(changes);
    await env.DB.prepare(
      `INSERT INTO items (team_id, kind, id, data, updated_at, seq, deleted, by)
       SELECT ?1, json_extract(value, '$.k'), json_extract(value, '$.i'), json_extract(value, '$.d'), json_extract(value, '$.u'), ?2 + key + 1, json_extract(value, '$.x'), ?3
       FROM json_each(?4) WHERE 1
       ON CONFLICT(team_id, kind, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, seq = excluded.seq, deleted = excluded.deleted, by = excluded.by
       WHERE excluded.updated_at >= items.updated_at`,
    ).bind(teamId, base, user.uid, payload).run();
    // Modifications refusées (une version plus récente existe) : on renvoie la version du serveur.
    const keys = JSON.stringify(changes.map((c) => c.k + '|' + c.i));
    const r = await env.DB.prepare(
      `SELECT kind, id, data, updated_at, seq, deleted FROM items
       WHERE team_id = ?1 AND (kind || '|' || id) IN (SELECT value FROM json_each(?2)) AND (seq <= ?3 OR seq > ?4)`,
    ).bind(teamId, keys, base, base + n).all();
    fix = r.results.map(rowOut);
  }
  const { results } = await env.DB.prepare('SELECT kind, id, data, updated_at, seq, deleted FROM items WHERE team_id = ?1 AND seq > ?2 ORDER BY seq LIMIT ?3')
    .bind(teamId, since, PAGE + 1).all();
  const more = results.length > PAGE;
  const items = results.slice(0, PAGE).map(rowOut);
  const cursor = items.length ? items[items.length - 1].s : since;
  return { items, fix, cursor, more, accepted: changes.length };
}

async function exportTeam(env, user, teamId) {
  const m = await membership(env, teamId, user.uid);
  const { results } = await env.DB.prepare('SELECT kind, id, data FROM items WHERE team_id = ?1 AND deleted = 0').bind(teamId).all();
  const out = { app: 'nokk', exportedAt: new Date().toISOString(), team: { id: teamId, name: m.name }, org: null, members: [], sectors: [], doors: [], visits: [], handovers: [], stock: [] };
  for (const r of results) {
    const d = JSON.parse(r.data);
    if (r.kind === 'org') out.org = d;
    else out[r.kind].push(d);
  }
  return out;
}

export default {
  async fetch(req, env) {
    const h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (path === '/' || path === '/health') {
        const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM teams').first();
        return json({ ok: true, app: 'nokk-api', teams: r?.n ?? 0 }, 200, h);
      }
      const auth = req.headers.get('authorization') || '';
      const user = await verifyToken(auth.replace(/^Bearer\s+/i, ''), env);
      let out;
      let m;
      if (path === '/me' && req.method === 'GET') out = await me(env, user);
      else if (path === '/teams' && req.method === 'POST') out = await createTeam(env, user, await body(req));
      else if (path === '/teams/join' && req.method === 'POST') out = await joinTeam(env, user, await body(req));
      else if (path === '/sync' && req.method === 'POST') out = await sync(env, user, await body(req));
      else if ((m = /^\/teams\/([\w-]+)\/link$/.exec(path)) && req.method === 'POST') out = await link(env, user, m[1], await body(req));
      else if ((m = /^\/teams\/([\w-]+)\/export$/.exec(path)) && req.method === 'GET') out = await exportTeam(env, user, m[1]);
      else throw new HttpError(404, 'not_found');
      return json(out, 200, h);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code }, e.status, h);
      console.error(e);
      return json({ error: 'server_error' }, 500, h);
    }
  },
};
