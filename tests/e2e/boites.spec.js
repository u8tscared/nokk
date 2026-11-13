import { test, expect } from '@playwright/test';
import { startDemo } from './helpers.js';

const READ = { boites: [
  { nom: 'DUPONT Jean', etage: 'RDC', porte: null },
  { nom: 'MARTIN', etage: 'RDC', porte: null },
  { nom: 'Mme LEROY', etage: '1er', porte: 'B3' },
  { nom: 'PETIT', etage: null, porte: null },
] };

async function building(page) {
  const id = await page.evaluate(() => {
    const d = window.__nokk.store.data.value;
    return d.doors.find((x) => x.sectorId === d.currentSectorId && x.flats > 1 && !d.visits.some((v) => v.doorId === x.id)).id;
  });
  await page.evaluate(() => { window.__nokkApi = location.origin + '/__api'; });
  await page.route('**/__api/boites/read', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(READ) }));
  await page.evaluate((id) => window.__nokk.openDoor(id), id);
  return id;
}

test('photo des boîtes : noms et étages pré-remplis, corrigés à la main, puis repasses étage par étage', async ({ page }, info) => {
  const errors = await startDemo(page);
  const id = await building(page);
  const sheet = page.locator('.door-sheet');
  // En arrivant : la photo des boîtes est proposée d'abord.
  await expect(sheet.getByTestId('photo-first')).toBeVisible();
  if (info.project.name === 'telephone') { await page.waitForTimeout(800); await page.screenshot({ path: test.info().outputPath('arrivee.png') }); }
  // La photo : Nokk lit 4 noms.
  await page.locator('input[type=file][capture]').first().setInputFiles('tests/fixtures/plan-caluire.jpg');
  const ed = page.getByTestId('res-editor');
  await expect(ed.getByTestId('res-row')).toHaveCount(4);
  await expect(ed.getByTestId('res-name').nth(0)).toHaveValue('Dupont Jean');
  // Petit n'a pas d'étage écrit : on le met au 2e, et on corrige un nom mal lu.
  await ed.getByTestId('res-floor').nth(3).selectOption('2');
  await ed.getByTestId('res-name').nth(1).fill('Martins');
  await ed.getByTestId('res-add').click();
  await ed.getByTestId('res-name').nth(4).fill('Garnier');
  await ed.getByTestId('res-floor').nth(4).selectOption('2');
  if (info.project.name === 'telephone') await page.screenshot({ path: test.info().outputPath('editeur.png') });
  await ed.getByTestId('res-save').click();
  const door = await page.evaluate((id) => window.__nokk.store.doorById.value.get(id), id);
  expect(door.residents.map((r) => [r.name, r.floor])).toEqual([['Dupont Jean', 0], ['Martins', 0], ['Mme Leroy', 1], ['Petit', 2], ['Garnier', 2]]);
  expect(door.flats).toBe(5);

  // Nom par nom, du rez-de-chaussée vers le haut.
  await expect(sheet.getByTestId('ask-name')).toHaveValue('Dupont Jean');
  await expect(sheet.getByTestId('now-floor')).toContainText('RDC');
  if (info.project.name === 'telephone') { await page.waitForTimeout(900); await page.screenshot({ path: test.info().outputPath('liste.png') }); }
  await sheet.getByTestId('absent').click();
  await expect(sheet.getByTestId('ask-name')).toHaveValue('Martins');
  // Don de 0,10 € : n'importe quel montant passe.
  await sheet.getByTestId('yes').click();
  await sheet.getByTestId('other-amount').click();
  for (const k of ['0', ',', '1']) await sheet.locator('.numpad button', { hasText: new RegExp('^' + (k === ',' ? ',' : k) + '$') }).click();
  await page.getByTestId('validate').click();
  await expect(sheet.getByTestId('ask-name')).toHaveValue('Mme Leroy');
  // On peut revenir au précédent pour le corriger.
  await expect(sheet.getByTestId('prev-fix')).toContainText('Martins');
  await sheet.getByTestId('prev-fix').click();
  await expect(page.getByTestId('edit-amount')).toHaveValue('0,10');
  await page.getByTestId('visit-save').click();
  // Calendrier offert.
  await sheet.getByTestId('yes').click();
  await sheet.getByTestId('amount-free').click();
  await page.getByTestId('validate').click();
  // Le montant se corrige après coup, depuis le message.
  await page.locator('.toast:not(.out)').getByTestId('toast-action').click();
  await page.getByTestId('edit-amount').fill('2,5');
  await page.getByTestId('visit-save').click();
  let vs = await page.evaluate((id) => window.__nokk.store.data.value.visits.filter((v) => v.doorId === id).map((v) => [v.unit, v.result, v.amount ?? null]), id);
  expect(vs).toEqual([['Dupont Jean', 'absent', null], ['Martins', 'donne', 10], ['B3', 'donne', 250]]);
  // L'étage se change aussi en un toucher sur le nom en cours.
  await expect(sheet.getByTestId('ask-name')).toHaveValue('Petit');
  await sheet.getByTestId('now-floor').click();
  await sheet.getByTestId('floor-3').click();
  await sheet.getByTestId('absent').click();
  expect(await page.evaluate((id) => window.__nokk.store.doorById.value.get(id).residents.find((r) => r.name === 'Petit').floor, id)).toBe(3);
  await sheet.locator('.outcome.tone-bad').click(); // Garnier

  // Le lendemain : repasse. Il reste Dupont (RDC) et Petit (3e).
  await page.evaluate(() => { const s = window.__nokk.store; s.setData((d) => ({ ...d, visits: d.visits.map((v) => ({ ...v, ts: v.ts - 86400000 })) })); });
  await page.keyboard.press('Escape');
  await page.evaluate((id) => window.__nokk.openDoor(id), id);
  await expect(sheet.getByTestId('building-left')).toContainText('2 absents');
  await expect(sheet.getByTestId('residents').getByTestId('res-chip')).toHaveCount(2);
  await expect(sheet.getByTestId('ask-name')).toHaveValue('Dupont Jean');
  await expect(sheet.getByTestId('now-last')).toContainText('Absent');
  if (info.project.name === 'telephone') {
    await page.waitForTimeout(900);
    await page.screenshot({ path: test.info().outputPath('repasse.png') });
    await sheet.getByTestId('residents').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: test.info().outputPath('repasse2.png') });
  }
  await sheet.getByTestId('absent').click();
  await expect(page.locator('.toast:not(.out)')).toContainText('2e fois');
  await expect(sheet.getByTestId('ask-name')).toHaveValue('Petit');
  // Récap de l'immeuble : ce qui reste, étage par étage.
  await sheet.getByTestId('open-recap').click();
  const recap = page.getByTestId('recap');
  await expect(recap.getByTestId('recap-row')).toHaveCount(2);
  await expect(recap).toContainText('absent 2 fois');
  await expect(recap).toContainText('3e étage');
  if (info.project.name === 'telephone') { await page.waitForTimeout(700); await page.screenshot({ path: test.info().outputPath('recap.png') }); }
  expect(errors).toEqual([]);
});

