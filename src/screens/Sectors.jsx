import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Button, IconButton, Progress, Avatar, Empty, toast, Field, DotIcon } from '../ui/ui.jsx';
import { data, byDoor, doorsBySector, setCurrentSector, memberById, removeSector, updateSector, addDoor, role, position, demo } from '../lib/store.js';
import { sectorStats, formatEuro, totals, doorState, isDone } from '../lib/model.js';
import { openSheet, go } from '../lib/nav.js';
import { feel } from '../lib/feedback.js';
import { fitSector, mapInstance } from '../ui/MapView.jsx';
import { openCreateChooser, shrink } from './SectorNew.jsx';
import { repasserMode } from '../lib/tour.js';
import { inputKinds } from '../lib/keyboard.js';
import { shareFile } from '../lib/share.js';
import { cacheSectorTiles } from '../lib/offline.js';
import { bbox } from '../lib/geo.js';
import { account, inviteLink } from '../lib/account.js';
import { markStart, StartCard } from './Start.jsx';
import { openQrCards, CallbacksBar, QrEntryCard } from './Repasser.jsx';

function SectorCard({ s }) {
  const doors = doorsBySector.value.get(s.id) || [];
  const st = sectorStats(doors, byDoor.value);
  const homes = doors.reduce((a, d) => {
    const ds = doorState(d, byDoor.value.get(d.id));
    const f = d.flats > 1 ? d.flats : 1;
    a.total += f;
    a.done += d.flats > 1 ? (ds.closed ? f : Math.min(f, ds.units || 0)) : isDone(ds.state) ? 1 : 0;
    return a;
  }, { total: 0, done: 0 });
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
            <div class="sector-units"><Icon name="building" /> {homes.done} / {homes.total} logements faits</div>
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
      {st.repasse > 0 && (
        <button type="button" class="sector-repasse" onClick={() => { feel('tap'); setCurrentSector(s.id); repasserMode.value = true; go('carte'); setTimeout(() => fitSector(s), 200); }} data-testid={'repasse-' + s.id}>
          <Icon name="repeat" size={18} /> Repasser chez les absents · {st.repasse}
        </button>
      )}
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
      {assignees.length > 0 && (
        <Button kind="soft full" icon="mail" onClick={() => { close(); setTimeout(() => openSheet(({ close: c }) => <AssignSend s={s} close={c} />, { label: 'Prévenir l\'équipe' }), 300); }} data-testid="assign-send">
          Prévenir {assignees.length > 1 ? 'les équipiers' : memberById.value.get(assignees[0])?.name.split(' ')[0] || 'l\'équipier'}
        </Button>
      )}
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
        <button class="row" onClick={() => { close(); setTimeout(() => openQrCards(s), 300); }} data-testid="qr-cards-open">
          <DotIcon icon="qr" sm tone="bad" /><span class="grow"><span class="t">Cartes « Repassez plus tard »</span><span class="s">{s.qrPrinted ? `${s.qrPrinted} cartes imprimées` : 'Pour les absents : ils choisissent quand on repasse'}</span></span>
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

export function assignMessage(s, m) {
  const d = data.value;
  const mates = (s.assignees || []).filter((id) => id !== m.id).map((id) => memberById.value.get(id)?.name.split(' ')[0]).filter(Boolean);
  const t = account.value?.team;
  const link = t ? inviteLink(t.code, { s: s.id, m: m.id }) : 'https://nokkapp.fr/';
  const doors = (doorsBySector.value.get(s.id) || []).length;
  return {
    subject: `Tournée des calendriers : ${s.name}`,
    text: `Salut ${m.name.split(' ')[0]} ! Pour la tournée des calendriers${d.org?.year ? ' ' + d.org.year : ''}, tu es affecté au secteur « ${s.name} »${mates.length ? ' avec ' + mates.join(' et ') : ''} (${doors} portes). Tout est prêt dans Nokk, la carte et le parcours : ${link}${t ? ` (code équipe ${t.code})` : ''}`,
  };
}

function AssignSend({ s, close }) {
  const people = (s.assignees || []).map((id) => memberById.value.get(id)).filter(Boolean);
  const [sent, setSent] = useState([]);
  const done = (id) => { setSent((x) => [...new Set([...x, id])]); markStart('team'); };
  return (
    <div class="stack" data-testid="assign-sheet">
      <div class="sheet-head"><div><div class="tiny muted">Affectation</div><h2>{s.name}</h2></div></div>
      {!account.value?.team && <p class="small muted">Astuce : connectez-vous dans Réglages pour que le lien les fasse entrer directement dans l'équipe.</p>}
      {people.map((m) => {
        const msg = assignMessage(s, m);
        return (
          <div class="card assign-card" key={m.id} data-testid="assign-person">
            <div class="hrow"><Avatar m={m} /><b class="grow">{m.name}</b>{sent.includes(m.id) && <span class="pill tone-ok">Envoyé</span>}</div>
            <p class="small assign-msg">{msg.text}</p>
            <div class="hrow">
              <Button kind="small grow" icon="share" onClick={async () => {
                try { if (navigator.share) await navigator.share({ title: msg.subject, text: msg.text }); else { await navigator.clipboard.writeText(msg.text); toast('Message copié'); } done(m.id); } catch (e) { if (e?.name !== 'AbortError') toast('Partage impossible ici', { error: true }); }
              }} data-testid="assign-share">Envoyer</Button>
              <a class="btn soft small" href={`mailto:?subject=${encodeURIComponent(msg.subject)}&body=${encodeURIComponent(msg.text)}`} onClick={() => done(m.id)}><Icon name="mail" /> E-mail</a>
              <a class="btn soft small" href={`sms:?&body=${encodeURIComponent(msg.text)}`} onClick={() => done(m.id)}><Icon name="phone" /> SMS</a>
            </div>
          </div>
        );
      })}
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

// Tableau de bord du chef : avancement de chaque secteur, ce qu'il rapporte, et la comparaison avec l'an dernier.
function SectorBoard() {
  const d = data.value;
  const rows = d.sectors.map((s) => {
    const doors = doorsBySector.value.get(s.id) || [];
    const st = sectorStats(doors, byDoor.value);
    const knocked = st.done + st.absent + (st.partiel || 0);
    // Mêmes portes que l'an dernier, déjà repassées cette année.
    let ly = 0, cur = 0;
    for (const x of doors) {
      if (!x.lastYear?.amount) continue;
      const gifts = (byDoor.value.get(x.id) || []).filter((v) => v.result === 'donne');
      if (!gifts.length) continue;
      ly += x.lastYear.amount;
      cur += gifts.reduce((a, v) => a + (v.amount || 0), 0);
    }
    return { s, st, perDoor: knocked ? Math.round(st.amount / knocked / 10) * 10 : 0, vs: ly ? Math.round(((cur - ly) / ly) * 100) : null };
  });
  if (rows.length < 2) return null;
  const sum = rows.reduce((a, r) => ({ done: a.done + r.st.done, total: a.total + r.st.total, amount: a.amount + r.st.amount }), { done: 0, total: 0, amount: 0 });
  const pct = sum.total ? Math.round((sum.done / sum.total) * 100) : 0;
  const best = [...rows].sort((a, b) => b.perDoor - a.perDoor);
  const max = Math.max(1, ...rows.map((r) => r.perDoor));
  return (
    <div class="card board" data-testid="sector-board">
      <div class="hrow between">
        <div><div class="tiny muted">Tableau de bord</div><div class="card-title">{pct} % de la campagne faite</div></div>
        <div class="right"><div class="big-num" style={{ fontSize: 22 }}>{formatEuro(sum.amount)}</div><div class="tiny muted">{sum.done} / {sum.total} portes</div></div>
      </div>
      <div class="board-rows">
        {best.map((r) => (
          <button class="board-row" key={r.s.id} onClick={() => openSheet(({ close }) => <SectorOptions s={r.s} close={close} />, { label: r.s.name })}>
            <span class="board-name"><b>{r.s.name}</b><span class="tiny muted">{r.st.pct} % · {(r.s.assignees || []).map((id) => memberById.value.get(id)?.name.split(' ')[0]).filter(Boolean).join(', ') || 'personne'}</span></span>
            <span class="board-bar"><i style={{ width: (r.perDoor / max) * 100 + '%' }} /></span>
            <span class="board-val"><b>{formatEuro(r.perDoor)}</b><span class="tiny muted">/porte{r.vs != null ? ` · ${r.vs >= 0 ? '+' : ''}${r.vs} %` : ''}</span></span>
          </button>
        ))}
      </div>
      <p class="tiny muted">Classés par euros par porte frappée. Le pourcentage compare aux mêmes portes l'an dernier. Touchez un secteur pour changer son équipe.</p>
    </div>
  );
}

export function SectorsScreen() {
  const d = data.value;
  const t = totals(d.visits);
  const canCreate = true; // tout le monde peut tracer un secteur (les pompiers aussi)
  return (
    <div class="page rise">
      <div class="page-head">
        <div><h1>Secteurs</h1><div class="sub">{d.sectors.length} secteurs · {d.doors.length} portes · {formatEuro(t.amount)}</div></div>
      </div>
      <StartCard compact />
      <CallbacksBar />
      {role.value !== 'pompier' && <SectorBoard />}
      <QrEntryCard />
      {d.sectors.length === 0 ? (
        <div class="card">
          <Empty icon="sectors" title="Votre premier secteur" text="Tracez votre zone sur la carte. Nokk trouve les rues, les numéros et le parcours le plus court." action={<Button kind="full" icon="draw" onClick={openCreateChooser} data-testid="new-sector">Créer un secteur</Button>} />
        </div>
      ) : (
        <div class="sector-grid">
          {canCreate && (
            <button class="new-sector-card" data-testid="new-sector" onClick={() => { feel('tap'); openCreateChooser(); }}>
              <span class="plus"><Icon name="plus" /></span>
              <span class="grow">Nouveau secteur<span class="tiny muted" style={{ display: 'block', fontWeight: 600 }}>Tracez la zone ici, Nokk trouve les rues et les numéros</span></span>
              <Icon name="chevR" class="chev" />
            </button>
          )}
          {d.sectors.map((s) => <SectorCard s={s} key={s.id} />)}
        </div>
      )}
    </div>
  );
}
