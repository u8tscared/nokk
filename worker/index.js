// API Nokk : comptes (Firebase Auth), équipes et sauvegarde des tournées (Cloudflare D1).
// Aucune dépendance : vérification des jetons Firebase par WebCrypto.

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const KINDS = new Set(['org', 'members', 'sectors', 'doors', 'visits', 'handovers', 'stock', 'sessions', 'callbacks']);
export const FEATURES = ['admin', 'ref', 'callbacks'];
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
  return { uid: p.sub, email: p.email || null, name: p.name || null, verified: p.email_verified === true || p.firebase?.sign_in_provider === 'google.com' };
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
  return { uid: user.uid, email: user.email, name: user.name, admin: isAdmin(user, env), teams: results.map(teamOut) };
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
  const out = { app: 'nokk', exportedAt: new Date().toISOString(), team: { id: teamId, name: m.name }, org: null, members: [], sectors: [], doors: [], visits: [], handovers: [], stock: [], sessions: [], callbacks: [] };
  for (const r of results) {
    const d = JSON.parse(r.data);
    if (r.kind === 'org') out.org = d;
    else out[r.kind].push(d);
  }
  return out;
}


// ——— QR « Repassez plus tard » : page publique, sans compte ———
// Chaque secteur porte un jeton (sector.qr). La carte n° n laissée à une porte renvoie vers /nokk/r/#JETON.n
const TOKEN_RE = /^[A-Za-z0-9]{8,24}$/;
async function sectorByToken(env, token) {
  if (!TOKEN_RE.test(token)) throw new HttpError(404, 'unknown_qr');
  const r = await env.DB.prepare("SELECT team_id, data FROM items WHERE kind = 'sectors' AND deleted = 0 AND json_extract(data, '$.qr') = ?1 LIMIT 1").bind(token).first();
  if (!r) throw new HttpError(404, 'unknown_qr');
  const sector = JSON.parse(r.data);
  const org = await env.DB.prepare("SELECT data FROM items WHERE team_id = ?1 AND kind = 'org' AND deleted = 0").bind(r.team_id).first();
  return { teamId: r.team_id, sector, org: org ? JSON.parse(org.data) : {} };
}
async function qrInfo(env, token) {
  const { sector, org } = await sectorByToken(env, token);
  return { org: { name: org.name || 'Amicale des sapeurs-pompiers', city: org.city || null, year: org.year || null }, sector: { name: sector.name }, slots: sector.qrSlots || null };
}
const clip = (v, n) => (v == null ? undefined : String(v).trim().slice(0, n) || undefined);
async function qrAnswer(env, token, b) {
  const { teamId, sector } = await sectorByToken(env, token);
  const n = Math.floor(+b.n);
  const want = b.want === 'non' ? 'non' : b.want === 'don' ? 'don' : 'oui';
  const slot = b.slot && typeof b.slot === 'object' ? { day: clip(b.slot.day, 10), from: Math.floor(+b.slot.from) || null, to: Math.floor(+b.slot.to) || null } : null;
  if (want === 'oui' && (!slot?.day || !/^\d{4}-\d{2}-\d{2}$/.test(slot.day))) throw new HttpError(400, 'bad_slot');
  const email = clip(b.email, 120);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'bad_email');
  const count = await env.DB.prepare("SELECT COUNT(*) AS c FROM items WHERE team_id = ?1 AND kind = 'callbacks' AND json_extract(data, '$.sectorId') = ?2").bind(teamId, sector.id).first();
  if ((count?.c || 0) >= 400) throw new HttpError(429, 'too_many');
  const now = Date.now();
  const id = rid('cb_', 8);
  const d = { id, sectorId: sector.id, n: Number.isFinite(n) && n > 0 && n < 1000 ? n : null, want, slot: want === 'oui' ? slot : null,
    name: clip(b.name, 80), address: clip(b.address, 160), email, note: clip(b.note, 300), ts: now, status: 'new' };
  const row = await env.DB.prepare('UPDATE teams SET seq = seq + 1 WHERE id = ?1 RETURNING seq').bind(teamId).first();
  await env.DB.prepare("INSERT INTO items (team_id, kind, id, data, updated_at, seq, deleted, by) VALUES (?1, 'callbacks', ?2, ?3, ?4, ?5, 0, 'qr')").bind(teamId, id, JSON.stringify(d), now, row.seq).run();
  return { ok: true, id };
}

