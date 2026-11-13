// QR « Repassez plus tard » : jetons des secteurs, cartes laissées aux portes, demandes reçues.
import { signal, computed } from '@preact/signals';
import { data, setData, updateSector, byDoor } from './store.js';
import { API_BASE } from './api.js';

export const QR_BASE = 'https://nokkapp.fr/r/#';
export const serverFeatures = signal(null); // null : on ne sait pas encore

export async function loadFeatures() {
  if (serverFeatures.peek()) return serverFeatures.peek();
  try {
    const r = await fetch(API_BASE + '/health', { cache: 'no-store' });
    const j = await r.json();
    serverFeatures.value = j.features || [];
  } catch { /* hors ligne : on réessaiera */ }
  return serverFeatures.peek();
}
export const qrReady = computed(() => !!serverFeatures.value?.includes('callbacks'));

function token() {
  const a = crypto.getRandomValues(new Uint8Array(12));
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return [...a].map((x) => abc[x % abc.length]).join('');
}
export function ensureQr(sector) {
  if (sector.qr) return sector.qr;
  const t = token();
  updateSector(sector.id, { qr: t });
  return t;
}
export const qrUrl = (t) => QR_BASE + t;

/** Prochaine carte à laisser dans ce secteur (dans l'ordre de la pile). */
export function nextCard(sectorId, d = data.peek()) {
  const s = d.sectors.find((x) => x.id === sectorId);
  if (!s?.qr || !s.qrPrinted) return null;
  const used = d.visits.filter((v) => v.sectorId === sectorId && v.card).map((v) => v.card);
  const n = (used.length ? Math.max(...used) : 0) + 1;
  return n > s.qrPrinted ? ((n - 1) % s.qrPrinted) + 1 : n;
}

export const CB_DONE_STATES = ['done', 'cancelled'];
const dayKey = (cb) => (cb.slot ? cb.slot.day + String(cb.slot.from).padStart(2, '0') : '9999');

/** Les demandes, avec la porte retrouvée grâce au numéro de carte. */
export const callbacks = computed(() => {
  const d = data.value;
  const list = d.callbacks || [];
  const cardDoor = new Map();
  for (const v of d.visits) if (v.card) cardDoor.set(v.sectorId + '#' + v.card, v.doorId);
  return list.map((cb) => {
    const doorId = cb.n ? cardDoor.get(cb.sectorId + '#' + cb.n) : null;
    const door = doorId ? d.doors.find((x) => x.id === doorId) : null;
    // Passé à cette porte après la demande : c'est fait.
    const visited = door && (byDoor.value.get(door.id) || []).some((v) => v.ts > cb.ts && v.result !== 'absent');
    const done = CB_DONE_STATES.includes(cb.status) || (cb.want === 'oui' && visited);
    return { ...cb, door, done };
  }).sort((a, b) => dayKey(a).localeCompare(dayKey(b)) || a.ts - b.ts);
});
export const openCallbacks = computed(() => callbacks.value.filter((c) => c.want === 'oui' && !c.done));

export function setCallback(id, patch) {
  setData((d) => ({ ...d, callbacks: (d.callbacks || []).map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
}

const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
export function slotDay(slot, now = new Date()) {
  return slotLabel(slot, now).split(' · ')[0];
}
export const slotHours = (slot) => (slot?.day ? `${slot.from} h – ${slot.to} h` : '');
export function slotLabel(slot, now = new Date()) {
  if (!slot?.day) return 'Sans créneau';
  const [y, m, dd] = slot.day.split('-').map(Number);
  const d = new Date(y, m - 1, dd);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((d - today) / 864e5);
  const day = diff === 0 ? "Aujourd'hui" : diff === 1 ? 'Demain' : `${DAYS[d.getDay()]} ${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${day} · ${slot.from} h – ${slot.to} h`;
}
