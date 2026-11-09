import { expect } from '@playwright/test';

export async function startDemo(page) {
  // Pas de réseau extérieur en test : la carte doit marcher sans tuiles.
  await page.route(/tiles\.openfreemap\.org|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('demo').click();
  await expect(page.getByTestId('screen-carte')).toBeVisible();
  await page.waitForFunction(() => window.__nokk?.store.demo.value === true);
  return errors;
}

export async function asRole(page, role) {
  await page.evaluate((role) => {
    const { store } = window.__nokk;
    const m = store.data.value.members.find((x) => x.role === role);
    store.switchUser(m.id);
  }, role);
}

export const isDesktop = (page) => page.viewportSize().width >= 960;

export async function noHorizontalScroll(page) {
  const over = await page.evaluate(() => {
    const el = document.querySelector('.page-scroll') || document.documentElement;
    return { doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, page: el.scrollWidth - el.clientWidth };
  });
  expect(over.doc, 'la page ne défile pas sur le côté').toBeLessThanOrEqual(1);
  expect(over.page, "l'écran ne défile pas sur le côté").toBeLessThanOrEqual(1);
}

// Après la création d'équipe, la présentation animée s'ouvre : on la passe.
export async function skipIntro(page) {
  const intro = page.getByTestId('intro');
  await intro.waitFor({ timeout: 5000 });
  await intro.getByTestId('intro-skip').click();
  await intro.waitFor({ state: 'detached' });
}
