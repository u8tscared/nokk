// Parcours réel d'une soirée : porte suivante, don, absent, annuler, caisse, exports.
import { test, expect } from '@playwright/test';
import { startDemo, isDesktop } from './helpers.js';

const count = (page) => page.evaluate(() => window.__nokk.store.data.value.visits.length);

test('saisir un don puis un absent, avec annulation', async ({ page }) => {
  const errors = await startDemo(page);
  const before = await count(page);
  await page.locator('[data-testid=next-door]:visible').click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  const title1 = await sheet.locator('h2').first().textContent();
  await sheet.getByRole('button', { name: '20 €' }).click();
  await sheet.getByRole('button', { name: 'Chèque' }).click();
  // Chèque sans nom : le champ tremble et explique.
  await page.getByTestId('validate').click();
  await expect(page.locator('#dname')).toBeFocused();
  await page.locator('#dname').fill('Mme Dupont');
  await page.getByTestId('validate').click();
  await expect(page.locator('.toast').filter({ hasText: '20 € enregistrés' })).toBeVisible();
  expect(await count(page)).toBe(before + 1);
  const last = await page.evaluate(() => window.__nokk.store.data.value.visits.at(-1));
  expect(last).toMatchObject({ result: 'donne', amount: 2000, method: 'cheque', name: 'Mme Dupont' });
  // La fenêtre passe toute seule à la porte suivante.
  await expect(sheet.locator('h2').first()).not.toHaveText(title1);
  await sheet.getByRole('button', { name: 'Absent' }).click();
  expect(await count(page)).toBe(before + 2);
  await page.locator('.toast').filter({ hasText: 'Absent' }).getByRole('button', { name: 'Annuler' }).click();
  expect(await count(page)).toBe(before + 1);
  expect(errors).toEqual([]);
});

test('le bouton retour ferme la fenêtre avant de quitter l\'écran', async ({ page }) => {
  await startDemo(page);
  await page.locator('[data-testid=next-door]:visible').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('screen-carte')).toBeVisible();
});

test('point caisse : compter, écart, remise au trésorier', async ({ page }) => {
  await startDemo(page);
  await page.evaluate(() => window.__nokk.nav.go('caisse'));
  await expect(page.getByTestId('screen-caisse')).toBeVisible();
  const expected = await page.evaluate(() => {
    const { store } = window.__nokk;
    return store.data.value.visits.filter((v) => v.result === 'donne' && v.method === 'especes' && v.by.includes(store.data.value.meId) && !store.data.value.handovers.some((h) => h.sectorId === v.sectorId)).reduce((s, v) => s + v.amount, 0);
  });
  expect(expected).toBeGreaterThan(0);
  // On compte en billets de 5 € : l'écart doit être cohérent.
  const fives = Math.floor(expected / 500);
  await page.getByLabel('Nombre de billets de 5 €').fill(String(fives));
  const diff = fives * 500 - expected;
  await expect(page.locator('.reco')).toContainText(diff === 0 ? '0 €' : '€');
  const n = await page.evaluate(() => window.__nokk.store.data.value.handovers.length);
  await page.getByTestId('handover').click();
  await page.getByTestId('confirm-handover').click();
  await expect.poll(() => page.evaluate(() => window.__nokk.store.data.value.handovers.length)).toBe(n + 1);
  const h = await page.evaluate(() => window.__nokk.store.data.value.handovers.at(-1));
  expect(h.counted).toBe(fives * 500);
  expect(h.diff).toBe(diff);
  // Après la remise, plus rien en poche.
  await expect(page.locator('.cash-hero .big-num')).toHaveText(/^0\s?€$/);
});

test('exports PDF et tableur', async ({ page }) => {
  await startDemo(page);
  await page.evaluate(() => window.__nokk.store.saveSettings({ sound: false }));
  await page.evaluate(() => window.__nokk.nav.go('exports'));
  for (const k of ['report', 'cheques', 'csv']) {
    const dl = page.waitForEvent('download');
    await page.getByTestId('export-' + k).click();
    const file = await dl;
    const path = await file.path();
    const fs = await import('node:fs');
    const buf = fs.readFileSync(path);
    if (k === 'csv') {
      const txt = buf.toString('utf8');
      expect(txt.split('\n').length).toBeGreaterThan(100);
      expect(txt).toContain('Montant (€)');
    } else {
      expect(buf.slice(0, 5).toString()).toBe('%PDF-');
      expect(buf.length).toBeGreaterThan(3000);
    }
  }
});

test('créer son équipe puis un secteur tracé sur la carte', async ({ page }) => {
  await page.route(/tiles\.openfreemap\.org|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  // Overpass simulé avec une vraie réponse OSM réduite.
  await page.route(/overpass|interpreter/, async (r) => {
    const fs = await import('node:fs');
    r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync('tests/fixtures/overpass.json', 'utf8') });
  });
  await page.goto('/');
  await page.getByTestId('create-team').click();
  await page.locator('#oname1').fill('Lucas Martin');
  await page.getByTestId('ob-next').click();
  await page.locator('#ocity1').fill('Rezé');
  await page.getByTestId('ob-next').click();
  await page.getByTestId('ob-next').click(); // rôle : chef
  await page.locator('#opartner').fill('Inès Diallo');
  await page.getByTestId('ob-next').click();
  await page.getByTestId('ob-next').click(); // don
  await page.getByTestId('ob-next').click(); // écran d'accueil
  await expect(page.getByTestId('screen-secteurs')).toBeVisible();
  await page.getByTestId('new-sector').click();
  await page.getByTestId('draw-sector').click();
  await expect(page.getByTestId('screen-carte')).toBeVisible();
  // Centre la carte sur la zone simulée puis pose 4 coins.
  await page.evaluate(() => window.__nokkMap.jumpTo({ center: [-1.5516, 47.1786], zoom: 16 }));
  const box = await page.locator('.map-box').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  for (const [dx, dy] of [[-150, -160], [150, -160], [150, 120], [-150, 120]]) {
    await page.mouse.click(cx + dx, cy + dy);
  }
  await page.getByTestId('draw-done').click();
  await expect(page.locator('.found')).toBeVisible();
  await page.getByTestId('create-sector').click();
  await expect.poll(() => page.evaluate(() => window.__nokk.store.data.value.doors.length)).toBeGreaterThan(5);
  // Les données sont gardées sur l'appareil (rechargement).
  await page.reload();
  await expect(page.getByTestId('screen-carte')).toBeVisible();
  expect(await page.evaluate(() => window.__nokk.store.data.value.sectors.length)).toBe(1);
  await expect(page.locator('[data-testid=next-door]:visible')).toBeVisible();
});
