// Le menu existe UNE seule fois ici. Barre d'onglets, barre latérale, écran « Plus »,
// droits par équipier et vues par rôle lisent tous ce tableau.
// Ajouter un écran = une ligne ici (+ sa leçon dans lessons.js : un test le vérifie).
import { signal, computed } from '@preact/signals';
import { me } from './store.js';

export const ROLES = {
  chef: { label: "Chef d'équipe", hint: 'Prépare les secteurs, voit tout' },
  pompier: { label: 'Pompier', hint: 'Fait la tournée, saisit les portes' },
  tresorier: { label: 'Trésorier', hint: 'Fait les caisses et les comptes' },
};

export const MENU = [
  { route: 'carte', icon: 'map', label: 'Carte', section: 'Terrain', tab: 1, roles: ['chef', 'pompier', 'tresorier'] },
  { route: 'secteurs', icon: 'sectors', label: 'Secteurs', section: 'Terrain', tab: 2, roles: ['chef', 'pompier', 'tresorier'] },
  { route: 'saisir', icon: 'door', label: 'Saisir', section: 'Terrain', tab: 3, action: true, roles: ['chef', 'pompier', 'tresorier'] },
  { route: 'journal', icon: 'list', label: 'Journal', section: 'Terrain', roles: ['chef', 'pompier', 'tresorier'] },
  { route: 'caisse', icon: 'cash', label: 'Caisse', section: 'Argent', tab: 4, roles: ['chef', 'pompier', 'tresorier'] },
  { route: 'comptes', icon: 'chart', label: 'Comptes', section: 'Argent', roles: ['chef', 'tresorier'] },
  { route: 'exports', icon: 'file', label: 'Exports', section: 'Argent', roles: ['chef', 'tresorier'] },
  { route: 'equipe', icon: 'team', label: 'Équipe', section: 'Équipe', roles: ['chef', 'pompier', 'tresorier'] },
  { route: 'reglages', icon: 'settings', label: 'Réglages', section: 'Réglages', roles: ['chef', 'pompier', 'tresorier'] },
  { route: 'formation', icon: 'book', label: 'Formation', section: 'Réglages', roles: ['chef', 'pompier', 'tresorier'] },
];
// Écran « Plus » du téléphone : lui-même une entrée (onglet 5), il liste tout ce qui n'a pas d'onglet.
export const MORE = { route: 'plus', icon: 'more', label: 'Plus', tab: 5 };

export const SIMPLE_ROUTES = ['carte', 'saisir', 'caisse', 'reglages'];

export function allowed(route, member, simple = false) {
  if (route === 'plus') return true;
  const item = MENU.find((m) => m.route === route);
  if (!item) return false;
  const r = member?.role || 'chef';
  if (!item.roles.includes(r)) return false;
  if (member?.hidden?.includes(route)) return false;
  if (simple && !SIMPLE_ROUTES.includes(route)) return false;
  return true;
}

export function menuFor(member, simple = false) {
  return MENU.filter((m) => allowed(m.route, member, simple));
}
export function tabsFor(member, simple = false) {
  return [...menuFor(member, simple).filter((m) => m.tab), MORE].sort((a, b) => a.tab - b.tab);
}
export function moreFor(member, simple = false) {
  return menuFor(member, simple).filter((m) => !m.tab);
}

// ——— Routeur (hash + historique propre) ———
let initial = typeof location !== 'undefined' ? location.hash.replace(/^#\/?/, '') : '';
// Lien d'invitation : #join=CODE (gardé jusqu'à la connexion).
// Avec un secteur et un équipier : #join=CODE&s=SECTEUR&m=EQUIPIER (« vous êtes affecté au secteur… »).
if (/^join=/.test(initial)) {
  const q = new URLSearchParams(initial);
  try {
    localStorage.setItem('nokk:join', String(q.get('join') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
    const extra = { s: q.get('s') || null, m: q.get('m') || null };
    if (extra.s || extra.m) localStorage.setItem('nokk:join:to', JSON.stringify(extra));
  } catch {}
  initial = 'carte';
}
// Lien profond vers la démo (depuis la page de présentation).
export const wantsDemo = initial === 'demo';
if (wantsDemo) initial = 'carte';
export const route = signal(initial || 'carte');
export const sheets = signal([]); // [{ id, render, opts }]

let sheetSeq = 0;
export function go(r, { replace = false } = {}) {
  if (r === route.value && !sheets.value.length) {
    // Retoucher l'onglet actif remonte en haut.
    document.querySelector('.page-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const hadSheets = sheets.value.length > 0;
  sheets.value = [];
  route.value = r;
  const url = '#' + r;
  // Depuis une fenêtre ouverte : on remplace son entrée d'historique (pas de retour fantôme).
  if (replace || hadSheets) history.replaceState({ r }, '', url);
  else history.pushState({ r }, '', url);
}

export function openSheet(render, opts = {}) {
  const id = ++sheetSeq;
  sheets.value = [...sheets.value, { id, render, opts }];
  history.pushState({ r: route.value, sheet: id }, '', location.hash || '#' + route.value);
  return id;
}
export function closeSheet(id) {
  const top = sheets.value[sheets.value.length - 1];
  if (!top) return;
  if (id && top.id !== id) {
    sheets.value = sheets.value.filter((s) => s.id !== id);
    return;
  }
  if (history.state?.sheet === top.id) history.back();
  else sheets.value = sheets.value.slice(0, -1);
}
export function closeAllSheets() {
  if (!sheets.value.length) return;
  sheets.value = [];
  history.replaceState({ r: route.value }, '', '#' + route.value);
}

export function installRouter() {
  history.replaceState({ r: route.value }, '', '#' + route.value);
  window.addEventListener('popstate', (e) => {
    // Le bouton retour ferme d'abord la fenêtre ouverte, puis revient à l'écran précédent.
    if (sheets.value.length) {
      const st = e.state;
      const keep = st?.sheet ? sheets.value.filter((s) => s.id <= st.sheet) : [];
      sheets.value = keep;
      if (st?.r && st.r !== route.value) route.value = st.r;
      return;
    }
    const r = e.state?.r || location.hash.replace(/^#\/?/, '') || 'carte';
    route.value = r;
  });
}

export const guardedRoute = computed(() => route.value);
export const currentMember = me;
