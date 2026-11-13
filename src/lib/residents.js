// Habitants d'un immeuble : noms des boîtes aux lettres, étages, et où en est chacun.
// Tout est pur (testé). Un habitant : { id, name, floor, unit }.
//   floor : 0 = rez-de-chaussée, -1 = sous-sol, 1, 2… ; null = étage inconnu.
//   unit  : porte / boîte si c'est écrit (« B12 », « 2e gauche »), facultatif.
import { uid } from './model.js';

// ——— Étages ———
export function parseFloor(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? Math.max(-3, Math.min(60, Math.round(input))) : null;
  const s = String(input).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (!s || /^(null|\?|inconnu|n\/?a|-)$/.test(s)) return null;
  if (/^(rdc|r\.?d\.?c\.?|rez|rez[- ]de[- ]chaussee|rez[- ]de[- ]jardin|rdj|0|0e|0eme)\b/.test(s) || /rez/.test(s)) return 0;
  if (/^(ss|sous[- ]?sol|s\/sol)/.test(s) || /^-\s*1$/.test(s)) return -1;
  const m = s.match(/-?\d{1,2}/);
  if (m) return parseFloor(+m[0]);
  const words = { premier: 1, deuxieme: 2, second: 2, troisieme: 3, quatrieme: 4, cinquieme: 5, sixieme: 6, septieme: 7, huitieme: 8, neuvieme: 9, dixieme: 10 };
  for (const [w, n] of Object.entries(words)) if (s.includes(w)) return n;
  return null;
}

/** « RDC », « 1er », « 2e »… */
export function floorShort(f) {
  if (f === null || f === undefined) return '?';
  if (f === 0) return 'RDC';
  if (f < 0) return f === -1 ? 'S-sol' : `S-sol ${-f}`;
  return f === 1 ? '1er' : f + 'e';
}
/** « Rez-de-chaussée », « 1er étage »… */
export function floorLabel(f) {
  if (f === null || f === undefined) return 'Étage non précisé';
  if (f === 0) return 'Rez-de-chaussée';
  if (f < 0) return f === -1 ? 'Sous-sol' : `Sous-sol ${-f}`;
  return floorShort(f) + ' étage';
}
// Ordre de visite : du bas vers le haut, l'étage inconnu à la fin.
export const floorRank = (f) => (f === null || f === undefined ? 1000 : f);

// ——— Noms ———
export const nameKey = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(m|mr|mme|mlle|mm|monsieur|madame|mademoiselle|et|famille|fam|ep|epouse|ou)\b\.?/g, ' ')
  .replace(/[^a-z0-9]/g, '');

function lev(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}
/** Même habitant, à une faute de lecture près (DUPONT / DUPOND). */
export function sameName(a, b) {
  const x = nameKey(a), y = nameKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (Math.min(x.length, y.length) >= 5 && lev(x, y) <= 1) return true;
  return false;
}

// « DUPONT Jean » → « Dupont Jean » ; on garde « de », « Mme »… lisibles.
export function tidyName(s) {
  const t = String(s || '').replace(/\s+/g, ' ').replace(/^[\s,;.\-–]+|[\s,;\-–]+$/g, '').trim().slice(0, 60);
  if (!t) return '';
  return t.split(' ').map((w) => {
    if (/^(de|du|des|la|le|et|van|von|d'|l')$/i.test(w)) return w.toLowerCase();
    if (/^(m|mr|mme|mlle)\.?$/i.test(w)) return w[0].toUpperCase() + w.slice(1).toLowerCase();
    if (w === w.toUpperCase() && /[A-ZÀ-Ý]{2,}/.test(w)) return w.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
    return w;
  }).join(' ');
}

export function makeResident(r = {}) {
  return { id: r.id || uid('r'), name: tidyName(r.name), floor: parseFloor(r.floor), unit: String(r.unit || '').trim().slice(0, 20) || undefined };
}

export function residentLabel(r, i) {
  return r?.name || (r?.unit ? 'Logt ' + r.unit : 'Logement ' + ((i ?? 0) + 1));
}

/**
 * Ajoute une lecture de photo à la liste : les noms déjà là ne sont pas doublés,
 * mais un étage lu vient compléter un étage inconnu. Rend { list, added, updated }.
 */
export function mergeResidents(existing = [], read = []) {
  const list = existing.map((r) => ({ ...r }));
  let added = 0, updated = 0;
  for (const x of read) {
    const n = makeResident(x);
    if (!n.name && !n.unit) continue;
    const same = n.name ? list.find((r) => sameName(r.name, n.name)) : list.find((r) => r.unit && r.unit === n.unit);
    if (same) {
      let ch = false;
      if ((same.floor === null || same.floor === undefined) && n.floor !== null) { same.floor = n.floor; ch = true; }
      if (!same.unit && n.unit) { same.unit = n.unit; ch = true; }
      if (ch) updated++;
      continue;
    }
    list.push(n);
    added++;
  }
  return { list, added, updated };
}

