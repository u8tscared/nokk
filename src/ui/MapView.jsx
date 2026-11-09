import { useEffect, useRef } from 'preact/hooks';
import { effect, signal } from '@preact/signals';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { buildStyle, overlayLayers, tokens } from '../lib/mapstyle.js';
import { data, currentSector, position, demo, memberById } from '../lib/store.js';
import { doorStates, route, nextDoor, streetFeatures, guidePath } from '../lib/tour.js';
import { bbox } from '../lib/geo.js';

export const follow = signal(false);
export const showRoute = signal(true);
export const drawing = signal(null); // null | { points: [[lon,lat]...] }
export const mapReady = signal(false);
export let mapInstance = null;

const fc = (features) => ({ type: 'FeatureCollection', features });

function circlePoly(center, meters, n = 40) {
  const out = [];
  const kx = 111320 * Math.cos((center[1] * Math.PI) / 180);
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([center[0] + (Math.cos(a) * meters) / kx, center[1] + (Math.sin(a) * meters) / 110540]);
  }
  return out;
}

function sourcesData() {
  const d = data.value;
  const cur = currentSector.value;
  const states = doorStates.value;
  const sectors = fc(d.sectors.filter((s) => s.polygon?.length > 2).map((s) => ({
    type: 'Feature', properties: { id: s.id, current: s.id === cur?.id },
    geometry: { type: 'Polygon', coordinates: [[...s.polygon, s.polygon[0]]] },
  })));
  const doors = fc(d.doors.filter((x) => x.sectorId === cur?.id).map((x) => ({
    type: 'Feature', properties: { id: x.id, num: x.num, state: states.get(x.id)?.state || 'todo' },
    geometry: { type: 'Point', coordinates: x.p },
  })));
  const streets = fc(streetFeatures(cur, d.meId));
  const r = route.value;
  const routeFc = fc(showRoute.value && r && r.line.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: r.line.slice(0, 400) } }] : []);
  const pos = position.value;
  const acc = fc(pos && pos.acc > 12 ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circlePoly(pos.p, Math.min(pos.acc, 300))] } }] : []);
  const dr = drawing.value;
  const draw = fc(dr ? [
    ...(dr.points.length > 2 ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...dr.points, dr.points[0]]] } }] : []),
    ...(dr.points.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: dr.points } }] : []),
    ...dr.points.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } })),
  ] : []);
  const gp = guidePath.value;
  const guideFc = fc(gp ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: gp.line } }] : []);
  return { sectors, doors, streets, 'streets-label': streets, 'doors-label': doors, route: showRoute.value && !gp ? routeFc : fc([]), acc, draw, guide: guideFc };
}

function addOverlays(map) {
  const src = sourcesData();
  for (const [k, v] of Object.entries(src)) {
    if (!map.getSource(k)) map.addSource(k, { type: 'geojson', data: v });
  }
  for (const l of overlayLayers(tokens())) if (!map.getLayer(l.id)) map.addLayer(l);
}

function el(cls, html = '') {
  const e = document.createElement('div');
  e.className = cls;
  e.innerHTML = html;
  return e;
}

export function fitSector(s, { animate = true } = {}) {
  if (!mapInstance || !s) return;
  const pts = s.polygon?.length ? s.polygon : (data.value.doors.filter((d) => d.sectorId === s.id).map((d) => d.p));
  if (!pts.length) return;
  const b = bbox(pts);
  const wide = innerWidth >= 700;
  mapInstance.fitBounds([[b[0], b[1]], [b[2], b[3]]], {
    padding: wide ? { top: 90, bottom: 60, left: innerWidth >= 960 ? 340 : 40, right: 380 } : { top: 80, bottom: 270, left: 24, right: 24 },
    duration: animate ? 900 : 0, maxZoom: 17.3,
  });
}

export function fitLine(line) {
  if (!mapInstance || !line?.length) return;
  const b = bbox(line);
  const wide = innerWidth >= 700;
  mapInstance.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: wide ? { top: 90, bottom: 80, left: innerWidth >= 960 ? 60 : 40, right: 400 } : { top: 90, bottom: 260, left: 40, right: 40 }, duration: 800, maxZoom: 18 });
}

export function flyTo(p, zoom = 17.6) {
  mapInstance?.easeTo({ center: p, zoom: Math.max(mapInstance.getZoom(), zoom), duration: 700, padding: innerWidth >= 700 ? { right: 360, top: 0, bottom: 0, left: 0 } : { bottom: 240, top: 0, left: 0, right: 0 } });
}

