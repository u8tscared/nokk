// Tracer un secteur : on cherche une adresse pour s'y rendre, et les numéros de rue s'affichent pour se repérer.
import { test, expect } from '@playwright/test';
import { skipIntro } from './helpers.js';

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
  await skipIntro(page);
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

test('photo du plan : la zone se trace toute seule', async ({ page }) => {
  await page.route(/tiles\.openfreemap\.org|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  let sent = null;
  await page.route(/\/plan\/read$/, (r) => {
    sent = r.request().postDataJSON();
    r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ville: 'Rezé', cp: null, secteurs: [{ nom: 'PARADIS', bord: ['Rue Ailleurs', 'Rue Loin'], dedans: [] }, { nom: 'MARTIN', bord: ['Rue des Déportés', 'Rue Alsace Lorraine', 'Rue Imaginaire'], dedans: [] }], rues: [], adresses: [] }) });
  });
  const streets = { 'Rue des Déportés': [-1.5571, 47.1781], 'Rue Alsace Lorraine': [-1.5545, 47.1765] };
  await page.route(/data\.geopf\.fr\/geocodage\/search/, (r) => {
    const q = new URL(r.request().url()).searchParams;
    const feats = [];
    if (q.get('type') === 'municipality') feats.push({ geometry: { type: 'Point', coordinates: [-1.5528, 47.1727] }, properties: { type: 'municipality', name: 'Rezé', city: 'Rezé', citycode: '44143' } });
    else if (q.get('type') === 'street') {
      const n = Object.keys(streets).find((k) => q.get('q').startsWith(k));
      feats.push(n ? { geometry: { type: 'Point', coordinates: streets[n] }, properties: { name: n, citycode: '44143' } } : { geometry: { type: 'Point', coordinates: [-1.55, 47.17] }, properties: { name: 'Rue Jean Jaurès', citycode: '44143' } });
    }
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: feats }) });
  });
  await page.route(/data\.geopf\.fr\/wfs/, (r) => {
    const features = [];
    for (let i = 0; i < 15; i++) {
      features.push({ type: 'Feature', geometry: null, properties: { id: 'd' + i, numero: String(i + 1), nom_voie: 'Rue des Déportés', code_insee: '44143', lon: -1.5590 + i * 0.0003, lat: 47.1781 } });
      features.push({ type: 'Feature', geometry: null, properties: { id: 'a' + i, numero: String(i + 1), nom_voie: 'Rue Alsace-Lorraine', code_insee: '44143', lon: -1.5560 + i * 0.0002, lat: 47.1765 - i * 0.0001 } });
      features.push({ type: 'Feature', geometry: null, properties: { id: 'x' + i, numero: String(i + 1), nom_voie: 'Rue Ailleurs', code_insee: '44143', lon: -1.54, lat: 47.19 } });
    }
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
  await skipIntro(page);
  await page.getByTestId('new-sector').click();
  await page.waitForFunction(() => !!window.__nokkCreatorMap);

  await page.locator('#cphoto').setInputFiles('public/apple-touch-icon.png');
  const st = page.getByTestId('auto-status');
  await expect(st).toContainText('Zone tracée', { timeout: 10000 });
  await expect(st).toContainText('2 rues');
  // Deux secteurs sur le plan : celui au nom de l'équipier du téléphone (Lucas Martin) est choisi.
  await expect(page.getByTestId('auto-sectors').getByRole('button', { name: 'MARTIN' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('auto-sectors').getByRole('button', { name: 'PARADIS' })).toHaveAttribute('aria-pressed', 'false');
  expect(sent.image).toMatch(/^data:image\/jpeg;base64,/);
  // Le tracé englobe les deux rues, pas la rue d'ailleurs.
  const poly = await page.evaluate(() => window.__nokkCreatorMap.getSource('draw').serialize().data.features.find((f) => f.geometry.type === 'Polygon').geometry.coordinates[0]);
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  expect(Math.min(...xs)).toBeLessThan(-1.559);
  expect(Math.max(...xs)).toBeGreaterThan(-1.5545);
  expect(Math.max(...xs)).toBeLessThan(-1.545);
  expect(Math.max(...ys)).toBeLessThan(47.185);
  await expect(page.getByTestId('draw-done')).toBeEnabled();
});

test('tracer au doigt et retirer une zone où on ne passe pas', async ({ page }) => {
  await page.route(/tiles\.openfreemap\.org|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route(/data\.geopf\.fr/, (r) => r.abort());
  await page.route(/overpass|interpreter/, async (r) => {
    const fs = await import('node:fs');
    r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync('tests/fixtures/overpass.json', 'utf8') });
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
  await skipIntro(page);
  await page.getByTestId('new-sector').click();
  await page.waitForFunction(() => !!window.__nokkCreatorMap);
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__nokkCreatorMap.jumpTo({ center: [-1.5516, 47.1786], zoom: 16 }));
  await page.waitForTimeout(400);
  const box = await page.getByTestId('creator-map').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const center0 = await page.evaluate(() => window.__nokkCreatorMap.getCenter().toArray());

  // Un trait au doigt : un cercle autour du centre. La carte ne bouge pas pendant qu'on dessine.
  await page.getByTestId('finger').click();
  const R = Math.min(150, box.width / 2 - 30);
  await page.mouse.move(cx + R, cy);
  await page.mouse.down();
  for (let a = 0; a <= 64; a++) await page.mouse.move(cx + R * Math.cos((a / 64) * 2 * Math.PI), cy + R * 0.9 * Math.sin((a / 64) * 2 * Math.PI));
  await page.mouse.up();
  expect(await page.evaluate(() => window.__nokkCreatorMap.getCenter().toArray())).toEqual(center0);
  await expect(page.getByTestId('draw-done')).toBeEnabled();
  const outer = await page.evaluate(() => window.__nokkCreatorMap.getSource('draw').serialize().data.features.find((f) => f.geometry.type === 'Polygon').geometry.coordinates[0].length);
  expect(outer).toBeGreaterThan(10);

  // Une zone retirée au milieu, en touchant ses coins.
  await page.getByTestId('add-hole').click();
  await expect(page.getByTestId('hole-hint')).toBeVisible();
  for (const [dx, dy] of [[-40, -40], [40, -40], [40, 40], [-40, 40]]) await page.mouse.click(cx + dx, cy + dy);
  await page.getByTestId('hole-done').click();
  await expect(page.getByTestId('undo-hole')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__nokkCreatorMap.getSource('draw').serialize().data.features.find((f) => f.geometry.type === 'Polygon')?.geometry.coordinates.length)).toBe(2);

  await page.getByTestId('draw-done').click();
  await expect(page.locator('.found')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('create-sector').click();
  await expect(page.getByTestId('screen-carte')).toBeVisible();
  const res = await page.evaluate(async () => {
    const d = window.__nokk.store.data.value;
    const s = d.sectors.at(-1);
    return { holes: s.holes, doors: d.doors.filter((x) => x.sectorId === s.id).map((x) => x.p) };
  });
  expect(res.holes.length).toBe(1);
  expect(res.doors.length).toBeGreaterThan(3);
  const inHole = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
  expect(res.doors.filter((p) => inHole(p, res.holes[0]))).toEqual([]);
});
