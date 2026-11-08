import { useState, useEffect, useRef } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Button, IconButton, toast, Field, Avatar, confetti, DotIcon } from '../ui/ui.jsx';
import { drawing, mapInstance, fitSector } from '../ui/MapView.jsx';
import { data, addSector, position, online } from '../lib/store.js';
import { fetchOverpass, processOsm } from '../lib/osm.js';
import { planRoute } from '../lib/route.js';
import { bbox, centroid, projector, dist, convexHull, inflate } from '../lib/geo.js';
import { openSheet, closeAllSheets, go } from '../lib/nav.js';
import { feel } from '../lib/feedback.js';
import { inputKinds } from '../lib/keyboard.js';
import { startGeo } from '../lib/geoloc.js';

let pendingPhotos = [];

export function startDrawing() {
  closeAllSheets();
  go('carte');
  drawing.value = { points: [] };
  setTimeout(() => {
    const p = position.value?.p;
    if (p && mapInstance) mapInstance.easeTo({ center: p, zoom: 16.2 });
  }, 200);
}

export function DrawBar() {
  const pts = drawing.value.points;
  const [photo, setPhoto] = useState(false);
  return (
    <>
      <div class="draw-top">
        <div class="draw-hint">
          <Icon name="draw" />
          <span>{pts.length < 3 ? `Touchez la carte pour poser les coins de votre zone (${pts.length}/3 minimum)` : 'Ajoutez des coins ou terminez'}</span>
        </div>
        {pendingPhotos.length > 0 && <IconButton icon="photo" label="Voir la photo du plan" onClick={() => setPhoto(!photo)} />}
      </div>
      {photo && pendingPhotos[0] && <img class="plan-photo" src={pendingPhotos[0]} alt="Photo du plan reçu" onClick={() => setPhoto(false)} />}
      <div class="draw-bar">
        <Button kind="ghost small" onClick={() => { drawing.value = null; pendingPhotos = []; }}>Annuler</Button>
        <Button kind="ghost small" icon="back" disabled={!pts.length} onClick={() => { drawing.value = { points: pts.slice(0, -1) }; }}>Retirer</Button>
        <Button kind="coral small" disabled={pts.length < 3} onClick={() => { const poly = pts; drawing.value = null; openNewSector(poly); }} data-testid="draw-done">Terminer</Button>
      </div>
    </>
  );
}

export function openNewSector(polygon, extra = {}) {
  openSheet(({ close }) => <NewSector polygon={polygon} close={close} {...extra} />, { label: 'Nouveau secteur', noFocus: true });
}

