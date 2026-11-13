// La tournée en cours : portes du secteur, parcours restant, porte suivante.
import { computed, signal } from '@preact/signals';
import { data, byDoor, currentSector, doorsBySector, position, settings } from './store.js';
import { doorState, isDone, sectorStats, streetState, totals } from './model.js';
import { planRoute, walkPath } from './route.js';
import { dist, nearestOnLine } from './geo.js';

export const repasserMode = signal(false);

export const sectorDoors = computed(() => (currentSector.value ? doorsBySector.value.get(currentSector.value.id) || [] : []));

export const doorStates = computed(() => {
  const m = new Map();
  const by = byDoor.value;
  for (const d of data.value.doors) m.set(d.id, doorState(d, by.get(d.id)));
  return m;
});

export const stats = computed(() => sectorStats(sectorDoors.value, byDoor.value));

// Total « ce soir » : visites de l'équipe d'aujourd'hui.
export const tonight = computed(() => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const crew = new Set(data.value.crew?.length ? data.value.crew : [data.value.meId]);
  const list = data.value.visits.filter((v) => v.ts >= start.getTime() && (v.by || []).some((b) => crew.has(b)));
  return totals(list);
});

let routeCache = { key: '', value: null };
export const route = computed(() => {
  const s = currentSector.value;
  if (!s) return null;
  const states = doorStates.value;
  const mode = repasserMode.value;
  const todo = sectorDoors.value.filter((d) => {
    const x = states.get(d.id);
    const st = x?.state;
    return mode ? st === 'absent' || x?.absents > 0 : st === 'todo' || st === 'partiel';
  });
  // Départ : position GPS si on est dans le coin, sinon la dernière porte faite.
  const pos = position.value;
  let start = null;
  if (pos && todo.length && Math.min(...todo.slice(0, 200).map((d) => dist(pos.p, d.p))) < 400) {
    start = [+pos.p[0].toFixed(4), +pos.p[1].toFixed(4)]; // arrondi ~10 m pour ne pas recalculer à chaque pas
  } else {
    const mine = data.value.visits.filter((v) => v.sectorId === s.id);
    const last = mine[mine.length - 1];
    if (last) {
      const d = sectorDoors.value.find((x) => x.id === last.doorId);
      if (d) start = d.p;
    }
  }
  const key = s.id + '|' + mode + '|' + todo.map((d) => d.id).join(',').length + ':' + todo.length + '|' + (start ? start.join(',') : '') + '|' + settings.value.sides;
  if (routeCache.key === key) return routeCache.value;
  const big = new Set((s.streets || []).filter((x) => x.big).map((x) => x.name));
  const r = planRoute({ doors: todo, network: s.network, start, big, sides: settings.value.sides });
  routeCache = { key, value: r };
  return r;
});

export const nextDoor = computed(() => {
  const r = route.value;
  if (!r || !r.order.length) return null;
  const map = new Map(sectorDoors.value.map((d) => [d.id, d]));
  return map.get(r.order[0]) || null;
});

export function doorAfter(doorId) {
  const r = route.value;
  if (!r) return null;
  const i = r.order.indexOf(doorId);
  const id = i >= 0 ? r.order[i + 1] : r.order[0] === doorId ? r.order[1] : r.order[0];
  return sectorDoors.value.find((d) => d.id === id) || null;
}

// Porte la plus proche du GPS (si on est vraiment devant).
export function doorAtPosition(maxMeters = 30) {
  const pos = position.value;
  if (!pos || Date.now() - pos.ts > 60000) return null;
  let best = null, bd = Infinity;
  for (const d of sectorDoors.value) {
    const st = doorStates.value.get(d.id)?.state;
    if (isDone(st)) continue;
    const m = dist(pos.p, d.p);
    if (m < bd) { bd = m; best = d; }
  }
  return bd <= maxMeters ? best : null;
}

export const distanceToNext = computed(() => {
  const d = nextDoor.value;
  const pos = position.value;
  if (!d || !pos) return null;
  return dist(pos.p, d.p);
});

export function streetFeatures(sector, meId) {
  if (!sector) return [];
  const doors = doorsBySector.value.get(sector.id) || [];
  const by = byDoor.value;
  const byStreet = new Map();
  for (const d of doors) {
    if (!byStreet.has(d.street)) byStreet.set(d.street, []);
    byStreet.get(d.street).push(d);
  }
  const now = Date.now();
  const out = [];
  for (const s of sector.streets || []) {
    const ds = byStreet.get(s.name) || [];
    const state = ds.length ? streetState(ds, by, now, meId) : 'todo';
    // On ne colorie que la portion de la rue utile au secteur (entre la première et la dernière porte).
    s.lines.forEach((line, li) => {
      const mine = ds.filter((d) => (d.line ?? 0) === li);
      let coords = line;
      if (mine.length >= 2) {
        const a = Math.min(...mine.map((d) => d.along)) - 15;
        const b = Math.max(...mine.map((d) => d.along)) + 15;
        coords = sliceLine(line, a, b);
      } else if (mine.length === 0 && ds.length) {
        return;
      }
      out.push({ type: 'Feature', properties: { name: s.name, state }, geometry: { type: 'LineString', coordinates: coords } });
    });
  }
  return out;
}

