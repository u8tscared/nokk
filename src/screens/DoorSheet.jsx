import { useState, useRef, useEffect } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Button, IconButton, Seg, Stepper, NumPad, toast, confetti, Pill, Bump, Field, shake } from '../ui/ui.jsx';
import { data, byDoor, addVisit, removeVisit, updateDoor, memberById, demo } from '../lib/store.js';
import { doorState, formatEuro, suggestAmount, revisitHint, RESULTS, METHODS } from '../lib/model.js';
import { doorAfter, stats, sectorDoors, repasserMode } from '../lib/tour.js';
import { flyTo } from '../ui/MapView.jsx';
import { feel } from '../lib/feedback.js';
import { inputKinds } from '../lib/keyboard.js';
import { openSheet, closeSheet } from '../lib/nav.js';

const QUICK = [500, 1000, 1500, 2000, 3000, 5000];

function when(ts) {
  const d = new Date(ts);
  const today = new Date();
  const day = d.toDateString() === today.toDateString() ? "aujourd'hui" : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
  return `${day} à ${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
}

export function openDoor(doorId) {
  openSheet(({ close }) => <DoorSheet doorId={doorId} close={close} />, { label: 'Porte', class: 'door-sheet' });
}

export function DoorSheet({ doorId: initialId, close }) {
  const [doorId, setDoorId] = useState(initialId);
  const door = data.value.doors.find((d) => d.id === doorId);
  const list = byDoor.value.get(doorId) || [];
  const st = door ? doorState(door, list) : null;
  const org = data.value.org || {};
  const sectorVisits = data.value.visits.filter((v) => v.sectorId === door?.sectorId);
  const suggested = door ? suggestAmount(door, sectorVisits, org.price || 1000) : 1000;

  const [amount, setAmount] = useState(suggested);
  const [method, setMethod] = useState('especes');
  const [cals, setCals] = useState(1);
  const [more, setMore] = useState(false);
  const [keypad, setKeypad] = useState(false);
  const [typed, setTyped] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [note, setNote] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const bodyRef = useRef();
  const nameRef = useRef();

  // Nouvelle porte : on remet le formulaire à zéro.
  useEffect(() => {
    const dd = data.value.doors.find((d) => d.id === doorId);
    if (!dd) return;
    setAmount(suggestAmount(dd, data.value.visits.filter((v) => v.sectorId === dd.sectorId), org.price || 1000));
    setMethod('especes'); setCals(1); setMore(dd.flats > 1); setKeypad(false); setTyped(''); setName(''); setUnit(''); setNote(''); setChequeNo('');
    bodyRef.current?.closest('.sheet-body')?.scrollTo({ top: 0 });
  }, [doorId]);

  if (!door) return <div class="empty"><p>Cette porte n'existe plus.</p></div>;

  const next = doorAfter(doorId);
  const lastYear = door.lastYear?.amount;
  const lo = Math.max(500, Math.round((suggested * 0.7) / 500) * 500);
  const hi = Math.round((suggested * 1.3) / 500) * 500;
  const isBuilding = door.flats > 1;

  function advance() {
    if (isBuilding && !st.closed) return; // on reste dans l'immeuble
    const n = doorAfter(doorId);
    if (n && n.id !== doorId) {
      setDoorId(n.id);
      flyTo(n.p);
    } else {
      close();
    }
  }

  function afterSave(v) {
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

  function record(result) {
    const v = addVisit({ doorId, sectorId: door.sectorId, result, unit: unit || undefined, note: note || undefined });
    feel(result === 'refus' ? 'err' : 'ok');
    const label = result === 'absent' ? 'Absent · on repassera' : result === 'refus' ? 'Refus noté · on ne repassera pas' : 'Déjà pris noté';
    toast(label, { undo: () => { removeVisit(v.id); setDoorId(doorId); } });
    if (!afterSave(v)) advance();
  }

  function give() {
    if (method === 'cheque' && !name.trim()) {
      setMore(true);
      setTimeout(() => { shake(nameRef.current); nameRef.current?.focus(); }, 60);
      toast('Le nom inscrit sur le chèque, pour la remise en banque', { error: true });
      return;
    }
    if (!amount && amount !== 0) return;
    const v = addVisit({
      doorId, sectorId: door.sectorId, result: 'donne', amount, method, calendars: cals,
      name: name.trim() || undefined, unit: unit.trim() || undefined, note: note.trim() || undefined, chequeNo: chequeNo.trim() || undefined,
    });
    feel('ok');
    toast(`${formatEuro(amount)} enregistrés${method !== 'especes' ? ' · ' + METHODS[method].label.toLowerCase() : ''}`, { undo: () => { removeVisit(v.id); setDoorId(doorId); } });
    if (!afterSave(v)) {
      if (isBuilding) { setName(''); setUnit(''); setNote(''); setChequeNo(''); }
      advance();
    }
  }

  function closeBuilding() {
    const v = addVisit({ doorId, sectorId: door.sectorId, result: 'absent', closed: true, unit: 'Fin', note: 'Immeuble terminé' });
    toast('Immeuble terminé', { undo: () => removeVisit(v.id) });
    feel('ok');
    const n = doorAfter(doorId);
    if (n) { setDoorId(n.id); flyTo(n.p); } else close();
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

  const passes = list.filter((v) => v.result === 'absent' && !v.closed);
  const unitsDone = st.units || 0;

  return (
    <div class="door" ref={bodyRef}>
      <div class="sheet-head">
        <div class="grow">
          <h2>{door.num} {door.street}</h2>
          <p class="small muted door-meta">
            {lastYear ? <>L'an dernier : {formatEuro(lastYear)}</> : <>Première visite</>}
            {door.code && <> · code {door.code}</>}
            {isBuilding && <> · {door.flats} logements</>}
            {passes.length > 0 && <> · {passes.length + 1}<sup>e</sup> passage</>}
          </p>
        </div>
        <IconButton icon="x" label="Fermer" class="flat" onClick={close} />
      </div>

      {door.notes && <div class="note-line"><Icon name="note" /> {door.notes}</div>}

      {list.length > 0 && (
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
      )}

      {isBuilding && (
        <div class="building">
          <div class="hrow between">
            <span class="hrow"><Icon name="building" /> <b>{unitsDone} / {door.flats}</b>&nbsp;logements faits</span>
            <button class="link-btn" onClick={closeBuilding}>Immeuble terminé</button>
          </div>
          <Field id="unit" label="Appartement ou étage">
            <input id="unit" class="input" placeholder="Ex. 401, bât. B 2e gauche" value={unit} onInput={(e) => setUnit(e.currentTarget.value)} {...inputKinds.text} />
          </Field>
        </div>
      )}

      <div class="give-main">
        <span class="tick"><Icon name="check" /></span> Calendrier donné
      </div>

      <div class="outcomes">
        <button class="outcome tone-warn" onClick={() => record('absent')}><Icon name="absent" />Absent</button>
        <button class="outcome tone-bad" onClick={() => record('refus')}><Icon name="refus" />Refus</button>
        <button class="outcome tone-muted" onClick={() => record('deja')}><Icon name="deja" />Déjà pris</button>
      </div>

      <div class="amount-block">
        <div class="stepper">
          <IconButton icon="minus" label="Moins 1 €" onClick={() => { setTyped(''); setAmount(Math.max(0, amount - 100)); }} />
          <button class="amount" onClick={() => { setKeypad(!keypad); setTyped(''); }} aria-label={`Montant ${formatEuro(amount)}, toucher pour saisir`}>
            <Bump value={amount} class="big-num">{formatEuro(amount)}</Bump>
          </button>
          <IconButton icon="plus" label="Plus 1 €" onClick={() => { setTyped(''); setAmount(amount + 100); }} />
        </div>
        <div class="tiny muted center">montant habituel ici : {formatEuro(lo)} à {formatEuro(Math.max(hi, lo))}</div>
        {keypad ? (
          <NumPad onKey={onKey} />
        ) : (
          <div class="chips center">
            {QUICK.map((q) => (
              <button class="chip" key={q} aria-pressed={amount === q ? 'true' : 'false'} onClick={() => { feel('tick'); setAmount(q); }}>{formatEuro(q)}</button>
            ))}
          </div>
        )}
      </div>

      <Seg
        label="Moyen de paiement"
        value={method}
        onChange={setMethod}
        options={[
          { value: 'especes', label: 'Espèces' },
          { value: 'carte', label: 'Carte' },
          { value: 'cheque', label: 'Chèque' },
        ]}
      />
      {method === 'carte' && <p class="tiny muted">Paiement sur votre terminal. Le lien direct avec SumUp arrive bientôt.</p>}

      <div class="hrow between cal-row">
        <span class="hrow"><Icon name="calendar" /> Calendriers</span>
        <div class="mini-step">
          <IconButton icon="minus" label="Un calendrier de moins" class="flat" onClick={() => setCals(Math.max(0, cals - 1))} />
          <b class="num">{cals}</b>
          <IconButton icon="plus" label="Un calendrier de plus" class="flat" onClick={() => setCals(cals + 1)} />
        </div>
      </div>

      {!more && !isBuilding ? (
        <button class="link-btn" onClick={() => setMore(true)}><Icon name="plus" size={18} /> Nom, appartement, note</button>
      ) : null}
      {(more || isBuilding) && (
        <div class="stack s8 more-fields">
          <Field id="dname" label={method === 'cheque' ? 'Nom sur le chèque' : 'Nom (facultatif)'}>
            <input id="dname" ref={nameRef} class="input" placeholder="Ex. Mme Dupont" value={name} onInput={(e) => setName(e.currentTarget.value)} {...inputKinds.name} />
          </Field>
          {method === 'cheque' && (
            <Field id="cheque" label="N° de chèque (facultatif)">
              <input id="cheque" class="input" value={chequeNo} onInput={(e) => setChequeNo(e.currentTarget.value)} {...inputKinds.int} />
            </Field>
          )}
          {!isBuilding && (
            <Field id="unit2" label="Bâtiment, appartement (facultatif)">
              <input id="unit2" class="input" placeholder="Ex. bât. A, 401" value={unit} onInput={(e) => setUnit(e.currentTarget.value)} {...inputKinds.text} />
            </Field>
          )}
          <Field id="dnote" label="Note pour la prochaine fois">
            <input id="dnote" class="input" placeholder="Ex. repasser après 18 h" value={note} onInput={(e) => setNote(e.currentTarget.value)} enterKeyHint="done" />
          </Field>
        </div>
      )}

      <div class="hrow door-tools">
        <button class="link-btn" onClick={() => editDoor(door)}><Icon name="pencil" size={18} /> Modifier la porte</button>
      </div>

      <div class="sticky-action">
        <Button kind="coral full" sound="" onClick={give} data-testid="validate">
          {next && !isBuilding ? <>Valider · aller au {next.num}{next.street !== door.street ? ' ' + shortStreet(next.street) : ''}</> : 'Valider'}
        </Button>
      </div>
    </div>
  );
}

function shortStreet(s) {
  return s.replace(/^(Rue|Avenue|Chemin|Place|Impasse|Allée|Boulevard)\s+(de la |des |du |de l'|de )?/i, '').slice(0, 16);
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
      <div class="field"><span class="label">Logements</span><Stepper label="Logements" value={flats} min={1} max={200} onChange={setFlats} format={(v) => <b class="big-num" style={{ fontSize: 28 }}>{v}</b>} /></div>
      <Field id="ecode" label="Digicode"><input id="ecode" class="input" value={code} onInput={(e) => setCode(e.currentTarget.value)} {...inputKinds.text} /></Field>
      <Field id="enotes" label="Note (chien, horaires…)"><input id="enotes" class="input" value={notes} onInput={(e) => setNotes(e.currentTarget.value)} enterKeyHint="done" /></Field>
      <div class="sticky-action"><Button kind="full" type="submit" sound="">Enregistrer</Button></div>
    </form>
  );
}
