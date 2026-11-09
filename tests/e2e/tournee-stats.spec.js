// Tournée : lancer, saisir, voir le chrono et l'argent, terminer, bilan, historique.
import { test, expect } from '@playwright/test';
import { startDemo } from './helpers.js';

test('lancer une tournée, ses chiffres en direct, puis le bilan', async ({ page }) => {
  const errors = await startDemo(page);
  await page.locator('[data-testid=start-tour]:visible').click();
  const live = page.locator('[data-testid=tour-live]:visible');
  await expect(live).toBeVisible();
  const c1 = await live.getByTestId('tour-chrono').textContent();
  await page.waitForTimeout(1200);
  await expect(live.getByTestId('tour-chrono')).not.toHaveText(c1);
  // Un don de 20 € : il apparaît dans la tournée.
  await page.locator('[data-testid=next-door]:visible').click();
  const sheet = page.getByRole('dialog');
  await sheet.getByTestId('yes').click();
  await sheet.locator('.amount-tile').filter({ hasText: /^20 €/ }).click();
  await page.getByTestId('validate').click();
  await page.keyboard.press('Escape');
  await expect(live).toContainText(/20\s€/);
  await live.getByTestId('end-tour').click();
  const report = page.getByTestId('tour-report');
  await expect(report).toBeVisible();
  await expect(report).toContainText(/20\s€/);
  await expect(report).toContainText('par heure');
  await report.getByTestId('report-ok').click();
  await expect(page.locator('[data-testid=start-tour]:visible')).toBeVisible();
  const s = await page.evaluate(() => window.__nokk.store.data.value.sessions);
  expect(s.length).toBe(1);
  expect(s[0].endedAt).toBeGreaterThan(s[0].startedAt);
  await page.evaluate(() => window.__nokk.nav.go('comptes'));

  await expect(page.getByTestId('tours-card')).toContainText(/20\s€/);
  expect(errors).toEqual([]);
});

test('la tournée démarre toute seule à la première porte', async ({ page }) => {
  await startDemo(page);
  await page.locator('[data-testid=next-door]:visible').click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Absent' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid=tour-live]:visible')).toBeVisible();
});

test('nom au clavier : seul l\'essentiel reste, avec les noms déjà vus', async ({ page }) => {
  await startDemo(page);
  await page.locator('[data-testid=next-door]:visible').click();
  const sheet = page.getByRole('dialog');
  // Un absent nommé, puis on revient à la même porte.
  const id = await page.evaluate(() => { const v = window.__nokk.store.data.value; return v.doors.find((d) => !v.visits.some((x) => x.doorId === d.id) && (d.flats || 1) === 1).id; });
  await page.keyboard.press('Escape');
  await page.evaluate((id) => window.__nokk.store.addVisit({ doorId: id, sectorId: null, result: 'absent', name: 'Mme Dupont', ts: Date.now() - 3600e3 }), id);
  await page.evaluate((id) => window.__nokk.openDoor?.(id), id);
  await expect(sheet).toBeVisible();
  await sheet.getByTestId('yes').click();
  await page.locator('#dname').focus();
  await expect(sheet.locator('.amount-grid')).toBeHidden();
  await expect(sheet.locator('.give-summary')).toBeVisible();
  await expect(page.getByTestId('validate')).toBeVisible();
  await sheet.getByTestId('name-suggest').getByRole('button', { name: 'Mme Dupont' }).click();
  await expect(page.locator('#dname')).toHaveValue('Mme Dupont');
  await expect(page.locator('#dname')).toBeFocused();
});
