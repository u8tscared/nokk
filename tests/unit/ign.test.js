// Données IGN (BAN + BD TOPO) → portes, rues et nombre de logements par bâtiment.
import { describe, it, expect } from 'vitest';
import { ignToOsm, niceName } from '../../src/lib/ign.js';
import { processOsm } from '../../src/lib/osm.js';

const road = (id, raw, coords, extra = {}) => ({ properties: { cleabs: id, nature: 'Route à 1 chaussée', importance: '5', nom_collaboratif_gauche: raw, ...extra }, geometry: { type: 'LineString', coordinates: coords } });
const adr = (id, numero, nom_voie, lon, lat, rep = '') => ({ properties: { id, numero, rep, nom_voie, lon, lat } });

const fx = {
  routes: [
    road('R1', 'R DES DEPORTES', [[-1.5500, 47.1780], [-1.5480, 47.1780]]),
    road('R2', 'AV DU MONT BLANC', [[-1.5480, 47.1780], [-1.5480, 47.1800]], { importance: '3' }),
    { properties: { cleabs: 'B1', nature: 'Bac auto' }, geometry: { type: 'LineString', coordinates: [[-1.55, 47.17], [-1.54, 47.17]] } },
  ],
  ban: [
    adr('a1', '7', 'Rue des Déportés', -1.5495, 47.17808),
    adr('a2', '9', 'Rue des Déportés', -1.5492, 47.17808),
    adr('a3', '9', 'Rue des Déportés', -1.5492, 47.17808, 'bis'),
    adr('a4', '20', 'Avenue du Mont Blanc', -1.54795, 47.1790),
  ],
  batiments: [
    { properties: { cleabs: 'BAT1', usage_1: 'Résidentiel', nombre_de_logements: 39 } },
    { properties: { cleabs: 'BAT2', usage_1: 'Résidentiel', nombre_de_logements: 16 } },
    { properties: { cleabs: 'BAT3', usage_1: 'Résidentiel', nombre_de_logements: 1 } },
    { properties: { cleabs: 'BAT4', usage_1: 'Annexe' } },
  ],
  liens: [
    { properties: { id_adr: 'a1', id_bat: 'BAT1' } },
    { properties: { id_adr: 'a2', id_bat: 'BAT2' } },
    { properties: { id_adr: 'a3', id_bat: 'BAT2' } },
    { properties: { id_adr: 'a4', id_bat: 'BAT3' } },
    { properties: { id_adr: 'a4', id_bat: 'BAT4' } },
  ],
};

describe('données IGN', () => {
  const r = processOsm(ignToOsm(fx));
  const door = (street, num) => r.doors.find((d) => d.street === street && d.num === num);

  it('chaque numéro a son nombre de logements, partagé entre les entrées d\'un même immeuble', () => {
    expect(door('Rue des Déportés', '7').flats).toBe(39);
    expect(door('Rue des Déportés', '9').flats).toBe(8);
    expect(door('Rue des Déportés', '9 bis').flats).toBe(8);
    expect(door('Avenue du Mont Blanc', '20').flats).toBe(1);
  });

  it('les rues prennent le nom des adresses, les bacs sont ignorés', () => {
    expect(r.streets.map((s) => s.name).sort()).toEqual(['Avenue du Mont Blanc', 'Rue des Déportés']);
    expect(r.streets.find((s) => s.name === 'Avenue du Mont Blanc').big).toBe(true);
    expect(r.network.length).toBe(2);
  });

  it('les portes sont placées le long de leur rue, dans l\'ordre', () => {
    const d = r.doors.filter((x) => x.street === 'Rue des Déportés');
    expect(d.map((x) => x.num)).toEqual(['7', '9', '9 bis']);
    expect(d[0].along).toBeLessThan(d[1].along);
  });

  it('noms IGN abrégés rendus lisibles', () => {
    expect(niceName('AV MARIE-CLAUDE VAILLANT-COUTURIER')).toBe('Avenue Marie-Claude Vaillant-Couturier');
    expect(niceName('R DES DEPORTES')).toBe('Rue des Deportes');
  });
});
