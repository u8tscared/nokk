// Pour se repérer en traçant un secteur : recherche d'adresse (Géoplateforme, gratuite, sans clé)
// et numéros de rue de la Base Adresse Nationale autour de la vue.
import { getAll } from './ign.js';

export const GEOCODE = 'https://data.geopf.fr/geocodage/search';

export const PHOTON = 'https://photon.komoot.io/api/';
export const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const FRANCE = '-5.6,41.2,9.9,51.2';

// Le géocodeur de l'IGN tombe parfois en panne (504 pendant des heures) : on interroge en même temps
// Photon (OpenStreetMap), et on garde l'IGN s'il répond vite, sinon Photon. En dernier recours, Nominatim.
let ignDownUntil = 0;

function timeout(signal, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  signal?.addEventListener('abort', () => c.abort(), { once: true });
  return { signal: c.signal, done: () => clearTimeout(t) };
}

async function getJson(url, signal, ms) {
  const t = timeout(signal, ms);
  try {
    const r = await fetch(url, { signal: t.signal });
    if (!r.ok) throw new Error('http ' + r.status);
    return await r.json();
  } finally { t.done(); }
}

async function ign(q, near, signal) {
  const u = new URLSearchParams({ q, limit: '6', autocomplete: '1', index: 'address' });
  if (near) { u.set('lon', String(near[0])); u.set('lat', String(near[1])); }
  const j = await getJson(GEOCODE + '?' + u, signal, 4000);
  return (j.features || []).map((f) => {
    const p = f.properties || {};
    const kind = p.type || 'housenumber';
    const label = kind === 'municipality' ? p.city || p.label : p.name || p.label;
    const sub = [p.postcode, kind === 'municipality' ? String(p.context || '').split(', ')[1] : p.city].filter(Boolean).join(' ');
    return { label, sub, p: f.geometry.coordinates, kind };
  });
}

const PLACE = new Set(['city', 'town', 'village', 'hamlet', 'suburb', 'quarter', 'neighbourhood', 'locality', 'district', 'county', 'state']);
export function fromPhoton(features) {
  const out = [];
  for (const f of features || []) {
    const p = f.properties || {};
    if (p.countrycode && p.countrycode !== 'FR') continue;
    let kind, label;
    if (p.housenumber && (p.street || p.name)) { kind = 'housenumber'; label = p.housenumber + ' ' + (p.street || p.name); }
    else if (p.type === 'street' || p.osm_key === 'highway') { kind = 'street'; label = p.name || p.street; }
    else if (PLACE.has(p.type) || p.osm_key === 'place' || p.osm_key === 'boundary') { kind = 'municipality'; label = p.name; }
    else continue; // commerces, associations… : pas des adresses
    if (!label) continue;
    const city = kind === 'municipality' ? p.county || p.state : p.city || p.locality || p.district;
    out.push({ label, sub: [p.postcode, city].filter(Boolean).join(' '), p: f.geometry.coordinates, kind });
  }
  return dedupe(out);
}

export function fromNominatim(list) {
  return dedupe((list || []).map((x) => {
    const a = x.address || {};
    const city = a.city || a.town || a.village || a.municipality || a.suburb;
    const street = a.road || a.pedestrian || a.footway || a.square;
    const kind = a.house_number && street ? 'housenumber' : street ? 'street' : 'municipality';
    const label = kind === 'housenumber' ? a.house_number + ' ' + street : kind === 'street' ? street : city || x.name;
    return { label, sub: [a.postcode, kind === 'municipality' ? a.county || a.state : city].filter(Boolean).join(' '), p: [+x.lon, +x.lat], kind };
  }).filter((r) => r.label));
}

// Une même rue revient en plusieurs tronçons : on n'en garde qu'un.
function dedupe(list) {
  const seen = new Set();
  return list.filter((r) => { const k = (r.label + '|' + r.sub).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

async function photon(q, near, signal) {
  const u = new URLSearchParams({ q, limit: '10', lang: 'fr', bbox: FRANCE });
  if (near) { u.set('lon', String(near[0])); u.set('lat', String(near[1])); u.set('location_bias_scale', '0.3'); }
  const j = await getJson(PHOTON + '?' + u, signal, 6000);
  return fromPhoton(j.features).slice(0, 6);
}

async function nominatim(q, signal) {
  const u = new URLSearchParams({ q, format: 'jsonv2', addressdetails: '1', countrycodes: 'fr', limit: '6', 'accept-language': 'fr' });
  return fromNominatim(await getJson(NOMINATIM + '?' + u, signal, 8000));
}

/**
 * Recherche d'une adresse, d'une rue ou d'une commune.
 * `deep` (touche Entrée) essaie aussi Nominatim si rien n'est trouvé.
 * @returns {Promise<{label:string, sub:string, p:[number,number], kind:string}[]>}
 */
export async function searchAddress(q, { near, signal, deep = false } = {}) {
  q = String(q || '').trim();
  if (q.length < 3) return [];
  const osm = photon(q, near, signal).catch((e) => { if (e?.name === 'AbortError' && signal?.aborted) throw e; return null; });
  if (Date.now() > ignDownUntil) {
    try {
      const r = await ign(q, near, signal);
      if (r.length) { osm.catch(() => {}); return r; }
    } catch (e) {
      if (signal?.aborted) throw e;
      ignDownUntil = Date.now() + 60_000; // en panne : on ne l'attend plus pendant une minute
    }
  }
  const r = await osm;
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  if (r?.length) return r;
  if (deep || r === null) {
    try { const n = await nominatim(q, signal); if (n.length || r) return n; } catch (e) { if (signal?.aborted) throw e; if (r) return r; }
    throw new Error('geocodage indisponible');
  }
  return r;
}

// Numéros chargés par zone : on garde ce qui est déjà venu, on ne redemande que si la vue sort de la zone connue.
export function houseNumbers({ onData }) {
  const seen = new Map();
  let loaded = null; // [w,s,e,n]
  let ctrl = null;
  const inside = (b, L) => L && b[0] >= L[0] && b[1] >= L[1] && b[2] <= L[2] && b[3] <= L[3];
  return {
    async update(b) {
      if (inside(b, loaded)) return;
      const dx = (b[2] - b[0]) * 0.4, dy = (b[3] - b[1]) * 0.4;
      const want = [b[0] - dx, b[1] - dy, b[2] + dx, b[3] + dy];
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        const feats = await getAll('BAN.DATA.GOUV:ban', want, { props: 'id,numero,rep,lon,lat' }, ctrl.signal);
        loaded = want;
        if (seen.size > 30000) seen.clear();
        for (const f of feats) {
          const p = f.properties || {};
          if (!p.numero || p.numero === '99999' || seen.has(p.id)) continue;
          const c = p.lon != null ? [+p.lon, +p.lat] : f.geometry?.coordinates;
          if (!c) continue;
          seen.set(p.id, { type: 'Feature', properties: { n: String(p.numero) + (p.rep ? String(p.rep).toLowerCase().slice(0, 3) : '') }, geometry: { type: 'Point', coordinates: c } });
        }
        onData({ type: 'FeatureCollection', features: [...seen.values()] });
      } catch (e) { if (e?.name !== 'AbortError') loaded = null; }
    },
    stop() { ctrl?.abort(); },
  };
}
