// Saisie en équipe : plusieurs pompiers sur le même secteur, le même immeuble, qui enregistrent en même temps.
// Rien ne doit se perdre ni s'écraser, ni sur le serveur ni sur les autres téléphones.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import worker from '../../worker/index.js';
import { d1, testKeys } from '../support/d1.js';
import { merge3 } from '../../src/lib/merge.js';

const PROJECT = 'nokk-test';
let env, keys;
async function call(uid, method, path, body) {
  const headers = { origin: 'https://nokkapp.fr', 'content-type': 'application/json', authorization: 'Bearer ' + (await keys.token(uid)) };
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
  const j = await res.json();
  if (!res.ok) throw new Error(path + ' ' + res.status + ' ' + JSON.stringify(j));
  return j;
}
async function team(names) {
  const t = await call(names[0], 'POST', '/teams', { name: 'Caserne' });
  for (const n of names.slice(1)) await call(n, 'POST', '/teams/join', { code: t.code });
  return t;
}

beforeAll(async () => {
  keys = await testKeys(PROJECT);
  env = { DB: d1({ jitter: 4 }), PROJECT_ID: PROJECT, JWKS: [keys.jwk], ORIGINS: 'https://nokkapp.fr' };
});

describe('fusion de deux saisies', () => {
  const base = { id: 'd1', num: '12', residents: [{ id: 'r1', name: 'Dupont', floor: 0 }], tags: ['chien'] };
  it('deux habitants ajoutés en même temps restent tous les deux', () => {
    const a = { ...base, residents: [...base.residents, { id: 'r2', name: 'Martin', floor: 1 }] };
    const b = { ...base, residents: [...base.residents, { id: 'r3', name: 'Bernard', floor: 2 }] };
    expect(merge3(base, a, b).residents.map((r) => r.name)).toEqual(['Dupont', 'Bernard', 'Martin']);
  });
  it('champs différents modifiés des deux côtés : les deux gardés', () => {
    const a = { ...base, code: 'A1234', residents: [{ ...base.residents[0], floor: 3 }] };
    const b = { ...base, notes: 'Sonnette HS', residents: [{ ...base.residents[0], name: 'Dupond' }] };
    const m = merge3(base, a, b);
    expect(m).toMatchObject({ code: 'A1234', notes: 'Sonnette HS', residents: [{ id: 'r1', name: 'Dupond', floor: 3 }] });
  });
  it('un retrait d\'un côté, un ajout de l\'autre', () => {
    const a = { ...base, residents: [], tags: ['chien', 'digicode'] };
    const b = { ...base, residents: [...base.residents, { id: 'r2', name: 'Martin' }], tags: [] };
    const m = merge3(base, a, b);
    expect(m.residents.map((r) => r.id)).toEqual(['r2']);
    expect(m.tags).toEqual(['digicode']);
  });
  it('sans version de départ : on réunit, ce téléphone gagne sur le même champ', () => {
    const m = merge3(undefined, { id: 'x', a: 1, l: [{ id: 'p' }] }, { id: 'x', a: 2, b: 3, l: [{ id: 'q' }] });
    expect(m).toEqual({ id: 'x', a: 1, b: 3, l: [{ id: 'q' }, { id: 'p' }] });
  });
});

describe('serveur', () => {
  it('une écriture faite sur une version dépassée est refusée et la version actuelle renvoyée', async () => {
    const t = await team(['c1', 'p1']);
    const door = { id: 'd1', residents: [] };
    const a = await call('c1', 'POST', '/sync', { teamId: t.id, since: 0, changes: [{ k: 'doors', i: 'd1', d: door, u: Date.now(), b: 0 }] });
    const s1 = a.acc['doors|d1'];
    expect(s1).toBeGreaterThan(0);
    const b = await call('p1', 'POST', '/sync', { teamId: t.id, since: 0, changes: [{ k: 'doors', i: 'd1', d: { ...door, residents: [{ id: 'r9' }] }, u: Date.now(), b: 0 }] });
    expect(b.acc).toEqual({});
    expect(b.fix).toMatchObject([{ k: 'doors', i: 'd1', s: s1, d: door }]);
    const c = await call('p1', 'POST', '/sync', { teamId: t.id, since: 0, changes: [{ k: 'doors', i: 'd1', d: { ...door, residents: [{ id: 'r9' }] }, u: Date.now(), b: s1 }] });
    expect(c.acc['doors|d1']).toBeGreaterThan(s1);
    // Même avec une horloge en retard, la bonne version passe (pas de « le plus récent gagne »).
    const d = await call('c1', 'POST', '/sync', { teamId: t.id, since: 0, changes: [{ k: 'doors', i: 'd1', d: { ...door, notes: 'x' }, u: 1000, b: c.acc['doors|d1'] }] });
    expect(Object.keys(d.acc)).toEqual(['doors|d1']);
  });

  it('écritures simultanées de 4 téléphones : chacun voit toutes les saisies des autres', async () => {
    const names = ['q1', 'q2', 'q3', 'q4'];
    const t = await team(names);
    const cursors = Object.fromEntries(names.map((n) => [n, 0]));
    const seen = Object.fromEntries(names.map((n) => [n, new Set()]));
    const pull = async (n, changes = []) => {
      const r = await call(n, 'POST', '/sync', { teamId: t.id, since: cursors[n], changes });
      for (const it of r.items) seen[n].add(it.i);
      cursors[n] = r.cursor;
    };
    let id = 0;
    for (let round = 0; round < 15; round++) {
      await Promise.all(names.map((n) => pull(n, Array.from({ length: 1 + (round % 3) }, () => {
        const i = 'v' + ++id;
        return { k: 'visits', i, d: { id: i, by: [n] }, u: Date.now(), b: 0 };
      }))));
    }
    await Promise.all(names.map((n) => pull(n)));
    for (const n of names) expect(seen[n].size).toBe(id);
  });
});

