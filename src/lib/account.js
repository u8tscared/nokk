// Compte et équipe : relie la connexion, l'équipe sur le serveur et la sauvegarde des tournées.
import { signal, computed, effect } from '@preact/signals';
import { authUser, initAuth, signOutAuth } from './auth.js';
import { api } from './api.js';
import { data, demo, setData, resetAll } from './store.js';
import { startSync, stopSync, forgetSync, flush, hasCursor, syncState } from './sync.js';

const AKEY = 'nokk:account:v1';
const JKEY = 'nokk:join';
const read = () => { try { return JSON.parse(localStorage.getItem(AKEY) || 'null'); } catch { return null; } };
const save = (v) => { try { v ? localStorage.setItem(AKEY, JSON.stringify(v)) : localStorage.removeItem(AKEY); } catch {} };

// { uid, email, name, team: { id, name, code, role, memberId } | null }
export const account = signal(read());
// idle | loading | needTeam | error
export const accountStep = signal('idle');
export const accountError = signal(null);
export const firstLoad = signal(false); // récupération des tournées de l'équipe en cours

export const hasLocalData = () => !!(data.peek().org || data.peek().members.length);
export const signedIn = computed(() => !!account.value);

function setAccount(v) { account.value = v; save(v); }

export function pendingJoin() { try { return sessionStorage.getItem(JKEY) || localStorage.getItem(JKEY); } catch { return null; } }
export function rememberJoin(code) { try { localStorage.setItem(JKEY, code); } catch {} }
function clearJoin() { try { sessionStorage.removeItem(JKEY); localStorage.removeItem(JKEY); } catch {} }

// Au démarrage : la sauvegarde reprend tout de suite (l'équipe est connue), la connexion suit.
export function bootAccount() {
  const a = account.peek();
  if (a?.team?.id) startSync(a.team.id);
  initAuth();
  effect(() => {
    const u = authUser.value;
    if (!u) return;
    const cur = account.peek();
    if (!cur || cur.uid !== u.uid || !cur.team) afterSignIn(u);
  });
  // Le choix « qui suis-je » est retenu par le compte, pour ne plus le refaire sur un autre téléphone.
  effect(() => {
    const meId = data.value.meId;
    const a = account.value;
    if (demo.value || !a?.team || !meId || a.team.memberId === meId) return;
    setAccount({ ...a, team: { ...a.team, memberId: meId } });
    api(`/teams/${a.team.id}/link`, { method: 'POST', body: { memberId: meId } }).catch(() => {});
  });
}

async function afterSignIn(u) {
  if (accountStep.peek() === 'loading') return;
  accountStep.value = 'loading';
  accountError.value = null;
  try {
    const me = await api('/me');
    const base = { uid: u.uid, email: u.email || me.email, name: u.name || me.name, admin: !!me.admin };
    const code = pendingJoin();
    if (code) {
      const t = await api('/teams/join', { method: 'POST', body: { code } }).catch(() => null);
      clearJoin();
      if (t) return attach(base, t, { existing: true });
    }
    const prev = account.peek();
    const t = me.teams.find((x) => x.id === prev?.team?.id) || me.teams[0];
    if (t) return attach(base, t, { existing: true });
    if (hasLocalData()) {
      // Les tournées déjà saisies sur ce téléphone deviennent l'équipe en ligne.
      const nt = await api('/teams', { method: 'POST', body: { name: data.peek().org?.name || 'Amicale', memberId: data.peek().meId } });
      return attach(base, nt, { existing: false });
    }
    setAccount({ ...base, team: null });
    accountStep.value = 'needTeam';
  } catch (e) {
    accountError.value = e?.code || 'error';
    accountStep.value = 'error';
  }
}

async function attach(base, team, { existing }) {
  const first = !hasCursor(team.id);
  setAccount({ ...base, team });
  accountStep.value = 'idle';
  // Première fois sur ce téléphone : ce qui y est saisi part au serveur, puis on récupère le reste.
  // Une équipe qui existait déjà garde ses réglages d'amicale.
  firstLoad.value = first && existing;
  const p = startSync(team.id, { upload: first, skipOrg: existing });
  await p;
  firstLoad.value = false;
  const d = data.peek();
  if (!d.meId && team.memberId && d.members.some((m) => m.id === team.memberId)) {
    setData((x) => ({ ...x, meId: team.memberId, crew: x.crew?.length ? x.crew : [team.memberId] }));
  }
}

// Après la création de l'équipe dans l'app (assistant) : on la crée sur le serveur.
export async function createTeamOnline() {
  const a = account.peek();
  if (!a || a.team) return;
  accountStep.value = 'loading';
  try {
    const t = await api('/teams', { method: 'POST', body: { name: data.peek().org?.name || 'Amicale', memberId: data.peek().meId } });
    await attach(a, t, { existing: false });
  } catch (e) {
    accountError.value = e?.code || 'error';
    accountStep.value = 'needTeam';
    throw e;
  }
}

export async function joinTeam(code) {
  const a = account.peek();
  const t = await api('/teams/join', { method: 'POST', body: { code } });
  await attach(a, t, { existing: true });
  return t;
}

export function retryAccount() {
  const u = authUser.peek();
  if (u) afterSignIn(u);
}

// Déconnexion : rien ne part tant que tout n'est pas envoyé. Le téléphone est ensuite vidé.
export async function signOut({ force = false } = {}) {
  if (account.peek()?.team && syncState.peek().pending > 0) {
    const ok = await flush();
    if (!ok && !force) return false;
  }
  try { await signOutAuth(); } catch {}
  forgetSync();
  setAccount(null);
  accountStep.value = 'idle';
  resetAll();
  return true;
}

export async function downloadBackup() {
  const a = account.peek();
  if (!a?.team) throw new Error('no_team');
  return api(`/teams/${a.team.id}/export`);
}

export const inviteLink = (code) => `https://u8tscared.github.io/nokk/#join=${code}`;

export { stopSync };
