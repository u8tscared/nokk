// État de l'app : signaux Preact + sauvegarde sur l'appareil (sauf en démo).
import { signal, computed, batch } from '@preact/signals';
import { indexVisits, uid } from './model.js';

const KEY = 'nokk:data:v1';
const SETTINGS_KEY = 'nokk:settings:v1';

export const DEFAULT_SETTINGS = {
  sound: true,
  haptics: true,
  theme: 'auto', // auto | light | dark | soir
  simple: false,
  sides: 'auto', // auto | zigzag | cote
  follow: true,
  lockedView: null,
};

function read(key) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; }
}
function write(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; }
}

export const emptyData = () => ({
  v: 1,
  org: null, // { name, city, year, price, stock }
  members: [],
  meId: null,
  sectors: [],
  doors: [],
  visits: [],
  handovers: [],
  stock: [], // { id, ts, memberId, qty }  qty>0 = calendriers confiés, <0 = rendus
  currentSectorId: null,
  crew: [], // équipiers de ce soir
});

export const settings = signal({ ...DEFAULT_SETTINGS, ...(read(SETTINGS_KEY) || {}) });
export const data = signal(read(KEY) || emptyData());
export const demo = signal(false);
export const online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
export const lastSaved = signal(0);
export const position = signal(null); // { p:[lon,lat], acc, heading, ts }
export const geoState = signal('idle'); // idle | asking | on | denied | unavailable

let saveTimer = 0;
export const saveError = signal(false);
function flush() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (demo.value) return;
  const ok = write(KEY, data.value);
  saveError.value = !ok;
  if (ok) lastSaved.value = Date.now();
}
function persist() {
  if (demo.value) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 120);
}
if (typeof window !== 'undefined') {
  // Rien ne se perd si l'app est fermée juste après une saisie.
  window.addEventListener('pagehide', () => saveTimer && flush());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveTimer) flush(); });
  window.addEventListener('beforeunload', () => saveTimer && flush());
}
export function saveSettings(patch) {
  settings.value = { ...settings.value, ...patch };
  write(SETTINGS_KEY, settings.value);
}

export function setData(fn) {
  data.value = fn(data.value);
  persist();
}

// Données réelles mises de côté pendant la démo.
let realBackup = null;
export function enterDemo(demoData) {
  realBackup = data.value;
  batch(() => { demo.value = true; data.value = demoData; });
}
export function exitDemo() {
  batch(() => { demo.value = false; data.value = realBackup || read(KEY) || emptyData(); });
  realBackup = null;
}

export const byDoor = computed(() => indexVisits(data.value.visits));
export const me = computed(() => data.value.members.find((m) => m.id === data.value.meId) || null);
export const role = computed(() => me.value?.role || 'chef');
export const currentSector = computed(() => data.value.sectors.find((s) => s.id === data.value.currentSectorId) || data.value.sectors[0] || null);
export const doorsBySector = computed(() => {
  const m = new Map();
  for (const d of data.value.doors) {
    if (!m.has(d.sectorId)) m.set(d.sectorId, []);
    m.get(d.sectorId).push(d);
  }
  return m;
});
export const doorById = computed(() => new Map(data.value.doors.map((d) => [d.id, d])));
export const memberById = computed(() => new Map(data.value.members.map((m) => [m.id, m])));

// ——— Actions ———

export function addVisit(v) {
  const visit = { id: uid('v'), ts: Date.now(), by: data.value.crew?.length ? data.value.crew : [data.value.meId].filter(Boolean), ...v };
  setData((d) => ({ ...d, visits: [...d.visits, visit] }));
  return visit;
}
export function removeVisit(id) {
  setData((d) => ({ ...d, visits: d.visits.filter((v) => v.id !== id) }));
}
export function updateVisit(id, patch) {
  setData((d) => ({ ...d, visits: d.visits.map((v) => (v.id === id ? { ...v, ...patch } : v)) }));
}
export function updateDoor(id, patch) {
  setData((d) => ({ ...d, doors: d.doors.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
}
export function addDoor(door) {
  const nd = { id: uid('d'), flats: 1, ...door };
  setData((d) => ({ ...d, doors: [...d.doors, nd] }));
  return nd;
}
export function setCurrentSector(id) {
  setData((d) => ({ ...d, currentSectorId: id }));
}
export function addSector(sector, doors) {
  const id = sector.id || uid('sec');
  const s = { createdAt: Date.now(), assignees: [], photos: [], ...sector, id };
  const ds = doors.map((x) => ({ ...x, id: id + '-' + x.id, sectorId: id }));
  setData((d) => ({ ...d, sectors: [...d.sectors, s], doors: [...d.doors, ...ds], currentSectorId: id }));
  return s;
}
export function updateSector(id, patch) {
  setData((d) => ({ ...d, sectors: d.sectors.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
}
export function removeSector(id) {
  const snapshot = data.value;
  setData((d) => ({
    ...d,
    sectors: d.sectors.filter((s) => s.id !== id),
    doors: d.doors.filter((x) => x.sectorId !== id),
    visits: d.visits.filter((v) => v.sectorId !== id),
    currentSectorId: d.currentSectorId === id ? null : d.currentSectorId,
  }));
  return () => setData(() => snapshot);
}
export function addMember(m) {
  const nm = { id: uid('m'), role: 'pompier', createdAt: Date.now(), ...m };
  setData((d) => ({ ...d, members: [...d.members, nm] }));
  return nm;
}
export function updateMember(id, patch) {
  setData((d) => ({ ...d, members: d.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
}
export function removeMember(id) {
  const snapshot = data.value;
  setData((d) => ({ ...d, members: d.members.filter((m) => m.id !== id), crew: d.crew.filter((c) => c !== id) }));
  return () => setData(() => snapshot);
}
export function setCrew(ids) {
  setData((d) => ({ ...d, crew: ids }));
}
export function switchUser(id) {
  setData((d) => ({ ...d, meId: id, crew: d.crew.includes(id) ? d.crew : [id] }));
}
export function addHandover(h) {
  const nh = { id: uid('h'), ts: Date.now(), ...h };
  setData((d) => ({ ...d, handovers: [...d.handovers, nh] }));
  return nh;
}
export function addStock(memberId, qty, note = '') {
  setData((d) => ({ ...d, stock: [...d.stock, { id: uid('st'), ts: Date.now(), memberId, qty, note }] }));
}
export function setOrg(patch) {
  setData((d) => ({ ...d, org: { ...(d.org || {}), ...patch } }));
}
export function resetAll() {
  data.value = emptyData();
  try { localStorage.removeItem(KEY); } catch {}
}

// Fusion d'un fichier d'équipe ou d'un relevé : par identifiant, sans doublon.
export function mergeData(incoming) {
  const merge = (a = [], b = []) => {
    const m = new Map(a.map((x) => [x.id, x]));
    let added = 0;
    for (const x of b) { if (!m.has(x.id)) added++; m.set(x.id, { ...m.get(x.id), ...x }); }
    return [[...m.values()], added];
  };
  let added = 0;
  setData((d) => {
    const out = { ...d };
    for (const k of ['members', 'sectors', 'doors', 'visits', 'handovers', 'stock']) {
      const [list, n] = merge(d[k], incoming[k]);
      out[k] = list;
      if (k === 'visits') added = n;
    }
    if (!out.org && incoming.org) out.org = incoming.org;
    if (!out.meId && incoming.members?.length) out.meId = null;
    return out;
  });
  return added;
}

export function exportData() {
  const d = data.value;
  return { app: 'nokk', exportedAt: new Date().toISOString(), ...d };
}
