// Comptes et sauvegarde en ligne, de bout en bout : la vraie API (Worker) tourne dans le test sur une base
// SQLite, la connexion Firebase est remplacée par une fausse connexion qui donne de vrais jetons signés.
import { test, expect } from '@playwright/test';
import worker from '../../worker/index.js';
import { d1, testKeys } from '../support/d1.js';

const API = 'https://api.nokk.test';
const PROJECT = 'nokk-test';
let env, keys;

test.beforeAll(async () => {
  keys = await testKeys(PROJECT);
  env = { DB: d1(), PROJECT_ID: PROJECT, JWKS: [keys.jwk] };
});

async function device(browser, { uid, name, signedIn = false, hash = '' }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const token = await keys.token(uid, { name });
  await page.route(/tiles\.openfreemap\.org|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route(API + '/**', async (r) => {
    const q = r.request();
    const res = await worker.fetch(new Request(q.url(), { method: q.method(), headers: q.headers(), body: q.postData() || undefined }), env);
    r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: res.status === 204 ? '' : await res.text() });
  });
  await page.addInitScript(({ API, token, user, signedIn }) => {
    window.__nokkApi = API;
    let u = signedIn || localStorage.getItem('fake:in') ? user : null;
    let cb = null;
    const set = (v) => { u = v; v ? localStorage.setItem('fake:in', '1') : localStorage.removeItem('fake:in'); cb?.(u); };
    window.__nokkFakeAuth = {
      onChange: (f) => { cb = f; setTimeout(() => f(u), 0); return () => {}; },
      google: async () => set(user),
      signIn: async (email, pass) => { if (pass !== 'secret1') throw { code: 'auth/invalid-credential' }; set(user); },
      signUp: async () => set(user),
      reset: async (email) => { window.__resetTo = email; },
      token: async () => (u ? token : null),
      signOut: async () => set(null),
    };
  }, { API, token, user: { uid, email: uid + '@ex.fr', name }, signedIn });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/' + hash);
  return { ctx, page, errors };
}

async function onboard(page, name) {
  await page.locator('#oname1').fill(name);
  await page.getByTestId('ob-next').click();
  await page.locator('#ocity1').fill('Rezé');
  await page.getByTestId('ob-next').click();
  await page.getByTestId('ob-next').click();
  await page.locator('#opartner').fill('Inès Diallo');
  await page.getByTestId('ob-next').click();
  await page.getByTestId('ob-next').click();
  await page.getByTestId('ob-next').click();
}

const serverCount = (kind) => env.DB.prepare('SELECT COUNT(*) AS n FROM items WHERE kind = ?1 AND deleted = 0').bind(kind).first().then((r) => r.n);

