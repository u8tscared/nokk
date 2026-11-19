// Le parcours de formation : quelques questions, puis les leçons qui comptent pour cette personne.
// Logique pure (testée dans tests/unit/parcours.test.js). L'écran est dans src/screens/Parcours.jsx.

export const QUESTIONS = [
  {
    key: 'does', multi: true, title: 'Pendant la tournée, vous…', sub: 'Plusieurs réponses possibles.',
    options: [
      { value: 'portes', icon: 'door', label: 'Je fais les portes', hint: 'Sonner, présenter le calendrier, noter le don' },
      { value: 'secteurs', icon: 'draw', label: 'Je prépare les secteurs', hint: 'Découper la ville, répartir les binômes' },
      { value: 'caisse', icon: 'cash', label: 'Je tiens la caisse', hint: 'Compter, remettre, faire les comptes' },
    ],
  },
  {
    key: 'exp', title: 'La tournée des calendriers, pour vous, c\'est…',
    options: [
      { value: 'debut', icon: 'sparkle', label: 'Ma première', hint: 'On reprend tout depuis le début, pas à pas' },
      { value: 'some', icon: 'calendar', label: 'J\'en ai fait quelques-unes', hint: 'On va droit à ce que Nokk change' },
      { value: 'pro', icon: 'flag', label: 'Je connais par cœur', hint: 'L\'essentiel, et les astuces qui font gagner du temps' },
    ],
  },
  {
    key: 'terrain', title: 'Votre secteur, c\'est plutôt…',
    options: [
      { value: 'maisons', icon: 'door', label: 'Des maisons', hint: 'Pavillons, lotissements' },
      { value: 'immeubles', icon: 'building', label: 'Des immeubles', hint: 'Interphones, étages, boîtes aux lettres' },
      { value: 'mixte', icon: 'map', label: 'Un peu des deux', hint: 'Centre-ville et quartiers' },
      { value: 'campagne', icon: 'walk', label: 'La campagne', hint: 'Hameaux, fermes, peu de réseau' },
    ],
  },
  {
    key: 'crew', title: 'Vous tournez…',
    options: [
      { value: 'binome', icon: 'team', label: 'En binôme', hint: 'À deux, le plus courant' },
      { value: 'equipe', icon: 'sectors', label: 'À plusieurs', hint: 'Plusieurs binômes en même temps' },
      { value: 'seul', icon: 'user', label: 'Seul', hint: 'Un pompier, un secteur' },
    ],
  },
  {
    key: 'pay', multi: true, title: 'Chez vous, on donne surtout…', sub: 'Plusieurs réponses possibles.',
    options: [
      { value: 'especes', icon: 'coins', label: 'En espèces' },
      { value: 'cheque', icon: 'cheque', label: 'Par chèque' },
      { value: 'carte', icon: 'card', label: 'Par carte bancaire' },
    ],
  },
  {
    key: 'comfort', title: 'Avec votre téléphone, vous êtes…',
    options: [
      { value: 'aise', icon: 'rocket', label: 'À l\'aise', hint: 'Les applis, je connais' },
      { value: 'moyen', icon: 'phone', label: 'Ça va', hint: 'Je me débrouille' },
      { value: 'peu', icon: 'help', label: 'Pas trop', hint: 'On y va doucement, avec la vue simple' },
    ],
  },
];

/** Réponses par défaut, d'après le rôle de la personne dans l'équipe. */
export function defaultProfile(role = 'pompier') {
  return {
    does: role === 'chef' ? ['portes', 'secteurs'] : role === 'tresorier' ? ['caisse'] : ['portes'],
    exp: null, terrain: null, crew: null, pay: ['especes', 'cheque'], comfort: null,
  };
}

export function isComplete(p) {
  return !!p && QUESTIONS.every((q) => (q.multi ? (p[q.key] || []).length > 0 : !!p[q.key]));
}

