// Photo d'un plan de secteur → tracé automatique.
// 1. Le serveur lit la photo (ville, rues de la zone, adresses) ;
// 2. on retrouve ces rues dans la Base Adresse Nationale ;
// 3. la zone est l'enveloppe des numéros de ces rues, avec une petite marge.
import { GEOCODE } from './adresse.js';
import { getAll } from './ign.js';

export async function readPlanPhoto(image, { signal } = {}) {
  let r;
  try {
    r = await fetch(((typeof window !== 'undefined' && window.__nokkApi) || 'https://nokk-api.marceau-ruis.workers.dev') + '/plan/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image }), signal });
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw Object.assign(new Error('network'), { code: 'network' });
  }
  const j = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(j?.error || 'plan'), { code: j?.error || 'error' });
  return j;
}

export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/['’-]/g, ' ').replace(/\b(rue|avenue|av|boulevard|bd|allee|chemin|impasse|place|route|square|quai|cours|passage|sentier|residence|rond point|de|du|des|la|le|les|l|d|et|aux|au|sur|en)\b/g, ' ')
  .replace(/\s+/g, ' ').trim();

async function geocode(params, signal) {
  const r = await fetch(GEOCODE + '?' + new URLSearchParams({ index: 'address', limit: '1', ...params }), { signal });
  if (!r.ok) return null;
  const f = (await r.json()).features?.[0];
  return f ? { p: f.geometry.coordinates, ...f.properties } : null;
}

const distM = (a, b) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110540);

export function hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}

// Garde au plus `max` coins en retirant ceux qui comptent le moins (aire du triangle).
export function simplify(poly, max = 12) {
  const p = [...poly];
  const area = (a, b, c) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
  while (p.length > max) {
    let bi = 0, ba = Infinity;
    for (let i = 0; i < p.length; i++) {
      const v = area(p[(i - 1 + p.length) % p.length], p[i], p[(i + 1) % p.length]);
      if (v < ba) { ba = v; bi = i; }
    }
    p.splice(bi, 1);
  }
  return p;
}

// Marge autour de chaque point (≈ m mètres) pour que les maisons du bord soient dans la zone.
function pad(points, m = 28) {
  const out = [];
  for (const [x, y] of points) {
    const dx = m / (111320 * Math.cos((y * Math.PI) / 180)), dy = m / 110540;
    for (let a = 0; a < 8; a++) out.push([x + dx * Math.cos((a * Math.PI) / 4), y + dy * Math.sin((a * Math.PI) / 4)]);
  }
  return out;
}

/**
 * @param {{ville?:string|null, cp?:string|null, zone:string[], rues?:string[], adresses?:string[]}} plan
 * @returns {Promise<{points:[number,number][], city:string|null, found:string[], missing:string[]}>}
 */
export async function traceFromPlan(plan, { near, signal, onStep = () => {} } = {}) {
  onStep('ville');
  let city = null;
  if (plan.ville) {
    city = await geocode({ q: plan.ville + (plan.cp ? ' ' + plan.cp : ''), type: 'municipality', ...(near ? { lon: near[0], lat: near[1] } : {}) }, signal);
  }
  const center = city?.p || near;
  if (!center) throw Object.assign(new Error('no_city'), { code: 'no_city' });
  const around = { lon: String(center[0]), lat: String(center[1]) };
  const inCity = city?.citycode ? { citycode: city.citycode } : {};

  onStep('rues');
  const names = (plan.zone?.length ? plan.zone : plan.rues || []).slice(0, 16);
  const streets = await Promise.all(names.map((n) => geocode({ q: n + (plan.ville ? ' ' + plan.ville : ''), type: 'street', ...inCity, ...around }, signal).catch(() => null)));
  const found = [], missing = [], keep = [];
  streets.forEach((s, i) => {
    if (s && (s.score ?? 1) > 0.45 && distM(s.p, center) < 9000) { found.push(s.name); keep.push(s); }
    else missing.push(names[i]);
  });
  const addrs = await Promise.all((plan.adresses || []).slice(0, 12).map((q) => geocode({ q: q + (plan.ville ? ' ' + plan.ville : ''), type: 'housenumber', ...inCity, ...around }, signal).catch(() => null)));
  const extra = addrs.filter((a) => a && (a.score ?? 1) > 0.5 && distM(a.p, center) < 9000).map((a) => a.p);
  if (!keep.length && !extra.length) throw Object.assign(new Error('no_street'), { code: 'no_street' });

  // Tous les numéros des rues trouvées, autour de leur position.
  onStep('numeros');
  const ref = [...keep.map((s) => s.p), ...extra];
  const xs = ref.map((q) => q[0]), ys = ref.map((q) => q[1]);
  const mid = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const half = 0.012; // ≈ 1 km autour du centre des rues au plus
  const b = [Math.max(Math.min(...xs) - 0.006, mid[0] - half * 1.4), Math.max(Math.min(...ys) - 0.004, mid[1] - half), Math.min(Math.max(...xs) + 0.006, mid[0] + half * 1.4), Math.min(Math.max(...ys) + 0.004, mid[1] + half)];
  const want = new Set(keep.map((s) => norm(s.name)));
  const ban = await getAll('BAN.DATA.GOUV:ban', b, { props: 'numero,nom_voie,code_insee,lon,lat' }, signal);
  const pts = [...extra];
  for (const f of ban) {
    const p = f.properties || {};
    if (!want.has(norm(p.nom_voie))) continue;
    if (city?.citycode && p.code_insee && p.code_insee !== city.citycode) continue;
    pts.push([+p.lon, +p.lat]);
  }
  // Une rue sans numéro chargé compte quand même par son point central.
  for (const s of keep) if (!pts.some((q) => distM(q, s.p) < 400)) pts.push(s.p);
  const points = simplify(hull(pad(pts)), 12);
  return { points, city: city?.city || city?.name || plan.ville || null, found, missing };
}
