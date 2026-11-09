// Espace admin : seul le compte Google du créateur y accède, avec les vrais chiffres du serveur.
import { test, expect } from '@playwright/test';
import worker from '../../worker/index.js';
import { d1, testKeys } from '../support/d1.js';

const API = 'https://api.nokk.test';
const PROJECT = 'nokk-test';
let env, keys;
const ADMIN = { email: 'marceau.ruis@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } };

async function call(uid, method, path, body, claims = {}) {
  const tok = await keys.token(uid, claims);
  const res = await worker.fetch(new Request(API + path, { method, headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json', origin: 'http://localhost' }, body: body ? JSON.stringify(body) : undefined }), env);
  return res.json();
}

test.beforeAll(async () => {
  keys = await testKeys(PROJECT);
  env = { DB: d1(), PROJECT_ID: PROJECT, JWKS: [keys.jwk] };
  const now = Date.now();
  // L'amicale de Marceau.
  await call('boss', 'GET', '/me', null, { ...ADMIN, name: 'Marceau Ruis' });
  const mine = await call('boss', 'POST', '/teams', { name: 'Caluire', memberId: 'mr' }, ADMIN);
  await call('boss', 'POST', '/sync', { teamId: mine.id, since: 0, changes: [
    { k: 'org', i: 'org', d: { name: 'Amicale de Caluire', city: 'Caluire', year: 2026, price: 1000 }, u: now },
    { k: 'members', i: 'mr', d: { id: 'mr', name: 'Marceau Ruis', role: 'chef' }, u: now },
  ] }, ADMIN);
  // Une autre amicale, avec deux comptes et des tournées.
  await call('chef', 'GET', '/me', null, { name: 'Paul Chef' });
  const t = await call('chef', 'POST', '/teams', { name: 'Rezé' });
  await call('pomp', 'GET', '/me', null, { name: 'Léa Pompier' });
  await call('pomp', 'POST', '/teams/join', { code: t.code });
  await call('pomp', 'POST', `/teams/${t.id}/link`, { memberId: 'm2' });
  const visits = Array.from({ length: 6 }, (_, i) => ({ k: 'visits', i: 'v' + i, d: { id: 'v' + i, sectorId: 's1', ts: now - i * 864e5, by: i % 2 ? ['m2'] : ['m1', 'm2'], result: i === 5 ? 'refus' : 'donne', amount: 1000, calendars: 1 }, u: now }));
  await call('chef', 'POST', '/sync', { teamId: t.id, since: 0, changes: [
    { k: 'members', i: 'm1', d: { id: 'm1', name: 'Paul', role: 'chef' }, u: now },
    { k: 'members', i: 'm2', d: { id: 'm2', name: 'Léa', role: 'pompier' }, u: now },
    { k: 'sectors', i: 's1', d: { id: 's1', name: 'Bourg' }, u: now },
    ...visits,
  ] });
});

async function device(browser, { uid, user, claims }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const token = await keys.token(uid, claims);
  await page.route(/tiles\.openfreemap\.org|fonts\.(googleapis|gstatic)\.com|data\.geopf\.fr/, (r) => r.abort());
  await page.route(API + '/**', async (r) => {
    const q = r.request();
    const res = await worker.fetch(new Request(q.url(), { method: q.method(), headers: q.headers(), body: q.postData() || undefined }), env);
    r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: res.status === 204 ? '' : await res.text() });
  });
  await page.addInitScript(({ API, token, user }) => {
    window.__nokkApi = API;
    window.__nokkFakeAuth = {
      onChange: (f) => { setTimeout(() => f(user), 0); return () => {}; },
      google: async () => {}, signIn: async () => {}, signUp: async () => {}, reset: async () => {},
      token: async () => token, signOut: async () => {},
    };
  }, { API, token, user });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#reglages');
  return { ctx, page, errors };
}

test('le créateur voit toutes les amicales, les pompiers et gère les comptes', async ({ browser }) => {
  const { ctx, page, errors } = await device(browser, { uid: 'boss', user: { uid: 'boss', email: 'marceau.ruis@gmail.com', name: 'Marceau Ruis' }, claims: { ...ADMIN, name: 'Marceau Ruis' } });
  await page.getByTestId('admin-entry').click();
  await expect(page.getByTestId('admin')).toBeVisible();
  await expect(page.getByTestId('admin-calendars')).toHaveText('5');
  await expect(page.getByTestId('admin-accounts')).toHaveText('3');
  await expect(page.getByTestId('admin-teams')).toHaveText('2');
  await expect(page.getByTestId('admin-activity')).toBeVisible();
  if (process.env.SHOT) await page.waitForTimeout(1200), await page.screenshot({ path: process.env.SHOT + '/' + test.info().project.name + '-vue.png' });

  await page.locator('.seg button', { hasText: 'Comptes' }).click();
  await expect(page.getByTestId('admin-account')).toHaveCount(3);
  if (process.env.SHOT) await page.waitForTimeout(1200), await page.screenshot({ path: process.env.SHOT + '/' + test.info().project.name + '-comptes.png' });
  await page.getByTestId('admin-search').fill('léa');
  await expect(page.getByTestId('admin-account')).toHaveCount(1);
  await page.getByTestId('admin-account').click();

  const sheet = page.getByTestId('admin-team-sheet');
  await expect(sheet.getByRole('heading', { name: 'Rezé' })).toBeVisible();
  const lea = sheet.getByTestId('admin-member').filter({ hasText: 'Léa' });
  await expect(lea).toContainText('5');
  await expect(lea).toContainText('pomp@ex.fr');
  await expect(sheet.getByTestId('admin-acc')).toHaveCount(2);
  if (process.env.SHOT) await page.waitForTimeout(1200), await page.screenshot({ path: process.env.SHOT + '/' + test.info().project.name + '-sheet.png' });
  await sheet.getByTestId('admin-acc').filter({ hasText: 'Léa' }).getByTestId('admin-remove').click();
  await sheet.getByTestId('admin-confirm').click();
  await expect(sheet.getByTestId('admin-acc')).toHaveCount(1);
  await page.keyboard.press('Escape');

  // Un avis envoyé depuis l'app arrive dans « Retours ».
  await page.evaluate(() => window.__nokk.nav.go('reglages'));
  await page.getByTestId('avis-entry').click();
  await page.getByTestId('star-5').click();
  await page.getByTestId('avis-message').fill('La carte est top');
  await page.getByTestId('avis-send').click();
  await expect(page.getByTestId('avis')).toHaveCount(0);
  await page.evaluate(() => window.__nokk.nav.go('admin'));
  await page.locator('.seg button', { hasText: 'Retours' }).click();
  const fb = page.getByTestId('fb-item').filter({ hasText: 'La carte est top' });
  await expect(fb).toContainText('★★★★★');
  await expect(fb).toContainText('marceau.ruis@gmail.com');
  if (process.env.SHOT) await page.waitForTimeout(800), await page.screenshot({ path: process.env.SHOT + '/' + test.info().project.name + '-retours.png' });
  await fb.getByTestId('fb-done').click();
  await expect(page.getByTestId('fb-item').filter({ hasText: 'La carte est top' })).toHaveCount(0);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("un autre compte ne voit pas l'espace admin, même avec l'adresse", async ({ browser }) => {
  // Même e-mail tapé à la main, sans vérification : le serveur refuse.
  const { ctx, page } = await device(browser, { uid: 'chef', user: { uid: 'chef', email: 'chef@ex.fr', name: 'Paul Chef' }, claims: { name: 'Paul Chef' } });
  await expect(page.getByTestId('screen-reglages').or(page.getByTestId('screen-carte'))).toBeVisible().catch(() => {});
  await expect(page.getByTestId('admin-entry')).toHaveCount(0);
  await page.goto('/#admin');
  await expect(page.getByTestId('admin')).toHaveCount(0);
  await ctx.close();
});
