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
  // Oui → montant → moyen → nom : le parcours d'une porte.
  await sheet.getByTestId('yes').click();
  await sheet.locator('.amount-tile').filter({ hasText: /^20 €/ }).click();
  await sheet.getByRole('button', { name: 'Chèque' }).click();
  // Chèque sans nom : le champ tremble et explique.
  await page.getByTestId('validate').click();
  await expect(page.locator('#dname')).toBeFocused();
  await expect(page.locator('.toast.error')).toBeVisible();
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
  await expect(page.locator('.cash-bar')).toContainText(diff === 0 ? '0 €' : '€');
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
  // Le secteur se crée depuis l'écran Secteurs, carte dans la fenêtre.
  await page.getByTestId('new-sector').click();
  await expect(page.getByTestId('creator-map')).toBeVisible();
  await page.waitForFunction(() => !!window.__nokkCreatorMap);
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__nokkCreatorMap.jumpTo({ center: [-1.5516, 47.1786], zoom: 16 }));
  await page.waitForTimeout(400);
  const box = await page.getByTestId('creator-map').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  for (const [dx, dy] of [[-150, -160], [150, -160], [150, 120], [-150, 120]]) {
    await page.mouse.click(cx + dx, cy + dy);
  }
  await page.getByTestId('draw-done').click();
  // On voit que Nokk cherche, puis ce qu'il a trouvé.
  await expect(page.locator('.dig')).toBeVisible();
  await expect(page.locator('.found')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('create-sector').click();
  await expect(page.getByTestId('screen-carte')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__nokk.store.data.value.doors.length)).toBeGreaterThan(5);
  // Les données sont gardées sur l'appareil (rechargement).
  await page.reload();
  await expect(page.getByTestId('screen-carte')).toBeVisible();
  expect(await page.evaluate(() => window.__nokk.store.data.value.sectors.length)).toBe(1);
  await expect(page.locator('[data-testid=next-door]:visible')).toBeVisible();
});

test('immeuble : les logements à la suite, puis changer de bâtiment', async ({ page }) => {
  const errors = await startDemo(page);
  const id = await page.evaluate(() => {
    const d = window.__nokk.store.data.value;
    return d.doors.find((x) => x.sectorId === d.currentSectorId && x.flats > 1 && !d.visits.some((v) => v.doorId === x.id)).id;
  });
  await page.evaluate((id) => window.__nokk.openDoor(id), id);
  const sheet = page.getByRole('dialog');
  await expect(sheet.locator('#unit')).toHaveValue('1');
  await sheet.getByRole('button', { name: 'Absent' }).click();
  // On reste dans l'immeuble, logement suivant proposé.
  await expect(sheet.locator('#unit')).toHaveValue('2');
  await sheet.getByTestId('yes').click();
  await sheet.locator('.amount-tile').filter({ hasText: /^10 €/ }).click();
  await page.getByTestId('validate').click();
  await expect(sheet.locator('#unit')).toHaveValue('3');
  await expect(sheet.locator('.unit-chip')).toHaveCount(2);
  const v = await page.evaluate((id) => window.__nokk.store.data.value.visits.filter((x) => x.doorId === id).map((x) => [x.unit, x.result]), id);
  expect(v).toEqual([['1', 'absent'], ['2', 'donne']]);
  // Changer de bâtiment : Nokk dit où aller.
  await sheet.getByTestId('leave-building').click();
  await expect(sheet.getByText('Où aller ensuite ?')).toBeVisible();
  const before = await sheet.locator('.next-card.primary .t').textContent();
  await sheet.getByTestId('go-next').click();
  await expect(sheet.locator('h2').first()).toHaveText(before);
  expect(errors).toEqual([]);
});

test('maison : nom sur un absent, deux sonnettes, trajet vers la suivante', async ({ page }) => {
  const errors = await startDemo(page);
  await page.locator('[data-testid=next-door]:visible').click();
  const sheet = page.getByRole('dialog');
  const doorId = await page.evaluate(() => window.__nokk.store.data.value.doors.find((d) => d.num + ' ' + d.street === document.querySelector('.stop-head h2').textContent).id);
  // Deux sonnettes : la maison passe en deux foyers.
  await sheet.getByTestId('two-homes').click();
  await expect(sheet.locator('#unit')).toHaveValue('1');
  await sheet.getByTestId('ask-name').fill('Martin');
  await sheet.getByRole('button', { name: 'Absent' }).click();
  await expect(sheet.locator('#unit')).toHaveValue('2');
  const v = await page.evaluate((id) => window.__nokk.store.data.value.visits.filter((x) => x.doorId === id).at(-1), doorId);
  expect(v).toMatchObject({ result: 'absent', name: 'Martin', unit: '1' });
  // Changer de bâtiment → Y aller : le trajet s'affiche sur la carte.
  await sheet.getByTestId('leave-building').click();
  await sheet.getByTestId('go-there').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('guide')).toBeVisible();
  await page.getByTestId('arrived').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(errors).toEqual([]);
});
