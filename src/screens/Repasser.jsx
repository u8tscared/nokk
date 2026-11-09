// QR « Repassez plus tard » : la planche de cartes à imprimer, et les demandes reçues des habitants.
import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Button, DotIcon, toast } from '../ui/ui.jsx';
import { data, demo, updateSector, setCurrentSector } from '../lib/store.js';
import { account } from '../lib/account.js';
import { openSheet, go } from '../lib/nav.js';
import { feel } from '../lib/feedback.js';
import { shareFile } from '../lib/share.js';
import { openDoor } from './DoorSheet.jsx';
import { qrReady, serverFeatures, loadFeatures, ensureQr, qrUrl, callbacks, openCallbacks, setCallback, slotLabel, slotDay, slotHours } from '../lib/callbacks.js';

export function openQrCards(s) {
  loadFeatures();
  openSheet(({ close }) => <QrCards sid={s.id} close={close} />, { label: 'Cartes « Repassez plus tard »' });
}

function QrCards({ sid }) {
  const s = data.value.sectors.find((x) => x.id === sid);
  const [busy, setBusy] = useState(false);
  useEffect(() => { loadFeatures(); }, []);
  if (!s) return null;
  const online = demo.value || !!account.value?.team;
  const ready = demo.value || qrReady.value;
  const printed = s.qrPrinted || 0;
  const n = callbacks.value.filter((c) => c.sectorId === s.id).length;
  const print = async () => {
    setBusy(true);
    try {
      const t = ensureQr(s);
      const { qrCardsPdf } = await import('../lib/pdf.js');
      const blob = await qrCardsPdf({ org: data.value.org, sector: s, url: qrUrl(t), from: printed + 1, count: 20 });
      updateSector(s.id, { qrPrinted: printed + 20 });
      await shareFile(`nokk-cartes-${s.name.toLowerCase().replace(/\W+/g, '-')}-${printed + 1}-${printed + 20}.pdf`, blob, 'application/pdf', `Cartes ${s.name}`);
      feel('ok');
    } catch { toast('Impossible de créer la planche, réessayez', { error: true }); }
    setBusy(false);
  };
  return (
    <div class="stack qr-cards" data-testid="qr-cards">
      <div class="sheet-head"><div><div class="tiny muted">{s.name}</div><h2>Cartes « Repassez plus tard »</h2></div></div>
      <ol class="qr-how">
        <li><span>1</span><div><b>Imprimez la planche</b><p class="small muted">20 cartes numérotées sur une feuille A4, à découper.</p></div></li>
        <li><span>2</span><div><b>Absent ? Laissez une carte</b><p class="small muted">Nokk vous dit laquelle : « laissez la carte n° 7 ». Pas besoin d'écrire l'adresse.</p></div></li>
        <li><span>3</span><div><b>L'habitant choisit son créneau</b><p class="small muted">Il scanne, choisit le jour et l'heure. La demande arrive sur la carte de l'équipe, rangée dans la tournée de rattrapage.</p></div></li>
      </ol>
      {!online ? (
        <p class="small note-line"><Icon name="lock" size={16} /> Connectez-vous dans Réglages : les réponses des habitants arrivent par la sauvegarde en ligne.</p>
      ) : !ready && serverFeatures.value === null ? (
        <p class="small note-line"><Icon name="wifiOff" size={16} /> Il faut du réseau pour préparer les cartes. Réessayez une fois connecté.</p>
      ) : !ready ? (
        <p class="small note-line" data-testid="qr-soon"><Icon name="clock" size={16} /> Bientôt disponible : le serveur Nokk est en cours de mise à jour pour recevoir les réponses.</p>
      ) : null}
      <Button kind="coral full" icon="qr" disabled={!online || !ready || busy} onClick={print} data-testid="qr-print">
        {busy ? 'Préparation…' : printed ? `Imprimer 20 cartes de plus (n° ${printed + 1} à ${printed + 20})` : 'Imprimer la planche de 20 cartes'}
      </Button>
      {printed > 0 && <p class="tiny muted center">{printed} cartes imprimées pour ce secteur · {n} réponse{n > 1 ? 's' : ''} reçue{n > 1 ? 's' : ''}</p>}
    </div>
  );
}