function sliceLine(line, a, b) {
  const out = [];
  let acc = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const L = dist(line[i], line[i + 1]);
    const s0 = acc, s1 = acc + L;
    if (s1 >= a && s0 <= b) {
      const t0 = Math.max(0, (a - s0) / L), t1 = Math.min(1, (b - s0) / L);
      const lerp = (t) => [line[i][0] + (line[i + 1][0] - line[i][0]) * t, line[i][1] + (line[i + 1][1] - line[i][1]) * t];
      if (!out.length) out.push(lerp(t0));
      out.push(lerp(t1));
    }
    acc = s1;
  }
  return out.length >= 2 ? out : line;
}

export function streetSummary(sector) {
  const doors = doorsBySector.value.get(sector.id) || [];
  const by = byDoor.value;
  const m = new Map();
  for (const d of doors) {
    if (!m.has(d.street)) m.set(d.street, { name: d.street, doors: 0, done: 0, absent: 0, amount: 0, state: 'todo' });
    const x = m.get(d.street);
    const st = doorState(d, by.get(d.id));
    x.doors++;
    if (isDone(st.state)) x.done++;
    if (st.state === 'absent') x.absent++;
    x.amount += st.amount;
  }
  const now = Date.now();
  for (const x of m.values()) x.state = streetState(doors.filter((d) => d.street === x.name), by, now, data.value.meId);
  return [...m.values()].sort((a, b) => (b.done > 0) - (a.done > 0) || b.amount - a.amount);
}

export { nearestOnLine };

// ——— Arrêts : une maison ou un immeuble ———
// Arrêts encore à faire (jamais vus, immeuble commencé, ou absents à repasser).
export function openStops() {
  const states = doorStates.value;
  return sectorDoors.value.filter((d) => {
    const x = states.get(d.id);
    const st = x?.state || 'todo';
    return st === 'todo' || st === 'partiel' || (repasserMode.value && (st === 'absent' || x?.absents > 0));
  });
}

// Point de départ pour mesurer : ma position si elle est fraîche, sinon la porte où l'on est.
export function hereFrom(door) {
  const pos = position.value;
  if (pos && Date.now() - pos.ts < 120000) return { p: pos.p, live: true };
  return door ? { p: door.p, live: false } : null;
}

export function nearestStops(from, { exclude = [], limit = 4 } = {}) {
  if (!from) return [];
  const ex = new Set(exclude);
  return openStops()
    .filter((d) => !ex.has(d.id))
    .map((d) => ({ door: d, m: dist(from, d.p) }))
    .sort((a, b) => a.m - b.m)
    .slice(0, limit);
}

// Que faire après cet arrêt : le suivant du parcours, et le plus proche s'il vaut le détour.
export function whereNext(doorId) {
  const door = sectorDoors.value.find((d) => d.id === doorId);
  const here = hereFrom(door);
  const onRoute = doorAfter(doorId);
  const near = nearestStops(here?.p, { exclude: [doorId], limit: 6 });
  const routeM = onRoute && here ? dist(here.p, onRoute.p) : null;
  const closest = near[0] || null;
  const better = closest && onRoute && closest.door.id !== onRoute.id && routeM - closest.m > 40 && closest.m < routeM * 0.6 ? closest : null;
  return {
    here,
    route: onRoute ? { door: onRoute, m: routeM } : null,
    closest: better,
    others: near.filter((x) => x.door.id !== onRoute?.id && x.door.id !== better?.door.id).slice(0, 4),
  };
}

// ——— Guidage : « y aller » vers un arrêt ———
export const guide = signal(null); // { doorId } — le tracé se recalcule avec la position
export const guidePath = computed(() => {
  const g = guide.value;
  if (!g) return null;
  const door = data.value.doors.find((d) => d.id === g.doorId);
  if (!door) return null;
  const pos = position.value;
  const fromP = pos && Date.now() - pos.ts < 120000 ? [+pos.p[0].toFixed(5), +pos.p[1].toFixed(5)] : g.from;
  if (!fromP) return null;
  const s = data.value.sectors.find((x) => x.id === door.sectorId);
  const r = walkPath(s?.network, fromP, door.p);
  return { door, ...r, minutes: Math.max(1, Math.round(r.meters / 75)), live: !!pos };
});
export function startGuide(door, fromP) {
  guide.value = { doorId: door.id, from: fromP || null };
}
export function stopGuide() { guide.value = null; }
