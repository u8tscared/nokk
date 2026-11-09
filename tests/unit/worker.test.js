// API Nokk testée de bout en bout : vraie base SQLite (comme D1), vrais jetons RS256 signés pour le test.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import worker, { verifyToken } from '../../worker/index.js';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../worker/schema.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
    _exec: () => db.prepare(sql).run(...args),
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (list) => {
      db.exec('BEGIN');
      try { for (const s of list) s._exec(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
      return [];
    },
  };
}

const PROJECT = 'nokk-test';
let keyPair, jwk;
const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
async function token(uid, extra = {}) {
  const now = Math.floor(Date.now() / 1000);
  const h = enc({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const p = enc({ iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, sub: uid, iat: now, exp: now + 3600, email: uid + '@ex.fr', ...extra });
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, new TextEncoder().encode(h + '.' + p));
  return h + '.' + p + '.' + Buffer.from(sig).toString('base64url');
}

let env;
async function call(uid, method, path, body, origin = 'https://u8tscared.github.io') {
  const headers = { origin, 'content-type': 'application/json' };
  if (uid) headers.authorization = 'Bearer ' + (await token(uid));
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
  return { status: res.status, body: res.status === 204 ? null : await res.json(), headers: res.headers };
}

beforeAll(async () => {
  keyPair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  jwk = { ...(await crypto.subtle.exportKey('jwk', keyPair.publicKey)), kid: 'k1' };
  env = { DB: d1(), PROJECT_ID: PROJECT, JWKS: [jwk] };
});

describe('API Nokk', () => {
  it('refuse sans jeton, avec un faux jeton ou un autre projet', async () => {
    expect((await call(null, 'GET', '/me')).status).toBe(401);
    const t = await token('a');
    const forged = t.slice(0, -6) + 'AAAAAA';
    await expect(verifyToken(forged, env)).rejects.toThrow();
    await expect(verifyToken(await token('a', { aud: 'autre' }), env)).rejects.toThrow();
    await expect(verifyToken(await token('a', { exp: 10 }), env)).rejects.toThrow();
    expect((await verifyToken(t, env)).uid).toBe('a');
  });

  it('CORS : le site et localhost, pas les autres', async () => {
    const ok = await call(null, 'OPTIONS', '/sync');
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://u8tscared.github.io');
    const loc = await call(null, 'OPTIONS', '/sync', null, 'http://localhost:4173');
    expect(loc.headers.get('access-control-allow-origin')).toBe('http://localhost:4173');
    const bad = await call(null, 'OPTIONS', '/sync', null, 'https://evil.example');
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('équipe : création, code, rejoindre, liaison au membre', async () => {
    const me0 = await call('chef', 'GET', '/me');
    expect(me0.body.teams).toEqual([]);
    const t = (await call('chef', 'POST', '/teams', { name: 'Amicale de Rezé', memberId: 'm1' })).body;
    expect(t.code).toMatch(/^[A-Z2-9]{6}$/);
    expect((await call('chef', 'GET', '/me')).body.teams[0]).toMatchObject({ id: t.id, role: 'owner', memberId: 'm1' });
    expect((await call('pompier', 'POST', '/teams/join', { code: 'ZZZZZZ' })).status).toBe(404);
    const j = await call('pompier', 'POST', '/teams/join', { code: t.code.toLowerCase() });
    expect(j.body).toMatchObject({ id: t.id, role: 'member', memberId: null });
    await call('pompier', 'POST', `/teams/${t.id}/link`, { memberId: 'm2' });
    expect((await call('pompier', 'GET', '/me')).body.teams[0].memberId).toBe('m2');
    expect((await call('intrus', 'POST', '/sync', { teamId: t.id, since: 0, changes: [] })).status).toBe(403);
  });

  it('sauvegarde et récupère tout, la plus récente gagne, suppressions comprises', async () => {
    const t = (await call('a', 'POST', '/teams', { name: 'Équipe' })).body;
    await call('b', 'POST', '/teams/join', { code: t.code });
    const now = Date.now();
    const doors = Array.from({ length: 1200 }, (_, i) => ({ k: 'doors', i: 'd' + i, d: { id: 'd' + i, num: String(i), p: [1.5, 47.2] }, u: now - 10000 }));
    const push = await call('a', 'POST', '/sync', { teamId: t.id, since: 0, changes: doors.slice(0, 500) });
    expect(push.body.accepted).toBe(500);
    await call('a', 'POST', '/sync', { teamId: t.id, since: 0, changes: doors.slice(500, 1000) });
    await call('a', 'POST', '/sync', { teamId: t.id, since: 0, changes: [...doors.slice(1000), { k: 'org', i: 'org', d: { name: 'Amicale' }, u: now - 10000 }, { k: 'visits', i: 'v1', d: { id: 'v1', doorId: 'd1', amount: 1000 }, u: now - 10000 }] });

    // Un nouveau téléphone récupère tout, par pages.
    let since = 0, got = [], more = true, pages = 0;
    while (more) { const r = (await call('b', 'POST', '/sync', { teamId: t.id, since })).body; got.push(...r.items); since = r.cursor; more = r.more; pages++; }
    expect(pages).toBe(2);
    expect(got.length).toBe(1202);
    expect(got.find((x) => x.k === 'visits').d.amount).toBe(1000);

    // Modif récente de B, puis modif plus ancienne de A : celle de B reste, A reçoit la bonne version.
    await call('b', 'POST', '/sync', { teamId: t.id, since, changes: [{ k: 'visits', i: 'v1', d: { id: 'v1', doorId: 'd1', amount: 2000 }, u: now - 1000 }] });
    const old = (await call('a', 'POST', '/sync', { teamId: t.id, since: 0, changes: [{ k: 'visits', i: 'v1', d: { id: 'v1', doorId: 'd1', amount: 500 }, u: now - 5000 }] })).body;
    const all = [...old.fix, ...old.items].filter((x) => x.i === 'v1');
    expect(all.at(-1).d.amount).toBe(2000);

    // Horloge en avance : ramenée à l'heure du serveur.
    await call('a', 'POST', '/sync', { teamId: t.id, since: 0, changes: [{ k: 'visits', i: 'v2', d: { id: 'v2' }, u: now + 10 * 86400e3 }] });
    const after = (await call('b', 'POST', '/sync', { teamId: t.id, since, changes: [{ k: 'visits', i: 'v2', x: true, u: Date.now() + 5 }] })).body;
    expect(after.accepted).toBe(1);

    // Export complet sans les éléments supprimés.
    const ex = (await call('a', 'GET', `/teams/${t.id}/export`)).body;
    expect(ex.doors.length).toBe(1200);
    expect(ex.org.name).toBe('Amicale');
    expect(ex.visits.map((v) => v.id)).toEqual(['v1']);
    expect(ex.visits[0].amount).toBe(2000);
  });

  it('rejette les données invalides', async () => {
    const t = (await call('c', 'POST', '/teams', { name: 'X' })).body;
    expect((await call('c', 'POST', '/sync', { teamId: t.id, changes: [{ k: 'hack', i: 'x', d: {} }] })).status).toBe(400);
    expect((await call('c', 'POST', '/sync', { teamId: t.id, changes: [{ k: 'doors', i: 'x', d: 'str' }] })).status).toBe(400);
  });
});
