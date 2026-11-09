// API Nokk testée de bout en bout : vraie base SQLite (comme D1), vrais jetons RS256 signés pour le test.
import { describe, it, expect, beforeAll } from 'vitest';
import worker, { verifyToken } from '../../worker/index.js';

import { d1 } from '../support/d1.js';

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
async function call(uid, method, path, body, origin = 'https://u8tscared.github.io', claims = {}) {
  const headers = { origin, 'content-type': 'application/json' };
  if (uid) headers.authorization = 'Bearer ' + (await token(uid, claims));
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

  it('espace admin : réservé au compte Google de Marceau, chiffres par équipe, par compte et par pompier', async () => {
    const admin = (method, path, b) => call('boss', method, path, b, undefined, { email: 'Marceau.Ruis@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } });
    const t = (await call('chef1', 'POST', '/teams', { name: 'Caluire' })).body;
    await call('pomp1', 'POST', '/teams/join', { code: t.code });
    const now = Date.now();
    await call('chef1', 'POST', '/sync', { teamId: t.id, since: 0, changes: [
      { k: 'members', i: 'm1', d: { id: 'm1', name: 'Paul', role: 'chef' }, u: now },
      { k: 'members', i: 'm2', d: { id: 'm2', name: 'Léa', role: 'pompier' }, u: now },
      { k: 'sectors', i: 's1', d: { id: 's1', name: 'Nord' }, u: now },
      { k: 'visits', i: 'w1', d: { id: 'w1', sectorId: 's1', ts: now, by: ['m1', 'm2'], result: 'donne', amount: 1000, calendars: 2 }, u: now },
      { k: 'visits', i: 'w2', d: { id: 'w2', sectorId: 's1', ts: now, by: ['m2'], result: 'refus' }, u: now },
      { k: 'sessions', i: 't1', d: { id: 't1', startedAt: now - 36e5, endedAt: now, crew: ['m1', 'm2'] }, u: now },
    ] });
    await call('pomp1', 'POST', `/teams/${t.id}/link`, { memberId: 'm2' });
    await call('pomp1', 'GET', '/me');

    expect((await call('chef1', 'GET', '/admin')).status).toBe(403);
    // Même e-mail mais non vérifié (compte e-mail + mot de passe) : refusé.
    expect((await call('x', 'GET', '/admin', undefined, undefined, { email: 'marceau.ruis@gmail.com', email_verified: false, firebase: { sign_in_provider: 'password' } })).status).toBe(403);
    expect((await admin('GET', '/me')).body.admin).toBe(true);
    expect((await call('chef1', 'GET', '/me')).body.admin).toBe(false);

    const o = (await admin('GET', '/admin')).body;
    const team = o.teams.find((x) => x.id === t.id);
    expect(team).toMatchObject({ name: 'Caluire', accounts: 2, members: 2, sectors: 1, tours: 1, visits: 2, calendars: 2, amount: 1000, owner: 'chef1@ex.fr' });
    expect(o.accounts.find((a) => a.uid === 'chef1')).toMatchObject({ calendars: 2, teams: [{ name: 'Caluire', role: 'owner' }] });
    expect(o.totals.calendars).toBeGreaterThanOrEqual(2);
    expect(o.days.length).toBeGreaterThan(0);

    const d = (await admin('GET', `/admin/teams/${t.id}`)).body;
    expect(d.members.find((m) => m.id === 'm2')).toMatchObject({ name: 'Léa', visits: 2, calendars: 2, amount: 1000, tours: 1, minutes: 60, email: 'pomp1@ex.fr' });
    expect(d.sectors[0]).toMatchObject({ name: 'Nord', visits: 2, calendars: 2 });

    expect((await admin('POST', `/admin/teams/${t.id}/member`, { uid: 'pomp1', action: 'role', role: 'owner' })).body.role).toBe('owner');
    expect((await admin('POST', `/admin/teams/${t.id}/member`, { uid: 'pomp1', action: 'remove' })).body.removed).toBe(true);
    expect((await call('pomp1', 'POST', '/sync', { teamId: t.id, since: 0 })).status).toBe(403);
    expect((await call('chef1', 'POST', `/admin/teams/${t.id}/member`, { uid: 'chef1', action: 'remove' })).status).toBe(403);
  });

  it('rejette les données invalides', async () => {
    const t = (await call('c', 'POST', '/teams', { name: 'X' })).body;
    expect((await call('c', 'POST', '/sync', { teamId: t.id, changes: [{ k: 'hack', i: 'x', d: {} }] })).status).toBe(400);
    expect((await call('c', 'POST', '/sync', { teamId: t.id, changes: [{ k: 'doors', i: 'x', d: 'str' }] })).status).toBe(400);
  });
});
