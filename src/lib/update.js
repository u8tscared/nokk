// Mises à jour de l'app : on demande au site quelle est la dernière version (version.json, jamais en cache),
// et si ce n'est pas celle-ci, on installe la nouvelle tout de suite.
import { signal } from '@preact/signals';

export const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
// idle | checking | updating | uptodate | offline
export const updateState = signal('idle');

// « 1.0.0+202611091005 » → « 9 nov. à 10 h 05 »
export function versionLabel(v = VERSION) {
  const m = /\+(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(v);
  if (!m) return v;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  const day = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });
  const t = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).replace(':', ' h ');
  return `${day} à ${t}`;
}

let reg = null;
export function setRegistration(r) { reg = r; }

export async function checkUpdate({ quiet = false } = {}) {
  if (updateState.peek() === 'updating') return 'updating';
  updateState.value = 'checking';
  try {
    const r = await fetch(import.meta.env.BASE_URL + 'version.json?t=' + Date.now(), { cache: 'no-store' });
    const j = await r.json();
    if (!j?.version || j.version === VERSION) { updateState.value = 'uptodate'; return 'uptodate'; }
    updateState.value = 'updating';
    if (!quiet) import('../ui/ui.jsx').then(({ toast }) => toast('Nouvelle version de Nokk : installation…', { duration: 6000 }));
    await reg?.update().catch(() => {});
    reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    // Si le service worker ne prend pas la main (navigateur sans, ou bloqué), on recharge quand même.
    setTimeout(() => location.reload(), 8000);
    return 'updating';
  } catch {
    updateState.value = 'offline';
    return 'offline';
  }
}
