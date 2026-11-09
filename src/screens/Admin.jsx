// Espace admin : réservé au propriétaire de Nokk. Qui utilise l'app, quelles équipes, combien de calendriers.
// Le serveur vérifie lui-même le compte : cet écran ne fait qu'afficher ce qu'il renvoie.
import { useEffect, useState } from 'preact/hooks';
import { computed } from '@preact/signals';
import { Icon } from '../ui/icons.jsx';
import { Button, DotIcon, Seg, Empty, toast } from '../ui/ui.jsx';
import { api } from '../lib/api.js';
import { account } from '../lib/account.js';
import { formatEuro } from '../lib/model.js';
import { openSheet, go } from '../lib/nav.js';
import { feel } from '../lib/feedback.js';

export const ADMIN_EMAILS = ['marceau.ruis@gmail.com'];
export const canAdmin = computed(() => {
  const a = account.value;
  return !!a && (a.admin === true || ADMIN_EMAILS.includes(String(a.email || '').toLowerCase()));
});

const n = (x) => (x || 0).toLocaleString('fr-FR');
const pl = (x, one, many = one + 's') => `${n(x)} ${x > 1 ? many : one}`;
export function ago(ts, at = Date.now()) {
  if (!ts) return 'jamais';
  const m = Math.round((at - ts) / 6e4);
  if (m < 2) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 31) return `il y a ${d} j`;
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
const fresh = (ts, at) => ts && at - ts < 7 * 864e5;
const ROLE = { owner: 'Responsable', member: 'Membre' };
const APP_ROLE = { chef: "Chef d'équipe", pompier: 'Pompier', tresorier: 'Trésorier' };
const errText = (e) => (e?.code === 'not_admin' ? "Ce compte n'a pas accès à l'espace admin." : e?.code === 'network' ? 'Pas de réseau. Réessayez une fois connecté.' : 'Le serveur ne répond pas. Réessayez.');

function useLoad(path) {
  const [state, set] = useState({ loading: true });
  const load = () => {
    set((s) => ({ ...s, loading: true, error: null }));
    api(path).then((data) => set({ data }), (error) => set({ error }));
  };
  useEffect(load, [path]);
  return [state, load];
}

export function AdminScreen() {
  const [{ data: o, error, loading }, reload] = useLoad('/admin');
  const [tab, setTab] = useState('vue');
  const [q, setQ] = useState('');
  if (!canAdmin.value) return <div class="page"><Empty icon="lock" title="Accès réservé" text="L'espace admin est réservé au compte du créateur de Nokk." /></div>;
  const ql = q.trim().toLowerCase();
  const match = (...xs) => !ql || xs.some((x) => String(x || '').toLowerCase().includes(ql));
  return (
    <div class="page rise admin" data-testid="admin">
      <div class="page-head">
        <div><h1>Admin</h1><div class="sub">{o ? `Mis à jour ${ago(o.at)}` : 'Toutes les amicales qui utilisent Nokk'}</div></div>
        <button class="icon-btn" aria-label="Actualiser" onClick={() => { feel('tap'); reload(); }} data-testid="admin-reload"><Icon name="repeat" /></button>
      </div>
      {error && !o && (
        <div class="card stack s8"><div class="hrow"><DotIcon icon="wifiOff" tone="warn" /><div class="grow small">{errText(error)}</div></div><Button kind="soft small" onClick={reload}>Réessayer</Button></div>
      )}
      {loading && !o && <div class="card admin-skel" aria-busy="true"><span /><span /><span /></div>}
      {o && (
        <>
          <Seg label="Vue" value={tab} onChange={setTab} options={[{ value: 'vue', label: 'Résumé' }, { value: 'equipes', label: `Amicales ${o.teams.length}` }, { value: 'comptes', label: `Comptes ${o.accounts.length}` }]} />
          {tab === 'vue' && <Overview o={o} onTab={setTab} />}
          {tab !== 'vue' && (
            <div class="admin-search">
              <Icon name="search" />
              <input class="input" type="search" placeholder={tab === 'equipes' ? 'Chercher une amicale, un code…' : 'Chercher un nom, un e-mail…'} value={q} onInput={(e) => setQ(e.currentTarget.value)} autoComplete="off" enterKeyHint="search" data-testid="admin-search" />
            </div>
          )}
          {tab === 'equipes' && <TeamList teams={o.teams.filter((t) => match(t.name, t.code, t.owner))} at={o.at} reload={reload} />}
          {tab === 'comptes' && <AccountList accounts={o.accounts.filter((a) => match(a.name, a.email, ...a.teams.map((t) => t.name)))} at={o.at} teams={o.teams} reload={reload} />}
        </>
      )}
    </div>
  );
}

