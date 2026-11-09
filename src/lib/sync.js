// Sauvegarde en ligne : chaque modification part vers le serveur dès qu'il y a du réseau,
// et les saisies des équipiers arrivent toutes seules. Rien ne part en démo.
//
// Principe : on compare les éléments de `data` par référence (les actions du store créent un nouvel objet
// à chaque changement). Ce qui a changé est noté « en attente » (clé + heure) et gardé sur l'appareil
// jusqu'à ce que le serveur l'ait reçu. Le contenu envoyé est toujours la version la plus récente.
import { signal, effect } from '@preact/signals';
import { data, demo, online, setData } from './store.js';
import { api } from './api.js';

export const KINDS = ['members', 'sectors', 'doors', 'visits', 'handovers', 'stock'];
const PKEY = 'nokk:pending:v1';
const CKEY = 'nokk:sync:v1';
const BATCH = 300;

// status : off | idle | syncing | offline | error
export const syncState = signal({ status: 'off', pending: 0, last: 0, error: null });

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let teamId = null;
let shadow = null; // { org, members: Map, … }
let pending = { team: null, items: {} }; // 'kind|id' -> { u, x }
let cursors = read(CKEY) || {};
let timer = 0;
let poll = 0;
let busy = false;
let again = false;
let failures = 0;
let stopEffect = null;
let waiters = [];

const pendingCount = () => Object.keys(pending.items).length;
function setState(patch) { syncState.value = { ...syncState.peek(), pending: pendingCount(), ...patch }; }
function savePending() { write(PKEY, pending); setState({}); }

function snapshot(d) {
  const s = { org: d.org || null };
  for (const k of KINDS) s[k] = new Map((d[k] || []).filter((x) => x && x.id).map((x) => [x.id, x]));
  return s;
}
const emptyShadow = () => { const s = { org: null }; for (const k of KINDS) s[k] = new Map(); return s; };

function mark(k, id, del) { pending.items[k + '|' + id] = { u: Date.now(), x: del ? 1 : 0 }; }

// Compare l'état courant à la dernière version connue et note les différences.
export function diff(d, opts = {}) {
  if (!shadow) return 0;
  const before = pendingCount();
  let n = 0;
  for (const k of KINDS) {
    const prev = shadow[k];
    const next = new Map();
    for (const x of d[k] || []) {
      if (!x || !x.id) continue;
      next.set(x.id, x);
      if (prev.get(x.id) !== x) { mark(k, x.id, false); n++; }
    }
    for (const id of prev.keys()) if (!next.has(id)) { mark(k, id, true); n++; }
    shadow[k] = next;
  }
  if ((d.org || null) !== shadow.org) {
    if (d.org && !opts.skipOrg) { mark('org', 'org', false); n++; }
    shadow.org = d.org || null;
  }
  if (n || pendingCount() !== before) { savePending(); schedule(1200); }
  return n;
}

const same = (a, b) => { try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; } };

// Applique ce qui vient du serveur sans le renvoyer. Une saisie locale plus récente reste prioritaire.
export function applyRemote(items) {
  if (!items.length || !shadow) return 0;
  const d = data.value;
  const maps = {};
  let org = d.org || null;
  let orgChanged = false;
  let n = 0;
  for (const it of items) {
    const key = it.k + '|' + it.i;
    const p = pending.items[key];
    if (p && p.u > it.u) continue;
    if (p) delete pending.items[key];
    if (it.k === 'org') {
      const v = it.x ? org : it.d;
      if (!same(v, org)) { org = v; orgChanged = true; n++; }
      continue;
    }
    if (!KINDS.includes(it.k)) continue;
    const m = (maps[it.k] ||= new Map((d[it.k] || []).filter((x) => x && x.id).map((x) => [x.id, x])));
    if (it.x) { if (m.delete(it.i)) n++; continue; }
    const cur = m.get(it.i);
    if (cur && same(cur, it.d)) continue;
    m.set(it.i, it.d);
    n++;
  }
  if (!n) { savePending(); return 0; }
  const out = { ...d };
  for (const k of Object.keys(maps)) { out[k] = [...maps[k].values()]; shadow[k] = new Map(maps[k]); }
  if (orgChanged) { out.org = org; shadow.org = org; }
  // Le secteur affiché ou la personne de ce téléphone ont pu être supprimés ailleurs.
  if (out.currentSectorId && !out.sectors.some((s) => s.id === out.currentSectorId)) out.currentSectorId = null;
  setData(() => out);
  savePending();
  return n;
}

