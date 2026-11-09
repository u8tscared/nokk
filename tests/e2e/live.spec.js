// Équipes en direct : chaque binôme sur le terrain a son marqueur, à sa position partagée ou à sa dernière porte.
import { test, expect } from '@playwright/test';
import { startDemo } from './helpers.js';

test('plusieurs binômes en direct sur la carte', async ({ page }) => {
  const errors = await startDemo(page);
  await expect(page.locator('.team-marker').first()).toBeVisible();
  const before = await page.locator('.team-marker').count();
  await page.evaluate(() => {
    const { store } = window.__nokk;
    const d = store.data.value;
    const door = d.doors.find((x) => x.sectorId === 'sec-6');
    store.setData((x) => ({ ...x, sessions: [...(x.sessions || []), { id: 't-hugo', startedAt: Date.now() - 6e5, endedAt: null, sectorId: 'sec-6', crew: ['m-hugo'], pos: { p: door.p, ts: Date.now() } }] }));
  });
  await expect(page.locator('.team-marker')).toHaveCount(before + 1);
  await expect(page.locator('.team-marker').filter({ hasText: 'Hugo' })).toContainText("à l'instant");
  expect(errors).toEqual([]);
});