export function MapView({ onDoor, visible = true }) {
  const box = useRef();

  useEffect(() => {
    const t = tokens();
    const sector = currentSector.value;
    const center = sector?.polygon?.length ? sector.polygon[0] : [2.35, 46.6];
    const map = new maplibregl.Map({
      container: box.current,
      style: buildStyle(t),
      center,
      zoom: sector ? 15.5 : 5,
      attributionControl: false,
      pitchWithRotate: false,
      dragRotate: true,
      touchPitch: false,
      maxZoom: 20,
      fadeDuration: 150,
    });
    mapInstance = map;
    window.__nokkMap = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© OpenStreetMap · OpenFreeMap' }), 'top-left');
    map.touchZoomRotate.disableRotation();

    let ready = false;
    const disposers = [];
    map.on('style.load', () => {
      addOverlays(map);
      ready = true;
      mapReady.value = true;
    });
    map.on('load', () => { if (sector) fitSector(sector, { animate: false }); });
    map.on('error', () => {}); // tuiles injoignables hors ligne : la carte continue avec nos calques

    // Interactions
    map.on('dragstart', () => { follow.value = false; });
    map.on('click', (e) => {
      if (drawing.value) {
        drawing.value = { points: [...drawing.value.points, [e.lngLat.lng, e.lngLat.lat]] };
        return;
      }
      const f = map.queryRenderedFeatures([[e.point.x - 14, e.point.y - 14], [e.point.x + 14, e.point.y + 14]], { layers: ['doors'] });
      if (f.length) {
        // La plus proche du doigt
        let best = f[0], bd = Infinity;
        for (const x of f) {
          const pp = map.project(x.geometry.coordinates);
          const d = Math.hypot(pp.x - e.point.x, pp.y - e.point.y);
          if (d < bd) { bd = d; best = x; }
        }
        onDoor?.(best.properties.id);
      }
    });
    map.on('mouseenter', 'doors', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'doors', () => { map.getCanvas().style.cursor = ''; });

    // Marqueurs : moi, porte suivante, équipe en direct
    const meEl = el('me-marker', '<i class="cone"></i><b></b>');
    const meMarker = new maplibregl.Marker({ element: meEl, rotationAlignment: 'map' });
    const nextEl = el('next-marker', '<span></span>');
    const nextMarker = new maplibregl.Marker({ element: nextEl });
    nextEl.addEventListener('click', (ev) => { ev.stopPropagation(); const n = nextDoor.value; if (n) onDoor?.(n.id); });
    const teamEl = el('team-marker');
    const teamMarker = new maplibregl.Marker({ element: teamEl, anchor: 'bottom' });

    // Mise à jour des données (sans rejouer d'animation)
    disposers.push(effect(() => {
      const src = sourcesData();
      if (!ready) return;
      for (const [k, v] of Object.entries(src)) map.getSource(k)?.setData(v);
    }));
    disposers.push(effect(() => {
      const pos = position.value;
      if (!pos) { meMarker.remove(); return; }
      meMarker.setLngLat(pos.p).addTo(map);
      meEl.classList.toggle('has-heading', pos.heading != null);
      if (pos.heading != null) meEl.style.setProperty('--hd', pos.heading + 'deg');
      if (follow.value) map.easeTo({ center: pos.p, duration: 600, zoom: Math.max(map.getZoom(), 17.2), padding: innerWidth >= 700 ? { right: 360, left: 0, top: 0, bottom: 0 } : { bottom: 240, top: 0, left: 0, right: 0 } });
    }));
    disposers.push(effect(() => {
      const g = guidePath.value;
      const n = g ? g.door : nextDoor.value;
      if (!n || drawing.value) { nextMarker.remove(); return; }
      nextMarker.setLngLat(n.p).addTo(map);
    }));
    disposers.push(effect(() => {
      // Équipe en direct : dernière porte d'un binôme qui n'est pas le mien, il y a moins de 15 min
      const d = data.value;
      const crew = new Set(d.crew || []);
      const recent = [...d.visits].reverse().find((v) => Date.now() - v.ts < 15 * 60e3 && !(v.by || []).some((b) => crew.has(b)));
      if (!recent) { teamMarker.remove(); return; }
      const door = d.doors.find((x) => x.id === recent.doorId);
      if (!door) { teamMarker.remove(); return; }
      const names = (recent.by || []).map((id) => memberById.value.get(id)).filter(Boolean);
      const mins = Math.max(1, Math.round((Date.now() - recent.ts) / 60e3));
      const sect = d.sectors.find((s) => s.id === recent.sectorId);
      const sum = d.visits.filter((v) => v.sectorId === recent.sectorId && v.result === 'donne' && new Date(v.ts).toDateString() === new Date().toDateString()).reduce((s, v) => s + v.amount, 0);
      teamEl.innerHTML = `<div class="tm-card"><div class="tm-top">${names.map((m) => m.name.split(' ')[0]).join(' · ')} · il y a ${mins} min</div><div class="tm-main">${door.street} · ${(sum / 100).toLocaleString('fr-FR')} €</div></div><div class="tm-dot"></div>`;
      teamEl.title = sect ? sect.name : '';
      teamMarker.setLngLat(door.p).addTo(map);
    }));
    // Changement de thème : on recolore la carte.
    const mo = new MutationObserver(() => restyle());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const restyle = () => {
      ready = false;
      map.setStyle(buildStyle(tokens()), { diff: false });
    };
    mq.addEventListener?.('change', restyle);

    return () => {
      disposers.forEach((d) => d());
      mo.disconnect();
      mq.removeEventListener?.('change', restyle);
      map.remove();
      mapInstance = null;
      mapReady.value = false;
    };
  }, []);

  useEffect(() => {
    if (visible && mapInstance) setTimeout(() => mapInstance?.resize(), 30);
  }, [visible]);

  return <div ref={box} class="map-box" data-free aria-label="Carte du secteur" role="region" />;
}
