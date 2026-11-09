// Données officielles françaises (IGN Géoplateforme, gratuites, sans clé) :
// - Base Adresse Nationale : tous les numéros de la zone ;
// - BD TOPO : les rues et chemins (pour le parcours) et le nombre de logements de chaque bâtiment ;
// - BAN PLUS : quel numéro donne sur quel bâtiment.
// Le résultat a la forme d'une réponse Overpass, pour être traité par processOsm comme avant.
import { bbox } from './geo.js';

export const WFS = 'https://data.geopf.fr/wfs/ows';
const PAGE = 5000;

function wfsUrl(layer, b, { props, start = 0 } = {}) {
  const [w, s, e, n] = b;
  const q = new URLSearchParams({
    SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: layer,
    OUTPUTFORMAT: 'application/json', COUNT: String(PAGE), STARTINDEX: String(start),
    BBOX: `${s},${w},${n},${e},urn:ogc:def:crs:EPSG::4326`,
  });
  if (props) q.set('PROPERTYNAME', props);
  return WFS + '?' + q;
}

async function getAll(layer, b, opts, signal) {
  const out = [];
  for (let start = 0; start < 50000; start += PAGE) {
    const r = await fetch(wfsUrl(layer, b, { ...opts, start }), { signal });
    if (!r.ok) throw new Error('IGN ' + r.status);
    const j = await r.json();
    out.push(...(j.features || []));
    if (!j.features || j.features.length < PAGE) break;
  }
  return out;
}