// ——— Parrainage : qui a fait connaître Nokk à qui ———
let refTable = false;
async function ensureRefs(env) {
  if (refTable) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS referrals (uid TEXT PRIMARY KEY, by_uid TEXT NOT NULL, at INTEGER NOT NULL)').run();
  refTable = true;
}
async function addRef(env, user, b) {
  const code = String(b.code || '').replace(/[^\w-]/g, '').slice(0, 16);
  if (code.length < 4) throw new HttpError(400, 'bad_code');
  await ensureRefs(env);
  const by = await env.DB.prepare('SELECT uid FROM accounts WHERE substr(uid, 1, ?2) = ?1 LIMIT 1').bind(code, code.length).first();
  if (!by || by.uid === user.uid) return { ok: false };
  const r = await env.DB.prepare('INSERT INTO referrals (uid, by_uid, at) VALUES (?1, ?2, ?3) ON CONFLICT(uid) DO NOTHING').bind(user.uid, by.uid, Date.now()).run();
  return { ok: true, added: !!r.meta?.changes };
}
async function refCount(env, user) {
  await ensureRefs(env);
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM referrals WHERE by_uid = ?1').bind(user.uid).first();
  return { count: r?.n || 0 };
}

// ——— Espace admin (propriétaire de Nokk) ———
export function isAdmin(user, env) {
  const list = String(env.ADMINS || 'marceau.ruis@gmail.com').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  return !!(user?.email && user.verified && list.includes(user.email.toLowerCase()));
}
function needAdmin(user, env) { if (!isAdmin(user, env)) throw new HttpError(403, 'not_admin'); }
const DAY = 864e5;
const VISIT_STATS = `COUNT(*) AS visits,
  SUM(CASE WHEN json_extract(data,'$.result')='donne' THEN COALESCE(json_extract(data,'$.calendars'),1) ELSE 0 END) AS calendars,
  SUM(CASE WHEN json_extract(data,'$.result')='donne' THEN COALESCE(json_extract(data,'$.amount'),0) ELSE 0 END) AS amount,
  MAX(json_extract(data,'$.ts')) AS last`;

async function adminOverview(env) {
  const now = Date.now();
  await ensureRefs(env);
  const q = (sql, ...a) => env.DB.prepare(sql).bind(...a).all().then((r) => r.results);
  const [accounts, teams, memberships, byTeam, byUser, counts, days, refs] = await Promise.all([
    q('SELECT uid, email, name, created_at, seen_at FROM accounts ORDER BY COALESCE(seen_at, created_at) DESC'),
    q('SELECT id, name, code, owner, created_at FROM teams ORDER BY created_at DESC'),
    q('SELECT team_id, uid, member_id, role, joined_at FROM memberships'),
    q(`SELECT team_id, ${VISIT_STATS} FROM items WHERE kind = 'visits' AND deleted = 0 GROUP BY team_id`),
    q(`SELECT "by" AS uid, ${VISIT_STATS} FROM items WHERE kind = 'visits' AND deleted = 0 GROUP BY "by"`),
    q("SELECT team_id, kind, COUNT(*) AS n, MAX(updated_at) AS last FROM items WHERE deleted = 0 AND kind IN ('members','sectors','doors','sessions') GROUP BY team_id, kind"),
    q(`SELECT CAST(json_extract(data,'$.ts') / ${DAY} AS INTEGER) AS d, ${VISIT_STATS} FROM items WHERE kind = 'visits' AND deleted = 0 AND json_extract(data,'$.ts') > ?1 GROUP BY d ORDER BY d`, now - 30 * DAY),
    q('SELECT uid, by_uid FROM referrals'),
  ]);
  const stat = (r) => ({ visits: r?.visits || 0, calendars: r?.calendars || 0, amount: r?.amount || 0, last: r?.last || null });
  const tStats = new Map(byTeam.map((r) => [r.team_id, stat(r)]));
  const uStats = new Map(byUser.map((r) => [r.uid, stat(r)]));
  const email = new Map(accounts.map((a) => [a.uid, a.email]));
  const tName = new Map(teams.map((t) => [t.id, t.name]));
  const outTeams = teams.map((t) => {
    const c = Object.fromEntries(counts.filter((x) => x.team_id === t.id).map((x) => [x.kind, x.n]));
    const ms = memberships.filter((m) => m.team_id === t.id);
    return { id: t.id, name: t.name, code: t.code, createdAt: t.created_at, owner: email.get(t.owner) || null,
      accounts: ms.length, members: c.members || 0, sectors: c.sectors || 0, doors: c.doors || 0, tours: c.sessions || 0, ...tStats.get(t.id) || stat() };
  });
  const outAccounts = accounts.map((a) => ({ uid: a.uid, email: a.email, name: a.name, createdAt: a.created_at, seenAt: a.seen_at,
    teams: memberships.filter((m) => m.uid === a.uid).map((m) => ({ id: m.team_id, name: tName.get(m.team_id) || '?', role: m.role })),
    invited: refs.filter((r) => r.by_uid === a.uid).length, invitedBy: email.get(refs.find((r) => r.uid === a.uid)?.by_uid) || null,
    ...uStats.get(a.uid) || stat() }));
  const sum = (k) => outTeams.reduce((n, t) => n + (t[k] || 0), 0);
  return {
    at: now,
    totals: { accounts: accounts.length, teams: teams.length, active7: accounts.filter((a) => a.seen_at > now - 7 * DAY).length,
      visits: sum('visits'), calendars: sum('calendars'), amount: sum('amount'), doors: sum('doors'), sectors: sum('sectors'), tours: sum('tours'), members: sum('members'), referrals: refs.length },
    days: days.map((r) => ({ day: r.d * DAY, ...stat(r) })),
    teams: outTeams, accounts: outAccounts,
  };
}