export function sortResidents(list = []) {
  return list.map((r, i) => [r, i]).sort((a, b) => floorRank(a[0].floor) - floorRank(b[0].floor) || a[1] - b[1]).map((x) => x[0]);
}

// ——— Où en est chaque habitant ———
const visitKey = (v) => v.rid || v.unit || '_' + v.id;

/**
 * Pour chaque habitant : sa dernière visite et le nombre de fois où il était absent.
 * state : todo | donne | absent | refus | deja.
 */
export function residentStates(door, list = []) {
  const residents = door?.residents || [];
  const byRid = new Map();
  for (const v of list) {
    if (v.closed) continue;
    const r = v.rid ? residents.find((x) => x.id === v.rid) : null;
    const key = r ? r.id : null;
    if (!key) continue;
    if (!byRid.has(key)) byRid.set(key, []);
    byRid.get(key).push(v);
  }
  return residents.map((r, i) => {
    const vs = (byRid.get(r.id) || []).slice().sort((a, b) => a.ts - b.ts);
    const last = vs[vs.length - 1];
    return {
      r, i, label: residentLabel(r, i), visits: vs, last,
      state: last ? last.result : 'todo',
      absences: vs.filter((v) => v.result === 'absent').length,
      amount: vs.reduce((s, v) => s + (v.result === 'donne' ? v.amount || 0 : 0), 0),
    };
  });
}

export const isOpen = (s) => s === 'todo' || s === 'absent';

/** Étages dans l'ordre, avec les habitants et ce qui reste. */
export function byFloor(states) {
  const m = new Map();
  for (const s of states) {
    const f = s.r.floor ?? null;
    if (!m.has(f)) m.set(f, []);
    m.get(f).push(s);
  }
  return [...m.entries()].sort((a, b) => floorRank(a[0]) - floorRank(b[0])).map(([floor, items]) => ({
    floor, items,
    left: items.filter((s) => isOpen(s.state)).length,
    todo: items.filter((s) => s.state === 'todo').length,
    absent: items.filter((s) => s.state === 'absent').length,
  }));
}

/**
 * Habitant suivant : d'abord ceux jamais vus, puis les absents ; au même étage si possible, puis en montant.
 */
export function nextResident(states, fromRid) {
  const open = states.filter((s) => isOpen(s.state) && s.r.id !== fromRid);
  if (!open.length) return null;
  const from = states.find((s) => s.r.id === fromRid);
  const f = from ? floorRank(from.r.floor) : -Infinity;
  const anyTodo = open.some((s) => s.state === 'todo');
  const pool = anyTodo ? open.filter((s) => s.state === 'todo') : open;
  const order = (s) => {
    const r = floorRank(s.r.floor);
    return (r === f ? 0 : r > f ? 1 : 2) * 10000 + r * 10 + s.i / 1000;
  };
  return pool.slice().sort((a, b) => order(a) - order(b))[0];
}

/** Numéro du passage dans l'immeuble : nombre de jours différents où l'on est venu. */
export function passCount(list = []) {
  return new Set(list.filter((v) => !v.closed).map((v) => new Date(v.ts).toDateString())).size;
}

const STATE_TXT = { todo: 'à voir', absent: 'absent', donne: 'donné', refus: 'refus', deja: 'déjà pris' };
const euro = (c) => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 }) + ' €';

/** Récap en texte, à partager (WhatsApp, SMS…) avant une repasse. */
export function recapText(door, states, { onlyOpen = false } = {}) {
  const floors = byFloor(states);
  const left = states.filter((s) => isOpen(s.state)).length;
  const lines = [`${door.num} ${door.street} · ${states.length} boîtes · reste ${left} à voir`];
  for (const g of floors) {
    const items = onlyOpen ? g.items.filter((s) => isOpen(s.state)) : g.items;
    if (!items.length) continue;
    lines.push('', floorLabel(g.floor) + ' :');
    for (const s of items) {
      const st = s.state === 'absent' ? `absent${s.absences > 1 ? ' ×' + s.absences : ''}` : s.state === 'donne' ? `donné ${euro(s.amount)}` : STATE_TXT[s.state];
      lines.push(`- ${s.label}${s.r.unit && s.r.name ? ' (' + s.r.unit + ')' : ''} : ${st}`);
    }
  }
  return lines.join('\n');
}
