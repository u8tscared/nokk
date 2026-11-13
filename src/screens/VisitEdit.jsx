// Corriger un passage déjà saisi : montant (même 0,10 € ou offert), paiement, calendriers, nom, résultat.
// On y arrive depuis la porte, l'immeuble, le récap et le journal.
import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Button, Seg, Field, toast, IconButton } from '../ui/ui.jsx';
import { data, setData, removeVisit, updateVisit } from '../lib/store.js';
import { RESULTS, formatEuro } from '../lib/model.js';
import { openSheet } from '../lib/nav.js';
import { feel } from '../lib/feedback.js';
import { inputKinds } from '../lib/keyboard.js';
import { parseAmount } from '../lib/amount.js';
export { parseAmount };

export function openVisitEdit(v) {
  if (!v) return;
  openSheet(({ close }) => <VisitEdit id={v.id} close={close} />, { label: 'Modifier le passage' });
}

const fmt = (c) => (c / 100).toFixed(2).replace('.', ',').replace(/,00$/, '');

function when(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function VisitEdit({ id, close }) {
  const v = data.value.visits.find((x) => x.id === id);
  const [amount, setAmount] = useState(v ? fmt(v.amount || 0) : '');
  const [method, setMethod] = useState(v?.method || 'especes');
  const [result, setResult] = useState(v?.result || 'donne');
  const [name, setName] = useState(v?.name || '');
  const [cals, setCals] = useState(v?.calendars ?? 1);
  const [chequeNo, setChequeNo] = useState(v?.chequeNo || '');
  const [note, setNote] = useState(v?.note || '');
  const [err, setErr] = useState('');
  if (!v) return <div class="empty"><p>Ce passage a été supprimé.</p></div>;
  const door = data.value.doors.find((x) => x.id === v.doorId);
  const res = v.rid ? door?.residents?.find((r) => r.id === v.rid) : null;
  const c = parseAmount(amount);

  function save(e) {
    e.preventDefault();
    if (result === 'donne' && c === null) { setErr('Montant en euros, par exemple 10 ou 0,50'); return; }
    updateVisit(v.id, {
      result,
      amount: result === 'donne' ? c : undefined,
      method: result === 'donne' ? method : undefined,
      calendars: result === 'donne' ? cals : undefined,
      chequeNo: result === 'donne' && method === 'cheque' ? chequeNo.trim() || undefined : undefined,
      name: name.trim() || undefined,
      note: note.trim() || undefined,
    });
    feel('ok');
    toast(result === 'donne' ? `Corrigé · ${c ? formatEuro(c) : 'offert'}` : 'Passage corrigé');
    close();
  }

  return (
    <form class="stack visit-edit" onSubmit={save} data-testid="visit-edit">
      <div class="sheet-head">
        <div class="grow">
          <div class="tiny muted">{when(v.ts)}</div>
          <h2>{door ? `${door.num} ${door.street}` : 'Passage'}{res?.name ? ' · ' + res.name : v.unit ? ' · ' + v.unit : ''}</h2>
        </div>
        <IconButton type="button" icon="x" label="Fermer" class="flat" onClick={close} />
      </div>
      <Seg label="Résultat" value={result} onChange={setResult} options={Object.entries(RESULTS).map(([k, r]) => ({ value: k, label: r.short }))} />
      {result === 'donne' && (
        <>
          <Field id="eamount" label="Montant du don (€)" error={err} hint="Tous les montants passent : 0,10 €, 12,50 €… ou 0 si le calendrier est offert.">
            <div class="amount-edit">
              <input id="eamount" class="input" value={amount} onFocus={(e) => e.currentTarget.select()} onInput={(e) => { setAmount(e.currentTarget.value); setErr(''); }} {...inputKinds.number} data-testid="edit-amount" />
              <span class="amount-edit-eur">€</span>
            </div>
          </Field>
          <div class="chips">
            {[0, 5, 10, 15, 20].map((q) => (
              <button type="button" class="chip" key={q} aria-pressed={c === q * 100 ? 'true' : 'false'} onClick={() => { feel('tick'); setAmount(String(q)); setErr(''); }}>{q ? q + ' €' : 'Offert'}</button>
            ))}
          </div>
          <Seg label="Paiement" value={method} onChange={setMethod} options={[{ value: 'especes', label: 'Espèces', icon: 'coins' }, { value: 'carte', label: 'Carte', icon: 'card' }, { value: 'cheque', label: 'Chèque', icon: 'cheque' }]} />
          {method === 'cheque' && <Field id="echeque" label="N° de chèque"><input id="echeque" class="input" value={chequeNo} onInput={(e) => setChequeNo(e.currentTarget.value)} {...inputKinds.int} /></Field>}
          <div class="hrow between cal-row">
            <span class="hrow"><Icon name="calendar" /> Calendriers</span>
            <div class="mini-step">
              <IconButton type="button" icon="minus" label="Un calendrier de moins" class="flat" onClick={() => setCals(Math.max(0, cals - 1))} />
              <b class="num">{cals}</b>
              <IconButton type="button" icon="plus" label="Un calendrier de plus" class="flat" onClick={() => setCals(cals + 1)} />
            </div>
          </div>
        </>
      )}
      <Field id="ename" label="Nom"><input id="ename" class="input" value={name} onInput={(e) => setName(e.currentTarget.value)} {...inputKinds.name} /></Field>
      <Field id="enote" label="Note"><input id="enote" class="input" value={note} onInput={(e) => setNote(e.currentTarget.value)} enterKeyHint="done" /></Field>
      <div class="sticky-action hrow">
        <Button kind="danger" type="button" icon="trash" onClick={() => { const snap = v; removeVisit(v.id); close(); toast('Passage supprimé', { undo: () => setData((x) => ({ ...x, visits: [...x.visits, snap].sort((a, b) => a.ts - b.ts) })) }); }} data-testid="visit-delete">Supprimer</Button>
        <Button kind="grow" type="submit" sound="" class="grow" data-testid="visit-save">Enregistrer</Button>
      </div>
    </form>
  );
}
