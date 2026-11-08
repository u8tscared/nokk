// Règles métier pures (testées) : état des portes, des rues, totaux, caisse.

export const RESULTS = {
  donne: { label: 'Calendrier donné', short: 'Donné', tone: 'ok' },
  absent: { label: 'Absent', short: 'Absent', tone: 'warn' },
  refus: { label: 'Refus', short: 'Refus', tone: 'bad' },
  deja: { label: 'Déjà pris', short: 'Déjà pris', tone: 'muted' },
};

export const METHODS = {
  especes: { label: 'Espèces' },
  carte: { label: 'Carte' },
  cheque: { label: 'Chèque' },
};

export const DENOMS = [
  { v: 50, kind: 'billet' }, { v: 20, kind: 'billet' }, { v: 10, kind: 'billet' }, { v: 5, kind: 'billet' },
  { v: 2, kind: 'piece' }, { v: 1, kind: 'piece' }, { v: 0.5, kind: 'piece' }, { v: 0.2, kind: 'piece' }, { v: 0.1, kind: 'piece' },
];

export const cents = (euros) => Math.round((+euros || 0) * 100);
export const euros = (c) => c / 100;

export function formatEuro(c, { decimals = 'auto' } = {}) {
  const v = c / 100;
  const d = decimals === 'auto' ? (Math.round(v) === v ? 0 : 2) : decimals;
  return v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €';
}

// Dernière visite par porte (et par logement pour un immeuble).
export function indexVisits(visits) {
  const byDoor = new Map();
  for (const v of visits) {
    if (!byDoor.has(v.doorId)) byDoor.set(v.doorId, []);
    byDoor.get(v.doorId).push(v);
  }
  for (const l of byDoor.values()) l.sort((a, b) => a.ts - b.ts);
  return byDoor;
}

/**
 * État d'une porte :
 *  - todo : jamais vue
 *  - donne / refus / deja : terminée
 *  - absent : à repasser (avec le nombre de passages)
 *  - partiel : immeuble commencé
 */
export function doorState(door, list = []) {
  if (!list.length) return { state: 'todo', passes: 0, amount: 0 };
  const amount = list.reduce((s, v) => s + (v.result === 'donne' ? v.amount || 0 : 0), 0);
  if (door.flats > 1) {
    const units = new Map();
    for (const v of list) units.set(v.unit || '_' + v.id, v);
    const done = [...units.values()].filter((v) => v.result !== 'absent').length;
    if (list.some((v) => v.closed) || done >= door.flats) return { state: 'donne', passes: list.length, amount, units: done, closed: true };
    return { state: 'partiel', passes: list.length, amount, units: done };
  }
  const last = list[list.length - 1];
  const passes = list.filter((v) => v.result === 'absent').length;
  return { state: last.result, passes, amount, last };
}

export const isDone = (s) => s === 'donne' || s === 'refus' || s === 'deja';

export function sectorStats(doors, byDoor) {
  const out = { total: doors.length, done: 0, donne: 0, absent: 0, refus: 0, deja: 0, todo: 0, partiel: 0, amount: 0 };
  for (const d of doors) {
    const st = doorState(d, byDoor.get(d.id));
    out[st.state] = (out[st.state] || 0) + 1;
    if (isDone(st.state)) out.done++;
    out.amount += st.amount;
  }
  out.pct = out.total ? Math.round((out.done / out.total) * 100) : 0;
  return out;
}

// Couleur d'une rue sur la carte.
export function streetState(doors, byDoor, now = Date.now(), meId = null) {
  if (!doors.length) return 'empty';
  let done = 0, absent = 0, live = false;
  for (const d of doors) {
    const l = byDoor.get(d.id) || [];
    const st = doorState(d, l).state;
    if (isDone(st)) done++;
    if (st === 'absent') absent++;
    const last = l[l.length - 1];
    if (last && now - last.ts < 12 * 60 * 1000 && meId && !(last.by || []).includes(meId)) live = true;
  }
  if (live && done < doors.length) return 'live';
  if (done === doors.length) return 'done';
  if (absent && done + absent === doors.length) return 'repasser';
  if (done + absent > 0) return 'partial';
  return 'todo';
}

export function totals(visits) {
  const t = { amount: 0, count: 0, calendars: 0, especes: 0, carte: 0, cheque: 0, absent: 0, refus: 0, deja: 0, donne: 0, nbCheques: 0 };
  for (const v of visits) {
    t[v.result] = (t[v.result] || 0) + 1;
    if (v.result !== 'donne') continue;
    t.amount += v.amount || 0;
    t.count++;
    t.calendars += v.calendars ?? 1;
    t[v.method || 'especes'] += v.amount || 0;
    if (v.method === 'cheque') t.nbCheques++;
  }
  t.average = t.count ? Math.round(t.amount / t.count) : 0;
  const knocked = t.donne + t.refus + t.deja + t.absent;
  t.rate = knocked ? Math.round((t.donne / knocked) * 100) : 0;
  return t;
}

export function countCash(counts) {
  let c = 0;
  for (const d of DENOMS) c += Math.round(d.v * 100) * (+counts[d.v] || 0);
  return c;
}

export function reconcile({ expectedCash, counted }) {
  const diff = counted - expectedCash;
  return { diff, tone: diff === 0 ? 'ok' : Math.abs(diff) <= 500 ? 'warn' : 'bad' };
}

// Montant habituel suggéré : l'an dernier ici, sinon la moyenne des dons du secteur, sinon le prix conseillé.
export function suggestAmount(door, sectorVisits, priceHint) {
  if (door?.lastYear?.amount) return door.lastYear.amount;
  const gifts = sectorVisits.filter((v) => v.result === 'donne').map((v) => v.amount);
  if (gifts.length >= 5) {
    gifts.sort((a, b) => a - b);
    const med = gifts[Math.floor(gifts.length / 2)];
    return Math.round(med / 500) * 500 || priceHint;
  }
  return priceHint;
}

// Moment conseillé pour repasser chez un absent.
export function revisitHint(visit) {
  if (!visit) return '';
  const h = new Date(visit.ts).getHours();
  if (h < 12) return 'Repasser en fin de journée';
  if (h < 17) return 'Repasser après 18 h';
  return 'Repasser samedi matin';
}

export function groupBy(list, fn) {
  const m = new Map();
  for (const x of list) {
    const k = fn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
