// Formation sur mesure (questions, leçons, exercice, quiz) et guide « écran d'accueil » selon le téléphone.
import { test, expect } from '@playwright/test';

const SHOT = process.env.SHOT;
const shot = async (page, name) => { if (SHOT) { await page.waitForTimeout(700); await page.screenshot({ path: `${SHOT}/${test.info().project.name}-${name}.png` }); } };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36';
const block = (page) => page.route(/tiles\.openfreemap\.org|fonts\.(googleapis|gstatic)\.com|data\.geopf\.fr|overpass/, (r) => r.abort());

async function createTeam(page) {
  await page.goto('/#carte');
  await page.getByTestId('no-account').click();
  await page.getByTestId('create-team').click();
  await page.locator('#oname1').fill('Lucas Martin');
  await page.getByTestId('ob-next').click();
  await page.locator('#ocity1').fill('Rezé');
  await page.getByTestId('ob-next').click();
  await page.getByTestId('ob-next').click();
  await page.locator('#opartner').fill('Inès Diallo');
  for (let i = 0; i < 3; i++) await page.getByTestId('ob-next').click();
}

test.describe('sur iPhone', () => {
  test.use({ userAgent: IPHONE });

  test('formation sur mesure : questions, parcours, exercice de portes, quiz', async ({ page }) => {
    test.skip(test.info().project.name !== 'telephone', 'parcours testé au téléphone');
    await block(page);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await createTeam(page);
    const intro = page.getByTestId('intro');
    await expect(intro).toContainText('Bienvenue Lucas');
    await shot(page, 'f1-bienvenue');
    await intro.getByTestId('intro-next').click();
    // 1. Ce que je fais (plusieurs choix)
    await page.getByTestId('q-does-portes').waitFor();
    await shot(page, 'f2-question');
    await page.getByTestId('q-next').click();
    await page.getByTestId('q-exp-debut').click();
    await page.getByTestId('q-terrain-immeubles').click();
    await page.getByTestId('q-crew-binome').click();
    await page.getByTestId('q-pay-cheque').waitFor();
    await page.getByTestId('q-next').click();
    await page.getByTestId('q-comfort-peu').click();
    const ready = page.getByTestId('parcours-ready');
    await expect(ready).toContainText('Les bons réflexes');
    await expect(ready).toContainText('Les immeubles');
    await expect(ready).toContainText('Nokk sur l\'écran d\'accueil');
    await expect(ready).not.toContainText('astuces');
    await shot(page, 'f3-parcours');
    await ready.getByTestId('parcours-start').click();

    // Leçon 1 : installation, guide iPhone Safari 26.
    const lesson = page.getByTestId('lesson');
    await expect(lesson).toHaveAttribute('data-lesson', 'install');
    const guide = lesson.getByTestId('install-guide');
    await expect(guide).toHaveAttribute('data-chrome', 'safari26');
    await expect(guide.getByTestId('install-device')).toContainText('iPhone · Safari');
    await shot(page, 'f4-installer');
    await guide.getByTestId('install-step-1').click();
    await shot(page, 'f4b-installer-menu');
    await guide.getByTestId('install-step-3').click();
    await shot(page, 'f4c-installer-ajouter');
    await guide.getByTestId('install-done').click();
    await expect(page.getByTestId('lesson-end')).toBeVisible();
    await page.getByTestId('lesson-continue').click();

    // Leçon 2 : les bons réflexes, avec quiz bloquant.
    await expect(lesson).toHaveAttribute('data-lesson', 'reflexes');
    await shot(page, 'f5-lecon');
    for (let i = 0; i < 4; i++) await lesson.getByTestId('lesson-next').click();
    await expect(lesson.getByTestId('lesson-next')).toBeDisabled();
    await lesson.getByTestId('quiz-0').click();
    await expect(lesson.getByTestId('quiz')).toContainText('Pas tout à fait');
    await lesson.getByTestId('quiz-1').click();
    await shot(page, 'f6-quiz');
    await lesson.getByTestId('lesson-next').click();
    await page.getByTestId('lesson-continue').click();
    // Leçon carte : on passe.
    await expect(lesson).toHaveAttribute('data-lesson', 'carte');
    await lesson.getByTestId('lesson-close').click();

    // Formation : la porte d'entraînement.
    await page.evaluate(() => window.__nokk.nav.go('formation'));
    const card = page.getByTestId('parcours-card');
    await expect(card).toContainText('2/');
    await shot(page, 'f7-formation');
    await card.getByTestId('module-porte').click();
    for (let i = 0; i < 3; i++) await lesson.getByTestId('lesson-next').click();
    const drill = lesson.getByTestId('drill');
    await expect(drill).toBeVisible();
    await drill.getByTestId('drill-absent').click();
    await expect(drill).toContainText('Pas tout à fait');
    await drill.getByTestId('drill-donne').click();
    await drill.getByTestId('drill-amt-1000').click();
    await shot(page, 'f8-exercice');
    await drill.getByTestId('drill-ok').click();
    await expect(drill).toContainText('Porte 2/');
    await drill.getByTestId('drill-absent').click();
    await expect(drill).toContainText('Porte 3/');
    await drill.getByTestId('drill-donne').click();
    await drill.getByTestId('drill-amt-1500').click();
    await drill.getByTestId('drill-pay-cheque').click();
    await drill.getByTestId('drill-ok').click();
    await expect(drill).toContainText('Porte 4/');
    await drill.getByTestId('drill-deja').click();
    await expect(lesson.getByTestId('drill-done')).toBeVisible();
    await expect(lesson.getByTestId('lesson-next')).toBeEnabled();
    expect(await page.evaluate(() => window.__nokk.store.data.value.visits.length)).toBe(0);
    expect(await page.evaluate(() => window.__nokk.store.settings.value.simple)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('rappel d\'installation et guide depuis la connexion', async ({ page }) => {
    test.skip(test.info().project.name === 'ordinateur', 'au téléphone');
    await block(page);
    await page.goto('/#carte');
    await page.getByTestId('install-first').click();
    const guide = page.getByTestId('install-guide');
    await expect(guide).toHaveAttribute('data-chrome', 'safari26');
    await expect(page.getByTestId('install-arrow')).toContainText('en bas à droite');
    await shot(page, 'i1-connexion-guide');
    // Pas le bon téléphone : on choisit à la main.
    await guide.getByTestId('install-other').click();
    await guide.getByTestId('install-pick-android').click();
    await expect(guide).toHaveAttribute('data-chrome', 'chromeAndroid');
    await guide.getByTestId('install-step-1').click();
    await shot(page, 'i2-android-menu');
  });
});

test.describe('sur Samsung', () => {
  test.use({ userAgent: SAMSUNG });
  test('le guide montre le menu ≡ de Samsung Internet', async ({ page }) => {
    test.skip(test.info().project.name !== 'telephone', 'au téléphone');
    await block(page);
    await page.goto('/#carte');
    await page.getByTestId('install-first').click();
    const guide = page.getByTestId('install-guide');
    await expect(guide).toHaveAttribute('data-chrome', 'samsung');
    await guide.getByTestId('install-step-2').click();
    await expect(guide).toContainText('Écran d\'accueil');
    await shot(page, 's1-samsung');
  });
});

test('ordinateur : QR pour continuer au téléphone', async ({ page }) => {
  test.skip(test.info().project.name !== 'ordinateur', 'à l\'ordinateur');
  await block(page);
  await page.goto('/#carte');
  await page.getByTestId('demo').click();
  await page.getByTestId('demo-pompier').click();
  await page.waitForFunction(() => window.__nokk?.store.demo.value === true);
  await page.evaluate(() => window.__nokk.nav.go('reglages'));
  await page.getByTestId('settings-install').click();
  await expect(page.getByTestId('install-guide')).toHaveAttribute('data-kind', 'desktop');
  await shot(page, 'd1-qr');
});
