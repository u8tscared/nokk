// Tournées : on lance (ou ça démarre tout seul à la première porte), un chrono tourne,
// et tout se calcule : argent, rythme, par personne. Fin automatique après 2 h sans saisie.
import { signal, computed, effect } from '@preact/signals';
import { data, setData, memberById } from './store.js';
import { totals, uid } from './model.js';

const IDLE = 2 * 3600e3; // 2 h sans porte : la tournée est finie

export const now = signal(Date.now());
let tick = 0;
function ensureTick(on) {
  if (on && !tick) tick = setInterval(() => { now.value = Date.now(); }, 1000);
  if (!on && tick) { clearInterval(tick); tick = 0; }
}

const mine = (s, d) => (s.crew || []).includes(d.meId) || s.by === d.meId;

function visitsOf(s, d = data.value, end = null) {
  const crew = new Set(s.crew || []);
  const to = end ?? s.endedAt ?? Infinity;
  return d.visits.filter((v) => v.ts >= s.startedAt && v.ts <= to && (!crew.size || (v.by || []).some((b) => crew.has(b))));
}

export const activeSession = computed(() => {
  const d = data.value;
  const s = [...(d.sessions || [])].reverse().find((x) => !x.endedAt && mine(x, d));
  ensureTick(!!s);
  return s || null;
});

export function startSession({ auto = false, at } = {}) {
  const d = data.value;
  if (activeSession.peek()) return activeSession.peek();
  const crew = d.crew?.length ? d.crew : [d.meId].filter(Boolean);
  const s = { id: uid('t'), startedAt: at ?? Date.now(), endedAt: null, sectorId: d.currentSectorId || d.sectors[0]?.id || null, crew, by: d.meId, auto };
  setData((x) => ({ ...x, sessions: [...(x.sessions || []), s] }));
  return s;
}

export function endSession(id, at = Date.now()) {
  setData((x) => ({ ...x, sessions: (x.sessions || []).map((s) => (s.id === id ? { ...s, endedAt: at } : s)) }));
}

export function removeSession(id) {
  setData((x) => ({ ...x, sessions: (x.sessions || []).filter((s) => s.id !== id) }));
}

// Une tournée oubliée (2 h sans porte) se termine à sa dernière porte.
export function closeIdle(t = Date.now()) {
  const d = data.value;
  for (const s of d.sessions || []) {
    if (s.endedAt) continue;
    const list = visitsOf(s, d);
    const last = list.length ? Math.max(...list.map((v) => v.ts)) : s.startedAt;
    if (t - last > IDLE) endSession(s.id, last + 5 * 60e3 > t ? t : Math.max(s.startedAt + 60e3, last + 5 * 60e3));
  }
}

// Démarrage automatique à la première porte saisie hors tournée.
export function autoStart(visit) {
  closeIdle(visit.ts);
  if (!activeSession.peek()) startSession({ auto: true, at: visit.ts - 60e3 });
}

/** Tout ce qu'on peut dire d'une tournée. */
export function sessionStats(s, t = now.value) {
  const d = data.value;
  const list = visitsOf(s, d);
  const end = s.endedAt || t;
  const ms = Math.max(60e3, end - s.startedAt);
  const h = ms / 3600e3;
  const tt = totals(list);
  const people = Math.max(1, (s.crew || []).length);
  const doors = new Set(list.map((v) => v.doorId + '|' + (v.unit || ''))).size;
  const streets = new Map();
  const byDoor = new Map(d.doors.map((x) => [x.id, x]));
  for (const v of list) {
    if (v.result !== 'donne') continue;
    const st = byDoor.get(v.doorId)?.street || '—';
    streets.set(st, (streets.get(st) || 0) + (v.amount || 0));
  }
  const best = [...streets.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const hours = Array.from({ length: Math.min(12, Math.ceil(h)) }, (_, i) => totals(list.filter((v) => v.ts >= s.startedAt + i * 3600e3 && v.ts < s.startedAt + (i + 1) * 3600e3)).amount);
  return {
    ms, amount: tt.amount, gifts: tt.count, average: tt.average, rate: tt.rate, calendars: tt.calendars,
    absent: tt.absent, refus: tt.refus + tt.deja, doors, people,
    perHour: Math.round(tt.amount / h), perPerson: Math.round(tt.amount / people), doorsPerHour: Math.round(doors / h),
    minutesPerDoor: doors ? Math.round((ms / 60e3 / doors) * 10) / 10 : null,
    especes: tt.especes, carte: tt.carte, cheque: tt.cheque, best: best && { street: best[0], amount: best[1] },
    crew: (s.crew || []).map((id) => memberById.value.get(id)?.name).filter(Boolean), hours,
  };
}

export const sessionsDone = computed(() => [...(data.value.sessions || [])].filter((s) => s.endedAt).sort((a, b) => b.startedAt - a.startedAt));

export function formatDuration(ms) {
  const m = Math.floor(ms / 60e3);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}
export function formatChrono(ms) {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return (hh ? hh + ':' + String(mm).padStart(2, '0') : String(mm)) + ':' + String(ss).padStart(2, '0');
}

// Chaque nouvelle porte saisie sur ce téléphone fait démarrer la tournée si besoin.
let seen = -1;
effect(() => {
  const d = data.value;
  const n = d.visits.length;
  if (seen < 0 || n < seen) { seen = n; return; }
  if (n === seen) return;
  const fresh = d.visits.slice(seen).filter((v) => Date.now() - v.ts < 120e3 && (v.by || []).includes(d.meId) && v.result);
  seen = n;
  if (fresh.length) queueMicrotask(() => autoStart(fresh[0]));
});
