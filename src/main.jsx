import { render } from 'preact';
import './styles/tokens.css';
import './styles/app.css';
import './styles/screens.css';
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

// Vraie hauteur de l'écran dans l'app installée (sinon une bande vide apparaît sous la barre d'onglets).
const setH = () => document.documentElement.style.setProperty('--app-h', (window.visualViewport?.height && !document.documentElement.classList.contains('kb-open') ? window.innerHeight : window.innerHeight) + 'px');
setH();
window.addEventListener('resize', setH);

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
window.__nokk = { store, nav };
