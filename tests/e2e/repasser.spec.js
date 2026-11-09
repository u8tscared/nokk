// QR « Repassez plus tard » : la page publique de l'habitant, la carte laissée à l'absent, les demandes sur la carte.
import { test, expect } from '@playwright/test';
import worker from '../../worker/index.js';
import { d1, testKeys } from '../support/d1.js';
import { startDemo } from './helpers.js';

const API = 'https://api.nokk.test';
const SHOT = process.env.SHOT;
const shot = async (page, name) => { if (SHOT) { await page.waitForTimeout(700); await page.screenshot({ path: `${SHOT}/${test.info().project.name}-${name}.png`, fullPage: true }); } };
let env, keys, teamId;

test.beforeAll(async () => {
  keys = await testKeys('nokk-test');
  env = { DB: d1(), PROJECT_ID: 'nokk-test', JWKS: [keys.jwk] };
  const tok = await keys.token('chef');
  const call = (method, path, body) => worker.fetch(new Request(API + path, { method, headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env).then((r) => r.json());
  const t = await call('POST', '/teams', { name: 'Caluire' });
  teamId = t.id;
  await call('POST', '/sync', { teamId, since: 0, changes: [
    { k: 'org', i: 'org', d: { name: 'Amicale des sapeurs-pompiers de Caluire', city: 'Caluire', year: 2027 }, u: Date.now() },
    { k: 'sectors', i: 's1', d: { id: 's1', name: 'Montessuy', qr: 'TestQr12345678' }, u: Date.now() },
  ] });
});

test("l'habitant choisit un créneau, la demande arrive dans l'équipe", async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route(API + '/**', async (r) => {
    const q = r.request();
    const res = await worker.fetch(new Request(q.url(), { method: q.method(), headers: { ...q.headers(), origin: 'https://u8tscared.github.io' }, body: q.postData() || undefined }), env);
    r.fulfill({ status: res.status, headers: { ...Object.fromEntries(res.headers), 'access-control-allow-origin': '*' }, body: await res.text() });
  });
  await page.addInitScript((API) => { window.NOKK_API = API; }, API);
  await page.goto('/r/#TestQr12345678.7');
  await expect(page.locator('.hero')).toContainText('Caluire');
  await shot(page, 'r-accueil');
  await page.locator('[data-want=oui]').click();
  await page.locator('.day').nth(1).click();
  await page.locator('.slot').first().click();
  await page.locator('#f-name').fill('Mme Dupont');
  await page.locator('#f-note').fill('Sonnez fort');
  await shot(page, 'r-creneau');
  await page.locator('#go').click();
  await expect(page.getByTestId('done')).toContainText('repassera');
  await shot(page, 'r-merci');
  const row = await env.DB.prepare("SELECT data FROM items WHERE team_id = ?1 AND kind = 'callbacks'").bind(teamId).first();
  expect(JSON.parse(row.data)).toMatchObject({ n: 7, want: 'oui', name: 'Mme Dupont', note: 'Sonnez fort', sectorId: 's1' });
});

test('absent : Nokk dit quelle carte laisser, les demandes arrivent sur la carte', async ({ page }) => {
  const errors = await startDemo(page);
  const bar = page.locator('[data-testid=cb-bar]:visible');
  await expect(bar).toContainText('demande');
  await bar.click();
  const sheet = page.getByTestId('cb-sheet');
  await expect(sheet.getByTestId('cb-item').first()).toContainText('Demain');
  await shot(page, 'cb-sheet');
  const before = await sheet.getByTestId('cb-item').count();
  await sheet.getByTestId('cb-done').first().click();
  await expect(sheet.getByTestId('cb-item')).toHaveCount(before - 1);
  await page.keyboard.press('Escape');
  // Absent sur une porte du secteur 4 : la carte suivante est proposée.
  await page.locator('[data-testid=next-door]:visible').click();
  const door = page.getByRole('dialog');
  await expect(door.getByTestId('absent')).toContainText('carte n°');
  await door.getByTestId('absent').click();
  const v = await page.evaluate(() => window.__nokk.store.data.value.visits.at(-1));
  expect(v.result).toBe('absent');
  expect(v.card).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  // Planche à imprimer.
  await page.evaluate(() => window.__nokk.nav.go('secteurs'));
  await page.locator('.sector-more').first().click();
  await page.getByTestId('qr-cards-open').click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('qr-print').click();
  expect((await dl).suggestedFilename()).toMatch(/nokk-cartes-.*\.pdf$/);
  expect(errors).toEqual([]);
});
