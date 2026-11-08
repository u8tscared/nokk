import { signal } from '@preact/signals';
import { Icon } from '../ui/icons.jsx';
import { Button } from '../ui/ui.jsx';

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
export function platform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

export function installHelp() {
  const p = platform();
  if (isStandalone()) return <div class="stack"><div class="sheet-head"><h2>Nokk est installée</h2></div><p class="muted">Elle s'ouvre déjà en plein écran depuis votre écran d'accueil.</p></div>;
  return (
    <div class="stack">
      <div class="sheet-head"><h2>Ajouter à l'écran d'accueil</h2></div>
      <p class="muted small">Nokk s'ouvre ensuite en plein écran, marche sans réseau et garde vos données sur le téléphone.</p>
      {p === 'ios' && (
        <ol class="install-steps">
          <li><Icon name="share" /> Touchez <b>Partager</b> en bas de Safari</li>
          <li><Icon name="plus" /> Choisissez <b>Sur l'écran d'accueil</b></li>
          <li><Icon name="check" /> Touchez <b>Ajouter</b> en haut à droite</li>
        </ol>
      )}
      {p !== 'ios' && canInstall.value && <Button kind="full" icon="install" onClick={promptInstall}>Installer Nokk</Button>}
      {p === 'android' && !canInstall.value && (
        <ol class="install-steps">
          <li><Icon name="more" /> Ouvrez le menu <b>⋮</b> de Chrome</li>
          <li><Icon name="install" /> Choisissez <b>Installer l'application</b></li>
        </ol>
      )}
      {p === 'desktop' && !canInstall.value && (
        <ol class="install-steps">
          <li><Icon name="install" /> Cliquez sur l'icône d'installation dans la barre d'adresse de Chrome ou Edge</li>
        </ol>
      )}
    </div>
  );
}
