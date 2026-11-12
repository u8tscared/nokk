import { describe, it, expect, vi, afterEach } from 'vitest';

const photonBody = { features: [
  { geometry: { coordinates: [4.835, 45.775] }, properties: { countrycode: 'FR', housenumber: '36', street: 'Rue Hénon', postcode: '69004', city: 'Lyon', type: 'house', osm_key: 'place' } },
  { geometry: { coordinates: [4.83, 45.776] }, properties: { countrycode: 'FR', name: 'Rue Hénon', postcode: '69004', city: 'Lyon', type: 'street', osm_key: 'highway' } },
  { geometry: { coordinates: [4.831, 45.777] }, properties: { countrycode: 'FR', name: 'Rue Hénon', postcode: '69004', city: 'Lyon', type: 'street', osm_key: 'highway' } },
  { geometry: { coordinates: [4.83, 45.77] }, properties: { countrycode: 'FR', name: 'Boulangerie Hénon', type: 'house', osm_key: 'shop' } },
  { geometry: { coordinates: [4.85, 45.79] }, properties: { countrycode: 'FR', name: 'Caluire-et-Cuire', postcode: '69300', county: 'Rhône', type: 'city', osm_key: 'place' } },
  { geometry: { coordinates: [4.3, 50.8] }, properties: { countrycode: 'BE', name: 'Rue Hénon', type: 'street', osm_key: 'highway' } },
] };

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('recherche d\'adresse', () => {
  it('lit Photon : adresses, rues sans doublon, communes ; pas de commerces ni d\'étranger', async () => {
    const { fromPhoton } = await import('../../src/lib/adresse.js');
    const r = fromPhoton(photonBody.features);
    expect(r.map((x) => [x.kind, x.label, x.sub])).toEqual([
      ['housenumber', '36 Rue Hénon', '69004 Lyon'],
      ['street', 'Rue Hénon', '69004 Lyon'],
      ['municipality', 'Caluire-et-Cuire', '69300 Rhône'],
    ]);
  });

  it('IGN en panne (504) : les résultats viennent de Photon', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (u) => {
      calls.push(String(u));
      if (String(u).includes('geopf')) return new Response('{"message":"timeout"}', { status: 504 });
      return new Response(JSON.stringify(photonBody), { status: 200 });
    }));
    const { searchAddress } = await import('../../src/lib/adresse.js');
    const r = await searchAddress('36 rue henon');
    expect(r[0]).toMatchObject({ label: '36 Rue Hénon', kind: 'housenumber', p: [4.835, 45.775] });
    // Ensuite on n'attend plus l'IGN pendant un moment.
    calls.length = 0;
    await searchAddress('rue henon lyon');
    expect(calls.some((u) => u.includes('geopf'))).toBe(false);
  });

  it('IGN qui répond : ses résultats passent en premier', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u) => {
      if (String(u).includes('geopf')) return new Response(JSON.stringify({ features: [{ geometry: { coordinates: [1, 2] }, properties: { type: 'housenumber', name: '36 Rue Hénon', postcode: '69004', city: 'Lyon' } }] }), { status: 200 });
      return new Response(JSON.stringify(photonBody), { status: 200 });
    }));
    const { searchAddress } = await import('../../src/lib/adresse.js');
    const r = await searchAddress('36 rue henon');
    expect(r).toEqual([{ label: '36 Rue Hénon', sub: '69004 Lyon', p: [1, 2], kind: 'housenumber' }]);
  });

  it('IGN et Photon en panne : Nominatim prend le relais', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u) => {
      if (String(u).includes('nominatim')) return new Response(JSON.stringify([{ lon: '4.835', lat: '45.775', address: { house_number: '36', road: 'Rue Hénon', postcode: '69004', city: 'Lyon' } }]), { status: 200 });
      throw new TypeError('Failed to fetch');
    }));
    const { searchAddress } = await import('../../src/lib/adresse.js');
    const r = await searchAddress('36 rue henon');
    expect(r[0]).toMatchObject({ label: '36 Rue Hénon', sub: '69004 Lyon', kind: 'housenumber' });
  });

  it('tout en panne : une erreur, pour afficher « recherche indisponible »', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const { searchAddress } = await import('../../src/lib/adresse.js');
    await expect(searchAddress('36 rue henon')).rejects.toThrow();
  });
});
