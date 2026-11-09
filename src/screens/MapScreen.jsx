import { useEffect } from 'preact/hooks';
import { Icon, Logo } from '../ui/icons.jsx';
import { Button, IconButton, Progress, Bump, Avatar, toast, Empty } from '../ui/ui.jsx';
import { MapView, follow, showRoute, fitSector, flyTo, fitLine, drawing, mapReady } from '../ui/MapView.jsx';
import { dist } from '../lib/geo.js';
import { data, currentSector, position, geoState, setCurrentSector, memberById, doorsBySector, byDoor } from '../lib/store.js';
import { stats, tonight, nextDoor, route, distanceToNext, repasserMode, streetSummary, doorAtPosition, guide, guidePath, stopGuide } from '../lib/tour.js';
import { formatEuro, totals, sectorStats } from '../lib/model.js';
import { formatDistance } from '../lib/geo.js';
import { startGeo } from '../lib/geoloc.js';
import { openDoor } from './DoorSheet.jsx';
import { openSheet, go } from '../lib/nav.js';
import { feel } from '../lib/feedback.js';
import { DrawBar } from './SectorNew.jsx';
import { TourBar } from './Tour.jsx';
import { activeSession } from '../lib/sessions.js';

export function locate() {
  if (geoState.value === 'on' && position.value) {
    follow.value = !follow.value;
    if (follow.value) flyTo(position.value.p, 17.4);
    return;
  }
  startGeo().then((ok) => {
    if (ok) { follow.value = true; if (position.value) flyTo(position.value.p, 17.4); }
    else if (geoState.value === 'denied') toast("La localisation est refusée. Autorisez-la dans les réglages du téléphone pour vous voir sur la carte.", { error: true, duration: 5200 });
    else toast('Position introuvable pour le moment, on réessaie', { error: true });
  });
}

// Action centrale : la porte devant laquelle on est, sinon la suivante du parcours.
export function quickLog() {
  const here = doorAtPosition(25);
  const target = here || nextDoor.value;
  if (!currentSector.value) { go('secteurs'); toast('Choisissez d\'abord un secteur'); return; }
  if (!target) { toast('Toutes les portes du secteur sont faites'); return; }
  flyTo(target.p);
  openDoor(target.id);
}

function SectorPicker({ close }) {
  const by = byDoor.value;
  return (
    <div class="stack">
      <div class="sheet-head"><h2>Changer de secteur</h2></div>
      <div class="list card tight">
        {data.value.sectors.map((s) => {
          const st = sectorStats(doorsBySector.value.get(s.id) || [], by);
          return (
            <button class="row" key={s.id} onClick={() => { feel('tap'); setCurrentSector(s.id); repasserMode.value = false; close(); setTimeout(() => fitSector(s), 300); }}>
              <span class={'dot-ico sm ' + (st.pct === 100 ? 'tone-ok' : st.done ? 'tone-warn' : 'tone-muted')}><Icon name="sectors" /></span>
              <span class="grow"><span class="t">{s.name}{s.area ? ' · ' + s.area : ''}</span><span class="s">{st.total} portes · {st.pct} % fait</span></span>
              <span class="end">{formatEuro(st.amount)}</span>
            </button>
          );
        })}
      </div>
      <Button kind="soft full" icon="plus" onClick={() => { close(); setTimeout(() => go('secteurs'), 50); }}>Nouveau secteur</Button>
    </div>
  );
}

