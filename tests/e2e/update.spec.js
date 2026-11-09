// Réglages : la version est lisible et on peut vérifier la mise à jour.
import { test, expect } from '@playwright/test';
import { startDemo } from './helpers.js';

test('réglages : version lisible et « À jour »', async ({ page }) => {
  await page.route(/tiles\.openfreemap\.org|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await startDemo(page);
  await page.evaluate(() => window.__nokk.nav.go('reglages'));
  const card = page.getByTestId('update-card');
  await expect(card).toContainText(/Version du \d+ \S+ à \d\d h \d\d/);
  await page.getByTestId('check-update').click();
  await expect(card).toContainText('À jour ✓');
});