test('tournées déjà sur le téléphone : connexion, mot de passe oublié, tout part en ligne, un équipier rejoint', async ({ browser }, info) => {
  test.skip(info.project.name !== 'telephone', 'scénario à deux téléphones, une fois suffit');
  // 1. Le testeur de ce matin : équipe créée sans compte, un secteur et des passages.
  const a = await device(browser, { uid: 'chef', name: 'Lucas Martin' });
  await a.page.getByTestId('no-account').click();
  await a.page.getByTestId('create-team').click();
  await onboard(a.page, 'Lucas Martin');
  await expect(a.page.getByTestId('screen-secteurs')).toBeVisible();
  await a.page.evaluate(() => {
    const { store } = window.__nokk;
    store.addSector({ id: 'sec-t', name: 'Bourg' }, [
      { id: '1', street: 'Rue A', num: '1', p: [-1.55, 47.18] },
      { id: '2', street: 'Rue A', num: '3', p: [-1.5502, 47.1801] },
    ]);
    store.addVisit({ doorId: 'sec-t-1', sectorId: 'sec-t', result: 'donne', amount: 1000, pay: 'especes', calendars: 1 });
  });

  // 2. Au retour dans l'app : on lui propose de mettre ses tournées à l'abri.
  await a.page.reload();
  await expect(a.page.getByText('Mettez vos tournées à l\'abri')).toBeVisible();
  await a.page.getByTestId('email-auth').click();
  await a.page.locator('#au-email').fill('chef@ex.fr');
  await a.page.locator('#au-pass').fill('mauvais');
  await a.page.getByTestId('auth-submit').click();
  await expect(a.page.getByText('E-mail ou mot de passe incorrect.')).toBeVisible();
  // Mot de passe oublié.
  await a.page.getByTestId('forgot').click();
  await a.page.getByTestId('auth-submit').click();
  await expect(a.page.getByTestId('reset-sent')).toBeVisible();
  expect(await a.page.evaluate(() => window.__resetTo)).toBe('chef@ex.fr');
  await a.page.getByText('Revenir à la connexion').click();
  await a.page.locator('#au-pass').fill('secret1');
  await a.page.getByTestId('auth-submit').click();

  // 3. Tout est envoyé : équipe créée en ligne avec ses données.
  await expect(a.page.getByTestId('screen-secteurs')).toBeVisible();
  await expect.poll(() => serverCount('visits')).toBe(1);
  expect(await serverCount('doors')).toBe(2);
  expect(await serverCount('members')).toBe(2);
  expect(await serverCount('org')).toBe(1);
  await a.page.evaluate(() => window.__nokk.nav.go('equipe'));
  const code = (await a.page.getByTestId('invite-code').textContent()).trim();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);

  // 4. Un équipier ouvre le lien d'invitation sur son téléphone et se connecte avec Google.
  const b = await device(browser, { uid: 'ines', name: 'Inès Diallo', hash: '#join=' + code });
  await expect(b.page.getByTestId('join-banner')).toBeVisible();
  await b.page.getByTestId('google').click();
  await expect(b.page.getByText('Qui utilise ce téléphone ?')).toBeVisible();
  await b.page.getByRole('button', { name: /Inès Diallo/ }).click();
  await expect(b.page.getByTestId('screen-carte')).toBeVisible();
  expect(await b.page.evaluate(() => window.__nokk.store.data.value.visits.length)).toBe(1);

  // 5. Elle saisit un don : il arrive chez le chef.
  await b.page.evaluate(() => window.__nokk.store.addVisit({ doorId: 'sec-t-2', sectorId: 'sec-t', result: 'donne', amount: 2000, pay: 'carte', calendars: 1 }));
  await expect.poll(() => serverCount('visits'), { timeout: 10000 }).toBe(2);
  await a.page.evaluate(() => window.__nokk.sync.flush());
  expect(await a.page.evaluate(() => window.__nokk.store.data.value.visits.map((v) => v.amount).sort())).toEqual([1000, 2000]);

  // 6. Les réglages montrent la sauvegarde, et l'équipier est relié à son compte.
  await b.page.evaluate(() => window.__nokk.nav.go('reglages'));
  await expect(b.page.getByTestId('sync-status')).toContainText('Tout est sauvegardé');
  const link = await env.DB.prepare("SELECT member_id FROM memberships WHERE uid = 'ines'").first();
  expect(link.member_id).toBeTruthy();

  // 7. Déconnexion : le téléphone est vidé, les tournées restent en ligne et reviennent à la connexion.
  await b.page.getByTestId('signout').click();
  await b.page.getByTestId('signout-confirm').click();
  await expect(b.page.getByTestId('google')).toBeVisible();
  expect(await b.page.evaluate(() => window.__nokk.store.data.value.visits.length)).toBe(0);
  await b.page.getByTestId('google').click();
  await expect(b.page.getByTestId('screen-carte')).toBeVisible();
  expect(await b.page.evaluate(() => window.__nokk.store.data.value.visits.length)).toBe(2);

  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await a.ctx.close();
  await b.ctx.close();
});

test('nouveau compte sans équipe : créer la sienne, tout est en ligne', async ({ browser }, info) => {
  test.skip(info.project.name !== 'telephone', 'une fois suffit');
  const a = await device(browser, { uid: 'neuf', name: 'Paul Neuf' });
  await a.page.getByTestId('email-auth').click();
  await a.page.getByTestId('to-signup').click();
  await a.page.locator('#au-name').fill('Paul Neuf');
  await a.page.locator('#au-email').fill('paul@ex.fr');
  await a.page.locator('#au-pass').fill('secret1');
  await a.page.getByTestId('auth-submit').click();
  await a.page.getByTestId('create-team').click();
  await onboard(a.page, 'Paul Neuf');
  await expect(a.page.getByTestId('screen-secteurs')).toBeVisible();
  await expect.poll(async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM memberships WHERE uid = 'neuf'").first()).n).toBe(1);
  const t = await env.DB.prepare("SELECT team_id FROM memberships WHERE uid = 'neuf'").first();
  await expect.poll(async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM items WHERE team_id = ?1 AND kind = 'members'").bind(t.team_id).first()).n).toBe(2);
  expect(a.errors).toEqual([]);
  await a.ctx.close();
});
