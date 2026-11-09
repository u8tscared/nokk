// Tournée en cours (chrono, argent, rythme) et bilan de fin de tournée.
import { Icon } from '../ui/icons.jsx';
import { Button, Bump, confetti, toast } from '../ui/ui.jsx';
import { activeSession, startSession, endSession, removeSession, sessionStats, now, formatChrono, formatDuration, sessionsDone } from '../lib/sessions.js';
import { formatEuro } from '../lib/model.js';
import { openSheet } from '../lib/nav.js';
import { feel } from '../lib/feedback.js';
import { data, settings } from '../lib/store.js';
import { openAvis } from './Avis.jsx';

export function TourBar() {
  const s = activeSession.value;
  if (!s) {
    return (
      <button class="tour-start" onClick={() => { feel('tap'); startSession(); toast('Tournée lancée · bon courage !'); }} data-testid="start-tour">
        <span class="tour-dot"><Icon name="clock" size={18} /></span>
        <span class="grow"><b>Lancer la tournée</b><span class="tiny muted"> · chrono, argent, rythme</span></span>
        <Icon name="chevR" />
      </button>
    );
  }
  const st = sessionStats(s, now.value);
  return (
    <div class="tour-live" data-testid="tour-live">
      <div class="tour-live-top">
        <span class="live-dot" aria-hidden="true" />
        <span class="tour-chrono" data-testid="tour-chrono">{formatChrono(now.value - s.startedAt)}</span>
        <span class="grow" />
        <button class="tour-end" onClick={() => { feel('tap'); endTour(s); }} data-testid="end-tour">Terminer</button>
      </div>
      <div class="tour-kpis">
        <div><Bump value={st.amount} class="k">{formatEuro(st.amount)}</Bump><span>récoltés</span></div>
        <div><b class="k">{formatEuro(st.perHour)}</b><span>par heure</span></div>
        <div><b class="k">{formatEuro(st.perPerson)}</b><span>par personne{st.people > 1 ? ` (${st.people})` : ''}</span></div>
        <div><b class="k">{st.doors}</b><span>portes</span></div>
      </div>
    </div>
  );
}

export function endTour(s) {
  endSession(s.id);
  feel('done');
  confetti();
  openReport(s.id);
}

export function openReport(id) {
  openSheet(({ close }) => <Report id={id} close={close} />, { label: 'Bilan de la tournée' });
}

function Report({ id, close }) {
  const s = (data.value.sessions || []).find((x) => x.id === id);
  if (!s) return null;
  const st = sessionStats(s);
  const max = Math.max(1, ...st.hours);
  const day = new Date(s.startedAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div class="report" data-testid="tour-report">
      <div class="sheet-head">
        <div>
          <div class="tiny muted">Bilan · {day}</div>
          <h2>{formatEuro(st.amount)} en {formatDuration(st.ms)}</h2>
          {st.crew.length > 0 && <div class="small muted">{st.crew.join(', ')}</div>}
        </div>
      </div>
      <div class="report-grid">
        <Stat v={formatEuro(st.perHour)} l="par heure" />
        <Stat v={formatEuro(st.perPerson)} l={`par personne (${st.people})`} />
        <Stat v={st.doors} l="portes" />
        <Stat v={st.gifts} l="dons" />
        <Stat v={st.rate + ' %'} l="des portes donnent" />
        <Stat v={formatEuro(st.average)} l="don moyen" />
        <Stat v={st.minutesPerDoor != null ? st.minutesPerDoor + ' min' : '—'} l="par porte" />
        <Stat v={st.calendars} l="calendriers" />
      </div>
      {st.hours.length > 1 && (
        <div class="report-hours" aria-label="Argent récolté heure par heure">
          {st.hours.map((a, i) => (
            <div class="bar-col" key={i}><i style={{ height: Math.max(4, (a / max) * 72) + 'px' }} /><span>{i + 1}e h</span></div>
          ))}
        </div>
      )}
      <div class="report-lines">
        <div class="hrow between"><span><Icon name="coins" size={18} /> Espèces</span><b>{formatEuro(st.especes)}</b></div>
        <div class="hrow between"><span><Icon name="card" size={18} /> Carte</span><b>{formatEuro(st.carte)}</b></div>
        <div class="hrow between"><span><Icon name="cheque" size={18} /> Chèques</span><b>{formatEuro(st.cheque)}</b></div>
        <div class="hrow between"><span><Icon name="absent" size={18} /> Absents · refus</span><b>{st.absent} · {st.refus}</b></div>
        {st.best && <div class="hrow between"><span><Icon name="sparkle" size={18} /> Meilleure rue</span><b>{st.best.street} · {formatEuro(st.best.amount)}</b></div>}
      </div>
      {!settings.value.avisAt && (
        <button class="link-btn center" onClick={() => { close(); setTimeout(() => openAvis('bilan'), 300); }} data-testid="report-avis"><Icon name="heart" size={16} /> Un avis sur Nokk après cette tournée ?</button>
      )}
      <div class="hrow">
        <Button kind="ghost small" icon="trash" onClick={() => { removeSession(s.id); close(); toast('Tournée retirée des statistiques'); }}>Retirer</Button>
        <Button kind="coral full grow" onClick={close} data-testid="report-ok">Super</Button>
      </div>
    </div>
  );
}

const Stat = ({ v, l }) => <div class="stat"><b>{v}</b><span>{l}</span></div>;

// Historique des tournées (écran Comptes).
export function ToursCard() {
  const list = sessionsDone.value;
  if (!list.length) return null;
  const all = list.map((s) => ({ s, st: sessionStats(s) }));
  const total = all.reduce((a, x) => a + x.st.amount, 0);
  const ms = all.reduce((a, x) => a + x.st.ms, 0);
  return (
    <div class="card stack s8" data-testid="tours-card">
      <div class="hrow between"><div class="card-title">Tournées</div><span class="tiny muted">{list.length} · {formatDuration(ms)} · {formatEuro(Math.round(total / (ms / 3600e3)))}/h</span></div>
      {all.slice(0, 12).map(({ s, st }) => (
        <button class="tour-row" key={s.id} onClick={() => openReport(s.id)}>
          <span class="grow">
            <b>{new Date(s.startedAt).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</b>
            <span class="tiny muted"> · {formatDuration(st.ms)} · {st.doors} portes{st.people > 1 ? ` · ${st.people} pers.` : ''}</span>
          </span>
          <span class="right"><b>{formatEuro(st.amount)}</b><span class="tiny muted">{formatEuro(st.perHour)}/h</span></span>
          <Icon name="chevR" class="chev" />
        </button>
      ))}
    </div>
  );
}