async function adminTeam(env, teamId) {
  const t = await env.DB.prepare('SELECT id, name, code, owner, created_at FROM teams WHERE id = ?1').bind(teamId).first();
  if (!t) throw new HttpError(404, 'unknown_team');
  const { results: ms } = await env.DB.prepare('SELECT m.uid, m.member_id, m.role, m.joined_at, a.email, a.name, a.seen_at FROM memberships m LEFT JOIN accounts a ON a.uid = m.uid WHERE m.team_id = ?1 ORDER BY m.joined_at').bind(teamId).all();
  const { results: items } = await env.DB.prepare("SELECT kind, data FROM items WHERE team_id = ?1 AND deleted = 0 AND kind IN ('org','members','sectors','visits','sessions')").bind(teamId).all();
  const of = (k) => items.filter((r) => r.kind === k).map((r) => JSON.parse(r.data));
  const members = of('members'); const visits = of('visits'); const sectors = of('sectors'); const sessions = of('sessions');
  const per = new Map();
  const bump = (id) => { if (!per.has(id)) per.set(id, { visits: 0, calendars: 0, amount: 0, last: null, tours: 0, minutes: 0 }); return per.get(id); };
  for (const v of visits) for (const id of (Array.isArray(v.by) && v.by.length ? v.by : ['?'])) {
    const p = bump(id); p.visits++;
    if (v.result === 'donne') { p.calendars += v.calendars ?? 1; p.amount += v.amount || 0; }
    if (!p.last || v.ts > p.last) p.last = v.ts;
  }
  for (const s of sessions) for (const id of s.crew || []) {
    const p = bump(id); p.tours++;
    if (s.endedAt) p.minutes += Math.round((s.endedAt - s.startedAt) / 6e4);
  }
  const accountOf = (id) => ms.find((m) => m.member_id === id);
  const secStats = sectors.map((s) => {
    const vs = visits.filter((v) => v.sectorId === s.id);
    return { id: s.id, name: s.name, visits: vs.length, calendars: vs.reduce((n, v) => n + (v.result === 'donne' ? v.calendars ?? 1 : 0), 0), amount: vs.reduce((n, v) => n + (v.result === 'donne' ? v.amount || 0 : 0), 0) };
  });
  return {
    id: t.id, name: t.name, code: t.code, createdAt: t.created_at, org: of('org')[0] || null,
    accounts: ms.map((m) => ({ uid: m.uid, email: m.email, name: m.name, role: m.role, memberId: m.member_id, joinedAt: m.joined_at, seenAt: m.seen_at })),
    members: members.map((m) => ({ id: m.id, name: m.name, role: m.role || null, email: accountOf(m.id)?.email || null, ...bump(m.id) })),
    sectors: secStats,
    tours: sessions.length,
  };
}

