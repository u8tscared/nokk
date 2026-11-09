import { useEffect, useState } from 'preact/hooks';
import { Icon, Logo, Wordmark } from './ui/icons.jsx';
import { Avatar, Button, SheetHost, Toasts } from './ui/ui.jsx';
import { data, demo, me, online, settings, saveError } from './lib/store.js';
import { route, go, menuFor, tabsFor, allowed, MENU, sheets } from './lib/nav.js';
import { feel } from './lib/feedback.js';
import { MapScreen, quickLog } from './screens/MapScreen.jsx';
import { SectorsScreen } from './screens/Sectors.jsx';
import { CaisseScreen, ComptesScreen, JournalScreen, ExportsScreen, PageStatus } from './screens/Money.jsx';
import { TeamScreen } from './screens/Team.jsx';
import { SettingsScreen, FormationScreen, MoreScreen } from './screens/Settings.jsx';
import { Login, Onboarding, WhoAmI, SaveGate } from './screens/Welcome.jsx';
import { TeamChoice, AccountBusy, AccountFailed } from './screens/Account.jsx';
import { AdminScreen, canAdmin } from './screens/Admin.jsx';
import { account, accountStep, firstLoad } from './lib/account.js';
import { authUser } from './lib/auth.js';
import { exitDemo } from './lib/store.js';
import { toast } from './ui/ui.jsx';

const PAGES = {
  secteurs: SectorsScreen,
  caisse: CaisseScreen,
  comptes: ComptesScreen,
  journal: JournalScreen,
  exports: ExportsScreen,
  equipe: TeamScreen,
  reglages: SettingsScreen,
  formation: FormationScreen,
  plus: MoreScreen,
  admin: AdminScreen,
};

function TabBar({ current }) {
  const tabs = tabsFor(me.value, settings.value.simple);
  return (
    <nav class="tabbar" aria-label="Navigation principale" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
      {tabs.map((t) =>
        t.action ? (
          <button key={t.route} class="tab-main" aria-label="Saisir une porte" onClick={() => { feel('sheet'); quickLog(); }} data-testid="tab-saisir">
            <Icon name="door" />
          </button>
        ) : (
          <button key={t.route} class="tab" aria-current={current === t.route ? 'page' : undefined} onClick={() => { feel('tap'); go(t.route); }} data-testid={'tab-' + t.route}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </button>
        ),
      )}
    </nav>
  );
}

function Sidebar({ current }) {
  const items = menuFor(me.value, settings.value.simple);
  const sections = [...new Set(items.map((i) => i.section))];
  const m = me.value;
  return (
    <nav class="sidebar" aria-label="Menu">
      <div class="brand"><Logo size={34} /><b>nokk</b></div>
      <Button kind="coral full" icon="door" onClick={quickLog} data-testid="side-saisir">Saisir une porte</Button>
      {sections.map((s) => (
        <div key={s}>
          <h4>{s}</h4>
          {items.filter((i) => i.section === s && !i.action).map((i) => (
            <button key={i.route} class="side-link" aria-current={current === i.route ? 'page' : undefined} onClick={() => { feel('tap'); go(i.route); }} data-testid={'side-' + i.route}>
              <Icon name={i.icon} /> {i.label}
            </button>
          ))}
        </div>
      ))}
      {canAdmin.value && (
        <div><h4>Nokk</h4><button class="side-link" aria-current={current === 'admin' ? 'page' : undefined} onClick={() => { feel('tap'); go('admin'); }} data-testid="side-admin"><Icon name="chart" /> Admin</button></div>
      )}
      <div class="side-foot">
        {demo.value && <Button kind="soft small full" onClick={() => { exitDemo(); go('carte', { replace: true }); toast('Démo terminée'); }}>Quitter la démo</Button>}
        {m && (
          <button class="hrow side-link" onClick={() => go('equipe')}><Avatar m={m} /> <span class="grow" style={{ textAlign: 'left' }}><b>{m.name.split(' ')[0]}</b><span class="tiny muted" style={{ display: 'block' }}>{data.value.org?.name}</span></span></button>
        )}
      </div>
    </nav>
  );
}

function Capsules() {
  const off = !online.value;
  return (
    <>
      {off && route.value === 'carte' && <div class="capsule on-map" role="status"><i /> Hors ligne · tout est gardé</div>}
      {saveError.value && <button class="capsule demo" style={{ pointerEvents: 'auto' }} onClick={() => go('exports')}><i /> Mémoire du téléphone pleine · exportez une sauvegarde</button>}
    </>
  );
}

// Écran d'accueil selon le compte : connexion, équipe à choisir, récupération en cours…
function accountGate(d, creating, setCreating, later, setLater) {
  const local = !!(d.org || d.members.length);
  const a = account.value;
  const step = accountStep.value;
  if (creating && !local) return <Onboarding onBack={() => setCreating(false)} />;
  if (!a) {
    if (authUser.value && step === 'loading') return <AccountBusy text="Connexion…" />;
    if (authUser.value && step === 'error') return <AccountFailed />;
    if (!local) return <Login onCreate={() => setCreating(true)} onLocal={() => setLater(true)} />;
    if (!later) return <SaveGate onLater={() => { try { sessionStorage.setItem('nokk:later', '1'); } catch {} setLater(true); }} />;
    return null;
  }
  if (local) return null;
  if (firstLoad.value || step === 'loading') return <AccountBusy />;
  if (step === 'error') return <AccountFailed />;
  if (!a.team) return <TeamChoice onCreate={() => setCreating(true)} />;
  return <Onboarding onBack={() => {}} />; // équipe en ligne encore vide
}

export function App() {
  const d = data.value;
  const [creating, setCreating] = useState(false);
  const [later, setLater] = useState(() => { try { return sessionStorage.getItem('nokk:later') === '1'; } catch { return false; } });
  const m = me.value;
  let r = route.value;

  // Droits : un écran retiré est bloqué à l'entrée, même par lien direct.
  const ok = r === 'carte' || r === 'plus' || (r === 'admin' && canAdmin.value) || allowed(r, m, settings.value.simple);
  useEffect(() => {
    if (r === 'saisir') { go('carte', { replace: true }); setTimeout(quickLog, 300); }
    else if (!ok) go('carte', { replace: true });
  }, [r, ok]);
  if (!ok || r === 'saisir') r = 'carte';

  const gate = !demo.value && accountGate(d, creating, setCreating, later, setLater);
  if (gate) return (<>{gate}<Toasts /></>);
  if (!demo.value && !m) return (<><WhoAmI /><Toasts /></>);

  const Page = PAGES[r];
  return (
    <>
      <a href="#main" class="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Aller au contenu</a>
      <div class="status-veil" />
      <div class="app">
        <Sidebar current={r} />
        <main class="main" id="main" tabIndex={-1}>
          <MapScreen visible={r === 'carte'} />
          {Page && (
            <div class="page-scroll" key={r} data-testid={'screen-' + r}>
              {(!online.value || demo.value) && <div class="page status-holder"><PageStatus /></div>}
              <Page />
            </div>
          )}
        </main>
        <TabBar current={r} />
      </div>
      <Capsules />
      <SheetHost />
      <Toasts />
    </>
  );
}
