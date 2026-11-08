import { describe, it, expect } from 'vitest';
import { MENU, menuFor, tabsFor, moreFor, allowed } from '../../src/lib/nav.js';
import { LESSONS } from '../../src/lib/lessons.js';
import { doorState, totals, countCash, reconcile, suggestAmount, formatEuro, streetState, indexVisits } from '../../src/lib/model.js';
import { pocket, breakdown, csv } from '../../src/lib/compta.js';
import { processOsm } from '../../src/lib/osm.js';
import fixture from '../fixtures/overpass.json';

describe('menu unique', () => {
  it('chaque écran du menu a sa leçon de formation', () => {
    for (const m of MENU) expect(LESSONS[m.route], `leçon pour ${m.route}`).toBeTruthy();
  });
  it('5 onglets maximum, action centrale au milieu', () => {
    for (const role of ['chef', 'pompier', 'tresorier']) {
      const tabs = tabsFor({ role });
      expect(tabs.length).toBeLessThanOrEqual(5);
      expect(tabs[Math.floor(tabs.length / 2)].action).toBe(true);
    }
  });
  it('tout ce qui n\'est pas un onglet est dans « Plus »', () => {
    for (const role of ['chef', 'pompier', 'tresorier']) {
      const all = menuFor({ role }).map((m) => m.route);
      const reach = [...tabsFor({ role }).map((t) => t.route), ...moreFor({ role }).map((m) => m.route)];
      for (const r of all) expect(reach).toContain(r);
    }
  });
  it('droits par équipier', () => {
    expect(allowed('comptes', { role: 'pompier' })).toBe(false);
    expect(allowed('comptes', { role: 'tresorier' })).toBe(true);
    expect(allowed('journal', { role: 'chef', hidden: ['journal'] })).toBe(false);
  });
});

describe('règles de la tournée', () => {
  const door = { id: 'd1', flats: 1 };
  it('état d\'une porte', () => {
    expect(doorState(door, []).state).toBe('todo');
    expect(doorState(door, [{ result: 'absent', ts: 1 }]).state).toBe('absent');
    const s = doorState(door, [{ result: 'absent', ts: 1 }, { result: 'donne', amount: 1500, ts: 2 }]);
    expect(s.state).toBe('donne');
    expect(s.amount).toBe(1500);
  });
  it('immeuble : terminé quand tous les logements sont vus', () => {
    const b = { id: 'b', flats: 2 };
    expect(doorState(b, [{ id: 'a', result: 'donne', amount: 500, unit: '1', ts: 1 }]).state).toBe('partiel');
    expect(doorState(b, [{ id: 'a', result: 'donne', amount: 500, unit: '1', ts: 1 }, { id: 'c', result: 'refus', unit: '2', ts: 2 }]).state).toBe('donne');
  });
  it('totaux et caisse au centime près', () => {
    const v = [
      { result: 'donne', amount: 1000, method: 'especes', calendars: 1 },
      { result: 'donne', amount: 1550, method: 'cheque' },
      { result: 'donne', amount: 500, method: 'carte' },
      { result: 'absent' },
      { result: 'refus' },
    ];
    const t = totals(v);
    expect(t).toMatchObject({ amount: 3050, especes: 1000, cheque: 1550, carte: 500, count: 3, calendars: 3, nbCheques: 1, rate: 60 });
    expect(countCash({ 10: 1, 0.5: 3, 0.2: 1 })).toBe(1170);
    expect(reconcile({ expectedCash: 1000, counted: 1000 }).tone).toBe('ok');
    expect(reconcile({ expectedCash: 1000, counted: 700 }).tone).toBe('warn');
    expect(reconcile({ expectedCash: 1000, counted: 0 }).tone).toBe('bad');
  });
  it('montant conseillé : l\'an dernier d\'abord', () => {
    expect(suggestAmount({ lastYear: { amount: 1500 } }, [], 1000)).toBe(1500);
    expect(suggestAmount({}, [], 1000)).toBe(1000);
  });
  it('format euro', () => {
    expect(formatEuro(1240).replace(/\s/g, ' ')).toBe('12,40 €');
    expect(formatEuro(124000).replace(/\s/g, ' ')).toBe('1 240 €');
  });
  it('rue « équipe dessus » quand un autre binôme vient de passer', () => {
    const doors = [{ id: 'a', flats: 1 }, { id: 'b', flats: 1 }];
    const by = indexVisits([{ doorId: 'a', result: 'donne', ts: Date.now() - 60000, by: ['x'] }]);
    expect(streetState(doors, by, Date.now(), 'me')).toBe('live');
    expect(streetState(doors, by, Date.now(), 'x')).toBe('partial');
  });
});

describe('comptabilité', () => {
  const d = {
    org: { stock: 100 }, members: [{ id: 'a', name: 'A', role: 'chef' }, { id: 'b', name: 'B', role: 'pompier' }],
    sectors: [{ id: 's', name: 'S' }], doors: [{ id: 'd1', sectorId: 's', num: '1', street: 'Rue X', lastYear: { amount: 1000 } }],
    visits: [
      { id: 'v1', doorId: 'd1', sectorId: 's', ts: 1, by: ['a', 'b'], result: 'donne', amount: 1200, method: 'especes', calendars: 1 },
      { id: 'v2', doorId: 'd1', sectorId: 's', ts: 2, by: ['a'], result: 'donne', amount: 800, method: 'cheque', name: 'Mme ; "Z"' },
    ],
    handovers: [], stock: [{ memberId: 'a', qty: 20 }],
  };
  it('ce qui reste en poche puis après remise', () => {
    expect(pocket(d, 'a').especes).toBe(1200);
    expect(pocket(d, 'b').amount).toBe(1200);
    const d2 = { ...d, handovers: [{ visitIds: ['v1'], counted: 1200 }] };
    expect(pocket(d2, 'a').amount).toBe(800);
    expect(pocket(d2, 'b').amount).toBe(0);
  });
  it('bilan par équipier (don partagé) et comparaison avec l\'an dernier', () => {
    const b = breakdown(d);
    expect(b.byMember.find((m) => m.id === 'a').share).toBe(600 + 800);
    expect(b.vsLastYear).toBe(100);
  });
  it('export tableur lisible par Excel', () => {
    const c = csv(d);
    expect(c.startsWith('﻿')).toBe(true);
    expect(c).toContain('"Mme ; ""Z"""');
    expect(c).toContain('12,00');
  });
});

describe('import OpenStreetMap', () => {
  it('rattache les numéros sans nom de rue à la rue la plus proche', () => {
    const r = processOsm(fixture);
    expect(r.doors.length).toBeGreaterThan(30);
    expect(r.doors.every((x) => x.street)).toBe(true);
    const ids = new Set(r.doors.map((x) => x.street + x.num));
    expect(ids.size).toBe(r.doors.length);
  });
});
