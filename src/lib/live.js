// Équipes en direct : chaque binôme en tournée partage sa position (dans sa tournée, toutes les minutes).
// Les autres téléphones voient où il est, sinon sa dernière porte.
import { computed, effect } from '@preact/signals';
import { data, setData, position, memberById, demo, settings } from './store.js';
import { activeSession, now } from './sessions.js';

const SHARE_EVERY = 60e3;
const FRESH = 3 * 60e3;
const RECENT = 15 * 60e3;
let lastShare = 0;

export function installLiveShare() {
  effect(() => {
    const s = activeSession.value;
    const pos = position.value;
    if (!s || !pos || pos.fake || demo.value || settings.value.shareLive === false) return;
    const t = Date.now();
    if (t - lastShare < SHARE_EVERY) return;
    lastShare = t;
    const p = [Math.round(pos.p[0] * 1e5) / 1e5, Math.round(pos.p[1] * 1e5) / 1e5];
    setData((x) => ({ ...x, sessions: (x.sessions || []).map((z) => (z.id === s.id ? { ...z, pos: { p, ts: t } } : z)) }));
  });
}

/** Les autres binômes sur le terrain en ce moment. */
export const liveTeams = computed(() => {
  const d = data.value;
  const t = now.value || Date.now();
  const mine = new Set(d.crew?.length ? d.crew : [d.meId].filter(Boolean));
  const groups = new Map();
  const keyOf = (ids) => [...ids].sort().join('+');
  // Dernières portes des autres (15 min).
  for (let i = d.visits.length - 1; i >= 0; i--) {
    const v = d.visits[i];
    if (t - v.ts > RECENT) break;
    const by = v.by || [];
    if (!by.length || by.some((b) => mine.has(b))) continue;
    const k = keyOf(by);
    if (groups.has(k)) continue;
    const door = d.doors.find((x) => x.id === v.doorId);
    if (door) groups.set(k, { key: k, by, p: door.p, ts: v.ts, where: door.street, sectorId: v.sectorId, live: false });
  }
  // Position partagée par leur tournée (plus précise, si récente).
  for (const s of d.sessions || []) {
    if (s.endedAt || !s.pos || t - s.pos.ts > FRESH) continue;
    const by = s.crew || [];
    if (!by.length || by.some((b) => mine.has(b))) continue;
    const k = keyOf(by);
    const g = groups.get(k);
    groups.set(k, { key: k, by, p: s.pos.p, ts: s.pos.ts, where: g?.where || null, sectorId: s.sectorId, live: true });
  }
  return [...groups.values()].map((g) => {
    const names = g.by.map((id) => memberById.value.get(id)?.name.split(' ')[0]).filter(Boolean);
    const today = new Date(t).toDateString();
    const sum = d.visits.filter((v) => v.sectorId === g.sectorId && v.result === 'donne' && new Date(v.ts).toDateString() === today && (v.by || []).some((b) => g.by.includes(b))).reduce((a, v) => a + (v.amount || 0), 0);
    return { ...g, names, mins: Math.max(0, Math.round((t - g.ts) / 60e3)), sum };
  });
});
