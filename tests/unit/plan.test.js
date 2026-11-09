import { describe, it, expect } from 'vitest';
import { hull, simplify, alike, norm } from '../../src/lib/plan.js';
import worker, { parsePlan } from '../../worker/index.js';

describe('photo de plan → tracé', () => {
  it('lit la réponse du modèle même entourée de texte', () => {
    const p = parsePlan('Voici :\n```json\n{"ville":"REZÉ","code_postal":null,"zone":["Rue des Déportés","Rue du Château"],"rues":["Rue du Château","Avenue X"],"adresses":[]}\n```');
    expect(p).toEqual({ ville: 'REZÉ', cp: null, zone: ['Rue des Déportés', 'Rue du Château'], rues: ['Avenue X'], adresses: [] });
    expect(parsePlan('{"zone_rues":["Rue A bis"]}').zone).toEqual(['Rue A bis']);
    expect(parsePlan('pas de json')).toBeNull();
  });

  it('compare les noms de rue sans se faire avoir par le géocodeur', () => {
    expect(alike('Rue des Deportes', 'Rue des Déportés')).toBe(1);
    expect(alike('rue alsace lorraine', 'Rue Alsace-Lorraine')).toBe(1);
    expect(alike('Avenue de la Vence', 'Avenue de la Houssais')).toBe(0);
    expect(norm("Allée de l'Église")).toBe('eglise');
  });

  it('enveloppe convexe et simplification', () => {
    const pts = [[0, 0], [2, 0], [2, 2], [0, 2], [1, 1], [1, 0.1]];
    expect(hull(pts).length).toBe(4);
    const circle = Array.from({ length: 40 }, (_, i) => [Math.cos(i / 6.4), Math.sin(i / 6.4)]);
    expect(simplify(hull(circle), 12).length).toBe(12);
  });

  it('API : lecture de plan depuis l\'app seulement, image vérifiée', async () => {
    let asked = null;
    const env = { AI: { run: async (model, input) => { asked = { model, input }; return { response: '{"ville":"Rezé","zone":["Rue A"]}' }; } } };
    const call = (body, origin = 'https://u8tscared.github.io') => worker.fetch(new Request('https://api.test/plan/read', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env);
    const ok = await call({ image: 'data:image/jpeg;base64,AAAA' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ville: 'Rezé', zone: ['Rue A'] });
    expect(asked.input.messages[0].content[1].image_url.url).toBe('data:image/jpeg;base64,AAAA');
    expect((await call({ image: 'http://evil/x.png' })).status).toBe(400);
    expect((await call({ image: 'data:image/jpeg;base64,AAAA' }, 'https://evil.example')).status).toBe(403);
  });
});
