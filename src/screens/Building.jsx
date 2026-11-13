// Immeuble : les boîtes aux lettres (noms + étages), qui reste à voir, la photo qui remplit tout, le récap.
import { useState, useEffect, useRef } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Button, IconButton, Seg, Field, toast, Bump } from '../ui/ui.jsx';
import { data, byDoor, updateDoor, demo } from '../lib/store.js';
import { formatEuro, flatsOf, doorState } from '../lib/model.js';
import { residentStates, byFloor, floorShort, floorLabel, floorRank, makeResident, mergeResidents, sortResidents, recapText, isOpen, passCount, parseFloor } from '../lib/residents.js';
import { readMailboxPhoto, PHOTO_ERRORS } from '../lib/boites.js';
import { openSheet } from '../lib/nav.js';
import { feel } from '../lib/feedback.js';
import { inputKinds } from '../lib/keyboard.js';
import { shrink } from './SectorNew.jsx';
import { openVisitEdit } from './VisitEdit.jsx';

const STATE = {
  todo: { t: 'à voir', tone: 'todo' },
  absent: { t: 'absent', tone: 'absent' },
  donne: { t: 'donné', tone: 'donne' },
  refus: { t: 'refus', tone: 'refus' },
  deja: { t: 'déjà pris', tone: 'deja' },
};
const stateText = (s) => (s.state === 'absent' ? (s.absences > 1 ? `absent ${s.absences} fois` : 'absent') : s.state === 'donne' ? (s.amount ? formatEuro(s.amount) : 'offert') : STATE[s.state].t);

// ——— Choix de l'étage : un toucher ———
export function FloorPicker({ value, onChange, top = 5, compact }) {
  const max = Math.max(top, (value ?? 0) + 1, 4);
  const [extra, setExtra] = useState(0);
  const list = [-1, 0, ...Array.from({ length: max + extra }, (_, i) => i + 1)];
  const strip = useRef();
  useEffect(() => {
    const el = strip.current?.querySelector('[aria-pressed="true"]');
    el?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, []);
  return (
    <div class={'floor-picker' + (compact ? ' compact' : '')} role="group" aria-label="Étage" ref={strip} data-free>
      <button type="button" class="fchip unk" aria-pressed={value == null ? 'true' : 'false'} onClick={() => { feel('tick'); onChange(null); }} title="Étage inconnu">?</button>
      {list.map((f) => (
        <button type="button" key={f} class="fchip" aria-pressed={value === f ? 'true' : 'false'} onClick={() => { feel('tick'); onChange(f); }} data-testid={'floor-' + f}>{floorShort(f)}</button>
      ))}
      <button type="button" class="fchip more" onClick={() => { feel('tick'); setExtra(extra + 5); }} aria-label="Plus d'étages">+</button>
    </div>
  );
}

// ——— Tête d'immeuble : avancement + accès au récap ———
export function BuildingHead({ door, list, states }) {
  const st = doorState(door, list);
  const total = flatsOf(door);
  const done = st.units || 0;
  const pct = Math.min(1, done / total);
  const R = 19, C = 2 * Math.PI * R;
  const absent = states.filter((s) => s.state === 'absent').length;
  const todo = states.filter((s) => s.state === 'todo').length;
  const unseen = Math.max(0, total - (st.units || 0) - (st.absents || 0) - todo);
  const pass = passCount(list);
  return (
    <div class="building bhead">
      <div class="hrow">
        <svg class="ring" viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r={R} class="ring-bg" />
          <circle cx="24" cy="24" r={R} class="ring-fg" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - pct) }} />
        </svg>
        <div class="grow">
          <div><b class="num"><Bump value={done}>{done}</Bump> / {total}</b> <span class="small muted">logements faits</span></div>
          <div class="tiny muted" data-testid="building-left">
            {[todo ? `${todo} à voir` : null, absent ? `${absent} absent${absent > 1 ? 's' : ''} à repasser` : null, unseen ? `${unseen} sans nom` : null].filter(Boolean).join(' · ') || 'Tout le monde est vu'}
            {pass > 1 ? ` · ${pass}e passage` : ''}
          </div>
        </div>
        <button type="button" class="link-btn" onClick={() => openRecap(door)} data-testid="open-recap"><Icon name="list" size={18} /> Récap</button>
      </div>
    </div>
  );
}

