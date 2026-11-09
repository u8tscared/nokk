// Créer un secteur sans quitter l'écran : la carte dans la fenêtre, on trace, Nokk creuse, on crée.
import { useState, useEffect, useRef } from 'preact/hooks';
import maplibregl from 'maplibre-gl';
import { Icon } from '../ui/icons.jsx';
import { Button, IconButton, toast, Field, Avatar, confetti, Bump } from '../ui/ui.jsx';
import { fitSector } from '../ui/MapView.jsx';
import { buildStyle, tokens } from '../lib/mapstyle.js';
import { data, addSector, position, currentSector } from '../lib/store.js';
import { fetchOverpass, processOsm } from '../lib/osm.js';
import { planRoute } from '../lib/route.js';
import { bbox, centroid, projector } from '../lib/geo.js';
import { openSheet, closeAllSheets, go } from '../lib/nav.js';
import { feel } from '../lib/feedback.js';
import { inputKinds } from '../lib/keyboard.js';
import { startGeo } from '../lib/geoloc.js';

const fc = (features) => ({ type: 'FeatureCollection', features });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function openCreator(opts = {}) {
  closeAllSheets();
  setTimeout(() => openSheet(({ close }) => <SectorCreator close={close} {...opts} />, { label: 'Nouveau secteur', class: 'creator-sheet', noFocus: true }), 30);
}

function CountUp({ value, ms = 800 }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(value); return; }
    let raf, t0;
    const step = (t) => {
      t0 = t0 || t;
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{v.toLocaleString('fr-FR')}</>;
}

const STEPS = ['Fouiller le plan de la zone', 'Repérer les rues', 'Trouver les numéros', 'Calculer le parcours'];