function NewSector({ polygon, close, preset }) {
  const n = data.value.sectors.length + 1;
  const [name, setName] = useState(`Secteur ${n}`);
  const [state, setState] = useState(preset ? 'ready' : 'loading');
  const [result, setResult] = useState(preset || null);
  const [crew, setCrew] = useState(data.value.crew?.length ? data.value.crew : [data.value.meId].filter(Boolean));
  const abort = useRef();

  async function load() {
    setState('loading');
    abort.current?.abort();
    abort.current = new AbortController();
    try {
      const json = await fetchOverpass(polygon, { signal: abort.current.signal });
      const r = processOsm(json, polygon);
      const plan = r.doors.length ? planRoute({ doors: r.doors, network: r.network, big: new Set(r.streets.filter((s) => s.big).map((s) => s.name)) }) : null;
      setResult({ ...r, plan });
      setState('ready');
      feel('scan');
    } catch (e) {
      if (e.name === 'AbortError') return;
      setState('error');
      feel('err');
    }
  }
  useEffect(() => { if (!preset) load(); return () => abort.current?.abort(); }, []);

  function create() {
    const r = result || { streets: [], network: [], doors: [] };
    const area = r.streets.length ? [...r.doors.reduce((m, d) => m.set(d.street, (m.get(d.street) || 0) + 1), new Map()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0] : '';
    const s = addSector({
      name: name.trim() || `Secteur ${n}`,
      area: (area || '').replace(/^(Rue|Avenue|Chemin|Place|Impasse|Allée|Boulevard) (de la |des |du |de l'|de )?/i, ''),
      polygon,
      streets: r.streets,
      network: r.network,
      assignees: crew,
      photos: pendingPhotos,
      source: r.source || 'osm',
    }, r.doors);
    pendingPhotos = [];
    feel('done');
    confetti();
    toast(`${s.name} créé · ${r.doors.length} portes`);
    close();
    go('carte');
    setTimeout(() => fitSector(s), 350);
  }

  const streets = result ? new Set(result.doors.map((d) => d.street)).size : 0;
  const members = data.value.members;

  return (
    <div class="stack">
      <div class="sheet-head"><h2>Nouveau secteur</h2></div>
      <Field id="sname" label="Nom du secteur">
        <input id="sname" class="input" value={name} onInput={(e) => setName(e.currentTarget.value)} {...inputKinds.text} enterKeyHint="done" />
      </Field>
      {state === 'loading' && (
        <div class="scan-card">
          <div class="scan-anim"><Icon name="search" /></div>
          <div><b>On cherche les rues et les numéros…</b><div class="tiny muted">Données OpenStreetMap, quelques secondes</div></div>
        </div>
      )}
      {state === 'error' && (
        <div class="scan-card tone-warn">
          <DotIcon icon="wifiOff" tone="warn" />
          <div class="grow"><b>Petit souci de réseau</b><div class="tiny muted">Impossible de récupérer les adresses pour l'instant.</div></div>
          <Button kind="small soft" onClick={load}>Réessayer</Button>
        </div>
      )}
      {state === 'ready' && result && (
        <div class="found">
          <div><div class="big-num">{result.doors.length}</div><div class="tiny muted">portes</div></div>
          <div><div class="big-num">{streets}</div><div class="tiny muted">rues</div></div>
          <div><div class="big-num">{result.plan ? `${Math.floor(result.plan.minutes / 60)} h ${String(result.plan.minutes % 60).padStart(2, '0')}` : '–'}</div><div class="tiny muted">de tournée</div></div>
        </div>
      )}
      {state === 'ready' && result && result.doors.length === 0 && <p class="small muted">Aucun numéro trouvé dans cette zone. Vous pourrez ajouter les portes à la main depuis la carte.</p>}
      {members.length > 0 && (
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
      <div class="sticky-action">
        <Button kind="full" sound="" disabled={state === 'loading'} onClick={create} data-testid="create-sector">{state === 'error' ? 'Créer sans les adresses' : 'Créer le secteur'}</Button>
      </div>
    </div>
  );
}

// ——— Création : choix de la méthode ———
export function openCreateChooser() {
  openSheet(({ close }) => <CreateChooser close={close} />, { label: 'Nouveau secteur' });
}

function CreateChooser({ close }) {
  const fileRef = useRef();
  const [radius, setRadius] = useState(null);
  async function aroundMe(r) {
    let p = position.value?.p;
    if (!p) {
      const ok = await startGeo();
      p = position.value?.p;
      if (!ok || !p) { toast('Position introuvable. Tracez la zone sur la carte à la place.', { error: true }); return; }
    }
    const P = projector(p);
    const poly = Array.from({ length: 16 }, (_, i) => P.from([Math.cos((i / 16) * Math.PI * 2) * r, Math.sin((i / 16) * Math.PI * 2) * r]));
    close();
    setTimeout(() => openNewSector(poly), 320);
  }
  return (
    <div class="stack">
      <div class="sheet-head"><h2>Nouveau secteur</h2></div>
      <p class="small muted">Nokk trouve tout seul les rues, les numéros et le meilleur parcours.</p>
      <div class="list card tight">
        <button class="row" onClick={startDrawing} data-testid="draw-sector">
          <DotIcon icon="draw" />
          <span class="grow"><span class="t">Tracer ma zone sur la carte</span><span class="s">Touchez les coins, c'est tout</span></span>
          <Icon name="chevR" class="chev" />
        </button>
        <button class="row" onClick={() => setRadius(radius ? null : 1)}>
          <DotIcon icon="locate" tone="info" />
          <span class="grow"><span class="t">Autour de ma position</span><span class="s">Un cercle de 150 à 400 m</span></span>
          <Icon name={radius ? 'chevD' : 'chevR'} class="chev" />
        </button>
        {radius && (
          <div class="chips" style={{ padding: '4px 12px 12px' }}>
            {[150, 250, 400].map((r) => <button class="chip" key={r} onClick={() => aroundMe(r)}>{r} m</button>)}
          </div>
        )}
        <button class="row" onClick={() => { close(); setTimeout(() => openSheet(({ close: c }) => <ImportList close={c} />, { label: 'Importer une liste' }), 320); }}>
          <DotIcon icon="list" tone="coral" />
          <span class="grow"><span class="t">Importer une liste d'adresses</span><span class="s">Copiée d'un tableau ou d'un mail</span></span>
          <Icon name="chevR" class="chev" />
        </button>
        <label class="row" for="planphoto">
          <DotIcon icon="photo" tone="warn" />
          <span class="grow"><span class="t">J'ai reçu une photo du plan</span><span class="s">Gardez-la sous les yeux pendant le tracé</span></span>
          <Icon name="chevR" class="chev" />
        </label>
        <input id="planphoto" ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
          const f = e.currentTarget.files?.[0];
          if (!f) return;
          pendingPhotos = [await shrink(f)];
          toast('Photo ajoutée · tracez maintenant la zone');
          startDrawing();
        }} />
      </div>
    </div>
  );
}

export async function shrink(file, max = 1400) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.78);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ——— Import d'une liste d'adresses (Base Adresse Nationale) ———
function ImportList({ close }) {
  const [text, setText] = useState('');
  const [city, setCity] = useState(data.value.org?.city || '');
  const [busy, setBusy] = useState(false);
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  async function run() {
    if (!lines.length) return;
    setBusy(true);
    try {
      const csv = 'adresse\n' + lines.map((l) => '"' + (l + (city && !l.toLowerCase().includes(city.toLowerCase()) ? ' ' + city : '')).replace(/"/g, "'") + '"').join('\n');
      const fd = new FormData();
      fd.append('data', new Blob([csv], { type: 'text/csv' }), 'adresses.csv');
      fd.append('columns', 'adresse');
      const r = await fetch('https://api-adresse.data.gouv.fr/search/csv/', { method: 'POST', body: fd });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const out = await r.text();
      const rows = parseCsv(out);
      const head = rows.shift();
      const col = (n) => head.indexOf(n);
      const doors = [];
      rows.forEach((row, i) => {
        const lat = parseFloat(row[col('latitude')]);
        const lon = parseFloat(row[col('longitude')]);
        const score = parseFloat(row[col('result_score')]);
        if (!isFinite(lat) || score < 0.4) return;
        doors.push({ id: 'i' + i.toString(36), street: row[col('result_street')] || row[col('result_name')], num: row[col('result_housenumber')] || '?', p: [lon, lat], snap: [lon, lat], line: 0, along: 0, flats: 1 });
      });
      if (!doors.length) throw new Error('aucune');
      // Ordonne par rue le long d'un axe pour un parcours cohérent.
      const c = centroid(doors.map((d) => d.p));
      const P = projector(c);
      const byStreet = new Map();
      doors.forEach((d) => { if (!byStreet.has(d.street)) byStreet.set(d.street, []); byStreet.get(d.street).push(d); });
      for (const list of byStreet.values()) {
        const pts = list.map((d) => P.to(d.p));
        const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        let sxx = 0, sxy = 0, syy = 0;
        pts.forEach((p) => { sxx += (p[0] - mx) ** 2; sxy += (p[0] - mx) * (p[1] - my); syy += (p[1] - my) ** 2; });
        const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
        list.forEach((d, k) => { d.along = Math.round((pts[k][0] - mx) * Math.cos(ang) + (pts[k][1] - my) * Math.sin(ang)); });
      }
      const poly = doors.length >= 3 ? inflate(convexHull(doors.map((d) => d.p)), 40) : inflate([[c[0] - 0.002, c[1] - 0.0015], [c[0] + 0.002, c[1] - 0.0015], [c[0] + 0.002, c[1] + 0.0015], [c[0] - 0.002, c[1] + 0.0015]], 0);
      // Les rues autour (tracé + réseau) si le réseau le permet ; sinon on fait sans.
      let streets = [], network = [];
      try {
        const osm = processOsm(await fetchOverpass(poly), poly);
        streets = osm.streets; network = osm.network;
      } catch {}
      const plan = planRoute({ doors, network });
      close();
      setTimeout(() => openNewSector(poly, { preset: { doors, streets, network, plan, source: 'import' } }), 320);
      toast(`${doors.length} adresses trouvées sur ${lines.length}`);
    } catch (e) {
      toast(e.message === 'aucune' ? 'Aucune adresse reconnue. Vérifiez la ville.' : 'Petit souci de réseau, réessayez dans un instant', { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="stack">
      <div class="sheet-head"><h2>Importer une liste</h2></div>
      <Field id="icity" label="Ville">
        <input id="icity" class="input" value={city} onInput={(e) => setCity(e.currentTarget.value)} {...inputKinds.name} placeholder="Ex. Rezé" />
      </Field>
      <Field id="ilist" label="Une adresse par ligne" hint={lines.length ? `${lines.length} adresses` : 'Ex. 12 rue des Lilas'}>
        <textarea id="ilist" class="input" rows={7} value={text} onInput={(e) => setText(e.currentTarget.value)} placeholder={'12 rue des Lilas\n14 rue des Lilas\n3 impasse du Moulin'} />
      </Field>
      <div class="sticky-action"><Button kind="full" sound="" disabled={!lines.length || busy} onClick={run}>{busy ? 'Recherche des adresses…' : 'Trouver les adresses'}</Button></div>
    </div>
  );
}

function parseCsv(s) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
