import { describe, it, expect } from 'vitest';
import { hull, simplify, alike, norm, enclose, pickSector } from '../../src/lib/plan.js';
import worker, { parsePlan, mergePlans } from '../../worker/index.js';

describe('photo de plan → tracé', () => {
  it('lit la réponse du modèle même entourée de texte', () => {
    const p = parsePlan('Voici :\n```json\n{"ville":"REZÉ","code_postal":null,"zone":["Rue des Déportés","Rue du Château"],"rues":["Rue du Château","Avenue X"],"adresses":[]}\n```');
    expect(p).toMatchObject({ ville: 'REZÉ', cp: null, zone: ['Rue des Déportés', 'Rue du Château'], rues: ['Avenue X'], secteurs: [{ nom: null, bord: ['Rue des Déportés', 'Rue du Château'], dedans: [] }] });
    expect(parsePlan('{"zone_rues":["Rue A bis"]}').zone).toEqual(['Rue A bis']);
    const s = parsePlan('{"ville":"Caluire","secteurs":[{"nom":"RUIS","bord":["Av du 8 Mai 1945"],"dedans":["Rue B"]},{"nom":"Paradis","bord":["Av Élie Vignal"]}]}');
    expect(s.secteurs.map((x) => x.nom)).toEqual(['RUIS', 'Paradis']);
    const m = mergePlans([s, parsePlan('{"secteurs":[{"nom":"Ruis","bord":["Av Alexander Fleming","Av du 8 Mai 1945"]}]}'), null]);
    expect(m.secteurs[0]).toEqual({ nom: 'RUIS', bord: ['Av du 8 Mai 1945', 'Av Alexander Fleming'], dedans: ['Rue B'] });
    expect(m.secteurs[1].nom).toBe('Paradis');
    expect(parsePlan('pas de json')).toBeNull();
  });

  it('compare les noms de rue sans se faire avoir par le géocodeur', () => {
    expect(alike('Rue des Deportes', 'Rue des Déportés')).toBe(1);
    expect(alike('rue alsace lorraine', 'Rue Alsace-Lorraine')).toBe(1);
    expect(alike('Avenue de la Vence', 'Avenue de la Houssais')).toBe(0);
    expect(norm("Allée de l'Église")).toBe('eglise');
    expect(alike('Av. du 8 Mai 1945', 'Avenue du 8 Mai 1945')).toBe(1);
    expect(alike('Mte du Petit Versailles', 'Montée du Petit Versailles')).toBe(1);
  });

  it('enveloppe convexe et simplification', () => {
    const pts = [[0, 0], [2, 0], [2, 2], [0, 2], [1, 1], [1, 0.1]];
    expect(hull(pts).length).toBe(4);
    const circle = Array.from({ length: 40 }, (_, i) => [Math.cos(i / 6.4), Math.sin(i / 6.4)]);
    expect(simplify(hull(circle), 12).length).toBe(12);
  });

  it('contour suivant les rues de bordure, et choix du secteur', () => {
    // Un carré de rues de 400 m autour du point de départ, avec une rue en trop dehors.
    const o = [4.85, 45.79], dx = 200 / (111320 * Math.cos((45.79 * Math.PI) / 180)), dy = 200 / 110540;
    const sq = [[o[0] - dx, o[1] - dy], [o[0] + dx, o[1] - dy], [o[0] + dx, o[1] + dy], [o[0] - dx, o[1] + dy]];
    const lines = [[sq[0], sq[1]], [sq[1], sq[2]], [sq[2], sq[3]], [sq[3], sq[0]], [[o[0] + 3 * dx, o[1] - 3 * dy], [o[0] + 3 * dx, o[1] + 3 * dy]]];
    const ring = enclose(o, lines);
    const xs = ring.map((p) => p[0]);
    expect(Math.max(...xs)).toBeLessThan(o[0] + dx * 1.2);
    expect(Math.max(...xs)).toBeGreaterThan(o[0] + dx);
    expect(enclose(o, [[sq[0], sq[1]]])).toBeNull();
    const plan = { secteurs: [{ nom: 'Paradis', bord: ['A'], dedans: [] }, { nom: 'RUIS', bord: ['B'], dedans: [] }] };
    expect(pickSector(plan, 'Ruis').nom).toBe('RUIS');
    expect(pickSector(plan, 0).nom).toBe('Paradis');
    expect(pickSector({ zone: ['X'] }).bord).toEqual(['X']);
  });

  it('API : lecture de plan depuis l\'app seulement, image vérifiée', async () => {
    let asked = null;
    const env = { AI: { run: async (model, input) => { asked = { model, input }; return { response: '{"ville":"Rezé","secteurs":[{"nom":"S1","bord":["Rue A"],"dedans":[]}]}' }; } } };
    const call = (body, origin = 'https://u8tscared.github.io') => worker.fetch(new Request('https://api.test/plan/read', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env);
    const ok = await call({ image: 'data:image/jpeg;base64,AAAA' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ville: 'Rezé', zone: ['Rue A'], secteurs: [{ nom: 'S1' }] });
    expect(asked.input.messages[0].content[1].image_url.url).toBe('data:image/jpeg;base64,AAAA');
    expect((await call({ image: 'http://evil/x.png' })).status).toBe(400);
    expect((await call({ image: 'data:image/jpeg;base64,AAAA' }, 'https://evil.example')).status).toBe(403);
  });
});
