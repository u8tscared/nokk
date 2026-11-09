// « Donner mon avis » : une idée, un souci ou un bravo, envoyé à l'équipe Nokk. Gardé et renvoyé plus tard sans réseau.
import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Button, DotIcon, Seg, toast } from '../ui/ui.jsx';
import { openSheet, route } from '../lib/nav.js';
import { feel } from '../lib/feedback.js';
import { account } from '../lib/account.js';
import { API_BASE } from '../lib/api.js';
import { idToken } from '../lib/auth.js';
import { settings, saveSettings } from '../lib/store.js';

const QKEY = 'nokk:avis:queue';
const readQ = () => { try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch { return []; } };
const writeQ = (q) => { try { q.length ? localStorage.setItem(QKEY, JSON.stringify(q)) : localStorage.removeItem(QKEY); } catch {} };

async function post(body) {
  let tok = null;
  try { if (account.peek()) tok = await idToken(); } catch {}
  const r = await fetch(API_BASE + '/feedback', { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('http ' + r.status);
}

/** Renvoie les avis gardés quand le réseau (ou le serveur) n'était pas là. */
export async function flushAvis() {
  const q = readQ();
  if (!q.length) return;
  const left = [];
  for (const b of q) { try { await post(b); } catch { left.push(b); } }
  writeQ(left);
}

export function openAvis(context = '') {
  feel('sheet');
  openSheet(({ close }) => <Avis close={close} context={context} />, { label: 'Donner mon avis' });
}

function Avis({ close, context }) {
  const [kind, setKind] = useState('idee');
  const [note, setNote] = useState(0);
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!message.trim()) { toast('Écrivez quelques mots', { error: true }); return; }
    setBusy(true);
    const body = { kind, message: message.trim(), note: note || undefined, contact: contact.trim() || undefined, page: context || route.peek(), ref: undefined, ua: navigator.userAgent.slice(0, 200) };
    try { await post(body); toast('Merci ! Votre avis est bien arrivé'); }
    catch { writeQ([...readQ(), body]); toast('Merci ! Votre avis partira dès que possible'); }
    saveSettings({ avisAt: Date.now() });
    feel('done');
    setBusy(false);
    close();
  };
  return (
    <div class="stack avis" data-testid="avis">
      <div class="sheet-head"><div><div class="tiny muted">Nokk est fait avec des pompiers volontaires</div><h2>Votre avis compte</h2></div></div>
      <Seg label="Type" value={kind} onChange={setKind} options={[{ value: 'idee', label: 'Une idée' }, { value: 'bug', label: 'Un souci' }, { value: 'bravo', label: 'Un bravo' }]} />
      <div class="field"><span class="label">Votre note</span>
        <div class="stars" role="radiogroup" aria-label="Note sur 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button type="button" key={n} role="radio" aria-checked={note === n ? 'true' : 'false'} aria-label={n + ' sur 5'} class={n <= note ? 'on' : ''} onClick={() => { feel('tick'); setNote(note === n ? 0 : n); }} data-testid={'star-' + n}>★</button>
          ))}
        </div>
      </div>
      <label class="field"><span class="label">{kind === 'bug' ? 'Que s\'est-il passé ?' : kind === 'bravo' ? 'Qu\'est-ce qui vous plaît ?' : 'Votre idée'}</span>
        <textarea class="input" rows={4} maxLength={2000} value={message} onInput={(e) => setMessage(e.currentTarget.value)} placeholder={kind === 'bug' ? 'Ex. la carte ne se charge pas dans le secteur 3' : kind === 'bravo' ? 'Ex. la caisse en fin de soirée, un bonheur' : 'Ex. pouvoir imprimer la liste des rues'} data-testid="avis-message" />
      </label>
      {!account.value && (
        <label class="field"><span class="label">E-mail (facultatif)</span>
          <input class="input" type="email" inputMode="email" value={contact} onInput={(e) => setContact(e.currentTarget.value)} placeholder="Pour qu'on puisse vous répondre" />
        </label>
      )}
      <div class="sticky-action"><Button kind="coral full" icon="heart" disabled={busy} onClick={send} data-testid="avis-send">{busy ? 'Envoi…' : 'Envoyer'}</Button></div>
    </div>
  );
}

export function AvisCard() {
  return (
    <button class="card hrow admin-entry" onClick={() => openAvis()} data-testid="avis-entry">
      <DotIcon icon="note" tone="warn" />
      <span class="grow"><span class="card-title">Donner mon avis</span><span class="small muted" style={{ display: 'block' }}>Une idée, un souci, un bravo : on lit tout</span></span>
      <Icon name="chevR" class="chev" />
    </button>
  );
}

/** Après la première tournée terminée, on demande une fois. */
export function askAvisOnce() {
  if (settings.peek().avisAsked) return false;
  saveSettings({ avisAsked: Date.now() });
  return true;
}
