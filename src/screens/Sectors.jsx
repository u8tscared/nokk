import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Button, IconButton, Progress, Avatar, Empty, toast, Field, DotIcon } from '../ui/ui.jsx';
import { data, byDoor, doorsBySector, setCurrentSector, memberById, removeSector, updateSector, addDoor, role, position, demo } from '../lib/store.js';
import { sectorStats, formatEuro, totals } from '../lib/model.js';
import { openSheet, go } from '../lib/nav.js';
import { feel } from '../lib/feedback.js';
import { fitSector, mapInstance } from '../ui/MapView.jsx';
import { openCreateChooser, shrink } from './SectorNew.jsx';
import { repasserMode } from '../lib/tour.js';
import { inputKinds } from '../lib/keyboard.js';
import { shareFile } from '../lib/share.js';
import { cacheSectorTiles } from '../lib/offline.js';
import { bbox } from '../lib/geo.js';

function SectorCard({ s }) {
  const doors = doorsBySector.value.get(s.id) || [];
  const st = sectorStats(doors, byDoor.value);
  const crew = (s.assignees || []).map((id) => memberById.value.get(id)).filter(Boolean);
  const current = data.value.currentSectorId === s.id;
  const tone = st.pct === 100 ? 'ok' : st.done ? 'coral' : 'muted';
  return (
    <div class={'sector-card card' + (current ? ' current' : '')}>
      <button class="sector-main" onClick={() => { feel('tap'); setCurrentSector(s.id); repasserMode.value = false; go('carte'); setTimeout(() => fitSector(s), 200); }} data-testid={'sector-' + s.id}>
        <div class="hrow between">
          <div class="grow">
            <div class="card-title">{s.name}</div>
            <div class="small muted">{s.area ? s.area + ' · ' : ''}{st.total} portes</div>
          </div>
          <span class={'pill tone-' + tone}>{st.pct === 100 ? 'Terminé' : st.done ? `${st.pct} %` : 'À faire'}</span>
        </div>
        <Progress label={`${st.pct} % fait`} parts={[
          { key: 'd', value: st.donne, color: 'var(--st-done)' },
          { key: 'a', value: st.absent + (st.partiel || 0), color: 'var(--st-repasser)' },
          { key: 'r', value: st.refus + st.deja, color: 'var(--muted)' },
          { key: 't', value: st.todo, color: 'transparent' },
        ]} />
        <div class="hrow between">
          <span class="avatars">{crew.map((m) => <Avatar m={m} key={m.id} />)}{!crew.length && <span class="tiny muted">Personne d'assigné</span>}</span>
          <span class="big-num" style={{ fontSize: 20 }}>{formatEuro(st.amount)}</span>
        </div>
      </button>
      <IconButton icon="more" label={'Options du ' + s.name} class="flat sector-more" onClick={() => openSheet(({ close }) => <SectorOptions s={s} close={close} />, { label: s.name })} />
    </div>
  );
}

function SectorOptions({ s, close }) {
  const [name, setName] = useState(s.name);
  const [busy, setBusy] = useState(false);
  const members = data.value.members;
  const assignees = s.assignees || [];
  const canEdit = role.value !== 'pompier';
  return (
    <div class="stack">
      <div class="sheet-head"><h2>{s.name}</h2></div>
      {canEdit && (
        <Field id="rname" label="Nom">
          <input id="rname" class="input" value={name} onInput={(e) => setName(e.currentTarget.value)} onBlur={() => name.trim() && updateSector(s.id, { name: name.trim() })} {...inputKinds.text} enterKeyHint="done" />
        </Field>
      )}
      <div class="field">
        <span class="label">Équipiers</span>
        <div class="chips">
          {members.map((m) => (
            <button class="chip" key={m.id} disabled={!canEdit} aria-pressed={assignees.includes(m.id) ? 'true' : 'false'} onClick={() => { feel('tick'); updateSector(s.id, { assignees: assignees.includes(m.id) ? assignees.filter((x) => x !== m.id) : [...assignees, m.id] }); close(); openSheet(({ close: c }) => <SectorOptions s={data.value.sectors.find((x) => x.id === s.id)} close={c} />, { label: s.name }); }}>
              <Avatar m={m} /> {m.name.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>
      {s.photos?.length > 0 && (
        <div class="field"><span class="label">Photo du plan</span><img class="plan-thumb" src={s.photos[0]} alt={'Plan du ' + s.name} /></div>
      )}
      <div class="list card tight">
        <button class="row" onClick={() => { close(); setTimeout(() => openSheet(({ close: c }) => <AddDoor s={s} close={c} />, { label: 'Ajouter une porte' }), 300); }}>
          <DotIcon icon="plus" sm /><span class="grow t">Ajouter une porte oubliée</span>
        </button>
        <label class="row" for={'ph-' + s.id}>
          <DotIcon icon="photo" sm tone="warn" /><span class="grow t">{s.photos?.length ? 'Remplacer la photo du plan' : 'Ajouter une photo du plan'}</span>
        </label>
        <input id={'ph-' + s.id} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.currentTarget.files?.[0]; if (!f) return; updateSector(s.id, { photos: [await shrink(f)] }); toast('Photo du plan ajoutée'); close(); }} />
        <button class="row" disabled={busy || demo.value} onClick={async () => {
          setBusy(true);
          const n = await cacheSectorTiles(bbox(s.polygon), (k, t) => {});
          setBusy(false);
          toast(n > 0 ? `Carte gardée hors ligne · ${n} morceaux` : 'Petit souci de réseau, réessayez', { error: n <= 0 });
        }}>
          <DotIcon icon="download" sm tone="info" /><span class="grow"><span class="t">{busy ? 'Téléchargement de la carte…' : 'Garder la carte hors ligne'}</span>{demo.value && <span class="s">Pas en démo</span>}</span>
        </button>
        <button class="row" onClick={() => shareSector(s)}>
          <DotIcon icon="share" sm tone="ok" /><span class="grow"><span class="t">Envoyer le secteur à un équipier</span><span class="s">Un fichier à ouvrir dans Nokk</span></span>
        </button>
        {canEdit && (
          <button class="row" onClick={() => { const undo = removeSector(s.id); close(); toast(`${s.name} supprimé`, { undo }); }}>
            <DotIcon icon="trash" sm tone="bad" /><span class="grow t" style={{ color: 'var(--bad)' }}>Supprimer le secteur</span>
          </button>
        )}
      </div>
    </div>
  );
}

function shareSector(s) {
  const d = data.value;
  const payload = {
    app: 'nokk', kind: 'secteur', exportedAt: new Date().toISOString(),
    org: d.org, members: d.members.map(({ pin, ...m }) => m),
    sectors: [s], doors: d.doors.filter((x) => x.sectorId === s.id), visits: d.visits.filter((v) => v.sectorId === s.id),
  };
  shareFile(`nokk-${s.name.toLowerCase().replace(/\W+/g, '-')}.nokk.json`, JSON.stringify(payload), 'application/json', `${s.name} · Nokk`);
}

function AddDoor({ s, close }) {
  const streets = [...new Set((doorsBySector.value.get(s.id) || []).map((d) => d.street))].sort((a, b) => a.localeCompare(b, 'fr'));
  const [street, setStreet] = useState(streets[0] || '');
  const [num, setNum] = useState('');
  const [flats, setFlats] = useState(1);
  return (
    <form class="stack" onSubmit={(e) => {
      e.preventDefault();
      if (!num.trim() || !street.trim()) { toast('Il manque le numéro ou la rue', { error: true }); return; }
      const c = position.value?.p || (mapInstance ? mapInstance.getCenter().toArray() : s.polygon[0]);
      const d = addDoor({ sectorId: s.id, street: street.trim(), num: num.trim(), p: c, snap: c, line: 0, along: 0, flats });
      feel('ok');
      toast(`${d.num} ${d.street} ajouté`);
      close();
    }}>
      <div class="sheet-head"><h2>Ajouter une porte</h2></div>
      <p class="small muted">Elle sera placée {position.value ? 'à votre position' : 'au centre de la carte'}.</p>
      <Field id="anum" label="Numéro"><input id="anum" class="input" value={num} onInput={(e) => setNum(e.currentTarget.value)} {...inputKinds.text} placeholder="Ex. 14 bis" /></Field>
      <Field id="astreet" label="Rue">
        <input id="astreet" class="input" list="streets-dl" value={street} onInput={(e) => setStreet(e.currentTarget.value)} {...inputKinds.name} />
        <datalist id="streets-dl">{streets.map((x) => <option value={x} key={x} />)}</datalist>
      </Field>
      <div class="field"><span class="label">Logements</span>
        <div class="seg">{[1, 2, 6, 12, 24].map((n) => <button type="button" key={n} aria-pressed={flats === n ? 'true' : 'false'} onClick={() => setFlats(n)}>{n === 1 ? 'Maison' : n}</button>)}</div>
      </div>
      <div class="sticky-action"><Button kind="full" type="submit" sound="">Ajouter</Button></div>
    </form>
  );
}

export function SectorsScreen() {
  const d = data.value;
  const t = totals(d.visits);
  const canCreate = role.value !== 'pompier' || d.sectors.length === 0;
  return (
    <div class="page rise">
      <div class="page-head">
        <div><h1>Secteurs</h1><div class="sub">{d.sectors.length} secteurs · {d.doors.length} portes · {formatEuro(t.amount)}</div></div>
        {canCreate && <Button kind="small" icon="plus" onClick={openCreateChooser} data-testid="new-sector">Nouveau</Button>}
      </div>
      {d.sectors.length === 0 ? (
        <div class="card">
          <Empty icon="sectors" title="Votre premier secteur" text="Tracez votre zone sur la carte. Nokk trouve les rues, les numéros et le parcours le plus court." action={<Button kind="full" icon="draw" onClick={openCreateChooser}>Créer un secteur</Button>} />
        </div>
      ) : (
        <div class="sector-grid">
          {d.sectors.map((s) => <SectorCard s={s} key={s.id} />)}
        </div>
      )}
    </div>
  );
}