function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(() => flush(), ms);
}

// Envoie ce qui attend et récupère les nouveautés, par paquets, jusqu'à être à jour.
export async function flush() {
  if (!teamId || demo.value) return false;
  if (busy) { again = true; return new Promise((res) => waiters.push(res)); }
  // On essaie même si le test réseau de la carte échoue : seul l'envoi dit vraiment s'il y a du réseau.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { setState({ status: 'offline' }); return false; }
  busy = true;
  clearTimeout(timer);
  setState({ status: 'syncing', error: null });
  let ok = false;
  try {
    for (let round = 0; round < 200; round++) {
      const d = data.value;
      const keys = Object.keys(pending.items).slice(0, BATCH);
      const idx = {};
      const changes = [];
      for (const key of keys) {
        const [k, ...rest] = key.split('|');
        const id = rest.join('|');
        const p = pending.items[key];
        let obj = null;
        if (k === 'org') obj = d.org;
        else {
          idx[k] ||= new Map((d[k] || []).filter((x) => x && x.id).map((x) => [x.id, x]));
          obj = idx[k].get(id);
        }
        if (p.x || !obj) changes.push({ k, i: id, x: true, u: p.u });
        else changes.push({ k, i: id, d: obj, u: p.u });
      }
      const res = await api('/sync', { method: 'POST', body: { teamId, since: cursors[teamId] || 0, changes } });
      for (const c of changes) {
        const key = c.k + '|' + c.i;
        if (pending.items[key]?.u === c.u) delete pending.items[key];
      }
      savePending();
      applyRemote([...(res.fix || []), ...(res.items || [])]);
      cursors[teamId] = res.cursor;
      write(CKEY, cursors);
      if (!res.more && !pendingCount()) break;
    }
    failures = 0;
    ok = true;
    setState({ status: 'idle', last: Date.now(), error: null });
  } catch (e) {
    failures++;
    const offline = e?.code === 'network';
    setState({ status: offline ? 'offline' : 'error', error: e?.code || 'error' });
    schedule(Math.min(60000, 3000 * 2 ** Math.min(failures, 5)));
  } finally {
    busy = false;
    const w = waiters;
    waiters = [];
    if (again) { again = false; flush().then((r) => w.forEach((f) => f(r))); }
    else w.forEach((f) => f(ok));
  }
  return ok;
}

// Démarre la sauvegarde pour une équipe. `upload` : tout ce qui est sur l'appareil part au serveur
// (première connexion de cet appareil à cette équipe).
export function startSync(id, { upload = false, skipOrg = false } = {}) {
  stopSync();
  teamId = id;
  const saved = read(PKEY);
  pending = saved && saved.team === id ? saved : { team: id, items: {} };
  shadow = upload ? emptyShadow() : snapshot(data.value);
  if (upload) diff(data.value, { skipOrg });
  stopEffect = effect(() => {
    const d = data.value;
    if (demo.value) return;
    diff(d);
  });
  setState({ status: 'idle' });
  poll = setInterval(() => { if (document.visibilityState !== 'hidden') flush(); }, 20000);
  return flush();
}

export function stopSync() {
  clearTimeout(timer);
  clearInterval(poll);
  stopEffect?.();
  stopEffect = null;
  teamId = null;
  shadow = null;
  setState({ status: 'off' });
}

export function hasCursor(id) { return !!cursors[id]; }

// Oublie tout ce qui concerne la sauvegarde sur cet appareil (déconnexion).
export function forgetSync() {
  stopSync();
  pending = { team: null, items: {} };
  cursors = {};
  try { localStorage.removeItem(PKEY); localStorage.removeItem(CKEY); } catch {}
  setState({ pending: 0, last: 0 });
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => teamId && flush());
  document.addEventListener('visibilitychange', () => {
    if (!teamId) return;
    if (document.visibilityState === 'visible') flush();
    else if (pendingCount()) flush(); // on part : on envoie ce qui attend
  });
  // Le store émet `online` aussi pour les coupures simulées.
  effect(() => { if (online.value && teamId) schedule(300); });
}
