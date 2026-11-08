// Récupère une vraie zone (rues + adresses OpenStreetMap) pour le mode démo.
// Lancé par GitHub Actions (le réseau y est ouvert). Résultat : public/demo/area.json
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('public/demo', { recursive: true });

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const CANDIDATES = [
  { town: 'Pessac', lat: 44.8067, lon: -0.6311 },
  { town: 'Bron', lat: 45.7386, lon: 4.9128 },
  { town: 'Rezé', lat: 47.1820, lon: -1.5490 },
  { town: 'Caluire-et-Cuire', lat: 45.7953, lon: 4.8467 },
  { town: 'Villeurbanne', lat: 45.7719, lon: 4.8902 },
];
const R = 420;

async function overpass(q) {
  for (const m of MIRRORS) {
    try {
      const r = await fetch(m, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'nokk-demo/1.0 (+https://github.com/u8tscared/nokk)', accept: 'application/json' } });
      if (r.ok) return await r.json();
      console.log(m, r.status);
    } catch (e) { console.log(m, e.message); }
  }
  throw new Error('overpass down');
}

const out = [];
for (const c of CANDIDATES) {
  const q = `[out:json][timeout:90];
(way(around:${R},${c.lat},${c.lon})[highway~"^(primary|secondary|tertiary|residential|living_street|unclassified|pedestrian|service|footway)$"];);
out geom tags;
(node(around:${R},${c.lat},${c.lon})["addr:housenumber"];way(around:${R},${c.lat},${c.lon})["addr:housenumber"];);
out center tags;`;
  try {
    const j = await overpass(q);
    const ways = j.elements.filter(e => e.type === 'way' && e.tags?.highway && e.geometry);
    const addrs = j.elements.filter(e => e.tags?.['addr:housenumber']);
    const named = new Set(ways.filter(w => w.tags.name).map(w => w.tags.name));
    console.log(c.town, 'ways', ways.length, 'named', named.size, 'addr', addrs.length);
    out.push({ ...c, radius: R, elements: j.elements, score: Math.min(addrs.length, 650) + named.size * 5 });
  } catch (e) { console.log(c.town, e.message); }
  await new Promise(r => setTimeout(r, 8000));
}
out.sort((a, b) => b.score - a.score);
writeFileSync('public/demo/candidates.json', JSON.stringify(out.map(({ elements, ...r }) => r), null, 1));
for (const c of out) writeFileSync(`public/demo/osm-${c.town.toLowerCase().replace(/[^a-z]+/g, '-')}.json`, JSON.stringify({ town: c.town, lat: c.lat, lon: c.lon, radius: c.radius, elements: c.elements }));