async function adminMember(env, teamId, b) {
  const uid = String(b.uid || '');
  const m = await env.DB.prepare('SELECT role FROM memberships WHERE team_id = ?1 AND uid = ?2').bind(teamId, uid).first();
  if (!m) throw new HttpError(404, 'not_member');
  if (b.action === 'remove') {
    await env.DB.prepare('DELETE FROM memberships WHERE team_id = ?1 AND uid = ?2').bind(teamId, uid).run();
    return { ok: true, removed: true };
  }
  if (b.action === 'role' && ['owner', 'member'].includes(b.role)) {
    await env.DB.prepare('UPDATE memberships SET role = ?3 WHERE team_id = ?1 AND uid = ?2').bind(teamId, uid, b.role).run();
    if (b.role === 'owner') await env.DB.prepare('UPDATE teams SET owner = ?2 WHERE id = ?1').bind(teamId, uid).run();
    return { ok: true, role: b.role };
  }
  throw new HttpError(400, 'bad_action');
}

// ——— Lecture d'une photo de plan (Workers AI) ———
// Deux modèles lisent la photo en parallèle ; on croise leurs réponses.
export const PLAN_MODELS = ['@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-4-scout-17b-16e-instruct'];
const PLAN_PROMPT = `Photo d'un plan de quartier en France, utilisé pour une tournée de calendriers de sapeurs-pompiers.
Un ou plusieurs secteurs y sont entourés au feutre, souvent avec un nom écrit sur un post-it ou à la main.
Lis les noms de rues IMPRIMÉS sur le plan, exactement comme ils sont écrits (abréviations : Av = Avenue, All = Allée, Pl = Place, Mte = Montée, Bd = Boulevard, Imp = Impasse, Che = Chemin). N'invente aucun nom.
Réponds UNIQUEMENT avec ce JSON compact, sans texte autour :
{"ville":"commune ou null","code_postal":"ou null","secteurs":[{"nom":"nom du secteur (post-it) ou null","bord":["rues le long desquelles passe le trait du contour"],"dedans":["rues entièrement à l'intérieur du contour"]}],"rues":["toutes les autres rues lisibles"]}`;

const cleanList = (v, max = 40) => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x || '').trim()).filter((x) => x.length > 2 && x.length < 120 && !/^(null|undefined|aucune?|inconnue?)$/i.test(x)))].slice(0, max);
const cleanStr = (v) => (v && typeof v === 'string' && v.trim() && !/^(null|inconnu|n\/a)$/i.test(v.trim()) ? v.trim().slice(0, 80) : null);

export function parsePlan(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j;
  try { j = JSON.parse(m[0]); } catch { return null; }
  let secteurs = (Array.isArray(j.secteurs) ? j.secteurs : []).map((x) => ({
    nom: cleanStr(x?.nom), bord: cleanList(x?.bord || x?.rues_bord), dedans: cleanList(x?.dedans || x?.rues_dedans),
  })).filter((x) => x.bord.length || x.dedans.length).slice(0, 8);
  const zone = cleanList(j.zone || j.zone_rues);
  if (!secteurs.length && zone.length) secteurs = [{ nom: null, bord: zone, dedans: [] }];
  const used = new Set(secteurs.flatMap((x) => [...x.bord, ...x.dedans]));
  return {
    ville: cleanStr(j.ville), cp: cleanStr(j.code_postal), secteurs,
    zone: secteurs[0] ? [...secteurs[0].bord, ...secteurs[0].dedans] : zone,
    rues: cleanList(j.rues).filter((r) => !used.has(r)), adresses: cleanList(j.adresses, 20),
  };
}