function Summary({ wide }) {
  const s = stats.value;
  const t = tonight.value;
  const n = nextDoor.value;
  const d = distanceToNext.value;
  const r = route.value;
  const sector = currentSector.value;
  const parts = [
    { key: 'donne', value: s.donne, color: 'var(--st-done)' },
    { key: 'absent', value: s.absent + (s.partiel || 0), color: 'var(--st-repasser)' },
    { key: 'refus', value: s.refus + s.deja, color: 'var(--muted)' },
    { key: 'todo', value: s.todo, color: 'transparent' },
  ];
  const left = r?.order.length || 0;
  return (
    <div class="summary" data-testid="summary">
      <TourBar />
      <div class="hrow between" hidden={!!activeSession.value}>
        <div>
          <div class="tiny muted">Ce soir</div>
          <Bump value={t.amount} class="big-num sum-amount">{formatEuro(t.amount)}</Bump>
        </div>
        <div class="right">
          <div class="big-num doors-count"><Bump value={s.done}>{s.done}</Bump><span class="muted"> / {s.total}</span></div>
          <div class="tiny muted">portes</div>
        </div>
      </div>
      <Progress parts={parts} label={`${s.done} portes faites sur ${s.total}`} />
      <div class="legend">
        <span><i style={{ background: 'var(--st-done)' }} />Donné {s.donne}</span>
        <span><i style={{ background: 'var(--st-repasser)' }} />À repasser {s.absent}</span>
        <span><i style={{ background: 'var(--muted)' }} />Refus {s.refus}</span>
      </div>
      {n ? (
        <button class="next-btn" onClick={() => { feel('tap'); flyTo(n.p); openDoor(n.id); }} data-testid="next-door">
          <span class="next-num">{n.num}</span>
          <span class="grow">
            <span class="tiny">{repasserMode.value ? 'Absent à revoir' : 'Porte suivante'}{d != null ? ' · ' + formatDistance(d) : ''}{left > 1 ? ` · ${left} restantes, ~${Math.max(1, Math.round(r.minutes))} min` : ''}</span>
            <span class="next-title">{n.num} {n.street}</span>
          </span>
          <Icon name="arrowR" />
        </button>
      ) : s.absent > 0 && !repasserMode.value ? (
        <Button kind="ink full" icon="repeat" onClick={() => { repasserMode.value = true; }}>Repasser chez les absents · {s.absent}</Button>
      ) : sector ? (
        <Button kind="ink full" icon="sectors" onClick={() => openSheet(({ close }) => <SectorPicker close={close} />, { label: 'Changer de secteur' })}>Secteur terminé · en choisir un autre</Button>
      ) : null}
    </div>
  );
}

function SidePanel() {
  const sector = currentSector.value;
  if (!sector) return null;
  const rows = streetSummary(sector);
  const s = stats.value;
  const cash = totals(data.value.visits.filter((v) => v.sectorId === sector.id)).especes;
  const tone = s.pct === 100 ? 'ok' : s.done ? 'coral' : 'muted';
  return (
    <aside class="side-panel">
      <div class="hrow between">
        <div class="card-title">{sector.name}</div>
        <span class={'pill tone-' + tone}>{s.pct === 100 ? 'Terminé' : s.done ? 'En cours' : 'À faire'}</span>
      </div>
      <div class="tiny muted">{sector.area ? sector.area + ' · ' : ''}{s.total} portes · {new Set((doorsBySector.value.get(sector.id) || []).map((d) => d.street)).size} rues</div>
      <div class="street-list">
        {rows.map((r) => (
          <div class="street-row" key={r.name}>
            <i class={'bar st-' + r.state} />
            <span class="grow t">{r.name}</span>
            <span class="end">{r.state === 'repasser' || (r.absent && r.done < r.doors) ? <span class="pill tone-warn">{r.absent} à repasser</span> : r.done ? formatEuro(r.amount) : <span class="muted tiny">{r.doors} portes</span>}</span>
          </div>
        ))}
      </div>
      <div class="cash-box">
        <div><div class="tiny muted">Espèces à déposer</div><div class="big-num" style={{ fontSize: 22 }}>{formatEuro(cash)}</div></div>
        <Button kind="ink small" onClick={() => go('caisse')}>Point caisse</Button>
      </div>
      <Summary wide />
    </aside>
  );
}

function TourCard() {
  const d = data.value;
  const t = totals(d.visits);
  const by = byDoor.value;
  const allStats = sectorStats(d.doors, by);
  return (
    <div class="tour-card">
      <div class="hrow"><Logo size={30} /><div><div class="card-title">Tournée {d.org?.year || new Date().getFullYear() + 1}</div><div class="tiny muted">{d.sectors.length} secteurs · {d.members.length} équipiers</div></div></div>
      <div class="hrow between" style={{ marginTop: 10 }}>
        <div><div class="big-num" style={{ fontSize: 26 }}>{formatEuro(t.amount)}</div><div class="tiny muted">collectés</div></div>
        <div class="right"><div class="big-num" style={{ fontSize: 26 }}>{allStats.pct} %</div><div class="tiny muted">des portes</div></div>
      </div>
      <div class="legend col">
        <span><i style={{ background: 'var(--st-done)' }} />Rue faite</span>
        <span><i style={{ background: 'var(--st-live)' }} />Équipe dessus en ce moment</span>
        <span><i style={{ background: 'var(--st-repasser)' }} />Portes à repasser</span>
        <span><i style={{ background: 'var(--st-todo)' }} />Pas encore faite</span>
      </div>
    </div>
  );
}

