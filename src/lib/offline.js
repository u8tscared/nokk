// Hors ligne : vraie détection du réseau + carte du secteur gardée sur le téléphone.
import { online } from './store.js';
import { TILE_SOURCE } from './mapstyle.js';

export const TILE_CACHE = 'nokk-tiles-v1';
let forcedOffline = false;

async function ping() {
  if (forcedOffline) return false;
  if (!navigator.onLine) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    // Le Wi-Fi « connecté » qui n'atteint rien : on vérifie vraiment.
    await fetch('https://tiles.openfreemap.org/planet?ping=' + Date.now(), { method: 'HEAD', mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
    clearTimeout(t);
    return true;
  } catch {
    return false;
  }
}

export function installOnline() {
  const check = async () => { online.value = await ping(); };
  window.addEventListener('online', check);
  window.addEventListener('offline', () => { online.value = false; });
  setInterval(check, 30000);
  check();
}

export function simulateOutage(seconds = 20) {
  forcedOffline = true;
  online.value = false;
  setTimeout(() => { forcedOffline = false; online.value = navigator.onLine; }, seconds * 1000);
}

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);

export async function cacheSectorTiles(b, onProgress) {
  if (!('caches' in window)) return -1;
  try {
    const tj = await (await fetch(TILE_SOURCE)).json();
    const tpl = tj.tiles[0];
    const pad = 0.003;
    const urls = [];
    for (let z = 11; z <= 14; z++) {
      for (let x = lon2x(b[0] - pad, z); x <= lon2x(b[2] + pad, z); x++)
        for (let y = lat2y(b[3] + pad, z); y <= lat2y(b[1] - pad, z); y++) urls.push(tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y));
    }
    const cache = await caches.open(TILE_CACHE);
    let done = 0;
    await Promise.all(urls.map(async (u) => {
      try { const r = await fetch(u); if (r.ok) await cache.put(u, r); } catch {}
      onProgress?.(++done, urls.length);
    }));
    await cache.put(TILE_SOURCE, new Response(JSON.stringify(tj), { headers: { 'content-type': 'application/json' } }));
    return done;
  } catch {
    return -1;
  }
}
