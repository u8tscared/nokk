// Style de carte « Le plan » : fond OpenFreeMap (vecteur, gratuit, sans clé) recoloré avec nos tokens.
// Hors ligne, sans tuiles, la carte garde le fond + nos rues de secteur : elle reste utilisable.
export const TILE_SOURCE = 'https://tiles.openfreemap.org/planet';
export const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

export function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    bg: v('--map-bg'), road: v('--map-road'), casing: v('--map-casing'), building: v('--map-building'),
    park: v('--map-park'), water: v('--map-water'), label: v('--map-label'), ink: v('--ink'), paper: v('--paper'),
    done: v('--st-done'), live: v('--st-live'), repasser: v('--st-repasser'), todo: v('--st-todo'),
    accent: v('--accent'), coral: v('--accent-2'), muted: v('--muted'), bad: v('--bad'),
  };
}

const W = (pairs) => ['interpolate', ['exponential', 1.6], ['zoom'], ...pairs];

export function buildStyle(t, { tiles = true } = {}) {
  const layers = [{ id: 'bg', type: 'background', paint: { 'background-color': t.bg } }];
  if (tiles) {
    layers.push(
      { id: 'landcover', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['grass', 'wood', 'farmland']]], paint: { 'fill-color': t.park, 'fill-opacity': 0.6 } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': t.park } },
      { id: 'landuse', type: 'fill', source: 'omt', 'source-layer': 'landuse', filter: ['in', ['get', 'class'], ['literal', ['cemetery', 'pitch', 'stadium', 'playground']]], paint: { 'fill-color': t.park, 'fill-opacity': 0.7 } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': t.water } },
      { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway', paint: { 'line-color': t.water, 'line-width': W([12, 1, 18, 6]) } },
      { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': t.building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, 1] } },
      { id: 'road-casing', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['!', ['in', ['get', 'class'], ['literal', ['path', 'track', 'rail', 'transit', 'ferry']]]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': t.casing, 'line-width': W([12, 1, 14, 3, 17, 16, 19, 40]) } },
      { id: 'path', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 15, filter: ['in', ['get', 'class'], ['literal', ['path', 'track']]], paint: { 'line-color': t.road, 'line-width': W([15, 1, 19, 4]), 'line-dasharray': [2, 1.5] } },
      { id: 'road', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['!', ['in', ['get', 'class'], ['literal', ['path', 'track', 'rail', 'transit', 'ferry']]]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': t.road, 'line-width': W([12, 0.5, 14, 2, 17, 13, 19, 36]) } },
      { id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'rail'], paint: { 'line-color': t.casing, 'line-width': 2, 'line-dasharray': [3, 3] } },
    );
  }
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: tiles ? { omt: { type: 'vector', url: TILE_SOURCE } } : {},
    layers,
  };
}

// Calques de Nokk (au-dessus du fond), ajoutés une fois la carte prête.
// Les textes ont leurs propres sources : sans réseau, une police introuvable ne doit pas effacer les rues.
export function overlayLayers(t, { labels = true } = {}) {
  const L = [
    { id: 'sector-fill', type: 'fill', source: 'sectors', paint: { 'fill-color': ['case', ['get', 'current'], t.accent, t.muted], 'fill-opacity': ['case', ['get', 'current'], 0.06, 0.04] } },
    { id: 'sector-line', type: 'line', source: 'sectors', paint: { 'line-color': ['case', ['get', 'current'], t.ink, t.muted], 'line-width': ['case', ['get', 'current'], 1.6, 1], 'line-opacity': ['case', ['get', 'current'], 0.55, 0.35], 'line-dasharray': [3, 2.5] } },
    { id: 'street-state', type: 'line', source: 'streets', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
      'line-color': ['match', ['get', 'state'], 'done', t.done, 'live', t.live, 'repasser', t.repasser, 'partial', t.done, t.todo],
      'line-opacity': ['match', ['get', 'state'], 'partial', 0.55, 'todo', 0.9, 1],
      'line-width': W([13, 2, 15, 4, 17, 7, 19, 12]),
    } },
    { id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': t.paper, 'line-width': W([14, 3, 18, 7]), 'line-opacity': 0.9 } },
    { id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': t.ink, 'line-width': W([14, 1.5, 18, 3.5]), 'line-dasharray': [0.1, 2] } },
    { id: 'doors', type: 'circle', source: 'doors', minzoom: 14.5, paint: {
      'circle-radius': W([14.5, 2, 16, 3.5, 18, 7, 19.5, 11]),
      'circle-color': ['match', ['get', 'state'], 'donne', t.done, 'absent', t.repasser, 'refus', t.bad, 'deja', t.muted, 'partiel', t.repasser, t.paper],
      'circle-stroke-color': ['match', ['get', 'state'], 'todo', t.ink, t.paper],
      'circle-stroke-width': ['match', ['get', 'state'], 'todo', 1.4, 1.2],
      'circle-stroke-opacity': ['match', ['get', 'state'], 'todo', 0.55, 1],
    } },
    { id: 'draw-fill', type: 'fill', source: 'draw', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': t.coral, 'fill-opacity': 0.12 } },
    { id: 'draw-line', type: 'line', source: 'draw', paint: { 'line-color': t.coral, 'line-width': 2.5 } },
    { id: 'draw-pts', type: 'circle', source: 'draw', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 7, 'circle-color': t.paper, 'circle-stroke-color': t.coral, 'circle-stroke-width': 3 } },
    { id: 'acc', type: 'fill', source: 'acc', paint: { 'fill-color': t.accent, 'fill-opacity': 0.12 } },
  ];
  if (labels) {
    L.splice(5, 0, { id: 'street-label', type: 'symbol', source: 'streets-label', minzoom: 15, layout: {
      'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': W([15, 10.5, 18, 13]), 'text-max-angle': 30, 'symbol-spacing': 320,
    }, paint: { 'text-color': t.label, 'text-halo-color': t.bg, 'text-halo-width': 1.6 } });
    L.push({ id: 'door-num', type: 'symbol', source: 'doors-label', minzoom: 17.2, layout: {
      'text-field': ['get', 'num'], 'text-font': ['Noto Sans Bold'], 'text-size': W([17.2, 9, 19.5, 12]), 'text-allow-overlap': false, 'text-offset': [0, -1.25],
    }, paint: { 'text-color': t.ink, 'text-halo-color': t.paper, 'text-halo-width': 1.6 } });
  }
  return L;
}