function Overview({ o, onTab }) {
  const t = o.totals;
  const top = [...o.teams].sort((a, b) => b.calendars - a.calendars).slice(0, 5);
  return (
    <>
      <div class="kpis" data-testid="admin-kpis">
        <div class="kpi main"><div class="tiny">Calendriers distribués avec Nokk</div><div class="big-num" data-testid="admin-calendars">{n(t.calendars)}</div><div class="tiny">{formatEuro(t.amount)} collectés · {n(t.visits)} portes saisies</div></div>
        <button class="kpi" onClick={() => onTab('comptes')}><div class="tiny muted">Comptes</div><div class="big-num" data-testid="admin-accounts">{n(t.accounts)}</div><div class="tiny muted">{n(t.active7)} actifs cette semaine{t.referrals ? ` · ${n(t.referrals)} parrainés` : ''}</div></button>
        <button class="kpi" onClick={() => onTab('equipes')}><div class="tiny muted">Amicales</div><div class="big-num" data-testid="admin-teams">{n(t.teams)}</div><div class="tiny muted">{pl(t.sectors, 'secteur')}</div></button>
        <div class="kpi"><div class="tiny muted">Pompiers</div><div class="big-num">{n(t.members)}</div><div class="tiny muted">dans les équipes</div></div>
        <div class="kpi"><div class="tiny muted">Tournées</div><div class="big-num">{n(t.tours)}</div><div class="tiny muted">{pl(t.doors, 'porte')} sur les cartes</div></div>
      </div>
      <Activity days={o.days} at={o.at} />
      {top.length > 0 && (
        <div class="card stack s8">
          <div class="card-title">Amicales les plus actives</div>
          {top.map((x) => <TeamRow key={x.id} t={x} at={o.at} />)}
        </div>
      )}
    </>
  );
}

