// Sauvegarde en ligne : chaque modification part vers le serveur dès qu'il y a du réseau,
// et les saisies des équipiers arrivent toutes seules. Rien ne part en démo.
//
// Principe : on compare les éléments de `data` par référence (les actions du store créent un nouvel objet
// à chaque changement). Ce qui a changé est noté « en attente » (clé + heure) et gardé sur l'appareil
// jusqu'à ce que le serveur l'ait reçu. Le contenu envoyé est toujours la version la plus récente.
//
// Saisies simultanées (plusieurs binômes sur le même secteur, le même immeuble) : chaque envoi dit sur quelle
// version du serveur il a été fait (b). Si un équipier a écrit entre-temps, le serveur refuse et renvoie sa
// version ; ce téléphone fusionne les deux (merge.js : champ par champ, habitants par identifiant) et renvoie.
// Rien n'est écrasé : deux noms ajoutés en même temps dans le même immeuble restent tous les deux.
import { signal, effect } from '@preact/signals';
import { data, demo, online, setData } from './store.js';
import { api } from './api.js';
import { merge3, same } from './merge.js';

export const KINDS = ['members', 'sectors', 'doors', 'visits', 'handovers', 'stock', 'sessions', 'callbacks'];
const PKEY = 'nokk:pending:v1';
const CKEY = 'nokk:sync:v1';
const SKEY = 'nokk:seq:v1';
const BATCH = 300;

// status : off | idle | syncing | offline | error
export const syncState = signal({ status: 'off', pending: 0, last: 0, error: null });

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let teamId = null;
let shadow = null; // { org, members: Map, … }
let pending = { team: null, items: {} }; // 'kind|id' -> { u, x, b: version serveur de départ, o: contenu de départ }
let seqs = { team: null, m: {} }; // 'kind|id' -> numéro de la version du serveur que ce téléphone a
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
function savePending() { write(PKEY, pending); write(SKEY, seqs); setState({}); }

function snapshot(d) {
  const s = { org: d.org || null };
  for (const k of KINDS) s[k] = new Map((d[k] || []).filter((x) => x && x.id).map((x) => [x.id, x]));
  return s;
}
const emptyShadow = () => { const s = { org: null }; for (const k of KINDS) s[k] = new Map(); return s; };

// Note une modification locale. La première fois, on retient la version de départ (pour fusionner plus tard).
function mark(k, id, del, prev) {
  const key = k + '|' + id;
  const p = pending.items[key];
  if (p) { p.u = Math.max(Date.now(), p.u + 1); p.x = del ? 1 : 0; return; }
  pending.items[key] = { u: Date.now(), x: del ? 1 : 0, b: seqs.m[key] || 0, o: prev === undefined ? null : prev };
}

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
      if (prev.get(x.id) !== x) { mark(k, x.id, false, prev.get(x.id)); n++; }
    }
    for (const id of prev.keys()) if (!next.has(id)) { mark(k, id, true); n++; }
    shadow[k] = next;
  }
  if ((d.org || null) !== shadow.org) {
    if (d.org && !opts.skipOrg) { mark('org', 'org', false, shadow.org || undefined); n++; }
    shadow.org = d.org || null;
  }
  if (n || pendingCount() !== before) { savePending(); schedule(1200); }
  return n;
}

// Applique ce qui vient du serveur sans le renvoyer. Si ce téléphone a une saisie en attente sur le même
// élément, les deux sont fusionnées : la fusion reste en attente et repart, basée sur la version reçue.
// `force` : versions renvoyées parce que notre envoi a été refusé (toujours à fusionner).
export function applyRemote(items, { force = false } = {}) {
  if (!items.length || !shadow) return 0;
  const d = data.value;
  const maps = {};
  let org = d.org || null;
  let orgChanged = false;
  let n = 0;
  const get = (k, id) => (k === 'org' ? org || undefined : (maps[k] ||= new Map((d[k] || []).filter((x) => x && x.id).map((x) => [x.id, x]))).get(id));
  const put = (k, id, v) => {
    if (k === 'org') { const nv = v === undefined ? org : v; if (!same(nv, org)) { org = nv; orgChanged = true; n++; } return; }
    get(k, id);
    const m = maps[k];
    if (v === undefined) { if (m.delete(id)) n++; return; }
    const cur = m.get(id);
    if (cur && same(cur, v)) return;
    m.set(id, v);
    n++;
  };
  for (const it of items) {
    if (it.k !== 'org' && !KINDS.includes(it.k)) continue;
    const key = it.k + '|' + it.i;
    const p = pending.items[key];
    const s = Number.isFinite(it.s) ? it.s : null;
    if (p) {
      if (!force && s != null && s <= (p.b || 0)) continue; // déjà pris en compte
      if (it.x) { delete pending.items[key]; if (s != null) seqs.m[key] = s; put(it.k, it.i, undefined); continue; } // supprimé ailleurs
      if (s != null) p.b = s;
      const local = p.x ? undefined : get(it.k, it.i);
      if (local === undefined) continue; // supprimé ici : la suppression repart
      const merged = merge3(p.o == null ? undefined : p.o, local, it.d);
      if (s != null) seqs.m[key] = s;
      if (same(merged, it.d)) { delete pending.items[key]; put(it.k, it.i, it.d); continue; }
      p.o = it.d;
      p.u = Math.max(Date.now(), p.u + 1);
      put(it.k, it.i, merged);
      continue;
    }
    if (!force && s != null && seqs.m[key] && s < seqs.m[key]) continue; // plus ancien que ce qu'on a
    if (s != null) seqs.m[key] = s;
    put(it.k, it.i, it.x ? undefined : it.d);
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
        else changes.push({ k, i: id, d: obj, u: p.u, b: p.b || 0 });
      }
      const res = await api('/sync', { method: 'POST', body: { teamId, since: cursors[teamId] || 0, changes } });
      const acc = res.acc; // absent : ancien serveur, tout est accepté
      for (const c of changes) {
        const key = c.k + '|' + c.i;
        if (acc && !(key in acc)) continue; // refusé : un équipier a écrit avant, sa version est dans fix
        const s = acc ? acc[key] : null;
        if (s) seqs.m[key] = s;
        const p = pending.items[key];
        if (!p) continue;
        if (p.u === c.u) delete pending.items[key];
        else if (s) { p.b = s; p.o = c.d ?? null; } // modifié pendant l'envoi : la suite part de ce qu'on vient d'écrire
      }
      savePending();
      if (res.fix?.length) applyRemote(res.fix, { force: true });
      applyRemote(res.items || []);
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
  for (const p of Object.values(pending.items)) { if (p.b == null) p.b = 0; if (p.o === undefined) p.o = null; } // saisies d'avant la mise à jour
  const sq = read(SKEY);
  seqs = !upload && sq && sq.team === id && sq.m ? sq : { team: id, m: {} };
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
  seqs = { team: null, m: {} };
  cursors = {};
  try { localStorage.removeItem(PKEY); localStorage.removeItem(CKEY); localStorage.removeItem(SKEY); } catch {}
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
