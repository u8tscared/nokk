import { describe, it, expect } from 'vitest';
import area from '../../src/demo/area.json';
import { planRoute, naiveMeters } from '../../src/lib/route.js';
import { buildDemo } from '../../src/lib/demo.js';
import { sectorStats, indexVisits } from '../../src/lib/model.js';

describe('parcours optimisé', () => {
  it('visite chaque porte une seule fois et bat un ordre naïf', () => {
    const doors = area.doors.filter((d) => d.p[0] < area.center[0]).slice(0, 160);
    const t = Date.now();
    const r = planRoute({ doors, network: area.network });
    const ms = Date.now() - t;
    expect(new Set(r.order).size).toBe(doors.length);
    expect(r.order.length).toBe(doors.length);
    const shuffled = [...doors].sort(() => Math.random() - 0.5);
    expect(r.meters).toBeLessThan(naiveMeters(shuffled));
    expect(ms).toBeLessThan(2500);
    console.log('portes', doors.length, 'mètres', r.meters, 'min', r.minutes, 'ms', ms, 'naïf trié', naiveMeters(doors));
  });
});

describe('démo', () => {
  it('construit 6 secteurs avec des visites cohérentes', async () => {
    const { data } = await buildDemo(Date.now());
    expect(data.sectors.length).toBe(6);
    const by = indexVisits(data.visits);
    const stats = data.sectors.map((s) => sectorStats(data.doors.filter((d) => d.sectorId === s.id), by));
    console.log(stats.map((s) => `${s.total} portes ${s.pct}% ${s.amount / 100}€`).join(' | '));
    expect(stats[0].pct).toBe(100);
    expect(stats[5].done).toBe(0);
  });
});
