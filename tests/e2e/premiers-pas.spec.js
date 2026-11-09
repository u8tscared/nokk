// Premiers pas, notes rapides, tableau de bord des secteurs, affectation, nouvelle campagne, partage de Nokk.
import { test, expect } from '@playwright/test';
import { startDemo } from './helpers.js';

const SHOT = process.env.SHOT;
const shot = async (page, name) => { if (SHOT) { await page.waitForTimeout(900); await page.screenshot({ path: `${SHOT}/${test.info().project.name}-${name}.png` }); } };

test('nouvelle équipe : présentation animée, puis on montre où toucher', async ({ page }) => {
  await page.route(/tiles\.openfreemap\.org|fonts\.(googleapis|gstatic)\.com|data\.geopf\.fr|overpass/, (r) => r.abort());
  await page.goto('/');
  await page.getByTestId('no-account').click();
  await page.getByTestId('create-team').click();
  await page.locator('#oname1').fill('Lucas Martin');
  await page.getByTestId('ob-next').click();
  await page.locator('#ocity1').fill('Rezé');
  await page.getByTestId('ob-next').click();
  await page.getByTestId('ob-next').click();
  await page.locator('#opartner').fill('Inès Diallo');
  for (let i = 0; i < 3; i++) await page.getByTestId('ob-next').click();
  const intro = page.getByTestId('intro');
  await expect(intro).toBeVisible();
  await shot(page, 'intro');
  for (let i = 0; i < 3; i++) await intro.getByTestId('intro-next').click();
  await expect(intro).toContainText('Toute l\'équipe');
  await intro.getByTestId('intro-next').click();
  // Le projecteur montre le bouton « Nouveau secteur ».
  await expect(page.getByTestId('coach')).toBeVisible();
  await expect(page.getByTestId('coach')).toContainText('Nouveau secteur');
  await shot(page, 'coach');
  await page.mouse.click(5, 5);
  await expect(page.getByTestId('coach')).toHaveCount(0);
  await expect(page.getByTestId('start-card')).toContainText('0/4');
  await expect(page.getByTestId('start-sector')).toBeVisible();
});

test('notes rapides, tableau de bord, prévenir les équipiers, partager Nokk', async ({ page }) => {
  const errors = await startDemo(page);
  // Notes rapides sur une porte, gardées sur la porte.
  await page.locator('[data-testid=next-door]:visible').click();
  const sheet = page.getByRole('dialog');
  await sheet.getByTestId('tags-toggle').click();
  await sheet.getByTestId('tag-chien').click();
  await sheet.getByTestId('tag-nepas').click();
  await sheet.getByTestId('tags-toggle').click();
  await expect(sheet.getByTestId('tag-chien')).toHaveAttribute('aria-pressed', 'true');
  await shot(page, 'tags');
  const tags = await page.evaluate(() => window.__nokk.store.data.value.doors.find((d) => d.tags?.length)?.tags);
  expect(tags).toEqual(['chien', 'nepas']);
  await page.keyboard.press('Escape');

  // Tableau de bord des secteurs.
  await page.evaluate(() => window.__nokk.nav.go('secteurs'));
  const board = page.getByTestId('sector-board');
  await expect(board).toBeVisible();
  await expect(board.locator('.board-row').first()).toContainText('/porte');
  await shot(page, 'board');
  await board.locator('.board-row').first().click();
  await page.getByTestId('assign-send').click();
  const assign = page.getByTestId('assign-sheet');
  await expect(assign.getByTestId('assign-person').first()).toContainText('tu es affecté au secteur');
  await shot(page, 'assign');
  await page.keyboard.press('Escape');

  // Partager Nokk : QR à scanner.
  await page.evaluate(() => window.__nokk.nav.go('equipe'));
  await expect(page.getByTestId('share-nokk')).toBeVisible();
  await page.getByTestId('share-nokk-qr').click();
  await expect(page.getByTestId('share-qr').locator('.qr-frame path')).toHaveCount(1);
  await shot(page, 'qr');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__nokk.nav.go('caisse'));
  await expect(page.getByTestId('soon-card')).toContainText('SumUp');
  expect(errors).toEqual([]);
});

test('clôturer la campagne : chaque porte garde son année, le journal repart à zéro', async ({ page }) => {
  await startDemo(page);
  const before = await page.evaluate(() => {
    const d = window.__nokk.store.data.value;
    const v = d.visits.find((x) => x.result === 'donne');
    return { door: v.doorId, year: d.org.year, n: d.visits.length };
  });
  expect(before.n).toBeGreaterThan(0);
  await page.evaluate(() => window.__nokk.nav.go('reglages'));
  await page.getByTestId('close-campaign').click();
  await page.getByTestId('close-ok').check();
  const dl = page.waitForEvent('download');
  await page.getByTestId('close-go').click();
  expect((await dl).suggestedFilename()).toContain('nokk-sauvegarde');
  const after = await page.evaluate((id) => {
    const d = window.__nokk.store.data.value;
    return { n: d.visits.length, year: d.org.year, door: d.doors.find((x) => x.id === id) };
  }, before.door);
  expect(after.n).toBe(0);
  expect(after.year).toBe(before.year + 1);
  expect(after.door.lastYear.year).toBe(before.year);
  expect(after.door.lastYear.amount).toBeGreaterThan(0);
  expect(after.door.history[before.year]).toBeTruthy();
});

test('lien #demo : la démo s\'ouvre directement', async ({ page }) => {
  await page.route(/tiles\.openfreemap\.org|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto('/#demo');
  await expect(page.locator('[data-testid=start-tour]:visible')).toBeVisible({ timeout: 15000 });
  expect(await page.evaluate(() => window.__nokk.store.demo.value)).toBe(true);
});