// Calendriers par jour sur 30 jours.
function Activity({ days, at }) {
  const today = Math.floor(at / 864e5);
  const map = new Map(days.map((d) => [Math.floor(d.day / 864e5), d]));
  const list = Array.from({ length: 30 }, (_, i) => map.get(today - 29 + i) || { day: (today - 29 + i) * 864e5, calendars: 0, visits: 0 });
  const max = Math.max(1, ...list.map((d) => d.calendars));
  const total = list.reduce((s, d) => s + d.calendars, 0);
  return (
    <div class="card" data-testid="admin-activity">
      <div class="hrow between"><div class="card-title">30 derniers jours</div><span class="tiny muted">{n(total)} calendriers</span></div>
      <div class="admin-spark" role="img" aria-label={`${total} calendriers sur 30 jours`}>
        {list.map((d) => (
          <span key={d.day} class={d.calendars ? 'on' : ''} style={{ height: Math.max(4, (d.calendars / max) * 100) + '%' }} title={`${new Date(d.day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} : ${d.calendars} calendriers, ${d.visits} portes`} />
        ))}
      </div>
      <div class="hrow between tiny muted"><span>{new Date(list[0].day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span><span>aujourd'hui</span></div>
    </div>
  );
}

function TeamRow({ t, at, reload }) {
  return (
    <button class="admin-row" onClick={() => openTeam(t, reload)} data-testid="admin-team">
      <span class={'admin-dot' + (fresh(t.last, at) ? ' live' : '')} />
      <span class="grow">
        <b>{t.name}</b>
        <span class="tiny muted"> · {t.accounts} compte{t.accounts > 1 ? 's' : ''} · {t.members} pompier{t.members > 1 ? 's' : ''} · {t.last ? 'actif ' + ago(t.last, at) : 'pas encore de tournée'}</span>
      </span>
      <span class="right"><b>{n(t.calendars)}</b><span class="tiny muted">calendriers</span></span>
      <Icon name="chevR" class="chev" />
    </button>
  );
}

function TeamList({ teams, at, reload }) {
  if (!teams.length) return <Empty icon="team" title="Aucune amicale" text="Rien ne correspond à cette recherche." />;
  return <div class="card stack s8">{teams.map((t) => <TeamRow key={t.id} t={t} at={at} reload={reload} />)}</div>;
}

function AccountList({ accounts, at, teams, reload }) {
  if (!accounts.length) return <Empty icon="user" title="Aucun compte" text="Rien ne correspond à cette recherche." />;
  return (
    <div class="card stack s8">
      {accounts.map((a) => (
        <button key={a.uid} class="admin-row" data-testid="admin-account" onClick={() => {
          const t = teams.find((x) => x.id === a.teams[0]?.id);
          if (t) openTeam(t, reload); else toast("Ce compte n'a pas encore d'amicale");
        }}>
          <span class={'admin-dot' + (fresh(a.seenAt, at) ? ' live' : '')} />
          <span class="grow">
            <b>{a.name || a.email || 'Sans nom'}</b>
            <span class="tiny muted" style={{ display: 'block' }}>{a.name && a.email ? a.email + ' · ' : ''}{a.teams.length ? a.teams.map((t) => t.name + (t.role === 'owner' ? ' (resp.)' : '')).join(', ') : 'sans amicale'}</span>
            <span class="tiny muted" style={{ display: 'block' }}>Inscrit {ago(a.createdAt, at)} · vu {ago(a.seenAt, at)}{a.invitedBy ? ' · venu par ' + a.invitedBy : ''}{a.invited ? ` · a fait venir ${a.invited} personne${a.invited > 1 ? 's' : ''}` : ''}</span>
          </span>
          <span class="right"><b>{n(a.calendars)}</b><span class="tiny muted">cal. saisis</span></span>
        </button>
      ))}
    </div>
  );
}

function openTeam(t, reload) {
  feel('sheet');
  openSheet(({ close }) => <TeamSheet t={t} close={close} reload={reload} />, { label: t.name });
}

function TeamSheet({ t, reload }) {
  const [{ data: d, error }, load] = useLoad('/admin/teams/' + t.id);
  const [ask, setAsk] = useState(null);
  const [busy, setBusy] = useState(false);
  const at = Date.now();
  const act = async (uid, action, role) => {
    setBusy(true);
    try {
      await api(`/admin/teams/${t.id}/member`, { method: 'POST', body: { uid, action, role } });
      toast(action === 'remove' ? "Compte retiré de l'amicale" : 'Rôle changé');
      setAsk(null); load(); reload?.();
    } catch (e) { toast(errText(e), { error: true }); }
    setBusy(false);
  };
  const members = d ? [...d.members].sort((a, b) => b.calendars - a.calendars || b.visits - a.visits) : [];
  const maxCal = Math.max(1, ...members.map((m) => m.calendars));
  return (
    <div class="admin-sheet stack s12" data-testid="admin-team-sheet">
      <div class="sheet-head">
        <div><div class="tiny muted">Amicale · code {t.code}</div><h2>{t.name}</h2><div class="small muted">Créée {ago(t.createdAt, at)}{d?.org?.city ? ' · ' + d.org.city : ''}{t.owner ? ' · ' + t.owner : ''}</div></div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="tiny muted">Calendriers</div><div class="big-num">{n(t.calendars)}</div></div>
        <div class="kpi"><div class="tiny muted">Collecté</div><div class="big-num">{formatEuro(t.amount)}</div></div>
        <div class="kpi"><div class="tiny muted">Portes saisies</div><div class="big-num">{n(t.visits)}</div><div class="tiny muted">{n(t.doors)} sur la carte</div></div>
        <div class="kpi"><div class="tiny muted">Tournées</div><div class="big-num">{n(t.tours)}</div><div class="tiny muted">{pl(t.sectors, 'secteur')}</div></div>
      </div>
      {error && !d && <div class="small muted">{errText(error)} <button class="link-btn" onClick={load}>Réessayer</button></div>}
      {!d && !error && <div class="admin-skel" aria-busy="true"><span /><span /></div>}
      {d && (
        <>
          <div class="stack s8">
            <div class="card-title">Pompiers</div>
            {!members.length && <div class="small muted">Aucun pompier enregistré pour l'instant.</div>}
            {members.map((m) => (
              <div class="admin-member" key={m.id} data-testid="admin-member">
                <div class="hrow between">
                  <span><b>{m.name}</b><span class="tiny muted"> · {APP_ROLE[m.role] || 'Pompier'}{m.email ? ' · ' + m.email : ''}</span></span>
                  <b class="admin-num">{n(m.calendars)}</b>
                </div>
                <div class="admin-meter"><span style={{ width: (m.calendars / maxCal) * 100 + '%' }} /></div>
                <div class="tiny muted">{pl(m.visits, 'porte')} · {formatEuro(m.amount)} · {pl(m.tours, 'tournée')}{m.minutes ? ` · ${Math.floor(m.minutes / 60)} h ${String(m.minutes % 60).padStart(2, '0')}` : ''} · {m.last ? 'dernière porte ' + ago(m.last, at) : 'pas encore sorti'}</div>
              </div>
            ))}
          </div>
          {d.sectors.length > 0 && (
            <div class="stack s8">
              <div class="card-title">Secteurs</div>
              {d.sectors.map((s) => (
                <div class="hrow between small" key={s.id}><span>{s.name}</span><span class="muted">{n(s.visits)} portes · <b>{n(s.calendars)}</b> cal. · {formatEuro(s.amount)}</span></div>
              ))}
            </div>
          )}
          <div class="stack s8">
            <div class="card-title">Comptes connectés</div>
            {d.accounts.map((a) => (
              <div class="admin-acc" key={a.uid} data-testid="admin-acc">
                <div class="hrow">
                  <div class="grow">
                    <b>{a.name || a.email || 'Sans nom'}</b> <span class={'admin-tag' + (a.role === 'owner' ? ' own' : '')}>{ROLE[a.role] || a.role}</span>
                    <div class="tiny muted">{a.email} · vu {ago(a.seenAt, at)}</div>
                  </div>
                </div>
                {ask?.uid === a.uid ? (
                  <div class="hrow admin-confirm">
                    <span class="grow small">{ask.action === 'remove' ? `Retirer ${a.name || a.email} de ${t.name} ? Ses tournées restent dans l'amicale.` : `Rendre ${a.name || a.email} responsable de ${t.name} ?`}</span>
                    <Button kind="soft small" onClick={() => setAsk(null)}>Annuler</Button>
                    <Button kind={(ask.action === 'remove' ? 'danger' : 'ink') + ' small'} disabled={busy} onClick={() => act(a.uid, ask.action, ask.role)} data-testid="admin-confirm">{ask.action === 'remove' ? 'Retirer' : 'Confirmer'}</Button>
                  </div>
                ) : (
                  <div class="hrow admin-actions">
                    {a.role === 'owner'
                      ? <button class="link-btn" onClick={() => setAsk({ uid: a.uid, action: 'role', role: 'member' })}>Repasser membre</button>
                      : <button class="link-btn" onClick={() => setAsk({ uid: a.uid, action: 'role', role: 'owner' })} data-testid="admin-make-owner">Rendre responsable</button>}
                    <button class="link-btn danger" onClick={() => setAsk({ uid: a.uid, action: 'remove' })} data-testid="admin-remove">Retirer</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function AdminEntry() {
  if (!canAdmin.value) return null;
  return (
    <button class="card hrow admin-entry" onClick={() => go('admin')} data-testid="admin-entry">
      <DotIcon icon="chart" tone="info" />
      <span class="grow"><span class="card-title">Espace admin</span><span class="small muted" style={{ display: 'block' }}>Toutes les amicales, les comptes et les calendriers</span></span>
      <Icon name="chevR" class="chev" />
    </button>
  );
}
