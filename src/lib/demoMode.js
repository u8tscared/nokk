// Démarre / arrête la démo (données réalistes, rien n'est enregistré).
import { enterDemo, demo, data, setData } from './store.js';
import { buildDemo, nextLiveVisit } from './demo.js';
import { go } from './nav.js';
import { toast } from '../ui/ui.jsx';
import { feel } from './feedback.js';
import { fakePosition } from './geoloc.js';
import { effect } from '@preact/signals';

let timer = 0;
let routes = {};

export async function startDemo() {
  feel('tap');
  const { data: d, routes: r } = await buildDemo(Date.now());
  routes = r;
  enterDemo(d);
  go('carte', { replace: true });
  toast('Démo : rien de ce que vous faites n\'est enregistré');
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
