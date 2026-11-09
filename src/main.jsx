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

installTheme();
installRouter();
installKeyboard();
installFreeze();
installOnline();
resumeGeoIfGranted();

// iOS 26, app installée : la fenêtre s'arrête parfois ~60 px avant le bas de l'écran (bande vide sous
// la barre d'onglets). On mesure l'écart avec la vraie hauteur de l'écran et le cadre de l'app le comble.
const fixGap = () => {
  const root = document.documentElement;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let g = 0;
  if (standalone && /iPhone|iPod/.test(navigator.userAgent) && !root.classList.contains('kb-open')) {
    const portrait = window.innerHeight >= window.innerWidth;
    const full = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    g = Math.round(full - window.innerHeight);
    if (g < 0 || g > 140) g = 0;
  }
  root.style.setProperty('--vgap', g + 'px');
};
fixGap();
window.addEventListener('resize', fixGap);
window.addEventListener('orientationchange', () => setTimeout(fixGap, 300));
document.addEventListener('visibilitychange', () => setTimeout(fixGap, 100));

render(<App />, document.getElementById('app'));

// Écran d'ouverture court.
const splash = document.getElementById('splash');
if (splash) setTimeout(() => splash.remove(), 1500);

// Service worker (hors ligne + mise à jour à chaque mise en ligne).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
}

// Accès pour les tests automatiques et le débogage.
import * as store from './lib/store.js';
import * as nav from './lib/nav.js';
import('./screens/DoorSheet.jsx').then((m) => { window.__nokk.openDoor = m.openDoor; });
window.__nokk = { store, nav };
