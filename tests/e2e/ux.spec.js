// Clavier iPhone/iPad simulé et écrans figés (vrais gestes tactiles).
import { test, expect } from '@playwright/test';
import { startDemo, isDesktop } from './helpers.js';

test('clavier : le champ et le bouton restent visibles au-dessus du clavier', async ({ page }) => {
  test.skip(isDesktop(page), 'pas de clavier virtuel sur ordinateur');
  await startDemo(page);
  await page.locator('[data-testid=next-door]:visible').click();
  await page.getByRole('button', { name: 'Nom, appartement, note' }).click();
  const field = page.locator('#dnote');
  await field.focus();
  const { width, height } = page.viewportSize();
  const KB = Math.round(height * 0.4); // clavier de N pixels
  await page.setViewportSize({ width, height: height - KB });
  await expect(page.locator('html')).toHaveClass(/kb-open/);
  await page.waitForTimeout(500);
  const visibleH = height - KB;
  const f = await field.boundingBox();
  const btn = await page.getByTestId('validate').boundingBox();
  expect(f.y).toBeGreaterThanOrEqual(0);
  expect(f.y + f.height).toBeLessThanOrEqual(visibleH);
  expect(btn.y + btn.height).toBeLessThanOrEqual(visibleH + 1);
  // La barre d'onglets se cache.
  // Entrée sur le dernier champ ferme le clavier.
  await page.setViewportSize({ width, height });
  await field.press('Enter');
  await expect(field).not.toBeFocused();
});

test('clavier : faux positifs évités (pas de champ, pas de clavier)', async ({ page }) => {
  await startDemo(page);
  const { width, height } = page.viewportSize();
  await page.setViewportSize({ width, height: height - 300 });
  await page.waitForTimeout(200);
  await expect(page.locator('html')).not.toHaveClass(/kb-open/);
  await page.setViewportSize({ width, height });
});

test('le bon clavier sur chaque champ', async ({ page }) => {
  await startDemo(page);
  await page.locator('[data-testid=next-door]:visible').click();
  await page.getByRole('button', { name: 'Chèque' }).click();
  await page.getByRole('button', { name: 'Nom, appartement, note' }).click();
  await expect(page.locator('#dname')).toHaveAttribute('autocapitalize', 'words');
  await expect(page.locator('#dname')).toHaveAttribute('autocorrect', 'off');
  await expect(page.locator('#cheque')).toHaveAttribute('inputmode', 'numeric');
});

async function swipe(page, x, y, dy) {
  const cdp = await page.context().newCDPSession(page);
  await page.evaluate(() => {
    window.__moves = [];
    window.addEventListener('touchmove', (e) => window.__moves.push(e.defaultPrevented), { passive: true });
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dy * i) / 6 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  return page.evaluate(() => window.__moves);
}

test('écran figé : rien ne se traîne là où rien ne défile', async ({ page }) => {
  test.skip(isDesktop(page), 'gestes tactiles');
  await startDemo(page);
  await page.evaluate(() => window.__nokk.nav.go('reglages'));
  await page.evaluate(() => window.__nokk.nav.go('caisse'));
  await expect(page.getByTestId('screen-caisse')).toBeVisible();
  // Sur la barre d'onglets : rien ne défile, le geste est annulé.
  const tb = await page.locator('.tabbar').boundingBox();
  const moves = await swipe(page, tb.x + 20, tb.y + 10, -120);
  expect(moves.length).toBeGreaterThan(0);
  expect(moves.every(Boolean)).toBe(true);
});

test('écran figé : une liste qui défile reste libre', async ({ page }) => {
  test.skip(isDesktop(page), 'gestes tactiles');
  await startDemo(page);
  await page.evaluate(() => window.__nokk.nav.go('journal'));
  await expect(page.getByTestId('screen-journal')).toBeVisible();
  const moves = await swipe(page, 200, 500, -200);
  expect(moves.length).toBeGreaterThan(0);
  expect(moves.some((x) => x === false)).toBe(true);
});

test('fenêtre du bas : on la ferme en la tirant par sa poignée', async ({ page }) => {
  test.skip(isDesktop(page), 'fenêtre centrée sur ordinateur');
  await startDemo(page);
  await page.locator('[data-testid=next-door]:visible').click();
  const grip = page.locator('.sheet-grip');
  await page.waitForTimeout(500); // fin de l'animation d'ouverture
  const g = await grip.boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + 10);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2, g.y + 500, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('mode sombre : les couleurs passent par les tokens', async ({ page }) => {
  await startDemo(page);
  await page.evaluate(() => { window.__nokk.store.saveSettings({ theme: 'dark' }); document.documentElement.setAttribute('data-theme', 'dark'); });
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(12, 22, 24)');
});