export function SectorCreator({ close, photo: initialPhoto }) {
  const box = useRef();
  const mapRef = useRef();
  const [stage, setStage] = useState('draw'); // draw | dig | ready | error
  const [points, setPoints] = useState([]);
  const [poly, setPoly] = useState(null);
  const [digStep, setDigStep] = useState(0);
  const [found, setFound] = useState({ streets: 0, doors: 0 });
  const [result, setResult] = useState(null);
  const [radar, setRadar] = useState(null);
  const [photo, setPhoto] = useState(initialPhoto || null);
  const [showPhoto, setShowPhoto] = useState(!!initialPhoto);
  const [radius, setRadius] = useState(false);
  const n = data.value.sectors.length + 1;
  const [name, setName] = useState(`Secteur ${n}`);
  const [crew, setCrew] = useState(data.value.crew?.length ? data.value.crew : [data.value.meId].filter(Boolean));
  const abort = useRef();
  const stageRef = useRef(stage);
  stageRef.current = stage;

  // Carte
  useEffect(() => {
    const t = tokens();
    const cur = currentSector.value;
    const pos = position.value?.p;
    const center = pos || (cur?.polygon?.length ? centroid(cur.polygon) : [2.35, 46.6]);
    const map = new maplibregl.Map({
      container: box.current, style: buildStyle(t), center, zoom: pos ? 16.2 : cur ? 15 : 5,
      attributionControl: false, pitchWithRotate: false, dragRotate: false, touchPitch: false, maxZoom: 19.5, fadeDuration: 120,
    });
    mapRef.current = map;
    window.__nokkCreatorMap = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© OpenStreetMap' }), 'bottom-right');
    map.touchZoomRotate.disableRotation();
    map.on('error', () => {});
    map.on('style.load', () => {
      const others = fc(data.value.sectors.filter((s) => s.polygon?.length > 2).map((s) => ({ type: 'Feature', properties: { name: s.name }, geometry: { type: 'Polygon', coordinates: [[...s.polygon, s.polygon[0]]] } })));
      map.addSource('others', { type: 'geojson', data: others });
      for (const k of ['draw', 'fstreets', 'fdoors', 'fnew', 'froute', 'mask']) map.addSource(k, { type: 'geojson', data: fc([]) });
      map.addLayer({ id: 'mask', type: 'fill', source: 'mask', paint: { 'fill-color': t.ink, 'fill-opacity': 0.42, 'fill-opacity-transition': { duration: 600 } } });
      map.addLayer({ id: 'others-fill', type: 'fill', source: 'others', paint: { 'fill-color': t.muted, 'fill-opacity': 0.08 } });
      map.addLayer({ id: 'others-line', type: 'line', source: 'others', paint: { 'line-color': t.muted, 'line-width': 1, 'line-dasharray': [3, 2.5], 'line-opacity': 0.6 } });
      map.addLayer({ id: 'draw-fill', type: 'fill', source: 'draw', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': t.coral, 'fill-opacity': 0.1 } });
      map.addLayer({ id: 'draw-line', type: 'line', source: 'draw', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': t.coral, 'line-width': 2.5 } });
      map.addLayer({ id: 'fstreets', type: 'line', source: 'fstreets', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': t.accent, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 2, 17, 6], 'line-opacity': 0.85 } });
      map.addLayer({ id: 'fdoors', type: 'circle', source: 'fdoors', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 1.6, 17, 4.5], 'circle-color': ['case', ['>', ['get', 'flats'], 1], t.info || t.accent, t.paper], 'circle-stroke-color': t.ink, 'circle-stroke-width': 1.2 } });
      map.addLayer({ id: 'froute', type: 'line', source: 'froute', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': t.ink, 'line-width': 2.5, 'line-dasharray': [0.1, 1.8] } });
      map.addLayer({ id: 'fnew', type: 'circle', source: 'fnew', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 5, 17, 13], 'circle-color': t.coral, 'circle-opacity': 0.35, 'circle-stroke-color': t.coral, 'circle-stroke-width': 2, 'circle-stroke-opacity': 0.8 } });
      map.addLayer({ id: 'draw-pts', type: 'circle', source: 'draw', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 7, 'circle-color': t.paper, 'circle-stroke-color': t.coral, 'circle-stroke-width': 3 } });
    });
    map.on('click', (e) => {
      if (stageRef.current !== 'draw') return;
      feel('tick');
      setPoints((pts) => [...pts, [e.lngLat.lng, e.lngLat.lat]]);
    });
    map.on('move', () => placeRadar());
    if (!pos) startGeo({ ask: false }).then(() => { const p = position.value?.p; if (p && stageRef.current === 'draw') map.easeTo({ center: p, zoom: 16.2 }); }).catch(() => {});
    return () => { abort.current?.abort(); map.remove(); mapRef.current = null; window.__nokkCreatorMap = null; };
  }, []);

  // Tracé affiché
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource('draw');
    const pts = poly || points;
    const feats = [
      ...(pts.length > 2 ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]]] } }] : []),
      ...(pts.length > 1 && pts.length < 3 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } }] : []),
      ...(poly ? [] : pts.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } }))),
    ];
    if (src) src.setData(fc(feats));
    else map?.once('style.load', () => map.getSource('draw')?.setData(fc(feats)));
  }, [points, poly]);

  function placeRadar(p = polyRef.current) {
    const map = mapRef.current;
    if (!map || !p || stageRef.current !== 'dig') { setRadar(null); return; }
    const b = bbox(p);
    const a = map.project([b[0], b[3]]), c = map.project([b[2], b[1]]);
    setRadar({ x: a.x, y: a.y, w: Math.max(80, c.x - a.x), h: Math.max(80, c.y - a.y) });
  }
  const polyRef = useRef(null);
  const [hud, setHud] = useState({ n: 0, label: 'On fouille le plan…' });

  async function dig(pg) {
    const map = mapRef.current;
    polyRef.current = pg;
    setPoly(pg);
    setStage('dig');
    stageRef.current = 'dig';
    setDigStep(0);
    setFound({ streets: 0, doors: 0 });
    setHud({ n: 0, label: 'On fouille le plan…' });
    for (const k of ['fstreets', 'fdoors', 'fnew', 'froute']) map?.getSource(k)?.setData(fc([]));
    // Tout s'assombrit sauf la zone : on voit où ça cherche.
    map?.getSource('mask')?.setData(fc([{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]], [...pg, pg[0]].slice().reverse()] } }]));
    feel('scan');
    const b = bbox(pg);
    map?.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: innerWidth >= 960 ? { top: 80, bottom: 80, left: 80, right: 440 } : { top: 80, bottom: 250, left: 36, right: 36 }, duration: 700, maxZoom: 17 });
    setTimeout(() => placeRadar(pg), 760);
    abort.current?.abort();
    abort.current = new AbortController();
    const t0 = performance.now();
    try {
      const json = await fetchOverpass(pg, { signal: abort.current.signal });
      const r = processOsm(json, pg);
      // On laisse le temps de voir que ça cherche.
      await wait(Math.max(0, 1600 - (performance.now() - t0)));
      // 1 · les rues se dessinent une par une
      setDigStep(1);
      const lines = r.streets.flatMap((st) => st.lines.map((l) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: l } })));
      const sN = Math.max(1, r.streets.length);
      for (let i = 1; i <= sN; i++) {
        const k = Math.ceil((lines.length * i) / sN);
        map?.getSource('fstreets')?.setData(fc(lines.slice(0, k)));
        setFound({ streets: i, doors: 0 });
        setHud({ n: Math.min(i, r.streets.length), label: r.streets.length > 1 ? 'rues trouvées' : 'rue trouvée' });
        if (i % 2) feel('tick');
        await wait(Math.max(60, Math.min(220, 1100 / sN)));
      }
      // 2 · les numéros tombent par paquets, chaque nouveau paquet brille
      setDigStep(2);
      const steps = Math.min(24, Math.max(6, Math.ceil(r.doors.length / 8)));
      const feat = (d) => ({ type: 'Feature', properties: { flats: d.flats || 1 }, geometry: { type: 'Point', coordinates: d.p } });
      for (let i = 1; i <= steps; i++) {
        const k0 = Math.ceil((r.doors.length * (i - 1)) / steps);
        const k = Math.ceil((r.doors.length * i) / steps);
        map?.getSource('fdoors')?.setData(fc(r.doors.slice(0, k).map(feat)));
        map?.getSource('fnew')?.setData(fc(r.doors.slice(k0, k).map(feat)));
        setFound({ streets: r.streets.length, doors: k });
        setHud({ n: k, label: k > 1 ? 'numéros trouvés' : 'numéro trouvé' });
        if (i % 3 === 0) feel('tick');
        await wait(75);
      }
      map?.getSource('fnew')?.setData(fc([]));
      // 3 · le parcours se trace
      setDigStep(3);
      setHud({ n: r.doors.length, label: 'on calcule le parcours…' });
      await wait(60);
      const plan = r.doors.length ? planRoute({ doors: r.doors, network: r.network, big: new Set(r.streets.filter((x) => x.big).map((x) => x.name)) }) : null;
      if (plan?.line?.length > 1) {
        const L = plan.line;
        for (let i = 1; i <= 12; i++) {
          map?.getSource('froute')?.setData(fc([{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: L.slice(0, Math.max(2, Math.ceil((L.length * i) / 12))) } }]));
          await wait(55);
        }
      }
      setDigStep(4);
      await wait(250);
      map?.getSource('mask')?.setData(fc([]));
      setResult({ ...r, plan });
      setStage('ready');
      stageRef.current = 'ready';
      setRadar(null);
      feel('done');
    } catch (e) {
      if (e.name === 'AbortError') return;
      map?.getSource('mask')?.setData(fc([]));
      setStage('error');
      stageRef.current = 'error';
      setRadar(null);
      feel('err');
    }
  }

  async function aroundMe(r) {
    let p = position.value?.p;
    if (!p) {
      const ok = await startGeo();
      p = position.value?.p;
      if (!ok || !p) { toast('Position introuvable. Touchez la carte pour tracer la zone.', { error: true }); return; }
    }
    const P = projector(p);
    const pg = Array.from({ length: 20 }, (_, i) => P.from([Math.cos((i / 20) * Math.PI * 2) * r, Math.sin((i / 20) * Math.PI * 2) * r]));
    setPoints(pg);
    dig(pg);
  }

  function redraw() {
    abort.current?.abort();
    polyRef.current = null;
    setPoly(null); setPoints([]); setResult(null); setStage('draw'); stageRef.current = 'draw'; setRadar(null);
    mapRef.current?.getSource('fstreets')?.setData(fc([]));
    mapRef.current?.getSource('fdoors')?.setData(fc([]));
  }

  function create() {
    const r = result || { streets: [], network: [], doors: [] };
    const area = r.streets.length ? [...r.doors.reduce((m, d) => m.set(d.street, (m.get(d.street) || 0) + 1), new Map()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0] : '';
    const s = addSector({
      name: name.trim() || `Secteur ${n}`,
      area: (area || '').replace(/^(Rue|Avenue|Chemin|Place|Impasse|Allée|Boulevard) (de la |des |du |de l'|de )?/i, ''),
      polygon: poly, streets: r.streets, network: r.network, assignees: crew, photos: photo ? [photo] : [], source: 'osm',
    }, r.doors);
    feel('done');
    confetti();
    toast(`${s.name} créé · ${r.doors.length} portes`);
    closeAllSheets();
    go('carte');
    setTimeout(() => fitSector(s), 350);
  }

  const pts = points.length;
  const members = data.value.members;
  const units = result ? result.doors.reduce((s, d) => s + (d.flats || 1), 0) : 0;
  const buildings = result ? result.doors.filter((d) => d.flats > 1).length : 0;

  return (
    <div class="creator">
      <div ref={box} class="creator-map" data-free aria-label="Carte pour tracer le secteur" role="region" data-testid="creator-map" />
      {radar && (
        <div class="scanbox" style={{ left: radar.x + 'px', top: radar.y + 'px', width: radar.w + 'px', height: radar.h + 'px' }}>
          <i class="beam" />
          <span class="corner tl" /><span class="corner tr" /><span class="corner bl" /><span class="corner br" />
          <div class="hud-wrap">
            <div class="hud" key={hud.label}>
              <b class="hud-n"><Bump value={hud.n}>{hud.n}</Bump></b>
              <span class="hud-l">{hud.label}</span>
            </div>
          </div>
        </div>
      )}

      <div class="creator-top">
        {stage === 'draw' && (
          <div class="creator-hint">
            <Icon name="draw" />
            <span>{pts < 3 ? <>Touchez la carte pour poser les coins de votre zone · <b>{pts}/3</b></> : <>Encore des coins, ou <b>Terminer</b></>}</span>
          </div>
        )}
        {stage !== 'draw' && <div class="grow" />}
        {photo && <IconButton icon="photo" label="Voir la photo du plan" onClick={() => setShowPhoto(!showPhoto)} />}
        <IconButton icon="x" label="Fermer" onClick={close} />
      </div>
      {photo && showPhoto && <img class="plan-photo" src={photo} alt="Photo du plan reçu" onClick={() => setShowPhoto(false)} style={{ top: '70px' }} />}

      {stage === 'draw' && (
        <div class="creator-bottom">
          <div class="creator-tools" data-free>
            {radius ? (
              <>
                {[150, 250, 400].map((r) => <button class="chip" key={r} onClick={() => { setRadius(false); aroundMe(r); }}>{r} m autour de moi</button>)}
                <button class="chip" onClick={() => setRadius(false)}>Annuler</button>
              </>
            ) : (
              <>
                <button class="chip" onClick={() => setRadius(true)}><Icon name="locate" size={18} /> Autour de moi</button>
                <label class="chip" for="cphoto"><Icon name="photo" size={18} /> Photo du plan</label>
                <button class="chip" onClick={async () => { close(); const { openImportList } = await import('./SectorNew.jsx'); setTimeout(openImportList, 320); }}><Icon name="list" size={18} /> Liste d'adresses</button>
              </>
            )}
            <input id="cphoto" type="file" accept="image/*" hidden onChange={async (e) => {
              const f = e.currentTarget.files?.[0];
              if (!f) return;
              const { shrink } = await import('./SectorNew.jsx');
              setPhoto(await shrink(f)); setShowPhoto(true);
              toast('Photo ajoutée · tracez la zone en la regardant');
            }} />
          </div>
          <div class="creator-bar">
            <Button kind="ghost small" icon="back" disabled={!pts} onClick={() => setPoints(points.slice(0, -1))}>Retirer</Button>
            <Button kind="coral small" disabled={pts < 3} onClick={() => dig(points)} data-testid="draw-done">Terminer</Button>
          </div>
        </div>
      )}

      {stage !== 'draw' && (
        <div class="creator-panel">
          {(stage === 'dig' || stage === 'ready') && (
            <>
              {stage === 'dig' ? (
                <div class="dig" role="status" aria-live="polite">
                  <h2 class="dig-title"><span class="dig-ico"><Icon name="search" /></span> Nokk fouille votre zone</h2>
                  <div class="dig-bar"><i /></div>
                  <div class="dig-steps">
                    {STEPS.map((label, i) => (
                      <div key={label} class={'dig-step' + (digStep > i ? ' ok' : digStep === i ? ' now' : '')}>
                        <span class="dot">{digStep > i && <Icon name="check" />}</span>
                        {label}
                        {i === 1 && digStep >= 1 && <span class="n">{found.streets} rues</span>}
                        {i === 2 && digStep >= 2 && <span class="n">{found.doors} portes</span>}
                      </div>
                    ))}
                  </div>
                  <p class="tiny muted">Données OpenStreetMap · quelques secondes</p>
                </div>
              ) : (
                <>
                  <div class="hrow between"><h2>C'est trouvé</h2><button class="link-btn" onClick={redraw}>Retracer</button></div>
                  <div class="found">
                    <div><div class="big-num"><CountUp value={result.doors.length} /></div><div class="tiny muted">portes</div></div>
                    <div><div class="big-num"><CountUp value={units} /></div><div class="tiny muted">logements{buildings ? ` · ${buildings} imm.` : ''}</div></div>
                    <div><div class="big-num">{result.plan ? `${Math.floor(result.plan.minutes / 60)} h ${String(result.plan.minutes % 60).padStart(2, '0')}` : '–'}</div><div class="tiny muted">de tournée</div></div>
                  </div>
                  {result.doors.length === 0 && <p class="small muted">Aucun numéro trouvé ici. Vous pourrez ajouter les portes à la main.</p>}
                </>
              )}
              {stage === 'ready' && <Field id="sname" label="Nom du secteur">
                <input id="sname" class="input" value={name} onInput={(e) => setName(e.currentTarget.value)} {...inputKinds.text} enterKeyHint="done" />
              </Field>}
              {stage === 'ready' && members.length > 0 && (
                <div class="field">
                  <span class="label">Qui fait ce secteur ?</span>
                  <div class="chips">
                    {members.map((m) => (
                      <button class="chip" key={m.id} aria-pressed={crew.includes(m.id) ? 'true' : 'false'} onClick={() => { feel('tick'); setCrew(crew.includes(m.id) ? crew.filter((x) => x !== m.id) : [...crew, m.id]); }}>
                        <Avatar m={m} /> {m.name.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {stage === 'ready' && <Button kind="full" sound="" onClick={create} data-testid="create-sector">Créer le secteur</Button>}
            </>
          )}
          {stage === 'error' && (
            <>
              <h2>Petit souci de réseau</h2>
              <p class="small muted">Impossible de récupérer les adresses pour l'instant. Réessayez, ou créez le secteur et ajoutez les portes à la main.</p>
              <Field id="sname" label="Nom du secteur">
                <input id="sname" class="input" value={name} onInput={(e) => setName(e.currentTarget.value)} {...inputKinds.text} enterKeyHint="done" />
              </Field>
              <div class="stack s8">
                <Button kind="full" icon="repeat" onClick={() => dig(poly)}>Réessayer</Button>
                <Button kind="soft full" onClick={create} data-testid="create-sector">Créer sans les adresses</Button>
                <button class="link-btn center" onClick={redraw}>Retracer la zone</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
