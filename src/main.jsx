import { render } from 'preact';
import './styles/tokens.css';
import './styles/app.css';
import './styles/screens.css';
import './styles/v2.css';
import { App } from './App.jsx';
import { installRouter } from './lib/nav.js';
import { installKeyboard } from './lib/keyboard.js';
import { installFreeze } from './lib/freeze.js';
import { installTheme } from './lib/theme.js';
import { installOnline } from './lib/offline.js';
import { resumeGeoIfGranted } from './lib/geoloc.js';
import { bootAccount } from './lib/account.js';

installTheme();
installRouter();
installKeyboard();
installFreeze();
installOnline();
resumeGeoIfGranted();
bootAccount();

render(<App />, document.getElementById('app'));

// Écran d'ouverture court.
const splash = document.getElementById('splash');
if (splash) setTimeout(() => splash.remove(), 1500);

// Service worker (hors ligne + mise à jour à chaque mise en ligne).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // L'app installée reste ouverte des jours : on vérifie souvent s'il y a une nouvelle version,
  // et elle s'installe toute seule (le plugin recharge la page ; tout est déjà gardé sur l'appareil).
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => { if (navigator.onLine !== false) reg.update().catch(() => {}); };
      setInterval(check, 15 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      window.addEventListener('online', check);
      check();
    },
  })).catch(() => {});
}

// Accès pour les tests automatiques et le débogage.
import * as store from './lib/store.js';
import * as nav from './lib/nav.js';
import('./screens/DoorSheet.jsx').then((m) => { window.__nokk.openDoor = m.openDoor; });
import * as sync from './lib/sync.js';
import * as accountMod from './lib/account.js';
window.__nokk = { store, nav, sync, account: accountMod };