/** Bandeau sur la carte : les habitants qui attendent qu'on repasse. */
export function CallbacksBar() {
  const list = openCallbacks.value;
  if (!list.length) return null;
  const first = list[0];
  return (
    <button class="cb-bar" onClick={() => { feel('tap'); openCallbacksSheet(); }} data-testid="cb-bar">
      <span class="cb-count">{list.length}</span>
      <span class="grow"><b>{list.length > 1 ? 'demandes de passage' : 'demande de passage'}</b><span class="tiny muted"> · prochaine {slotLabel(first.slot).toLowerCase()}</span></span>
      <Icon name="chevR" class="chev" />
    </button>
  );
}

export function openCallbacksSheet() {
  openSheet(({ close }) => <CallbacksSheet close={close} />, { label: 'Demandes de passage' });
}

function CallbacksSheet({ close }) {
  const all = callbacks.value;
  const open = all.filter((c) => c.want === 'oui' && !c.done);
  const no = all.filter((c) => c.want === 'non');
  const done = all.filter((c) => c.want === 'oui' && c.done);
  const sectors = new Map(data.value.sectors.map((s) => [s.id, s]));
  return (
    <div class="stack" data-testid="cb-sheet">
      <div class="sheet-head"><div><div class="tiny muted">Tournée de rattrapage</div><h2>{open.length} habitant{open.length > 1 ? 's' : ''} à revoir</h2></div></div>
      {!open.length && <p class="small muted">Aucune demande en attente. Les réponses aux cartes QR arrivent ici.</p>}
      {open.map((c) => (
        <div class="cb-item" key={c.id} data-testid="cb-item">
          <div class="cb-slot"><b>{slotDay(c.slot)}</b><span>{slotHours(c.slot)}</span></div>
          <div class="grow">
            <b>{c.door ? `${c.door.num} ${c.door.street}` : c.address || 'Adresse non précisée'}</b>
            <div class="tiny muted">{[c.name, sectors.get(c.sectorId)?.name, c.n ? `carte n° ${c.n}` : null].filter(Boolean).join(' · ')}</div>
            {c.note && <div class="small cb-note">« {c.note} »</div>}
            <div class="hrow cb-actions">
              {c.door && <Button kind="small" icon="navigate" onClick={() => { close(); setCurrentSector(c.sectorId); go('carte'); setTimeout(() => openDoor(c.door.id), 400); }}>Y aller</Button>}
              {c.email && <a class="btn soft small" href={`mailto:${c.email}?subject=${encodeURIComponent('Passage des pompiers pour les calendriers')}`}><Icon name="mail" /> Écrire</a>}
              <Button kind="soft small" onClick={() => { setCallback(c.id, { status: 'done' }); toast('Demande faite'); }} data-testid="cb-done">Fait</Button>
            </div>
          </div>
        </div>
      ))}
      {no.length > 0 && <p class="tiny muted">{no.length} habitant{no.length > 1 ? 's ont' : ' a'} répondu « non merci » : on ne repasse pas.</p>}
      {done.length > 0 && <p class="tiny muted">{done.length} passage{done.length > 1 ? 's' : ''} déjà fait{done.length > 1 ? 's' : ''}.</p>}
    </div>
  );
}

/** Carte visible dans Secteurs : l'entrée vers les cartes QR, secteur par secteur. */
export function QrEntryCard() {
  const sectors = data.value.sectors;
  if (!sectors.length) return null;
  const printed = sectors.reduce((a, s) => a + (s.qrPrinted || 0), 0);
  return (
    <div class="card qr-entry" data-testid="qr-entry">
      <div class="hrow"><DotIcon icon="qr" tone="bad" /><div class="grow"><div class="card-title">Cartes « Repassez plus tard »</div><div class="small muted">Pour les absents : une carte QR dans la boîte, l'habitant choisit quand on repasse.{printed ? ` ${printed} cartes imprimées.` : ''}</div></div></div>
      <div class="chips" style={{ marginTop: 10 }}>
        {sectors.map((s) => <button class="chip" key={s.id} onClick={() => openQrCards(s)} data-testid={'qr-entry-' + s.id}><Icon name="qr" size={16} /> {s.name}</button>)}
      </div>
    </div>
  );
}
