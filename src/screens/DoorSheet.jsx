import { useState, useRef, useEffect } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Button, IconButton, Seg, Stepper, NumPad, toast, confetti, Bump, Field, shake } from '../ui/ui.jsx';
import { data, byDoor, addVisit, removeVisit, updateDoor, position, geoState } from '../lib/store.js';
import { doorState, formatEuro, suggestAmount, revisitHint, RESULTS, METHODS, unitsOf, nextUnit, prevUnit } from '../lib/model.js';
import { doorAfter, stats, whereNext, startGuide } from '../lib/tour.js';
import { formatDistance } from '../lib/geo.js';
import { flyTo } from '../ui/MapView.jsx';
import { feel } from '../lib/feedback.js';
import { inputKinds } from '../lib/keyboard.js';
import { openSheet } from '../lib/nav.js';
import { startGeo } from '../lib/geoloc.js';

const QUICK = [500, 1000, 1500, 2000, 3000, 5000];
const walk = (m) => Math.max(1, Math.round(m / 75));

function when(ts) {
  const d = new Date(ts);
  const today = new Date();
  const day = d.toDateString() === today.toDateString() ? "aujourd'hui" : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
  return `${day} à ${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
}

export function openDoor(doorId, opts = {}) {
  openSheet(({ close }) => <DoorSheet doorId={doorId} close={close} start={opts.step} />, { label: 'Porte', class: 'door-sheet' });
}

// Coup de tampon : un grand ✓ qui apparaît et s'efface.
function stamp(kind = 'ok') {
  const el = document.querySelector('.door-sheet');
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const s = document.createElement('div');
  s.className = 'stamp tone-' + kind;
  s.innerHTML = kind === 'ok'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M8 12h8"/></svg>';
  el.appendChild(s);
  setTimeout(() => s.remove(), 700);
}

export function DoorSheet({ doorId: initialId, close, start }) {
  const [doorId, setDoorId] = useState(initialId);
  const [step, setStep] = useState(start || 'ask'); // ask | give | pick
  const [motion, setMotion] = useState('in'); // sens de l'animation : in | fwd | back | next
  const door = data.value.doors.find((d) => d.id === doorId);
  const list = byDoor.value.get(doorId) || [];
  const st = door ? doorState(door, list) : null;
  const org = data.value.org || {};
  const suggested = door ? suggestAmount(door, data.value.visits.filter((v) => v.sectorId === door.sectorId), org.price || 1000) : 1000;
  const isBuilding = door?.flats > 1;
  const units = isBuilding ? unitsOf(list) : [];

  const [amount, setAmount] = useState(suggested);
  const [method, setMethod] = useState('especes');
  const [cals, setCals] = useState(1);
  const [keypad, setKeypad] = useState(false);
  const [typed, setTyped] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [chequeNo, setChequeNo] = useState('');
  const [popUnit, setPopUnit] = useState(null);
  const [naming, setNaming] = useState(false); // le clavier est ouvert sur le nom : on ne garde que l'essentiel
  const [leaving, setLeaving] = useState(null); // immeuble qu'on vient de quitter (pour le titre du choix)
  const bodyRef = useRef();
  const nameRef = useRef();

  function resetForm(dd = door) {
    if (!dd) return;
    setAmount(suggestAmount(dd, data.value.visits.filter((v) => v.sectorId === dd.sectorId), org.price || 1000));
    setMethod('especes'); setCals(1); setKeypad(false); setTyped(''); setName(''); setNote(''); setNoteOpen(false); setChequeNo('');
  }

  // Nouvel arrêt : formulaire remis à zéro, logement suivant proposé.
  useEffect(() => {
    const dd = data.value.doors.find((d) => d.id === doorId);
    if (!dd) return;
    resetForm(dd);
    const u = unitsOf(byDoor.value.get(doorId) || []);
    const last = [...u].reverse().find((v) => v.unit);
    setUnit(dd.flats > 1 ? (last ? nextUnit(last.unit) || String(u.length + 1) : String(u.length + 1)) : '');
    bodyRef.current?.closest('.sheet-body')?.scrollTo({ top: 0 });
  }, [doorId]);

  if (!door) return <div class="empty"><p>Cette porte n'existe plus.</p></div>;

  function go(nextStep, how = 'fwd') {
    setMotion(how);
    setStep(nextStep);
    bodyRef.current?.closest('.sheet-body')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function moveTo(d, how = 'next') {
    setLeaving(null);
    setMotion(how);
    setDoorId(d.id);
    setStep('ask');
    flyTo(d.p);
  }

  function sectorFinished() {
    const s = stats.value;
    if (s.total && s.done === s.total) {
      feel('done');
      confetti();
      toast('Secteur terminé, bravo !');
      close();
      return true;
    }
    return false;
  }

  // Après une saisie : on reste dans l'immeuble, sinon on file à la porte suivante.
  function after(savedUnit) {
    if (sectorFinished()) return;
    if (isBuilding) {
      const now = doorState(door, byDoor.value.get(doorId) || []);
      if (now.closed) {
        feel('done');
        setLeaving({ door, done: true });
        go('pick', 'next');
        return;
      }
      setPopUnit(savedUnit || '_last');
      setUnit(nextUnit(savedUnit) || String(unitsOf(byDoor.value.get(doorId) || []).length + 1));
      resetForm();
      go('ask', 'back');
      return;
    }
    const n = doorAfter(doorId);
    if (n && n.id !== doorId) moveTo(n);
    else close();
  }

  function record(result) {
    const u = unit.trim();
    const v = addVisit({ doorId, sectorId: door.sectorId, result, unit: u || undefined, name: name.trim() || undefined, note: note.trim() || undefined });
    feel(result === 'refus' ? 'err' : 'ok');
    stamp(result === 'absent' ? 'warn' : 'muted');
    const label = result === 'absent' ? 'Absent · on repassera' : result === 'refus' ? 'Refus noté · on ne repassera pas' : 'Déjà pris noté';
    toast((u ? u + ' · ' : '') + label, { undo: () => { removeVisit(v.id); setMotion('back'); setDoorId(doorId); setStep('ask'); if (u) setUnit(u); } });
    after(u);
  }

  function give() {
    if (method === 'cheque' && !name.trim()) {
      setTimeout(() => { shake(nameRef.current); nameRef.current?.focus(); }, 60);
      toast('Le nom inscrit sur le chèque, pour la remise en banque', { error: true });
      return;
    }
    if (!amount) { toast('Choisissez un montant', { error: true }); return; }
    const u = unit.trim();
    const v = addVisit({
      doorId, sectorId: door.sectorId, result: 'donne', amount, method, calendars: cals,
      name: name.trim() || undefined, unit: u || undefined, note: note.trim() || undefined, chequeNo: chequeNo.trim() || undefined,
    });
    feel('ok');
    stamp('ok');
    toast(`${formatEuro(amount)} enregistrés${method !== 'especes' ? ' · ' + METHODS[method].label.toLowerCase() : ''}`, { undo: () => { removeVisit(v.id); setMotion('back'); setDoorId(doorId); setStep('give'); } });
    after(u);
  }

  function closeBuilding() {
    const v = addVisit({ doorId, sectorId: door.sectorId, result: 'absent', closed: true, unit: 'Fin', note: 'Immeuble terminé' });
    toast('Immeuble terminé', { undo: () => { removeVisit(v.id); setMotion('back'); setStep('ask'); } });
    feel('done');
    if (sectorFinished()) return;
    setLeaving({ door, done: true });
    go('pick', 'next');
  }

  function leaveBuilding() {
    feel('tap');
    setLeaving({ door, done: false });
    go('pick', 'fwd');
  }

  function onKey(k) {
    let t = typed;
    if (k === '⌫') t = t.slice(0, -1);
    else if (k === ',') { if (!t.includes(',')) t = (t || '0') + ','; }
    else if (t.length < 6) {
      if (t.includes(',') && t.split(',')[1].length >= 2) return;
      t = t === '0' ? k : t + k;
    }
    setTyped(t);
    setAmount(Math.round(parseFloat((t || '0').replace(',', '.')) * 100));
  }

  const here = position.value && Date.now() - position.value.ts < 120000 ? position.value.p : null;
  const away = here ? Math.hypot((here[0] - door.p[0]) * 111320 * Math.cos((door.p[1] * Math.PI) / 180), (here[1] - door.p[1]) * 110540) : null;
  const passes = list.filter((v) => v.result === 'absent' && !v.closed);
  const lastYear = door.lastYear?.amount;
  const next = doorAfter(doorId);
  const usual = Math.round(suggested / 500) * 500;
  // Noms déjà vus à cette porte (et l'an dernier) : un toucher suffit.
  const known = [...new Set([...list.filter((v) => !unit || v.unit === unit.trim()).map((v) => v.name), door.lastYear?.name].filter((x) => x && x.trim()))].slice(-3).reverse();
  const nameProps = {
    onFocus: () => setNaming(true),
    onBlur: () => setTimeout(() => { const a = document.activeElement; if (!a || !/^(aname|dname)$/.test(a.id)) setNaming(false); }, 120),
  };
  const suggest = naming && known.length > 0 && !known.includes(name.trim()) && (
    <div class="name-suggest" data-testid="name-suggest">
      {known.map((n) => <button key={n} type="button" class="chip" onPointerDown={(e) => e.preventDefault()} onClick={() => { feel('tick'); setName(n); }}>{n}</button>)}
    </div>
  );

  return (
    <div class={'door' + (naming ? ' naming' : '')} ref={bodyRef}>
      {step !== 'pick' && (
        <div class={'stop-head anim-' + motion} key={'h' + doorId}>
          <span class={'stop-kind' + (isBuilding ? ' building' : '')}><Icon name={isBuilding ? 'building' : 'door'} /></span>
          <div class="grow">
            <div class="stop-kicker">
              <span>{isBuilding ? <>Immeuble · {door.flats} logements</> : 'Maison'}</span>
              {away != null && away > 15 && <span class="away"><Icon name="walk" size={14} /> {formatDistance(away)}</span>}
            </div>
            <h2>{door.num} {door.street}</h2>
            <p class="small muted door-meta">
              {lastYear ? <>{door.lastYear.year || 'L\'an dernier'} : <b>{formatEuro(lastYear)}</b>{door.lastYear.name ? <> · {door.lastYear.name}</> : null}</> : door.lastYear?.result ? <>{door.lastYear.year || 'L\'an dernier'} : {door.lastYear.result === 'absent' ? 'absent' : door.lastYear.result === 'refus' ? 'refus' : 'déjà pris'}</> : <>Première visite</>}
              {passes.length > 0 && !isBuilding && <> · {passes.length + 1}<sup>e</sup> passage</>}
            </p>
          </div>
          <IconButton icon="x" label="Fermer" class="flat" onClick={close} />
        </div>
      )}

      {step !== 'pick' && (
        <div class="stop-notes nm-hide">
          {door.code && <span class="code-chip"><Icon name="key" size={16} /> {door.code}</span>}
          {door.notes && <span class="note-line"><Icon name="note" size={16} /> {door.notes}</span>}
          <QuickTags door={door} />
        </div>
      )}

      {step !== 'pick' && isBuilding && !naming && (
        <BuildingBar door={door} st={st} units={units} unit={unit} setUnit={setUnit} pop={popUnit} />
      )}

      {step === 'ask' && (
        <div class={'stage anim-' + motion} key={'ask' + doorId + units.length}>
          {!isBuilding && list.length > 0 && !naming && <History list={list} st={st} />}
          <div class="ask-name">
            <label for="aname"><Icon name="user" size={18} /></label>
            <input id="aname" class="input" placeholder={isBuilding ? 'Nom sur l\'interphone (facultatif)' : 'Nom sur la boîte (facultatif)'} value={name} onInput={(e) => setName(e.currentTarget.value)} {...inputKinds.name} {...nameProps} autoComplete="off" enterKeyHint="done" data-testid="ask-name" />
          </div>
          {suggest}
          <div class="ask-label">{isBuilding ? <>Logement <b>{unit || 'suivant'}</b> : ils donnent ?</> : 'Ils donnent ?'}</div>
          <button class="yes-btn" data-autofocus onClick={() => { feel('tap'); go('give'); }} data-testid="yes">
            <span class="yes-ico"><Icon name="check" /></span>
            <span class="grow">Oui, ils donnent</span>
            <span class="yes-hint">{formatEuro(usual)} habituel</span>
          </button>
          <div class="outcomes">
            <button class="outcome tone-warn" onClick={() => record('absent')}><Icon name="absent" />Absent</button>
            <button class="outcome tone-bad" onClick={() => record('refus')}><Icon name="refus" />Non merci</button>
            <button class="outcome tone-muted" onClick={() => record('deja')}><Icon name="deja" />Déjà pris</button>
          </div>
          {isBuilding ? (
            <div class="building-actions nm-hide">
              <Button kind="soft full" icon="swap" onClick={leaveBuilding} data-testid="leave-building">Changer de bâtiment</Button>
              <button class="link-btn" onClick={closeBuilding} data-testid="close-building"><Icon name="flag" size={18} /> Immeuble fini</button>
            </div>
          ) : (
            <div class="door-tools3 nm-hide">
              <button class="link-btn" onClick={() => { feel('tap'); updateDoor(door.id, { flats: 2 }); setUnit(String(list.filter((v) => !v.closed).length + 1)); toast('Deux foyers ici : saisissez-les l\'un après l\'autre'); }} data-testid="two-homes"><Icon name="plus" size={18} /> 2 sonnettes</button>
              <button class="link-btn" onClick={() => { feel('tap'); setLeaving(null); go('pick'); }} data-testid="pick-other"><Icon name="swap" size={18} /> Autre porte</button>
              <button class="link-btn" onClick={() => editDoor(door)}><Icon name="pencil" size={18} /> Modifier</button>
            </div>
          )}
        </div>
      )}

      {step === 'give' && (
        <div class={'stage anim-' + motion} key={'give' + doorId}>
          {naming && (
            <button type="button" class="give-summary" onPointerDown={(e) => e.preventDefault()} onClick={() => document.activeElement?.blur()}>
              <b>{formatEuro(amount)}</b> · {METHODS[method].label} · {cals} calendrier{cals > 1 ? 's' : ''}
            </button>
          )}
          <div class="give-top nm-hide">
            <button class="link-btn back-link" onClick={() => go('ask', 'back')}><Icon name="chevL" size={18} /> Retour</button>
            <span class="tiny muted">{isBuilding && unit ? 'Logement ' + unit : 'Montant du don'}</span>
          </div>
          <button class={'amount-display nm-hide' + (keypad ? ' typing' : '')} onClick={() => { feel('tick'); setKeypad(!keypad); setTyped(''); }} aria-label={`Montant ${formatEuro(amount)}, toucher pour saisir un autre montant`}>
            <Bump value={amount} class="big-num">{formatEuro(amount)}</Bump>
            {keypad && <span class="caret" />}
          </button>
          {naming ? null : keypad ? (
            <>
              <NumPad onKey={onKey} />
              <button class="link-btn center" onClick={() => { setKeypad(false); setTyped(''); }}>Montants rapides</button>
            </>
          ) : (
            <div class="amount-grid">
              {QUICK.map((q) => (
                <button class="amount-tile" key={q} aria-pressed={amount === q ? 'true' : 'false'} onClick={() => { feel('tick'); setAmount(q); }}>
                  {formatEuro(q)}
                  {q === usual && <small>habituel</small>}
                </button>
              ))}
              <button class="amount-tile other" onClick={() => { feel('tick'); setKeypad(true); setTyped(''); }} data-testid="other-amount"><Icon name="pencil" size={18} /> Autre montant</button>
            </div>
          )}

          {!naming && <Seg
            label="Moyen de paiement"
            value={method}
            onChange={(m) => { setMethod(m); if (m === 'cheque') setTimeout(() => nameRef.current?.focus({ preventScroll: true }), 80); }}
            options={[
              { value: 'especes', label: 'Espèces', icon: 'coins' },
              { value: 'carte', label: 'Carte', icon: 'card' },
              { value: 'cheque', label: 'Chèque', icon: 'cheque' },
            ]}
          />}
          {method === 'carte' && !naming && <p class="tiny muted">Paiement sur votre terminal. Le lien direct avec SumUp arrive bientôt.</p>}

          <Field id="dname" label={method === 'cheque' ? 'Nom sur le chèque' : 'Nom (facultatif)'}>
            <input id="dname" ref={nameRef} class="input" placeholder="Ex. Mme Dupont" value={name} onInput={(e) => setName(e.currentTarget.value)} {...inputKinds.name} {...nameProps} autoComplete="off" enterKeyHint={method === 'cheque' ? 'next' : 'done'} />
          </Field>
          {suggest}
          {method === 'cheque' && (
            <Field id="cheque" label="N° de chèque (facultatif)">
              <input id="cheque" class="input" value={chequeNo} onInput={(e) => setChequeNo(e.currentTarget.value)} {...inputKinds.int} />
            </Field>
          )}

          <div class="hrow between cal-row nm-hide">
            <span class="hrow"><Icon name="calendar" /> Calendriers</span>
            <div class="mini-step">
              <IconButton icon="minus" label="Un calendrier de moins" class="flat" onClick={() => setCals(Math.max(0, cals - 1))} />
              <Bump value={cals} class="num"><b>{cals}</b></Bump>
              <IconButton icon="plus" label="Un calendrier de plus" class="flat" onClick={() => setCals(cals + 1)} />
            </div>
          </div>

          {naming ? null : !noteOpen ? (
            <button class="link-btn" onClick={() => setNoteOpen(true)} data-testid="add-note"><Icon name="note" size={18} /> Ajouter une note</button>
          ) : (
            <Field id="dnote" label="Note pour la prochaine fois">
              <input id="dnote" class="input" placeholder="Ex. repasser après 18 h" value={note} onInput={(e) => setNote(e.currentTarget.value)} enterKeyHint="done" />
            </Field>
          )}

          <div class="sticky-action">
            <Button kind="coral full" sound="" onClick={give} data-testid="validate">
              Enregistrer {formatEuro(amount)}{!isBuilding && next ? <span class="btn-sub"> · puis le {next.num}</span> : null}
            </Button>
          </div>
        </div>
      )}

      {step === 'pick' && (
        <div class={'stage anim-' + motion} key={'pick' + doorId}>
          <NextPicker
            from={door}
            leaving={leaving}
            onGo={(d) => { feel('tap'); moveTo(d); }}
            onMap={(d) => { startGuide(d, door.p); close(); }}
            onBack={leaving?.done ? null : () => go('ask', 'back')}
            close={close}
          />
        </div>
      )}
    </div>
  );
}

function History({ list, st }) {
  return (
    <div class="history">
      {list.slice(-3).map((v) => (
        <div class="hist" key={v.id}>
          <span class={'hdot st-' + v.result} />
          <span class="grow">{v.closed ? 'Immeuble terminé' : RESULTS[v.result]?.short}{v.unit && !v.closed ? ' · ' + v.unit : ''}{v.amount ? ' · ' + formatEuro(v.amount) : ''}</span>
          <span class="muted tiny">{when(v.ts)}</span>
        </div>
      ))}
      {st.state === 'absent' && <div class="tiny muted">{revisitHint(list[list.length - 1])}</div>}
    </div>
  );
}

// Barre d'immeuble : avancement, logements déjà vus, logement en cours.
function BuildingBar({ door, st, units, unit, setUnit, pop }) {
  const done = st.units || 0;
  const pct = Math.min(1, done / door.flats);
  const R = 19, C = 2 * Math.PI * R;
  const strip = useRef();
  useEffect(() => { strip.current?.scrollTo({ left: strip.current.scrollWidth, behavior: 'smooth' }); }, [units.length]);
  return (
    <div class="building">
      <div class="hrow">
        <svg class="ring" viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r={R} class="ring-bg" />
          <circle cx="24" cy="24" r={R} class="ring-fg" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - pct) }} />
        </svg>
        <div class="grow">
          <b class="num"><Bump value={done}>{done}</Bump> / {door.flats}</b> <span class="small muted">logements faits</span>
          {(() => { const a = units.filter((v) => v.result === 'absent').length; return <div class="tiny muted">{a ? `${a} absent${a > 1 ? 's' : ''} à repasser` : 'Aucun absent pour l\'instant'}</div>; })()}
        </div>
      </div>
      {units.length > 0 && (
        <div class="unit-strip" ref={strip} data-free>
          {units.map((v, i) => (
            <span key={v.id} class={'unit-chip st-' + v.result + (i === units.length - 1 && pop ? ' pop' : '')}>
              <i />{v.unit || 'Logt ' + (i + 1)}{v.amount ? <small>{formatEuro(v.amount)}</small> : null}
            </span>
          ))}
        </div>
      )}
      <div class="unit-field">
        <label for="unit">Logement</label>
        <IconButton icon="minus" label="Logement précédent" class="flat" onClick={() => { feel('tick'); setUnit(prevUnit(unit)); }} disabled={!/\d/.test(unit)} />
        <input id="unit" class="input" placeholder="Ex. 401" value={unit} onInput={(e) => setUnit(e.currentTarget.value)} {...inputKinds.text} />
        <IconButton icon="plus" label="Logement suivant" class="flat" onClick={() => { feel('tick'); setUnit(nextUnit(unit) || (unit ? unit : '1')); }} />
      </div>
    </div>
  );
}

// « Où aller ensuite ? » : le suivant du parcours, le plus proche, et les autres autour.
function NextPicker({ from, leaving, onGo, onMap, onBack, close }) {
  const w = whereNext(from.id);
  const live = w.here?.live;
  const geo = geoState.value;
  const Row = ({ x, tag, primary }) => {
    const d = x.door;
    const st = doorState(d, byDoor.value.get(d.id) || []);
    const left = d.flats > 1 ? Math.max(0, d.flats - (st.units || 0)) : 0;
    return (
      <div class={'next-card' + (primary ? ' primary' : '')}>
        <button class="next-main" onClick={() => onGo(d)} data-testid={primary ? 'go-next' : undefined}>
          <span class={'stop-kind' + (d.flats > 1 ? ' building' : '')}><Icon name={d.flats > 1 ? 'building' : 'door'} /></span>
          <span class="grow">
            {tag && <span class="next-tag">{tag}</span>}
            <span class="t">{d.num} {d.street}</span>
            <span class="s">
              {d.flats > 1 ? (st.state === 'partiel' ? `Immeuble · encore ${left} logements` : `Immeuble · ${d.flats} logements`) : 'Maison'}
              {st.state === 'absent' ? ' · à repasser' : ''}
            </span>
          </span>
          {x.m != null && <span class="next-dist"><b>{formatDistance(x.m)}</b><small>{walk(x.m)} min</small></span>}
        </button>
        {primary && (
          <div class="next-actions">
            <Button kind="full" icon="walk" onClick={() => onMap(d)} data-testid="go-there">Y aller</Button>
            <Button kind="soft" icon="door" onClick={() => onGo(d)}>J'y suis</Button>
          </div>
        )}
      </div>
    );
  };
  const first = w.closest || w.route;
  const second = w.closest ? w.route : null;
  return (
    <div class="stack s12 picker">
      <div class="sheet-head">
        <div class="grow">
          {leaving?.done && <div class="done-badge"><Icon name="check" /> {leaving.door.num} {leaving.door.street} terminé</div>}
          <h2>Où aller ensuite ?</h2>
          <p class="small muted">{live ? 'Distances depuis votre position, en direct.' : 'Distances depuis ' + from.num + ' ' + from.street + '.'}</p>
        </div>
        <IconButton icon="x" label="Fermer" class="flat" onClick={close} />
      </div>
      {!live && geo !== 'denied' && (
        <button class="geo-nudge" onClick={() => startGeo()}><Icon name="locate" /> Activer ma position pour voir le plus proche</button>
      )}
      {first ? <Row x={first} primary tag={w.closest ? 'Le plus proche de vous' : 'Suivant sur le parcours'} /> : (
        <div class="empty"><p>Plus rien à faire dans ce secteur. Bravo !</p></div>
      )}
      {second && <Row x={second} tag="Suivant sur le parcours" />}
      {w.others.length > 0 && (
        <>
          <div class="label">Autour</div>
          <div class="stack s8">{w.others.map((x) => <Row x={x} key={x.door.id} />)}</div>
        </>
      )}
      {onBack && <button class="link-btn center" onClick={onBack}><Icon name="chevL" size={18} /> Rester ici</button>}
    </div>
  );
}

export function editDoor(door) {
  openSheet(({ close }) => <EditDoor door={door} close={close} />, { label: 'Modifier la porte' });
}

function EditDoor({ door, close }) {
  const [num, setNum] = useState(door.num);
  const [flats, setFlats] = useState(door.flats || 1);
  const [code, setCode] = useState(door.code || '');
  const [notes, setNotes] = useState(door.notes || '');
  return (
    <form class="stack" onSubmit={(e) => { e.preventDefault(); updateDoor(door.id, { num: num.trim() || door.num, flats: Math.max(1, flats), code: code.trim(), notes: notes.trim() }); feel('ok'); toast('Porte mise à jour'); close(); }}>
      <div class="sheet-head"><h2>Modifier la porte</h2></div>
      <Field id="enum" label="Numéro"><input id="enum" class="input" value={num} onInput={(e) => setNum(e.currentTarget.value)} {...inputKinds.text} /></Field>
      <div class="field"><span class="label">C'est…</span>
        <div class="seg">
          <button type="button" aria-pressed={flats === 1 ? 'true' : 'false'} onClick={() => setFlats(1)}><Icon name="door" size={18} /> Une maison</button>
          <button type="button" aria-pressed={flats > 1 ? 'true' : 'false'} onClick={() => setFlats(Math.max(2, flats > 1 ? flats : 8))}><Icon name="building" size={18} /> Un immeuble</button>
        </div>
      </div>
      {flats > 1 && <div class="field"><span class="label">Logements</span><Stepper label="Logements" value={flats} min={2} max={300} onChange={setFlats} format={(v) => <b class="big-num" style={{ fontSize: 28 }}>{v}</b>} /></div>}
      <Field id="ecode" label="Digicode"><input id="ecode" class="input" value={code} onInput={(e) => setCode(e.currentTarget.value)} {...inputKinds.text} /></Field>
      <Field id="enotes" label="Note (chien, horaires…)"><input id="enotes" class="input" value={notes} onInput={(e) => setNotes(e.currentTarget.value)} enterKeyHint="done" /></Field>
      <div class="sticky-action"><Button kind="full" type="submit" sound="">Enregistrer</Button></div>
    </form>
  );
}

// Notes rapides : un toucher, gardées sur la porte pour toute l'équipe et l'an prochain.
export const TAGS = [
  { k: 'chien', label: 'Chien' },
  { k: 'digicode', label: 'Digicode' },
  { k: 'interphone', label: 'Interphone en panne' },
  { k: 'nepas', label: 'Ne pas sonner' },
  { k: 'soir', label: 'Plutôt le soir' },
  { k: 'boite', label: 'Laisser un mot' },
];
function QuickTags({ door }) {
  const [open, setOpen] = useState(false);
  const tags = door.tags || [];
  const on = TAGS.filter((t) => tags.includes(t.k));
  const toggle = (k) => {
    feel('tick');
    const next = tags.includes(k) ? tags.filter((x) => x !== k) : [...tags, k];
    updateDoor(door.id, { tags: next });
  };
  return (
    <div class="quick-tags" data-testid="quick-tags">
      {(open ? TAGS : on).map((t) => (
        <button type="button" key={t.k} class={'qtag' + (tags.includes(t.k) ? ' on' : '') + (t.k === 'nepas' ? ' bad' : '')} aria-pressed={tags.includes(t.k) ? 'true' : 'false'} onClick={() => toggle(t.k)} data-testid={'tag-' + t.k}>{t.label}</button>
      ))}
      <button type="button" class="qtag add" onClick={() => { feel('tap'); setOpen(!open); }} aria-expanded={open ? 'true' : 'false'} data-testid="tags-toggle">{open ? 'OK' : on.length ? '+' : '+ Note rapide'}</button>
    </div>
  );
}