// Un « téléphone » = une copie à part de l'app (store + sauvegarde), avec son propre stockage.
async function phone(uid, teamId, storage) {
  vi.resetModules();
  const mem = new Map();
  storage.current = mem;
  const tok = await keys.token(uid);
  vi.doMock('../../src/lib/api.js', () => ({
    api: async (path, { method = 'GET', body } = {}) => {
      const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: { origin: 'https://nokkapp.fr', 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: body ? JSON.stringify(body) : undefined }), env);
      const j = await res.json();
      if (!res.ok) throw Object.assign(new Error(j.error), { code: j.error });
      return j;
    },
  }));
  const store = await import('../../src/lib/store.js');
  const sync = await import('../../src/lib/sync.js');
  storage.current = null;
  await sync.startSync(teamId);
  return { uid, store, sync };
}

describe('téléphones en équipe', () => {
  it('4 pompiers dans le même immeuble, chacun son logement, en même temps : tous les noms et passages restent', async () => {
    const storage = { current: null };
    const shared = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k) => (storage.current || shared).get(k) ?? null,
      setItem: (k, v) => (storage.current || shared).set(k, String(v)),
      removeItem: (k) => (storage.current || shared).delete(k),
    });
    const names = ['f1', 'f2', 'f3', 'f4'];
    const t = await team(names);
    // Le chef crée le secteur avec un immeuble.
    const chef = await phone('f1', t.id, storage);
    chef.store.addSector({ id: 'sec', name: 'Bourg' }, [{ id: 'imm', num: '3', street: 'rue Haute', flats: 12, p: [0, 0] }]);
    await chef.sync.flush();
    const phones = [chef];
    for (const n of names.slice(1)) phones.push(await phone(n, t.id, storage));
    const doorId = 'sec-imm';
    for (const ph of phones) expect(ph.store.data.value.doors.some((d) => d.id === doorId)).toBe(true);

    // Chacun ajoute deux habitants et note deux passages, sans attendre les autres.
    for (let k = 0; k < 2; k++) {
      for (const ph of phones) {
        const r = ph.store.addResident(doorId, { id: 'r-' + ph.uid + '-' + k, name: 'Nom ' + ph.uid + k, floor: k });
        ph.store.addVisit({ doorId, sectorId: 'sec', rid: r.id, result: 'donne', amount: 1000 });
      }
      // Tous envoient en même temps.
      await Promise.all(phones.map((ph) => ph.sync.flush()));
    }
    // Quelqu'un corrige le code de la porte pendant qu'un autre ajoute une note.
    phones[1].store.updateDoor(doorId, { code: 'B1234' });
    phones[2].store.updateDoor(doorId, { notes: 'Interphone HS' });
    await Promise.all(phones.map((ph) => ph.sync.flush()));
    // Un dernier tour pour que tout le monde reçoive la fin.
    for (let i = 0; i < 2; i++) for (const ph of phones) await ph.sync.flush();

    const want = names.flatMap((n) => [0, 1].map((k) => 'r-' + n + '-' + k)).sort();
    for (const ph of phones) {
      const d = ph.store.data.value;
      const door = d.doors.find((x) => x.id === doorId);
      expect(door.residents.map((r) => r.id).sort()).toEqual(want);
      expect(door).toMatchObject({ code: 'B1234', notes: 'Interphone HS' });
      expect(d.visits.length).toBe(8);
      expect(new Set(d.visits.map((v) => v.id)).size).toBe(8);
      expect(ph.sync.syncState.value.pending).toBe(0);
    }
    const row = await env.DB.prepare("SELECT data FROM items WHERE team_id = ?1 AND kind = 'doors' AND id = ?2").bind(t.id, doorId).first();
    expect(JSON.parse(row.data).residents.map((r) => r.id).sort()).toEqual(want);
    for (const ph of phones) ph.sync.stopSync();
    vi.unstubAllGlobals();
  });
});
