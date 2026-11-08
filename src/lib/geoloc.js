// Localisation en direct (GPS) + boussole quand l'appareil l'autorise.
import { position, geoState } from './store.js';

let watchId = null;
let heading = null;

function onOrient(e) {
  const h = e.webkitCompassHeading ?? (e.absolute && e.alpha != null ? 360 - e.alpha : null);
  if (h == null) return;
  heading = h;
  if (position.value) position.value = { ...position.value, heading: h };
}

export async function startGeo({ ask = true } = {}) {
  if (!('geolocation' in navigator)) { geoState.value = 'unavailable'; return false; }
  if (watchId != null) return true;
  geoState.value = 'asking';
  // Boussole (iOS demande une autorisation, depuis un geste).
  try {
    const DOE = window.DeviceOrientationEvent;
    if (ask && DOE && typeof DOE.requestPermission === 'function') {
      const r = await DOE.requestPermission().catch(() => 'denied');
      if (r === 'granted') window.addEventListener('deviceorientation', onOrient, true);
    } else if (DOE) {
      window.addEventListener('deviceorientationabsolute', onOrient, true);
      window.addEventListener('deviceorientation', onOrient, true);
    }
  } catch {}
  return new Promise((resolve) => {
    let first = true;
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        geoState.value = 'on';
        const c = pos.coords;
        position.value = {
          p: [c.longitude, c.latitude],
          acc: c.accuracy,
          heading: c.heading != null && !isNaN(c.heading) && c.speed > 0.6 ? c.heading : heading,
          ts: pos.timestamp || Date.now(),
        };
        if (first) { first = false; resolve(true); }
      },
      (err) => {
        geoState.value = err.code === 1 ? 'denied' : 'unavailable';
        stopGeo(false);
        if (first) { first = false; resolve(false); }
      },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 20000 },
    );
  });
}

export function stopGeo(reset = true) {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  if (reset) geoState.value = 'idle';
}

// Si l'utilisateur a déjà accepté, on relance la localisation au démarrage sans rien demander.
export async function resumeGeoIfGranted() {
  try {
    const p = await navigator.permissions?.query({ name: 'geolocation' });
    if (p?.state === 'granted') startGeo({ ask: false });
  } catch {}
}

// Simulation de position (mode démo, ou test).
export function fakePosition(p, acc = 8) {
  position.value = { p, acc, heading: null, ts: Date.now(), fake: true };
  geoState.value = 'on';
}
