// Le menu existe une fois et doit être joignable partout, pour chaque rôle.
import { test, expect } from '@playwright/test';
import { startDemo, asRole, isDesktop, noHorizontalScroll } from './helpers.js';

const ROLES = ['chef', 'pompier', 'tresorier'];

for (const role of ROLES) {
  test(`chaque écran du menu est joignable (${role})`, async ({ page }) => {
    const errors = await startDemo(page);
    await asRole(page, role);
    const expected = await page.evaluate(() => {
      const { nav, store } = window.__nokk;
      const me = store.data.value.members.find((m) => m.id === store.data.value.meId);
      return nav.menuFor(me, false).filter((m) => !m.action).map((m) => m.route);
    });
    expect(expected.length).toBeGreaterThan(3);

    let reachable;
    if (isDesktop(page)) {
      await expect(page.locator('.sidebar')).toBeVisible();
      reachable = await page.locator('.sidebar [data-testid^="side-"]').evaluateAll((els) => els.map((e) => e.dataset.testid.replace('side-', '')));
    } else {
      await expect(page.locator('.tabbar')).toBeVisible();
      const tabs = await page.locator('.tabbar [data-testid^="tab-"]').evaluateAll((els) => els.map((e) => e.dataset.testid.replace('tab-', '')));
      await page.getByTestId('tab-plus').click();
      await expect(page.getByTestId('screen-plus')).toBeVisible();
      const more = await page.locator('[data-testid^="more-"]').evaluateAll((els) => els.map((e) => e.dataset.testid.replace('more-', '')));
      reachable = [...tabs, ...more];
    }
    for (const r of expected) expect(reachable, `« ${r} » joignable`).toContain(r);

    // Chaque écran s'ouvre vraiment, sans défilement horizontal.
    for (const r of expected) {
      if (isDesktop(page)) await page.getByTestId('side-' + r).click();
      else if (await page.getByTestId('tab-' + r).count()) await page.getByTestId('tab-' + r).click();
      else { await page.getByTestId('tab-plus').click(); await page.getByTestId('more-' + r).click(); }
      await expect(page.getByTestId('screen-' + r)).toBeVisible();
      await noHorizontalScroll(page);
    }
    expect(errors).toEqual([]);
  });
}

test('un écran retiré disparaît partout et son lien est bloqué', async ({ page }) => {
  await startDemo(page);
  await page.evaluate(() => {
    const { store } = window.__nokk;
    const m = store.data.value.members.find((x) => x.role === 'pompier');
    store.updateMember(m.id, { hidden: ['journal'] });
    store.switchUser(m.id);
  });
  if (isDesktop(page)) await expect(page.getByTestId('side-journal')).toHaveCount(0);
  else {
    await page.getByTestId('tab-plus').click();
    await expect(page.getByTestId('more-journal')).toHaveCount(0);
  }
  await page.evaluate(() => { location.hash = '#journal'; });
  await page.evaluate(() => window.__nokk.nav.route.value = 'journal');
  await expect(page.getByTestId('screen-journal')).toHaveCount(0);
  await expect(page.getByTestId('screen-carte')).toBeVisible();
});

test('le pompier ne voit pas les comptes', async ({ page }) => {
  await startDemo(page);
  await asRole(page, 'pompier');
  await page.evaluate(() => window.__nokk.nav.go('comptes'));
  await expect(page.getByTestId('screen-comptes')).toHaveCount(0);
});
