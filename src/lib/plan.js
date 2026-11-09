// Photo d'un plan de secteur → tracé automatique.
// 1. Le serveur lit la photo (ville, rues de la zone, adresses) ;
// 2. on retrouve ces rues dans la Base Adresse Nationale ;
// 3. la zone est l'enveloppe des numéros de ces rues, avec une petite marge.
import { GEOCODE } from './adresse.js';
import { getAll, niceName } from './ign.js';

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
  .replace(/['’.-]/g, ' ').replace(/\b(rue|r|avenue|av|ave|boulevard|bd|allee|all|chemin|che|ch|impasse|imp|place|pl|route|rte|square|sq|quai|cours|crs|passage|pas|sentier|sen|residence|res|montee|mte|rond point|de|du|des|la|le|les|l|d|et|aux|au|sur|en)\b/g, ' ')
  .replace(/\s+/g, ' ').trim();

async function geocode(params, signal) {
  const r = await fetch(GEOCODE + '?' + new URLSearchParams({ index: 'address', limit: '1', ...params }), { signal });
  if (!r.ok) return null;
  const f = (await r.json()).features?.[0];
  return f ? { p: f.geometry.coordinates, ...f.properties } : null;
}

// Le géocodeur trouve toujours quelque chose : on vérifie que le nom ressemble vraiment à celui lu.
export function alike(a, b) {
  const x = norm(a).split(' ').filter(Boolean), y = new Set(norm(b).split(' ').filter(Boolean));
  if (!x.length || !y.size) return 0;
  const near = (w) => [...y].some((v) => v === w || (w.length > 4 && v.length > 4 && (v.startsWith(w.slice(0, -1)) || w.startsWith(v.slice(0, -1)) || lev(v, w) <= 1)));
  // Le mot le plus long (le vrai nom) doit correspondre : « Jean Corbel » n'est pas « Jean Moulin ».
  const main = [...x].sort((a, b) => b.length - a.length)[0];
  if (main.length > 3 && !near(main)) return 0;
  return x.filter(near).length / Math.max(x.length, y.size);
}
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
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

// Projection locale en mètres autour d'un point.
function local(o) {
  const kx = 111320 * Math.cos((o[1] * Math.PI) / 180), ky = 110540;
  return { to: (p) => [(p[0] - o[0]) * kx, (p[1] - o[1]) * ky], from: (q) => [o[0] + q[0] / kx, o[1] + q[1] / ky] };
}

// Contour formé par les rues de bordure : depuis un point intérieur, on lance des rayons
// et chacun s'arrête sur la première rue de bordure rencontrée.
export function enclose(seed, lines, { rays = 120, maxR = 1600, pad = 18 } = {}) {
  const L = local(seed);
  const segs = [];
  for (const line of lines) for (let i = 0; i < line.length - 1; i++) segs.push([L.to(line[i]), L.to(line[i + 1])]);
  const hits = [];
  for (let k = 0; k < rays; k++) {
    const a = (k / rays) * 2 * Math.PI, dx = Math.cos(a), dy = Math.sin(a);
    let best = Infinity;
    for (const [p, q] of segs) {
      const ex = q[0] - p[0], ey = q[1] - p[1];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = (p[0] * ey - p[1] * ex) / den; // distance le long du rayon
      const u = (p[0] * dy - p[1] * dx) / den; // position sur le segment
      if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
    }
    hits.push(best <= maxR ? best : null);
  }
  const found = hits.filter((h) => h != null);
  if (found.length < rays * 0.5) return null; // contour trop ouvert : on ne devine pas
  // Trous dans le contour : on reprend la distance des rayons voisins.
  const fill = hits.map((h, i) => {
    if (h != null) return h;
    for (let d = 1; d < rays / 2; d++) {
      const a = hits[(i - d + rays) % rays], b = hits[(i + d) % rays];
      if (a != null || b != null) return Math.min(a ?? Infinity, b ?? Infinity);
    }
    return maxR;
  });
  const ring = fill.map((r, k) => { const a = (k / rays) * 2 * Math.PI; return L.from([Math.cos(a) * (r + pad), Math.sin(a) * (r + pad)]); });
  return simplify(ring, 36);
}

const cityOf = async (plan, near, signal) => (plan.ville ? geocode({ q: plan.ville + (plan.cp ? ' ' + plan.cp : ''), type: 'municipality', ...(near ? { lon: near[0], lat: near[1] } : {}) }, signal) : null);

/** Choisit le secteur du plan : celui qui porte le nom demandé, sinon le premier. */
export function pickSector(plan, wanted) {
  const list = plan.secteurs?.length ? plan.secteurs : [{ nom: null, bord: plan.zone || [], dedans: [] }];
  const k = (s) => norm(s).replace(/\s/g, '');
  if (wanted != null) {
    const w = typeof wanted === 'number' ? list[wanted] : list.find((s) => s.nom && k(s.nom) === k(wanted));
    if (w) return w;
  }
  return list[0];
}

/**
 * @param {{ville?:string|null, cp?:string|null, secteurs?:{nom:string|null,bord:string[],dedans:string[]}[], zone?:string[], adresses?:string[]}} plan
 * @returns {Promise<{points:[number,number][], city:string|null, found:string[], missing:string[], how:'rues'|'numeros'}>}
 */
export async function traceFromPlan(plan, { near, signal, sector, onStep = () => {} } = {}) {
  onStep('ville');
  const city = await cityOf(plan, near, signal);
  const center = city?.p || near;
  if (!center) throw Object.assign(new Error('no_city'), { code: 'no_city' });
  const around = { lon: String(center[0]), lat: String(center[1]) };
  const inCity = city?.citycode ? { citycode: city.citycode } : {};
  const s0 = pickSector(plan, sector);
  // Une rue notée à la fois au bord et dedans traverse le secteur : ce n'est pas un bord.
  const inner = new Set(s0.dedans.map(norm));
  const s = { ...s0, bord: s0.bord.filter((r) => !inner.has(norm(r))) };

  onStep('rues');
  const look = async (n) => {
    const g = await geocode({ q: n + (plan.ville ? ' ' + plan.ville : ''), type: 'street', ...inCity, ...around }, signal).catch(() => null);
    return g && alike(n, g.name) >= 0.5 && distM(g.p, center) < 9000 ? g : null;
  };
  const [bord, dedans] = await Promise.all([Promise.all(s.bord.slice(0, 14).map(look)), Promise.all(s.dedans.slice(0, 10).map(look))]);
  const found = [], missing = [];
  const add = (list, names) => list.forEach((g, i) => { if (g) { if (!found.includes(g.name)) found.push(g.name); } else missing.push(names[i]); });
  add(bord, s.bord); add(dedans, s.dedans);
  const B = bord.filter(Boolean), D = dedans.filter(Boolean);
  if (!B.length && !D.length) throw Object.assign(new Error('no_street'), { code: 'no_street' });

  // Point de départ à l'intérieur : le milieu des rues intérieures, sinon celui des rues du bord.
  const ref = (D.length ? D : B).map((g) => g.p);
  const seed = [ref.reduce((a, p) => a + p[0], 0) / ref.length, ref.reduce((a, p) => a + p[1], 0) / ref.length];

  // 1 · Le contour suit les vraies rues de bordure (BD TOPO).
  onStep('numeros');
  if (B.length >= 2) {
    const r = 0.022;
    const box = [seed[0] - r * 1.45, seed[1] - r, seed[0] + r * 1.45, seed[1] + r];
    const roads = await getAll('BDTOPO_V3:troncon_de_route', box, { props: 'nom_collaboratif_gauche,nom_collaboratif_droite,geometrie' }, signal).catch(() => []);
    const want = B.map((g) => g.name);
    const lines = [];
    for (const f of roads) {
      const p = f.properties || {};
      const n = [p.nom_collaboratif_gauche, p.nom_collaboratif_droite].filter(Boolean).map(niceName);
      if (!n.some((x) => want.some((w) => alike(w, x) >= 0.75))) continue;
      const g = f.geometry;
      for (const line of g?.type === 'LineString' ? [g.coordinates] : g?.type === 'MultiLineString' ? g.coordinates : []) lines.push(line);
    }
    const ring = lines.length ? enclose(seed, lines) : null;
    if (ring && ring.length >= 3) return { points: ring, city: city?.city || city?.name || plan.ville || null, found, missing, how: 'rues' };
  }

  // 2 · Sinon : l'enveloppe des numéros des rues trouvées.
  const xs = [...B, ...D].map((g) => g.p[0]), ys = [...B, ...D].map((g) => g.p[1]);
  const b = [Math.max(Math.min(...xs) - 0.006, seed[0] - 0.017), Math.max(Math.min(...ys) - 0.004, seed[1] - 0.012), Math.min(Math.max(...xs) + 0.006, seed[0] + 0.017), Math.min(Math.max(...ys) + 0.004, seed[1] + 0.012)];
  const names = new Set([...B, ...D].map((g) => norm(g.name)));
  const ban = await getAll('BAN.DATA.GOUV:ban', b, { props: 'numero,nom_voie,code_insee,lon,lat' }, signal);
  const pts = [];
  for (const f of ban) {
    const p = f.properties || {};
    if (!names.has(norm(p.nom_voie))) continue;
    if (city?.citycode && p.code_insee && p.code_insee !== city.citycode) continue;
    pts.push([+p.lon, +p.lat]);
  }
  for (const g of [...B, ...D]) if (!pts.some((q) => distM(q, g.p) < 400)) pts.push(g.p);
  return { points: simplify(hull(pad(pts)), 12), city: city?.city || city?.name || plan.ville || null, found, missing, how: 'numeros' };
}
