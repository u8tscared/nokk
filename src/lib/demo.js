// Mode démo : une vraie zone (rues et numéros OpenStreetMap de Rezé), une équipe crédible,
// une semaine de tournée déjà faite. Rien n'est enregistré.
import { convexHull, inflate, centroid, dist } from './geo.js';
import { planRoute } from './route.js';
import { uid } from './model.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_MEMBERS = [
  { id: 'm-lucas', name: 'Lucas Martin', role: 'chef', color: '#367a6d', pin: '1111' },
  { id: 'm-ines', name: 'Inès Diallo', role: 'pompier', color: '#d9554f', pin: '2222' },
  { id: 'm-thomas', name: 'Thomas Bernard', role: 'pompier', color: '#3f6c8f', pin: '3333' },
  { id: 'm-sarah', name: 'Sarah Petit', role: 'pompier', color: '#b7791f', pin: '4444' },
  { id: 'm-hugo', name: 'Hugo Moreau', role: 'pompier', color: '#6b5ca5', pin: '5555' },
  { id: 'm-camille', name: 'Camille Laurent', role: 'tresorier', color: '#12262a', pin: '6666' },
];

const NAMES = ['Dupont', 'Leroy', 'Moreau', 'Simon', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel', 'Girard', 'André', 'Lefèvre', 'Mercier', 'Blanc', 'Guérin', 'Boyer', 'Garnier', 'Chevalier', 'François', 'Legrand', 'Gauthier', 'Perrin', 'Robin', 'Clément', 'Morin', 'Nicolas', 'Henry', 'Rousseau', 'Mathieu', 'Gautier', 'Masson', 'Marchand', 'Duval', 'Denis', 'Lemaire', 'Joly', 'Gaillard'];
const FIRST = ['M.', 'Mme', 'Famille', 'M. et Mme'];

function kmeans(points, k, rand) {
  let cents = [];
  // k-means++ simplifié
  cents.push(points[Math.floor(rand() * points.length)]);
  while (cents.length < k) {
    let far = null, fd = -1;
    for (const p of points) {
      const d = Math.min(...cents.map((c) => dist(p, c)));
      if (d > fd) { fd = d; far = p; }
    }
    cents.push(far);
  }
  let assign = new Array(points.length).fill(0);
  for (let it = 0; it < 25; it++) {
    assign = points.map((p) => {
      let b = 0, bd = Infinity;
      cents.forEach((c, i) => { const d = dist(p, c); if (d < bd) { bd = d; b = i; } });
      return b;
    });
    cents = cents.map((c, i) => {
      const mine = points.filter((_, j) => assign[j] === i);
      return mine.length ? centroid(mine) : c;
    });
  }
  return assign;
}

export async function buildDemo(now = Date.now()) {
  const area = (await import('../demo/area.json')).default;
  const rand = rng(2027);
  const K = 6;
  const assign = kmeans(area.doors.map((d) => d.p), K, rand);

  // Une rue courte reste entière dans un seul secteur.
  const byStreet = new Map();
  area.doors.forEach((d, i) => {
    if (!byStreet.has(d.street)) byStreet.set(d.street, []);
    byStreet.get(d.street).push(i);
  });
  for (const idx of byStreet.values()) {
    if (idx.length > 45) continue;
    const count = new Map();
    idx.forEach((i) => count.set(assign[i], (count.get(assign[i]) || 0) + 1));
    const major = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
    idx.forEach((i) => (assign[i] = major));
  }

  // Ordonne les secteurs d'ouest en est pour des numéros lisibles.
  const groups = Array.from({ length: K }, (_, i) => area.doors.filter((_, j) => assign[j] === i)).filter((g) => g.length);
  groups.sort((a, b) => centroid(a.map((d) => d.p))[0] - centroid(b.map((d) => d.p))[0]);

  const sectors = [];
  const doors = [];
  const plan = [
    { status: 'done', pct: 1, crew: ['m-lucas', 'm-ines'], daysAgo: 7 },
    { status: 'done', pct: 0.94, crew: ['m-thomas', 'm-sarah'], daysAgo: 6 },
    { status: 'en-cours', pct: 0.72, crew: ['m-hugo', 'm-camille'], daysAgo: 1 },
    { status: 'en-cours', pct: 0.46, crew: ['m-lucas', 'm-ines'], daysAgo: 0, tonight: true },
    { status: 'en-cours', pct: 0.18, crew: ['m-thomas', 'm-sarah'], daysAgo: 0, live: true },
    { status: 'a-faire', pct: 0, crew: ['m-hugo'], daysAgo: 0 },
  ];

  groups.forEach((g, i) => {
    const id = 'sec-' + (i + 1);
    const counts = new Map();
    g.forEach((d) => counts.set(d.street, (counts.get(d.street) || 0) + 1));
    const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const names = new Set(g.map((d) => d.street));
    const hull = inflate(convexHull(g.map((d) => d.p)), 28);
    sectors.push({
      id,
      name: `Secteur ${i + 1}`,
      area: main.replace(/^(Rue|Avenue|Chemin|Place|Impasse|Allée) (de la |des |du |de l'|de )?/i, ''),
      polygon: hull,
      streets: area.streets.filter((s) => names.has(s.name)).map((s, k) => ({ id: id + '-s' + k, ...s })),
      network: area.network,
      assignees: plan[i]?.crew || [],
      createdAt: now - 20 * 864e5,
      photos: [],
      source: 'osm',
    });
    const bigNames = new Set(area.streets.filter((x) => x.big).map((x) => x.name));
    for (const d of g) {
      const r = rand();
      // Quelques immeubles, surtout sur les grandes rues.
      const rb = rand();
      const flats = rb < (bigNames.has(d.street) ? 0.22 : 0.06) ? [6, 8, 9, 12, 12, 16, 20, 24][Math.floor(rand() * 8)] : d.flats || 1;
      doors.push({
        ...d,
        flats,
        id: id + '-' + d.id,
        sectorId: id,
        lastYear: r < 0.62 ? { amount: [500, 1000, 1000, 1000, 1500, 1500, 2000, 2000, 3000][Math.floor(rand() * 9)] } : null,
        notes: r > 0.93 ? 'Chien, sonner fort' : r > 0.9 ? 'Boîte aux lettres sur le côté' : '',
        code: flats > 1 ? (rand() < 0.5 ? 'A' : 'B') + String(1000 + Math.floor(rand() * 8999)) : '',
      });
    }
  });

  // Visites.
  const visits = [];
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const result = () => {
    const r = rand();
    return r < 0.63 ? 'donne' : r < 0.84 ? 'absent' : r < 0.93 ? 'refus' : 'deja';
  };
  const amount = (door) => {
    if (door.lastYear && rand() < 0.7) return door.lastYear.amount + (rand() < 0.2 ? 500 : 0);
    const r = rand();
    return r < 0.1 ? 500 : r < 0.5 ? 1000 : r < 0.7 ? 1500 : r < 0.9 ? 2000 : r < 0.97 ? 3000 : 5000;
  };
  const method = () => { const r = rand(); return r < 0.68 ? 'especes' : r < 0.9 ? 'cheque' : 'carte'; };

  const routes = {};
  sectors.forEach((s, i) => {
    const p = plan[i];
    const sd = doors.filter((d) => d.sectorId === s.id);
    const route = planRoute({ doors: sd, network: s.network, big: new Set(s.streets.filter((x) => x.big).map((x) => x.name)) });
    routes[s.id] = route.order;
    if (!p || !p.pct) return;
    const n = Math.round(sd.length * p.pct);
    const byId = new Map(sd.map((d) => [d.id, d]));
    const day = new Date(now - p.daysAgo * 864e5);
    const startTs = p.tonight ? now - 105 * 60e3 : p.live ? now - 50 * 60e3 : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 17, 30).getTime();
    const span = p.tonight ? 100 * 60e3 : p.live ? 48 * 60e3 : 150 * 60e3;
    for (let k = 0; k < n; k++) {
      const door = byId.get(route.order[k]);
      const ts = Math.round(startTs + (span * k) / n);
      let res = result();
      if (p.status === 'done' && res === 'absent' && rand() < (p.pct === 1 ? 1 : 0.75)) {
        // Secteur fini : l'absent a été revu un autre jour.
        visits.push({ id: uid('v'), doorId: door.id, sectorId: s.id, ts: ts - 864e5, by: p.crew, result: 'absent' });
        res = rand() < 0.7 ? 'donne' : 'refus';
      }
      if (door.flats > 1) {
        // Immeuble : un passage par logement (101, 102… 201…).
        const share = p.status === 'done' ? 1 : p.tonight || p.live ? 0.5 + rand() * 0.4 : 0.8;
        const nUnits = Math.max(1, Math.round(door.flats * share));
        for (let u = 0; u < nUnits; u++) {
          const label = `${1 + Math.floor(u / 4)}0${1 + (u % 4)}`;
          let ur = result();
          if (p.status === 'done' && ur === 'absent') ur = rand() < 0.7 ? 'donne' : 'refus';
          const uv = { id: uid('v'), doorId: door.id, sectorId: s.id, ts: ts + u * 40e3, by: p.crew, result: ur, unit: label };
          if (ur === 'donne') { uv.amount = amount(door); uv.method = method(); uv.calendars = 1; if (uv.method === 'cheque') { uv.name = pick(FIRST) + ' ' + pick(NAMES); uv.chequeNo = String(1000000 + Math.floor(rand() * 8999999)); } }
          visits.push(uv);
        }
        continue;
      }
      const v = { id: uid('v'), doorId: door.id, sectorId: s.id, ts, by: p.crew, result: res };
      if (res === 'donne') {
        v.amount = amount(door);
        v.method = method();
        v.calendars = rand() < 0.06 ? 2 : 1;
        if (rand() < 0.35 || v.method === 'cheque') v.name = pick(FIRST) + ' ' + pick(NAMES);
        if (v.method === 'cheque') v.chequeNo = String(1000000 + Math.floor(rand() * 8999999));
      }
      visits.push(v);
    }
  });

  // QR « Repassez plus tard » : les absents du secteur 3 et 4 ont reçu une carte, trois habitants ont répondu.
  const callbacks = [];
  const day = (k) => { const d = new Date(now + k * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  for (const sid of ['sec-3', 'sec-4']) {
    const s = sectors.find((x) => x.id === sid);
    if (!s) continue;
    s.qr = 'DEMO' + sid.replace(/\W/g, '') + 'qrcode';
    s.qrPrinted = 40;
    let card = 0;
    for (const v of visits) if (v.sectorId === sid && v.result === 'absent' && !v.unit) v.card = ++card;
    const answers = sid === 'sec-4' ? [
      { n: 2, want: 'oui', slot: { day: day(1), from: 18, to: 19 }, name: 'Mme Garcia', note: 'Sonnez deux fois, je suis au fond du jardin' },
      { n: 5, want: 'oui', slot: { day: day(2), from: 17, to: 18 }, name: 'M. Leroy', email: 'leroy@exemple.fr' },
      { n: 3, want: 'non', note: 'Déjà pris chez un collègue de la caserne' },
    ] : [
      { n: 1, want: 'oui', slot: { day: day(1), from: 19, to: 20 }, name: 'Famille Roux' },
    ];
    answers.forEach((a, i) => { if (a.n <= card) callbacks.push({ id: `cb-${sid}-${i}`, sectorId: sid, ts: now - (3 - i) * 36e5, status: 'new', ...a }); });
  }

  const handovers = [
    { id: 'h-1', ts: now - 7 * 864e5 + 3 * 36e5, from: 'm-lucas', to: 'm-camille', sectorId: 'sec-1', counted: null, diff: 0, note: 'RAS' },
  ];
  // Montant compté = attendu pour le secteur 1.
  const s1cash = visits.filter((v) => v.sectorId === 'sec-1' && v.result === 'donne' && v.method === 'especes').reduce((s, v) => s + v.amount, 0);
  handovers[0].expected = s1cash;
  handovers[0].counted = s1cash;

  const stock = DEMO_MEMBERS.filter((m) => m.role !== 'tresorier').map((m, i) => ({ id: 'st-' + i, ts: now - 21 * 864e5, memberId: m.id, qty: 400 + i * 20, note: 'Carton de départ' }));

  return {
    data: {
      v: 1,
      org: { name: 'Amicale des sapeurs-pompiers', city: 'Rezé', year: 2027, price: 1000, stock: 1500, demo: true },
      members: DEMO_MEMBERS,
      meId: 'm-lucas',
      sectors,
      doors,
      visits,
      handovers,
      stock,
      callbacks,
      currentSectorId: 'sec-4',
      crew: ['m-lucas', 'm-ines'],
    },
    routes,
  };
}

// Simulation : Thomas et Sarah avancent dans le secteur 5 pendant la démo.
export function nextLiveVisit(data, routes, now = Date.now()) {
  const sid = 'sec-5';
  const order = routes[sid] || [];
  const done = new Set(data.visits.filter((v) => v.sectorId === sid).map((v) => v.doorId));
  const next = order.find((id) => !done.has(id));
  if (!next) return null;
  const r = Math.random();
  const res = r < 0.64 ? 'donne' : r < 0.86 ? 'absent' : r < 0.94 ? 'refus' : 'deja';
  const v = { id: uid('v'), doorId: next, sectorId: sid, ts: now, by: ['m-thomas', 'm-sarah'], result: res };
  if (res === 'donne') {
    v.amount = [1000, 1000, 1500, 2000, 500][Math.floor(Math.random() * 5)];
    v.method = Math.random() < 0.7 ? 'especes' : 'cheque';
    v.calendars = 1;
  }
  return v;
}
