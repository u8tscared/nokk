// Transforme une réponse Overpass (OpenStreetMap) en rues, réseau piéton et portes.
import { pointInPolygon, bbox, nearestOnLine } from './geo.js';
import { fetchIgn } from './ign.js';

export const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const WALKABLE = /^(primary|secondary|tertiary|residential|living_street|unclassified|pedestrian|service|footway|path|steps|track|primary_link|secondary_link|tertiary_link)$/;
const BIG = /^(primary|secondary|trunk)$/;

export function overpassQuery(poly) {
  const [w, s, e, n] = bbox(poly);
  const pad = 0.0008;
  const b = `${s - pad},${w - pad},${n + pad},${e + pad}`;
  return `[out:json][timeout:60];
(way(${b})[highway];);
out geom tags;
(node(${b})["addr:housenumber"];way(${b})["addr:housenumber"];);
out center tags;`;
}

// Un serveur Overpass, avec un délai maximum (ils sont souvent saturés).
async function overpassOne(url, q, signal, ms) {
  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  signal?.addEventListener('abort', stop);
  const t = setTimeout(stop, ms);
  try {
    const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!Array.isArray(j.elements)) throw new Error('réponse vide');
    return j;
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', stop);
  }
}

// OpenStreetMap : tous les serveurs en même temps, le premier qui répond gagne.
export async function fetchOsmOnly(poly, { signal, timeout = 25000 } = {}) {
  const q = overpassQuery(poly);
  try {
    return await Promise.any(OVERPASS.map((u) => overpassOne(u, q, signal, timeout)));
  } catch (e) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    throw new Error('réseau');
  }
}

// Adresses et rues de la zone : d'abord les données officielles (IGN, avec les logements par bâtiment),
// sinon OpenStreetMap.
export async function fetchOverpass(poly, { signal } = {}) {
  try {
    return await fetchIgn(poly, { signal });
  } catch (e) {
    if (e?.name === 'AbortError' || signal?.aborted) throw e;
  }
  return fetchOsmOnly(poly, { signal });
}

function numKey(n) {
  const m = /^(\d+)\s*([a-zA-Z]*)/.exec(String(n).trim());
  return m ? +m[1] + (m[2] ? (m[2].toLowerCase().charCodeAt(0) - 96) / 100 : 0) : 9999;
}

const id = (p, i) => p + i.toString(36);

/**
 * @param {{elements: any[]}} json
 * @param {Array<[number,number]>|null} poly  contour du secteur ; null = tout garder
 */
export function processOsm(json, poly = null) {
  const inside = (p) => !poly || pointInPolygon(p, poly);
  const ways = json.elements.filter((e) => e.type === 'way' && e.tags?.highway && e.geometry && WALKABLE.test(e.tags.highway));

  // Réseau : toutes les voies praticables à pied (sert au calcul d'itinéraire).
  const network = ways.map((w) => w.geometry.map((g) => [+g.lon.toFixed(7), +g.lat.toFixed(7)]));

  // Rues nommées.
  const byName = new Map();
  for (const w of ways) {
    const name = w.tags.name;
    if (!name) continue;
    const coords = w.geometry.map((g) => [+g.lon.toFixed(7), +g.lat.toFixed(7)]);
    if (!coords.some(inside)) continue;
    if (!byName.has(name)) byName.set(name, { name, big: false, lines: [] });
    const s = byName.get(name);
    s.lines.push(coords);
    if (BIG.test(w.tags.highway)) s.big = true;
  }

  // Adresses.
  const seen = new Set();
  const doors = [];
  for (const e of json.elements) {
    const t = e.tags;
    if (!t?.['addr:housenumber']) continue;
    const street = t['addr:street'] || t['addr:place'] || null; // sinon : rue la plus proche
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat == null) continue;
    const p = [+lon.toFixed(7), +lat.toFixed(7)];
    if (!inside(p)) continue;
    // Plusieurs numéros sur un même objet : "12;14" ou "12-14"
    const nums = String(t['addr:housenumber']).split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    for (const num of nums.slice(0, 4)) {
      const key = (street || p.join(',')) + '|' + num.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const known = parseInt(t['nokk:flats'] || '', 10); // nombre de logements officiel (IGN)
      const flatsTag = parseInt(t['building:flats'] || t['addr:flats'] || '', 10);
      const levels = parseInt(t['building:levels'] || '', 10);
      const apart = t.building === 'apartments' || flatsTag > 2 || levels >= 4;
      const flats = known > 0 ? Math.max(1, Math.round(known / Math.min(nums.length, 4))) : apart ? (flatsTag > 0 ? flatsTag : Math.max(6, (levels || 4) * 3)) : 1;
      doors.push({ street, num, p, flats: Math.min(flats, 200) });
    }
  }

  // Rattache chaque porte à sa rue (géométrie) et calcule sa position le long de la rue.
  const streets = [];
  for (const s of byName.values()) streets.push(s);
  const streetIndex = new Map(streets.map((s) => [s.name, s]));
  // Numéros sans nom de rue (fréquent dans OSM) : rue nommée la plus proche, à moins de 70 m.
  for (const d of doors) {
    if (d.street && streetIndex.has(d.street)) continue;
    let best = null;
    for (const s of streets) for (const line of s.lines) {
      const r = nearestOnLine(d.p, line);
      if (!best || r.distance < best.distance) best = { distance: r.distance, name: s.name };
    }
    if (!d.street) d.street = best && best.distance < 70 ? best.name : null;
  }
  for (let i = doors.length - 1; i >= 0; i--) if (!doors[i].street) doors.splice(i, 1);
  // Dédoublonne après rattachement.
  const uniq = new Set();
  for (let i = 0; i < doors.length; i++) {
    const k = doors[i].street + '|' + String(doors[i].num).toLowerCase();
    if (uniq.has(k)) { doors.splice(i, 1); i--; } else uniq.add(k);
  }
  for (const d of doors) {
    const s = streetIndex.get(d.street);
    if (!s) continue;
    let best = null;
    s.lines.forEach((line, li) => {
      const r = nearestOnLine(d.p, line);
      if (!best || r.distance < best.distance) best = { ...r, li };
    });
    d.snap = best.point;
    d.line = best.li;
    d.along = Math.round(best.along);
    d.off = Math.round(best.distance);
  }

  // Garde les rues qui ont au moins une porte, ou qui sont dans le secteur.
  const kept = streets.filter((s) => doors.some((d) => d.street === s.name) || s.lines.some((l) => l.every(inside)));
  doors.sort((a, b) => a.street.localeCompare(b.street, 'fr') || numKey(a.num) - numKey(b.num));

  return {
    streets: kept.map((s, i) => ({ id: id('s', i), name: s.name, big: s.big, lines: s.lines })),
    network,
    doors: doors.map((d, i) => ({
      id: id('d', i),
      street: d.street,
      num: d.num,
      p: d.p,
      snap: d.snap || d.p,
      line: d.line ?? 0,
      along: d.along ?? 0,
      flats: d.flats,
    })),
  };
}

export { numKey };