const keyName = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Réunit les lectures : mêmes secteurs (par nom, ou dans l'ordre), rues mises en commun.
export function mergePlans(plans) {
  const ok = plans.filter(Boolean);
  if (!ok.length) return null;
  const out = { ville: null, cp: null, secteurs: [], rues: [], adresses: [] };
  for (const p of ok) {
    out.ville ||= p.ville; out.cp ||= p.cp;
    p.secteurs.forEach((s, i) => {
      const k = keyName(s.nom);
      let t = out.secteurs.find((x) => k && keyName(x.nom) === k) || (!k && out.secteurs[i] && !out.secteurs[i].nom ? out.secteurs[i] : null);
      if (!t) { t = { nom: s.nom, bord: [], dedans: [], votes: 0 }; out.secteurs.push(t); }
      t.votes++;
      for (const r of s.bord) if (!t.bord.some((x) => keyName(x) === keyName(r))) t.bord.push(r);
      for (const r of s.dedans) if (!t.dedans.some((x) => keyName(x) === keyName(r))) t.dedans.push(r);
    });
    for (const r of p.rues) if (!out.rues.some((x) => keyName(x) === keyName(r))) out.rues.push(r);
    for (const r of p.adresses) if (!out.adresses.includes(r)) out.adresses.push(r);
  }
  out.secteurs.sort((a, b) => b.votes - a.votes);
  out.secteurs = out.secteurs.slice(0, 8).map(({ votes, ...s }) => s);
  out.zone = out.secteurs[0] ? [...out.secteurs[0].bord, ...out.secteurs[0].dedans] : [];
  return out;
}

async function readPlan(env, b) {
  const img = String(b.image || '');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(img) || img.length > 2.5 * 1024 * 1024) throw new HttpError(400, 'bad_image');
  if (!env.AI) throw new HttpError(503, 'no_ai');
  const ask = async (model) => {
    const r = await env.AI.run(model, {
      messages: [{ role: 'user', content: [{ type: 'text', text: PLAN_PROMPT }, { type: 'image_url', image_url: { url: img } }] }],
      max_tokens: 1200, temperature: 0.1,
    });
    const text = r?.response ?? r?.choices?.[0]?.message?.content ?? '';
    return parsePlan(typeof text === 'string' ? text : JSON.stringify(text));
  };
  const res = await Promise.allSettled(PLAN_MODELS.map(ask));
  const plan = mergePlans(res.map((x) => (x.status === 'fulfilled' ? x.value : null)));
  if (!plan || !plan.secteurs.length) throw new HttpError(422, 'unreadable');
  return plan;
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
        return json({ ok: true, app: 'nokk-api', teams: r?.n ?? 0, features: FEATURES }, 200, h);
      }
      // Page publique « Repassez plus tard » : sans compte, depuis le site seulement.
      let qm;
      if ((qm = /^\/r\/([A-Za-z0-9]+)$/.exec(path))) {
        if (!allowedOrigin(req.headers.get('origin'), env)) throw new HttpError(403, 'origin');
        if (req.method === 'GET') return json(await qrInfo(env, qm[1]), 200, h);
        if (req.method === 'POST') return json(await qrAnswer(env, qm[1], await body(req)), 200, h);
      }
      // Lecture de plan : aussi sans compte, mais seulement depuis l'app.
      if (path === '/plan/read' && req.method === 'POST') {
        if (!allowedOrigin(req.headers.get('origin'), env)) throw new HttpError(403, 'origin');
        return json(await readPlan(env, await body(req)), 200, h);
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
      else if (path === '/ref' && req.method === 'POST') out = await addRef(env, user, await body(req));
      else if (path === '/ref/count' && req.method === 'GET') out = await refCount(env, user);
      else if (path === '/admin' && req.method === 'GET') { needAdmin(user, env); out = await adminOverview(env); }
      else if ((m = /^\/admin\/teams\/([\w-]+)$/.exec(path)) && req.method === 'GET') { needAdmin(user, env); out = await adminTeam(env, m[1]); }
      else if ((m = /^\/admin\/teams\/([\w-]+)\/member$/.exec(path)) && req.method === 'POST') { needAdmin(user, env); out = await adminMember(env, m[1], await body(req)); }
      else throw new HttpError(404, 'not_found');
      return json(out, 200, h);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code }, e.status, h);
      console.error(e);
      return json({ error: 'server_error' }, 500, h);
    }
  },
};