// ——— La liste des boîtes, étage par étage ———
export function ResidentsPanel({ door, states, sel, onPick, onNew }) {
  const anyDone = states.some((s) => s.state !== 'todo');
  const [mode, setMode] = useState(anyDone ? 'left' : 'all');
  const floors = byFloor(states);
  const left = states.filter((s) => isOpen(s.state)).length;
  const shown = floors.map((g) => ({ ...g, items: mode === 'left' ? g.items.filter((s) => isOpen(s.state)) : g.items }));
  return (
    <div class="residents" data-testid="residents">
      <div class="hrow between res-top">
        <span class="label">Boîtes aux lettres</span>
        <Seg light label="Afficher" value={mode} onChange={setMode} options={[{ value: 'left', label: `Reste ${left}` }, { value: 'all', label: `Tous ${states.length}` }]} />
      </div>
      {mode === 'left' && !left && <p class="small muted res-empty">Tout le monde a été vu dans cet immeuble.</p>}
      {shown.map((g) => (g.items.length || mode === 'all') && (
        <div class="floor-group" key={String(g.floor)}>
          <div class="floor-name">
            <span class={'floor-badge' + (g.floor == null ? ' unk' : '')}>{floorShort(g.floor)}</span>
            <span class="grow">{floorLabel(g.floor)}</span>
            <span class="tiny muted">{g.left ? `${g.left} à voir` : <><Icon name="check" size={14} /> fini</>}</span>
          </div>
          <div class="res-chips">
            {g.items.map((s) => (
              <button type="button" key={s.r.id} class={'res-chip st-' + s.state} aria-pressed={sel === s.r.id ? 'true' : 'false'} onClick={() => { feel('tick'); onPick(s); }} data-testid="res-chip">
                <i /><span class="nm">{s.label}</span><small>{stateText(s)}</small>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div class="res-tools">
        <button type="button" class="link-btn" onClick={onNew} data-testid="res-new"><Icon name="plus" size={18} /> Pas dans la liste</button>
        <button type="button" class="link-btn" onClick={() => openResidents(door)} data-testid="res-edit"><Icon name="pencil" size={18} /> Noms et étages</button>
      </div>
    </div>
  );
}

// ——— Pas encore de noms : on propose la photo ———
export function MailboxCta({ door }) {
  return (
    <div class="mailbox-cta" data-testid="mailbox-cta">
      <span class="mb-ico"><Icon name="photo" /></span>
      <div class="grow">
        <b>Photographiez les boîtes aux lettres</b>
        <p class="tiny muted">Nokk lit les noms (et les étages s'ils sont écrits). Aux repasses, vous saurez qui reste, étage par étage.</p>
        <div class="hrow mb-actions">
          <PhotoButton onFile={(f) => openResidents(door, { file: f })} label="Prendre la photo" testid="mailbox-photo" />
          <button type="button" class="link-btn" onClick={() => openResidents(door)} data-testid="mailbox-manual">Saisir à la main</button>
        </div>
      </div>
    </div>
  );
}

let photoSeq = 0;
function PhotoButton({ onFile, label, kind = 'small', testid }) {
  const [id] = useState(() => 'mbphoto' + ++photoSeq);
  return (
    <>
      <label for={id} class={'btn ' + kind} data-testid={testid} onClick={() => feel('tap')}><Icon name="photo" /> {label}</label>
      <input id={id} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) onFile(f); }} />
    </>
  );
}

// ——— Éditeur : noms, étages, portes. Tout se corrige à la main. ———
export function openResidents(door, opts = {}) {
  openSheet(({ close }) => <ResidentsEditor doorId={door.id} file={opts.file} close={close} />, { label: 'Boîtes aux lettres', class: 'res-sheet' });
}

function ResidentsEditor({ doorId, file, close }) {
  const door = data.value.doors.find((d) => d.id === doorId);
  const [rows, setRows] = useState(() => sortResidents(door?.residents || []).map((r) => ({ ...r })));
  const [flats, setFlats] = useState(() => (door ? flatsOf(door) : 2));
  const [flatsTouched, setFlatsTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [fresh, setFresh] = useState(new Set());
  const [bulk, setBulk] = useState(false);
  const [picked, setPicked] = useState(new Set());
  const listRef = useRef();
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => { if (file) read(file); }, []);
  if (!door) return null;
  const visited = new Set((byDoor.value.get(doorId) || []).map((v) => v.rid).filter(Boolean));

  async function read(f) {
    setBusy(true); setErr('');
    try {
      const img = await shrink(f, 1800);
      const got = demo.value && !window.__nokkApi ? demoRead() : await readMailboxPhoto(img);
      const cur = rowsRef.current;
      const { list, added, updated } = mergeResidents(cur, got);
      setRows(list);
      setFresh(new Set(list.slice(cur.length).map((r) => r.id)));
      const floors = got.filter((x) => x.floor != null).length;
      feel('ok');
      toast(added ? `${added} nom${added > 1 ? 's' : ''} lu${added > 1 ? 's' : ''}${floors ? ` · ${floors} avec l'étage` : ' · ajoutez les étages'}` : updated ? `${updated} étage${updated > 1 ? 's' : ''} complété${updated > 1 ? 's' : ''}` : 'Aucun nouveau nom sur cette photo');
      if (!flatsTouched) setFlats(Math.max(2, list.length));
    } catch (e) {
      setErr(PHOTO_ERRORS[e.code] || PHOTO_ERRORS.error);
      feel('err');
    }
    setBusy(false);
  }

  const set = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id) => { feel('tick'); setRows((rs) => rs.filter((r) => r.id !== id)); };
  function add(floor) {
    const last = rows[rows.length - 1];
    const r = makeResident({ floor: floor !== undefined ? floor : last?.floor ?? null });
    setRows([...rows, r]);
    if (!flatsTouched && rows.length + 1 > flats) setFlats(rows.length + 1);
    setTimeout(() => listRef.current?.querySelector(`[data-rid="${r.id}"] input`)?.focus(), 40);
  }
  function save() {
    const clean = rows.map((r) => ({ id: r.id, name: (r.name || '').trim(), floor: r.floor ?? null, ...(String(r.unit || '').trim() ? { unit: String(r.unit).trim() } : {}) }))
      .filter((r) => r.name || r.unit || visited.has(r.id));
    const n = Math.max(2, flats, clean.length);
    updateDoor(doorId, { residents: clean, residentsSet: true, flats: n, flatsSet: true });
    feel('ok');
    toast(`${clean.length} habitant${clean.length > 1 ? 's' : ''} · ${n} logements`);
    close();
  }
  const setPickedFloor = (f) => { setRows((rs) => rs.map((r) => (picked.has(r.id) ? { ...r, floor: f } : r))); feel('ok'); toast(`${picked.size} mis au ${floorShort(f)}`); setPicked(new Set()); setBulk(false); };
  const noFloor = rows.filter((r) => r.floor == null).length;

  return (
    <div class="stack res-editor" data-testid="res-editor">
      <div class="sheet-head">
        <div class="grow"><div class="tiny muted">{door.num} {door.street}</div><h2>Boîtes aux lettres</h2></div>
        <IconButton icon="x" label="Fermer" class="flat" onClick={close} />
      </div>

      <div class="photo-row">
        <PhotoButton onFile={read} label={rows.length ? 'Ajouter une photo' : 'Photographier les boîtes'} kind={rows.length ? 'soft' : 'coral'} testid="res-photo" />
        <p class="tiny muted">{rows.length ? 'Une photo par rangée de boîtes si besoin : les noms déjà là ne sont pas doublés.' : 'Bien en face, assez près pour lire les noms. Nokk lit aussi les étages quand ils sont écrits.'}</p>
      </div>
      {busy && <div class="reading" data-testid="res-reading"><span class="scan" /><span>Lecture des boîtes aux lettres…</span></div>}
      {err && <p class="small note-line bad" data-testid="res-error"><Icon name="note" size={16} /> {err}</p>}

      {rows.length > 0 && (
        <div class="hrow between">
          <span class="label">{rows.length} habitant{rows.length > 1 ? 's' : ''}{noFloor ? ` · ${noFloor} sans étage` : ''}</span>
          <button type="button" class="link-btn" onClick={() => { feel('tap'); setBulk(!bulk); setPicked(new Set()); }} data-testid="res-bulk">{bulk ? 'Terminé' : 'Choisir plusieurs'}</button>
        </div>
      )}
      {bulk && (
        <div class="bulk-bar">
          <span class="tiny">{picked.size ? `${picked.size} choisi${picked.size > 1 ? 's' : ''} : mettre au…` : 'Touchez les noms, puis l\'étage'}</span>
          {picked.size > 0 && <FloorPicker compact value={undefined} onChange={setPickedFloor} />}
        </div>
      )}

      <div class="res-rows" ref={listRef}>
        {rows.map((r) => (
          <div class={'res-row' + (fresh.has(r.id) ? ' fresh' : '') + (bulk && picked.has(r.id) ? ' picked' : '')} key={r.id} data-rid={r.id} data-testid="res-row">
            {bulk ? (
              <button type="button" class="res-pick" onClick={() => { const p = new Set(picked); p.has(r.id) ? p.delete(r.id) : p.add(r.id); setPicked(p); feel('tick'); }} aria-pressed={picked.has(r.id) ? 'true' : 'false'}>
                <span class="box">{picked.has(r.id) && <Icon name="check" size={16} />}</span>{r.name || r.unit || 'Sans nom'}<small>{floorShort(r.floor)}</small>
              </button>
            ) : (
              <>
                <select class="input res-floor" aria-label="Étage" value={r.floor == null ? '' : String(r.floor)} onChange={(e) => set(r.id, { floor: e.currentTarget.value === '' ? null : +e.currentTarget.value })} data-testid="res-floor">
                  <option value="">Étage ?</option>
                  <option value="-1">Sous-sol</option>
                  <option value="0">RDC</option>
                  {Array.from({ length: Math.max(12, (r.floor || 0) + 1) }, (_, i) => i + 1).map((f) => <option value={String(f)} key={f}>{floorShort(f)}</option>)}
                </select>
                <input class="input res-name" placeholder="Nom" value={r.name} onInput={(e) => set(r.id, { name: e.currentTarget.value })} {...inputKinds.name} aria-label="Nom" data-testid="res-name" />
                <input class="input res-unit" placeholder="Porte" value={r.unit || ''} onInput={(e) => set(r.id, { unit: e.currentTarget.value })} aria-label="Porte ou appartement" />
                <IconButton icon="trash" label={'Retirer ' + (r.name || 'cette ligne')} class="flat" onClick={() => remove(r.id)} />
              </>
            )}
          </div>
        ))}
      </div>
      <Button kind="soft full" icon="plus" onClick={() => add()} data-testid="res-add">Ajouter un habitant</Button>

      <div class="field">
        <label class="label" for="rflats">Logements dans l'immeuble</label>
        <div class="stepper flats-stepper">
          <IconButton type="button" icon="minus" label="Un logement de moins" onClick={() => { setFlatsTouched(true); setFlats(Math.max(2, rows.length, flats - 1)); }} />
          <input id="rflats" class="big-num flats-input" type="text" inputMode="numeric" value={flats} onInput={(e) => { const n = parseInt(e.currentTarget.value.replace(/\D/g, ''), 10); if (n) { setFlatsTouched(true); setFlats(Math.min(999, n)); } }} onBlur={() => setFlats(Math.max(2, rows.length, flats))} />
          <IconButton type="button" icon="plus" label="Un logement de plus" onClick={() => { setFlatsTouched(true); setFlats(flats + 1); }} />
        </div>
        <p class="tiny muted">{flats > rows.length ? `${flats - rows.length} logement${flats - rows.length > 1 ? 's' : ''} sans nom : ils comptent quand même dans l'avancement.` : 'Un logement par boîte aux lettres.'}</p>
      </div>

      <div class="sticky-action">
        <Button kind="full" sound="" onClick={save} data-testid="res-save">Enregistrer</Button>
      </div>
    </div>
  );
}

// Démo sans serveur : une lecture plausible, pour montrer le principe.
function demoRead() {
  return [
    { name: 'DUPONT Jean', floor: 0 }, { name: 'MARTIN', floor: 0 }, { name: 'Mme LEROY', floor: 1 }, { name: 'BERNARD S.', floor: 1 },
    { name: 'PETIT', floor: 2 }, { name: 'ROUX - GARNIER', floor: 2 }, { name: 'FAURE', floor: null }, { name: 'MOREL', floor: null },
  ];
}

// ——— Récap : étage par étage, qui a donné, qui reste. À partager avant une repasse. ———
export function openRecap(door) {
  openSheet(({ close }) => <BuildingRecap doorId={door.id} close={close} />, { label: 'Récap de l\'immeuble' });
}

function BuildingRecap({ doorId, close }) {
  const door = data.value.doors.find((d) => d.id === doorId);
  const list = byDoor.value.get(doorId) || [];
  const states = door ? residentStates(door, list) : [];
  const [mode, setMode] = useState(states.some((s) => s.state !== 'todo') ? 'left' : 'all');
  if (!door) return null;
  const floors = byFloor(states);
  const left = states.filter((s) => isOpen(s.state)).length;
  const amount = list.reduce((a, v) => a + (v.result === 'donne' ? v.amount || 0 : 0), 0);
  const gifts = list.filter((v) => v.result === 'donne').length;
  const other = list.filter((v) => !v.closed && !v.rid);
  async function share() {
    const text = recapText(door, states, { onlyOpen: mode === 'left' });
    feel('tap');
    try {
      if (navigator.share) { await navigator.share({ title: `${door.num} ${door.street}`, text }); return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text); toast('Récap copié : collez-le dans un message'); } catch { toast('Impossible de partager ici', { error: true }); }
  }
  return (
    <div class="stack recap" data-testid="recap">
      <div class="sheet-head">
        <div class="grow"><div class="tiny muted">Récap de l'immeuble</div><h2>{door.num} {door.street}</h2></div>
        <IconButton icon="x" label="Fermer" class="flat" onClick={close} />
      </div>
      <div class="recap-kpis">
        <div><b>{left}</b><span>à voir</span></div>
        <div><b>{gifts}</b><span>dons</span></div>
        <div><b>{formatEuro(amount)}</b><span>collectés</span></div>
        <div><b>{passCount(list)}</b><span>passage{passCount(list) > 1 ? 's' : ''}</span></div>
      </div>
      {!states.length ? (
        <div class="empty"><p class="small muted">Pas encore de noms pour cet immeuble.</p><MailboxCta door={door} /></div>
      ) : (
        <>
          <Seg label="Afficher" value={mode} onChange={setMode} options={[{ value: 'left', label: `Reste à voir · ${left}` }, { value: 'all', label: `Tout · ${states.length}` }]} />
          {floors.map((g) => {
            const items = mode === 'left' ? g.items.filter((s) => isOpen(s.state)) : g.items;
            if (!items.length) return null;
            return (
              <div class="card tight" key={String(g.floor)}>
                <div class="section-title" style={{ padding: '8px 10px 2px' }}>{floorLabel(g.floor)} · {g.left ? `${g.left} à voir` : 'fini'}</div>
                <div class="list">
                  {items.map((s) => (
                    <button type="button" class="row" key={s.r.id} onClick={() => s.last ? openVisitEdit(s.last) : openResidents(door)} data-testid="recap-row">
                      <span class={'hdot st-' + s.state} />
                      <span class="grow"><span class="t">{s.label}{s.r.unit && s.r.name ? ' · ' + s.r.unit : ''}</span>
                        <span class="s">{s.last ? `${s.visits.length} passage${s.visits.length > 1 ? 's' : ''} · ${new Date(s.last.ts).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}, ${new Date(s.last.ts).getHours()} h` : 'Pas encore vu'}</span></span>
                      <span class="end"><span class={'pill tone-' + (s.state === 'donne' ? 'ok' : s.state === 'absent' ? 'warn' : s.state === 'todo' ? 'info' : 'muted')}>{stateText(s)}</span></span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
      {other.length > 0 && <p class="tiny muted">{other.length} passage{other.length > 1 ? 's' : ''} saisi{other.length > 1 ? 's' : ''} sans nom dans la liste (journal).</p>}
      <div class="sticky-action hrow">
        <Button kind="soft" icon="pencil" onClick={() => openResidents(door)}>Noms et étages</Button>
        <Button kind="grow" icon="share" class="grow" onClick={share} data-testid="recap-share">Partager</Button>
      </div>
    </div>
  );
}

export { floorRank, parseFloor };
