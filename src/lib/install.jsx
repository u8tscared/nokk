// L'invite d'installation du navigateur (Android, ordinateur). Le guide animé est dans src/screens/Install.jsx.
import { signal } from '@preact/signals';

let deferred = null;
export const canInstall = signal(false);
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; canInstall.value = true; });
  window.addEventListener('appinstalled', () => { canInstall.value = false; deferred = null; });
}
export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const r = await deferred.userChoice.catch(() => null);
  deferred = null;
  canInstall.value = false;
  return r?.outcome === 'accepted';
}
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