// Carte « y aller » : le trajet à pied vers le prochain bâtiment.
function GuideCard() {
  const g = guidePath.value;
  useEffect(() => { if (g) fitLine(g.line); }, [guide.value?.doorId]);
  // Arrivé devant : on ouvre la porte tout seul.
  useEffect(() => {
    const pos = position.value;
    if (!g || !pos || Date.now() - pos.ts > 60000) return;
    if (dist(pos.p, g.door.p) < 18) { feel('done'); const id = g.door.id; stopGuide(); toast('Vous y êtes'); openDoor(id); }
  }, [position.value, g?.door.id]);
  if (!g) return null;
  const d = g.door;
  return (
    <div class="guide-card" role="status" data-testid="guide">
      <div class="guide-top">
        <span class="guide-ico"><Icon name="walk" /></span>
        <div class="grow">
          <div class="tiny">{g.live ? 'Trajet à pied depuis votre position' : 'Trajet à pied'}</div>
          <div class="guide-title">{d.num} {d.street}</div>
          <div class="small">{d.flats > 1 ? `Immeuble · ${d.flats} logements` : 'Maison'}{d.code ? ' · code ' + d.code : ''}</div>
        </div>
        <div class="guide-dist"><b>{formatDistance(g.meters)}</b><small>{g.minutes} min</small></div>
      </div>
      <div class="guide-actions">
        <Button kind="coral full" icon="door" onClick={() => { const id = d.id; stopGuide(); openDoor(id); }} data-testid="arrived">J'y suis</Button>
        <IconButton icon="x" label="Arrêter le trajet" onClick={() => { stopGuide(); feel('close'); }} />
      </div>
    </div>
  );
}

export function MapScreen({ visible }) {
  const sector = currentSector.value;
  const crew = (data.value.crew || []).map((id) => memberById.value.get(id)).filter(Boolean);

  useEffect(() => {
    if (visible && mapReady.value && sector) fitSector(sector, { animate: false });
  }, [visible, mapReady.value]);

  return (
    <div class="map-screen" hidden={!visible} data-testid="screen-carte">
      <MapView visible={visible} onDoor={(id) => { feel('tap'); openDoor(id); }} />
      {drawing.value ? <DrawBar /> : (
        <>
          <div class="map-top">
            <button class="sector-chip" onClick={() => { feel('tap'); openSheet(({ close }) => <SectorPicker close={close} />, { label: 'Changer de secteur' }); }} data-testid="sector-chip">
              <Logo size={26} />
              <span class="grow">{sector ? <>{sector.name}{sector.area ? <span class="muted"> · {sector.area}</span> : null}</> : 'Choisir un secteur'}</span>
              <Icon name="chevD" size={16} />
            </button>
            {crew.length > 0 && <span class="avatars crew-chip">{crew.map((m) => <Avatar m={m} key={m.id} />)}</span>}
            <div class="map-tools">
              <IconButton icon="locate" label={follow.value ? 'Arrêter de me suivre' : 'Me localiser'} class={follow.value ? 'on' : geoState.value === 'on' ? 'located' : ''} onClick={locate} data-testid="locate" />
              <IconButton icon="route" label={showRoute.value ? 'Masquer le parcours' : 'Afficher le parcours'} class={showRoute.value ? '' : 'off'} onClick={() => { showRoute.value = !showRoute.value; }} />
              {sector && <IconButton icon="target" label="Voir tout le secteur" onClick={() => { follow.value = false; fitSector(sector); }} />}
            </div>
          </div>
          <div class="tour-wrap"><TourCard /></div>
          {sector ? (
            <>
              {guide.value ? <div class="map-bottom guide-wrap">{activeSession.value && <TourBar />}<GuideCard /></div> : <div class="map-bottom"><Summary /></div>}
              <SidePanel />
            </>
          ) : (
            <div class="map-bottom">
              <div class="summary">
                <Empty icon="sectors" title="Aucun secteur pour l'instant" text="Tracez votre zone sur la carte : Nokk trouve les rues et les numéros tout seul." action={<Button kind="full" icon="draw" onClick={() => go('secteurs')}>Créer mon premier secteur</Button>} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
