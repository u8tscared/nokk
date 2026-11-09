// Pour se repérer en traçant un secteur : recherche d'adresse (Géoplateforme, gratuite, sans clé)
// et numéros de rue de la Base Adresse Nationale autour de la vue.
import { getAll } from './ign.js';

export const GEOCODE = 'https://data.geopf.fr/geocodage/search';

/** @returns {Promise<{label:string, sub:string, p:[number,number], kind:string}[]>} */
export async function searchAddress(q, { near, signal } = {}) {
  q = String(q || '').trim();
  if (q.length < 3) return [];
  const u = new URLSearchParams({ q, limit: '6', autocomplete: '1', index: 'address' });
  if (near) { u.set('lon', String(near[0])); u.set('lat', String(near[1])); }
  const r = await fetch(GEOCODE + '?' + u, { signal });
  if (!r.ok) throw new Error('geocodage ' + r.status);
  const j = await r.json();
  return (j.features || []).map((f) => {
    const p = f.properties || {};
    const kind = p.type || 'housenumber';
    const label = kind === 'municipality' ? p.city || p.label : p.name || p.label;
    const sub = [p.postcode, kind === 'municipality' ? p.context : p.city].filter(Boolean).join(' ');
    return { label, sub, p: f.geometry.coordinates, kind };
  });
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
