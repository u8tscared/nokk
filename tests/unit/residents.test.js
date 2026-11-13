import { describe, it, expect } from 'vitest';
import { parseFloor, floorShort, tidyName, sameName, mergeResidents, residentStates, byFloor, nextResident, recapText, passCount } from '../../src/lib/residents.js';
import { doorState, unitsOf, sectorStats } from '../../src/lib/model.js';
import { parseBoites, mergeBoites } from '../../worker/index.js';
import { parseAmount } from '../../src/lib/amount.js';

describe('étages', () => {
  it('comprend les façons d\'écrire un étage', () => {
    expect(parseFloor('RDC')).toBe(0);
    expect(parseFloor('rez-de-chaussée')).toBe(0);
    expect(parseFloor('1er')).toBe(1);
    expect(parseFloor('2ème étage')).toBe(2);
    expect(parseFloor('Ét. 4')).toBe(4);
    expect(parseFloor('troisième')).toBe(3);
    expect(parseFloor('sous-sol')).toBe(-1);
    expect(parseFloor(null)).toBe(null);
    expect(parseFloor('?')).toBe(null);
    expect(floorShort(0)).toBe('RDC');
    expect(floorShort(1)).toBe('1er');
    expect(floorShort(3)).toBe('3e');
  });
});

describe('noms des boîtes', () => {
  it('rend les majuscules lisibles et reconnaît le même nom mal lu', () => {
    expect(tidyName('DUPONT Jean')).toBe('Dupont Jean');
    expect(tidyName('M. et Mme MARTIN-ROUX')).toBe('M. et Mme Martin-Roux');
    expect(sameName('DUPONT', 'Dupond')).toBe(true);
    expect(sameName('Mme Martin', 'MARTIN')).toBe(true);
    expect(sameName('Martin', 'Morel')).toBe(false);
  });
  it('une deuxième photo ne double pas les noms, mais complète les étages', () => {
    const a = mergeResidents([], [{ name: 'DUPONT', floor: null }, { name: 'MARTIN', floor: '1' }]);
    expect(a.added).toBe(2);
    const b = mergeResidents(a.list, [{ name: 'Dupond', floor: '2e' }, { name: 'PETIT', floor: 'RDC' }]);
    expect(b.added).toBe(1);
    expect(b.updated).toBe(1);
    expect(b.list.find((r) => r.name === 'Dupont').floor).toBe(2);
    expect(b.list.length).toBe(3);
  });
});

const door = {
  id: 'd1', num: '12', street: 'rue des Lilas', flats: 6,
  residents: [
    { id: 'r1', name: 'Dupont', floor: 0 }, { id: 'r2', name: 'Martin', floor: 0 },
    { id: 'r3', name: 'Leroy', floor: 1 }, { id: 'r4', name: 'Petit', floor: 1 },
    { id: 'r5', name: 'Faure', floor: null },
  ],
};
const day1 = new Date('2026-11-10T10:00:00').getTime();
const day2 = new Date('2026-11-12T18:00:00').getTime();
const visits = [
  { id: 'a', doorId: 'd1', rid: 'r1', result: 'donne', amount: 1000, ts: day1 },
  { id: 'b', doorId: 'd1', rid: 'r2', result: 'absent', ts: day1 + 60e3 },
  { id: 'c', doorId: 'd1', rid: 'r3', result: 'absent', ts: day1 + 120e3 },
  { id: 'd', doorId: 'd1', rid: 'r2', result: 'absent', ts: day2 },
  { id: 'e', doorId: 'd1', rid: 'r3', result: 'donne', amount: 10, ts: day2 + 60e3 },
];

describe('repasses dans un immeuble', () => {
  const st = residentStates(door, visits);
  it('chaque habitant : dernier résultat et nombre d\'absences', () => {
    const m = Object.fromEntries(st.map((s) => [s.r.id, s]));
    expect(m.r1.state).toBe('donne');
    expect(m.r2.state).toBe('absent');
    expect(m.r2.absences).toBe(2);
    expect(m.r3.state).toBe('donne');
    expect(m.r3.amount).toBe(10);
    expect(m.r4.state).toBe('todo');
  });
  it('étage par étage, ce qui reste', () => {
    const f = byFloor(st);
    expect(f.map((g) => g.floor)).toEqual([0, 1, null]);
    expect(f[0].left).toBe(1);
    expect(f[1].left).toBe(1);
    expect(f[2].left).toBe(1);
  });
  it('habitant suivant : d\'abord jamais vus, au même étage, puis les absents', () => {
    expect(nextResident(st, 'r3').r.id).toBe('r4');
    const all = residentStates(door, [...visits, { id: 'f', rid: 'r4', result: 'refus', ts: day2 + 1 }, { id: 'g', rid: 'r5', result: 'donne', amount: 500, ts: day2 + 2 }]);
    expect(nextResident(all, 'r5').r.id).toBe('r2');
  });
  it('compte les passages par jour', () => {
    expect(passCount(visits)).toBe(2);
  });
  it('immeuble : un logement par habitant, les absents restent à repasser même immeuble fini', () => {
    expect(unitsOf(visits).length).toBe(3);
    const s = doorState(door, visits);
    expect(s.units).toBe(2);
    expect(s.absents).toBe(1);
    const closed = doorState(door, [...visits, { id: 'z', result: 'absent', closed: true, ts: day2 + 5 }]);
    expect(closed.state).toBe('donne');
    expect(closed.absents).toBe(1);
    expect(sectorStats([door], new Map([['d1', [...visits, { id: 'z', result: 'absent', closed: true, ts: day2 + 5 }]]])).repasse).toBe(1);
  });
  it('récap à partager', () => {
    const t = recapText(door, st, { onlyOpen: true });
    expect(t).toContain('reste 3 à voir');
    expect(t).toContain('Rez-de-chaussée :');
    expect(t).toContain('- Martin : absent ×2');
    expect(t).not.toContain('Dupont');
  });
});

describe('lecture des boîtes (serveur)', () => {
  it('garde les noms, enlève les « Stop pub »', () => {
    const r = parseBoites('Voici : {"boites":[{"nom":"DUPONT","etage":"2","porte":null},{"nom":"Stop pub","etage":null},{"nom":"null"}]}');
    expect(r).toEqual([{ nom: 'DUPONT', etage: '2', porte: null }]);
  });
  it('croise deux lectures sans doublon', () => {
    const m = mergeBoites([[{ nom: 'DUPONT', etage: null }], [{ nom: 'DUPOND', etage: '2' }, { nom: 'MARTIN', etage: 'RDC' }]]);
    expect(m.length).toBe(2);
    expect(m.find((x) => /DUPON/.test(x.nom)).etage).toBe('2');
  });
});

describe('montant du don', () => {
  it('accepte les centimes et le zéro', () => {
    expect(parseAmount('0,1')).toBe(10);
    expect(parseAmount('0')).toBe(0);
    expect(parseAmount('12,50 €')).toBe(1250);
    expect(parseAmount('abc')).toBe(null);
    expect(parseAmount('')).toBe(null);
  });
});
