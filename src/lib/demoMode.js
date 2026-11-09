// Démarre / arrête la démo (données réalistes, rien n'est enregistré).
import { enterDemo, demo, data, setData } from './store.js';
import { buildDemo, nextLiveVisit } from './demo.js';
import { go } from './nav.js';
import { toast } from '../ui/ui.jsx';
import { feel } from './feedback.js';
import { fakePosition } from './geoloc.js';
import { effect, signal } from '@preact/signals';

let timer = 0;
let routes = {};

export const demoMode = signal('caserne');

// Deux démos : le pompier (Inès, sur le terrain) ou la caserne (Lucas, chef : secteurs, équipes, comptes).
export async function startDemo(mode = 'caserne') {
  feel('tap');
  if (typeof mode !== 'string') mode = 'caserne';
  const { data: d0, routes: r } = await buildDemo(Date.now());
  routes = r;
  const d = mode === 'pompier' ? { ...d0, meId: 'm-ines', crew: ['m-ines', 'm-lucas'] } : d0;
  demoMode.value = mode;
  enterDemo(d);
  go(mode === 'pompier' ? 'carte' : 'secteurs', { replace: true });
  toast(mode === 'pompier' ? 'Démo pompier : vous êtes Inès, en tournée ce soir' : 'Démo caserne : vous êtes Lucas, chef d\'équipe');
  // Position simulée : à quelques mètres de la porte suivante du secteur 4.
  const next = d.doors.find((x) => x.id === r['sec-4'].find((id) => !d.visits.some((v) => v.doorId === id)));
  if (next) fakePosition([next.p[0] - 0.00035, next.p[1] + 0.0002], 9);
  clearInterval(timer);
  // Thomas et Sarah avancent dans le secteur 5 : la carte vit pendant la démo.
  timer = setInterval(() => {
    if (!demo.value) { clearInterval(timer); return; }
    const v = nextLiveVisit(data.value, routes);
    if (v) setData((x) => ({ ...x, visits: [...x.visits, v] }));
  }, 25000);
}

export function isDemo() { return demo.value; }