test('immeuble sans photo : l\'étage se note à chaque logement, et la repasse montre les absents', async ({ page }) => {
  const errors = await startDemo(page);
  const id = await building(page);
  const sheet = page.locator('.door-sheet');
  await sheet.getByTestId('pf-skip').click();
  await expect(sheet.getByTestId('mailbox-cta')).toBeVisible();
  await sheet.getByTestId('floor-0').click();
  await sheet.getByTestId('ask-name').fill('Bernard');
  await sheet.getByTestId('absent').click();
  await expect(sheet.locator('#unit')).toHaveValue('2');
  // Même étage gardé pour le suivant.
  await expect(sheet.getByTestId('floor-0')).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByTestId('floor-1').click();
  await sheet.locator('.outcome.tone-muted').click();
  const door = await page.evaluate((id) => window.__nokk.store.doorById.value.get(id), id);
  expect(door.residents.map((r) => [r.name, r.floor, r.unit])).toEqual([['Bernard', 0, '1'], ['', 1, '2']]);
  // Repasse sur la carte : l'absent est proposé directement.
  await page.evaluate(() => { const s = window.__nokk.store; s.setData((d) => ({ ...d, visits: d.visits.map((v) => ({ ...v, ts: v.ts - 86400000 })) })); });
  await page.keyboard.press('Escape');
  await page.evaluate((id) => window.__nokk.openDoor(id), id);
  await expect(sheet.getByTestId('residents')).toBeVisible();
  await expect(sheet.getByTestId('ask-name')).toHaveValue('Bernard');
  await sheet.getByTestId('yes').click();
  await sheet.locator('.amount-tile').filter({ hasText: /^10 €/ }).click();
  await page.getByTestId('validate').click();
  const vs = await page.evaluate((id) => window.__nokk.store.data.value.visits.filter((v) => v.doorId === id).map((v) => [v.rid, v.result]), id);
  expect(vs[2]).toEqual([door.residents[0].id, 'donne']);
  expect(errors).toEqual([]);
});

test('maison : un don déjà saisi se corrige depuis la porte', async ({ page }) => {
  const errors = await startDemo(page);
  const id = await page.evaluate(() => { const v = window.__nokk.store.data.value; return v.doors.find((d) => v.visits.some((x) => x.doorId === d.id && x.result === 'donne') && (d.flats || 1) === 1).id; });
  await page.evaluate((id) => window.__nokk.openDoor(id), id);
  await page.locator('.door-sheet').getByTestId('hist-row').last().click();
  await page.getByTestId('edit-amount').fill('0,1');
  await page.getByTestId('visit-save').click();
  const v = await page.evaluate((id) => window.__nokk.store.data.value.visits.filter((x) => x.doorId === id && x.result === 'donne').at(-1).amount, id);
  expect(v).toBe(10);
  expect(errors).toEqual([]);
});