// « AV MARIE-CLAUDE VAILLANT-COUTURIER » → nom lisible (servira seulement si aucune adresse ne le nomme).
const ABBR = { AV: 'Avenue', BD: 'Boulevard', R: 'Rue', RUE: 'Rue', PL: 'Place', CHE: 'Chemin', IMP: 'Impasse', ALL: 'Allée', RTE: 'Route', SQ: 'Square', QUA: 'Quai', CRS: 'Cours', PAS: 'Passage', SEN: 'Sentier', RES: 'Résidence', LOT: 'Lotissement', HAM: 'Hameau', ESP: 'Esplanade', PROM: 'Promenade', VLA: 'Villa', CITE: 'Cité', RPT: 'Rond-point', MAIL: 'Mail' };
const SMALL = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'aux', 'au', 'sur', 'en']);
export function niceName(raw) {
  if (!raw) return null;
  const words = String(raw).toLowerCase().split(/\s+/).filter(Boolean);
  return words.map((w, i) => {
    if (i === 0 && ABBR[w.toUpperCase()]) return ABBR[w.toUpperCase()];
    if (i > 0 && SMALL.has(w)) return w;
    return w.replace(/(^|[-'’])(\p{L})/gu, (_, a, c) => a + c.toUpperCase());
  }).join(' ');
}

function highwayOf(p) {
  const n = p.nature || '';
  if (/autoroutier/i.test(n)) return 'motorway';
  if (/bac|transbordeur/i.test(n)) return null;
  if (/escalier/i.test(n)) return 'steps';
  if (/sentier/i.test(n)) return 'path';
  if (/chemin|piste cyclable/i.test(n)) return 'footway';
  if (/bretelle/i.test(n)) return 'primary_link';
  const imp = parseInt(p.importance, 10);
  if (imp <= 2) return 'primary';
  if (imp === 3) return 'secondary';
  return 'residential';
}

const lineCoords = (g) => (g?.type === 'LineString' ? [g.coordinates] : g?.type === 'MultiLineString' ? g.coordinates : []);

// Distance approximative (m) d'un point à un segment, en coordonnées locales.
function segDist(p, a, b) {
  const k = Math.cos((p[1] * Math.PI) / 180) * 111320;
  const ax = (a[0] - p[0]) * k, ay = (a[1] - p[1]) * 110540;
  const bx = (b[0] - p[0]) * k, by = (b[1] - p[1]) * 110540;
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/**
 * Assemble les couches IGN en une réponse au format Overpass.
 * @param {{ban:any[], routes:any[], batiments:any[], liens:any[]}} f
 */
export function ignToOsm({ ban, routes, batiments, liens }) {
  // Logements par bâtiment, partagés entre les numéros qui y mènent.
  const bat = new Map(batiments.map((x) => [x.properties.cleabs, x.properties]));
  const adrOfBat = new Map();
  const batsOfAdr = new Map();
  for (const l of liens) {
    const { id_adr: a, id_bat: b } = l.properties || {};
    if (!a || !b) continue;
    if (!adrOfBat.has(b)) adrOfBat.set(b, new Set());
    adrOfBat.get(b).add(a);
    if (!batsOfAdr.has(a)) batsOfAdr.set(a, new Set());
    batsOfAdr.get(a).add(b);
  }
  const flatsOf = (adrId) => {
    let sum = 0, known = false, levels = 0, residential = false;
    for (const b of batsOfAdr.get(adrId) || []) {
      const p = bat.get(b);
      if (!p) continue;
      if (p.usage_1 === 'Résidentiel' || p.usage_2 === 'Résidentiel') residential = true;
      levels = Math.max(levels, p.nombre_d_etages || 0);
      const n = p.nombre_de_logements;
      if (n > 0) { known = true; sum += n / Math.max(1, adrOfBat.get(b)?.size || 1); }
    }
    if (known) return Math.max(1, Math.round(sum));
    // Sans le chiffre : un grand immeuble résidentiel compte au moins quelques logements.
    if (residential && levels >= 4) return levels * 3;
    return 1;
  };

  const elements = [];
  const doors = [];
  for (const f of ban) {
    const p = f.properties || {};
    const c = p.lon != null && p.lat != null ? [+p.lon, +p.lat] : f.geometry?.coordinates;
    if (!c || !p.numero || p.numero === '99999') continue;
    const num = String(p.numero) + (p.rep ? ' ' + String(p.rep).toLowerCase() : '');
    const d = { type: 'node', id: 'ban:' + p.id, lat: c[1], lon: c[0], tags: { 'addr:housenumber': num, 'addr:street': p.nom_voie || p.nom_ld || null, 'nokk:flats': String(flatsOf(p.id)) } };
    doors.push(d);
    elements.push(d);
  }

  // Les rues prennent le nom écrit dans les adresses (plus propre que celui de la BD TOPO).
  const ways = [];
  for (const r of routes) {
    const hw = highwayOf(r.properties || {});
    if (!hw) continue;
    for (const line of lineCoords(r.geometry)) {
      if (line.length < 2) continue;
      const xs = line.map((q) => q[0]), ys = line.map((q) => q[1]);
      const box = [Math.min(...xs) - 0.001, Math.min(...ys) - 0.0007, Math.max(...xs) + 0.001, Math.max(...ys) + 0.0007];
      ways.push({ type: 'way', id: 'ign:' + r.properties.cleabs + ':' + ways.length, line, box, raw: r.properties.nom_collaboratif_gauche || r.properties.nom_collaboratif_droite || null, hw, votes: new Map() });
    }
  }
  for (const d of doors) {
    const p = [d.lon, d.lat];
    let best = null, bd = 60;
    for (const w of ways) {
      if (!w.raw || p[0] < w.box[0] || p[0] > w.box[2] || p[1] < w.box[1] || p[1] > w.box[3]) continue;
      for (let i = 0; i < w.line.length - 1; i++) {
        const dist = segDist(p, w.line[i], w.line[i + 1]);
        if (dist < bd) { bd = dist; best = w; }
      }
    }
    const name = d.tags['addr:street'];
    if (best && name) best.votes.set(name, (best.votes.get(name) || 0) + 1);
  }
  // Un même nom IGN reçoit le nom d'adresse le plus voté sur l'ensemble de ses tronçons.
  const byRaw = new Map();
  for (const w of ways) {
    if (!w.raw) continue;
    if (!byRaw.has(w.raw)) byRaw.set(w.raw, new Map());
    const m = byRaw.get(w.raw);
    for (const [k, v] of w.votes) m.set(k, (m.get(k) || 0) + v);
  }
  const nameOfRaw = new Map();
  for (const [raw, m] of byRaw) {
    let best = null, bv = 0;
    for (const [k, v] of m) if (v > bv) { bv = v; best = k; }
    nameOfRaw.set(raw, best || niceName(raw));
  }
  for (const w of ways) {
    const tags = { highway: w.hw };
    if (w.raw) tags.name = nameOfRaw.get(w.raw);
    elements.push({ type: 'way', id: w.id, tags, geometry: w.line.map(([lon, lat]) => ({ lat, lon })) });
  }
  return { elements, source: 'ign' };
}

export async function fetchIgn(poly, { signal } = {}) {
  const [w, s, e, n] = bbox(poly);
  const pad = 0.0008;
  const b = [w - pad, s - pad, e + pad, n + pad];
  const [ban, routes, batiments, liens] = await Promise.all([
    getAll('BAN.DATA.GOUV:ban', b, {}, signal),
    getAll('BDTOPO_V3:troncon_de_route', b, {}, signal),
    getAll('BDTOPO_V3:batiment', b, { props: 'cleabs,usage_1,usage_2,nombre_de_logements,nombre_d_etages' }, signal),
    getAll('BAN-PLUS:lien_adresse_bati', b, { props: 'id_adr,id_bat' }, signal),
  ]);
  if (!ban.length && !routes.length) throw new Error('IGN vide');
  return ignToOsm({ ban, routes, batiments, liens });
}
