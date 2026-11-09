// Tracer un secteur : on cherche une adresse pour s'y rendre, et les numéros de rue s'affichent pour se repérer.
import { test, expect } from '@playwright/test';

test('rechercher une adresse et voir les numéros de rue en traçant', async ({ page }) => {
  await page.route(/tiles\.openfreemap\.org|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const asked = [];
  await page.route(/data\.geopf\.fr\/geocodage\/search/, (r) => {
    asked.push(new URL(r.request().url()).searchParams.get('q'));
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: [
      { geometry: { type: 'Point', coordinates: [-1.5571, 47.1781] }, properties: { type: 'housenumber', name: '12 Rue des Déportés', postcode: '44400', city: 'Rezé', label: '12 Rue des Déportés 44400 Rezé' } },
      { geometry: { type: 'Point', coordinates: [-1.5560, 47.1790] }, properties: { type: 'street', name: 'Rue des Déportés', postcode: '44400', city: 'Rezé' } },
    ] }) });
  });
  await page.route(/data\.geopf\.fr\/wfs/, (r) => {
    const u = new URL(r.request().url());
    expect(u.searchParams.get('TYPENAMES')).toBe('BAN.DATA.GOUV:ban');
    const features = Array.from({ length: 20 }, (_, i) => ({ type: 'Feature', geometry: null, properties: { id: 'a' + i, numero: String(i * 2 + 1), rep: i === 3 ? 'bis' : null, lon: -1.5571 + i * 0.00008, lat: 47.1781 } }));
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ features }) });
  });
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
  await page.getByTestId('new-sector').click();
  await page.waitForFunction(() => !!window.__nokkCreatorMap);

  await page.getByTestId('addr-search').fill('12 rue des dép');
  const results = page.getByTestId('addr-results');
  await expect(results.getByText('12 Rue des Déportés')).toBeVisible();
  await expect(results.getByText('44400 Rezé').first()).toBeVisible();
  expect(asked.at(-1)).toBe('12 rue des dép');
  await results.getByText('12 Rue des Déportés').click();
  await expect(results).toBeHidden();
  await expect(page.locator('.addr-pin')).toBeVisible();
  await expect.poll(() => page.evaluate(() => { const m = window.__nokkCreatorMap; const c = m.getCenter(); return [m.getZoom() > 17, Math.abs(c.lng + 1.5571) < 1e-4, Math.abs(c.lat - 47.1781) < 1e-4]; }), { timeout: 5000 }).toEqual([true, true, true]);

  // Les numéros de la zone sont chargés sur la carte.
  await expect.poll(() => page.evaluate(() => window.__nokkCreatorMap.getSource('housenums')?.serialize().data.features?.length || 0), { timeout: 5000 }).toBeGreaterThan(10);
  const nums = await page.evaluate(() => window.__nokkCreatorMap.getSource('housenums').serialize().data.features.map((f) => f.properties.n));
  expect(nums).toContain('7bis');

  // On trace toujours en touchant la carte, sous la recherche.
  const box = await page.getByTestId('creator-map').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  for (const [dx, dy] of [[-120, -100], [120, -100], [120, 100]]) await page.mouse.click(cx + dx, cy + dy);
  await expect(page.locator('.creator-hint')).toContainText('Terminer');
});