// Les leçons, dans l'ordre où on les suit.
export const MODULES = {
  install: { icon: 'install', title: 'Nokk sur l\'écran d\'accueil', min: 1 },
  reflexes: { icon: 'heart', title: 'Les bons réflexes à la porte', min: 3 },
  carte: { icon: 'map', title: 'Lire la carte', min: 2 },
  tournee: { icon: 'walk', title: 'Lancer la tournée', min: 2 },
  porte: { icon: 'door', title: 'Une porte en deux gestes', min: 3 },
  immeuble: { icon: 'building', title: 'Les immeubles', min: 3 },
  repasse: { icon: 'repeat', title: 'Les absents et les repasses', min: 2 },
  caisse: { icon: 'cash', title: 'Votre caisse au centime', min: 2 },
  equipe: { icon: 'team', title: 'Tourner en binôme', min: 2 },
  reseau: { icon: 'wifiOff', title: 'Sans réseau, rien ne se perd', min: 1 },
  secteur: { icon: 'draw', title: 'Tracer un secteur', min: 3 },
  comptes: { icon: 'chart', title: 'Les comptes et les exports', min: 2 },
  astuces: { icon: 'sparkle', title: 'Les astuces des anciens', min: 2 },
};

/**
 * Les leçons de cette personne, avec la raison de chacune (« parce que vous… »).
 * ctx : { standalone, mobile }
 */
export function buildPlan(p, ctx = {}) {
  const does = p?.does || [];
  const portes = does.includes('portes') || !does.length;
  const out = [];
  const add = (key, why) => out.push({ key, why, ...MODULES[key] });
  if (ctx.mobile !== false && !ctx.standalone) add('install', 'Pour l\'ouvrir en un toucher, même sans réseau.');
  if (p?.exp === 'debut' && portes) add('reflexes', 'Parce que c\'est votre première tournée.');
  if (portes || does.includes('secteurs')) add('carte', 'La carte vous dit où aller et ce qui reste.');
  if (portes) {
    add('tournee', 'Le chrono, le parcours, le secteur du soir.');
    add('porte', 'Le geste que vous ferez à chaque porte : on s\'entraîne.');
    if (p?.terrain === 'immeubles' || p?.terrain === 'mixte') add('immeuble', p.terrain === 'immeubles' ? 'Parce que votre secteur, ce sont des immeubles.' : 'Pour les immeubles de votre secteur.');
    add('repasse', 'Pour ne jamais oublier un absent.');
  }
  if (portes || does.includes('caisse')) add('caisse', does.includes('caisse') ? 'Parce que vous tenez la caisse.' : 'Ce que vous avez en poche, au centime.');
  if (portes && (p?.crew === 'binome' || p?.crew === 'equipe')) add('equipe', p.crew === 'equipe' ? 'Parce que vous tournez à plusieurs.' : 'Parce que vous tournez en binôme.');
  add('reseau', p?.terrain === 'campagne' ? 'Parce que le réseau manque souvent à la campagne.' : p?.terrain === 'immeubles' ? 'Halls et cages d\'escalier captent mal.' : 'Pour les coins sans réseau.');
  if (does.includes('secteurs')) add('secteur', 'Parce que vous préparez les secteurs.');
  if (does.includes('caisse')) add('comptes', 'Parce que vous faites les comptes de l\'amicale.');
  if (p?.exp === 'pro' || p?.exp === 'some') add('astuces', p.exp === 'pro' ? 'Parce que vous connaissez déjà la tournée par cœur.' : 'Pour gagner du temps, porte après porte.');
  return out;
}

export function planMinutes(plan) {
  return plan.reduce((s, m) => s + m.min, 0);
}

/** Progression : faites, total, la suivante. */
export function progressOf(plan, done = {}) {
  const ok = plan.filter((m) => done[m.key]);
  return { done: ok.length, total: plan.length, next: plan.find((m) => !done[m.key]) || null, pct: plan.length ? Math.round((ok.length / plan.length) * 100) : 0 };
}

/** Une phrase qui résume le profil (« Pompier en binôme, immeubles, première tournée »). */
export function profileLine(p) {
  if (!p) return '';
  const parts = [];
  const d = p.does || [];
  parts.push(d.includes('secteurs') ? 'Chef de secteur' : d.includes('caisse') && !d.includes('portes') ? 'Trésorier' : 'Pompier');
  if (p.crew === 'binome') parts.push('en binôme');
  else if (p.crew === 'equipe') parts.push('en équipe');
  else if (p.crew === 'seul') parts.push('seul');
  const t = { maisons: 'maisons', immeubles: 'immeubles', mixte: 'maisons et immeubles', campagne: 'campagne' }[p.terrain];
  const e = { debut: 'première tournée', some: 'déjà quelques tournées', pro: 'vétéran des calendriers' }[p.exp];
  return [parts.join(' '), t, e].filter(Boolean).join(' · ');
}
