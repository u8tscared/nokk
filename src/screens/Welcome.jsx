import { useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { Icon, Logo, Wordmark } from '../ui/icons.jsx';
import { Button, Field, Avatar, toast, confetti, shake, DotIcon } from '../ui/ui.jsx';
import { data, setData, addMember, setOrg, mergeData, switchUser, setCrew, enterDemo, addStock } from '../lib/store.js';
import { ROLES, go } from '../lib/nav.js';
import { feel } from '../lib/feedback.js';
import { inputKinds } from '../lib/keyboard.js';
import { installHelp } from '../lib/install.jsx';
import { formatEuro } from '../lib/model.js';
import { startDemo } from '../lib/demoMode.js';
import { PinPad } from './Team.jsx';
import { SignIn } from './Account.jsx';
import { pendingJoin, account, createTeamOnline } from '../lib/account.js';

export const demoAsk = signal(false);

// Deux démos : pompier (sur le terrain) ou caserne (secteurs, équipes, comptes).
export function DemoButton({ kind = 'ghost' }) {
  const open = demoAsk.value;
  if (!open) return <Button kind={kind + ' full'} icon="eye" onClick={() => { feel('tap'); demoAsk.value = true; }} data-testid="demo">Essayer la démo</Button>;
  return (
    <div class="demo-chooser stack s8" data-testid="demo-chooser" ref={(el) => el && !el.dataset.seen && (el.dataset.seen = '1', setTimeout(() => el.scrollIntoView({ block: 'end', behavior: 'smooth' }), 350))}>
      <div class="tiny muted center">Démo : rien n'est enregistré. Vous êtes…</div>
      <button class="choice" onClick={() => startDemo('pompier')} data-testid="demo-pompier">
        <DotIcon icon="walk" tone="bad" />
        <span class="grow"><b>Pompier en tournée</b><span class="small muted" style={{ display: 'block' }}>La carte, le parcours porte à porte, un don en un toucher, votre caisse.</span></span>
        <Icon name="chevR" class="chev" />
      </button>
      <button class="choice" onClick={() => startDemo('caserne')} data-testid="demo-caserne">
        <DotIcon icon="flag" tone="info" />
        <span class="grow"><b>Chef de caserne</b><span class="small muted" style={{ display: 'block' }}>Les secteurs tracés depuis un plan, les binômes affectés, l'avancement et les comptes de l'amicale.</span></span>
        <Icon name="chevR" class="chev" />
      </button>
    </div>
  );
}

function WelcomeArt() {
  return (
    <div class="welcome-art" aria-hidden="true">
      <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
        <g fill="none" stroke="var(--map-road)" stroke-linecap="round">
          <path d="M-20 80 H420" stroke-width="16" /><path d="M120 -20 V320" stroke-width="16" /><path d="M300 -20 V320" stroke-width="12" /><path d="M-20 210 H420" stroke-width="12" />
        </g>
        <path d="M-20 80 H120" stroke="var(--st-done)" stroke-width="7" stroke-linecap="round" class="draw-in" />
        <path d="M120 80 V210" stroke="var(--st-done)" stroke-width="7" stroke-linecap="round" class="draw-in d2" />
        <path d="M120 210 H300" stroke="var(--st-live)" stroke-width="7" stroke-linecap="round" class="draw-in d3" />
        <path d="M300 210 V320" stroke="var(--st-repasser)" stroke-width="7" stroke-linecap="round" class="draw-in d4" />
        <circle cx="300" cy="210" r="12" fill="var(--accent-2)" class="pulse-dot" />
      </svg>
    </div>
  );
}

function FileJoin() {
  return (
    <>
      <label class="btn soft full" for="joinfile"><Icon name="upload" /> J'ai reçu un fichier Nokk</label>
      <input id="joinfile" type="file" accept=".json,application/json" hidden onChange={async (e) => {
        const f = e.currentTarget.files?.[0];
        if (!f) return;
        try {
          const j = JSON.parse(await f.text());
          if (j.app !== 'nokk') throw new Error();
          mergeData(j);
          feel('ok');
          toast('Équipe reçue. Qui êtes-vous ?');
        } catch { toast("Ce fichier n'est pas un fichier Nokk", { error: true }); }
      }} />
    </>
  );
}

export function Login({ onCreate, onLocal }) {
  const [local, setLocal] = useState(false);
  const join = pendingJoin();
  return (
    <div class="welcome">
      <WelcomeArt />
      <div class="welcome-body">
        <div class="hrow"><Logo size={44} animated /><Wordmark size={34} /></div>
        <h1 class="welcome-title">La tournée des calendriers, sans carnet ni calculette.</h1>
        {join ? (
          <div class="join-banner" data-testid="join-banner"><DotIcon icon="team" tone="info" /><span>Vous êtes invité dans une équipe. Connectez-vous pour la rejoindre.</span></div>
        ) : (
          <p class="muted">Secteurs sur la carte, parcours le plus court, chaque porte en deux gestes. Tout est sauvegardé en ligne.</p>
        )}
        {!local ? (
          <div class="stack s8">
            <SignIn />
            <DemoButton />
            <button class="link center" onClick={() => { setLocal(true); onLocal?.(); }} data-testid="no-account">Utiliser sans compte</button>
          </div>
        ) : (
          <div class="stack s8 anim-in">
            <p class="small muted">Sans compte, les tournées restent seulement sur ce téléphone. Vous pourrez vous connecter plus tard depuis les réglages.</p>
            <Button kind="full" icon="team" onClick={onCreate} data-testid="create-team">Créer mon équipe</Button>
            <FileJoin />
            <button class="link center" onClick={() => setLocal(false)}>Revenir à la connexion</button>
          </div>
        )}
      </div>
    </div>
  );
}

// Tournées déjà saisies sur ce téléphone, sans compte : on propose de les mettre à l'abri.
export function SaveGate({ onLater }) {
  return (
    <div class="welcome">
      <div class="welcome-body">
        <DotIcon icon="lock" tone="warn" />
        <h1 class="welcome-title">Mettez vos tournées à l'abri</h1>
        <p class="muted">Nokk sauvegarde maintenant tout en ligne. Connectez-vous : ce qui est déjà saisi sur ce téléphone est envoyé tout de suite, et rien ne se perd, même si le téléphone casse.</p>
        <SignIn />
        <button class="link center" onClick={onLater} data-testid="later">Plus tard</button>
      </div>
    </div>
  );
}

export function WhoAmI() {
  const d = data.value;
  const [m, setM] = useState(null);
  if (m?.pin) return <div class="welcome"><div class="welcome-body"><PinPad m={m} onOk={() => switchUser(m.id)} /></div></div>;
  return (
    <div class="welcome">
      <div class="welcome-body">
        <Logo size={44} />
        <h1 class="welcome-title">Qui utilise ce téléphone ?</h1>
        <div class="card tight list">
          {d.members.map((x) => (
            <button class="row" key={x.id} onClick={() => { if (x.pin) setM(x); else switchUser(x.id); }}>
              <Avatar m={x} /><span class="grow"><span class="t">{x.name}</span><span class="s">{ROLES[x.role]?.label}</span></span><Icon name="chevR" class="chev" />
            </button>
          ))}
        </div>
        {account.value ? <NotListed /> : <DemoButton />}
      </div>
    </div>
  );
}

// Nouvel équipier connecté qui n'est pas encore dans la liste : il s'ajoute lui-même.
function NotListed() {
  const [name, setName] = useState(account.value?.name || '');
  const [open, setOpen] = useState(!data.value.members.length);
  if (!open) return <button class="link center" onClick={() => setOpen(true)} data-testid="not-listed">Je ne suis pas dans la liste</button>;
  return (
    <form class="card stack s8 anim-in" onSubmit={(e) => {
      e.preventDefault();
      if (name.trim().length < 2) { shake(document.getElementById('nl-name')); return; }
      const m = addMember({ name: name.trim(), role: 'pompier' });
      switchUser(m.id);
      feel('done');
      toast('Bienvenue ' + name.trim().split(' ')[0]);
    }}>
      <Field id="nl-name" label="Votre prénom et nom"><input id="nl-name" class="input" value={name} onInput={(e) => setName(e.currentTarget.value)} {...inputKinds.name} data-autofocus enterKeyHint="done" /></Field>
      <Button kind="full" type="submit" data-testid="add-me">C'est moi</Button>
    </form>
  );
}

const STEPS = 6;

export function Onboarding({ onBack }) {
  const [step, setStep] = useState(0);
  const [a, setA] = useState({ name: '', org: 'Amicale des sapeurs-pompiers', city: '', role: 'chef', crew: 'deux', partner: '', price: 1000, stock: 300 });
  const [err, setErr] = useState('');
  const set = (k) => (e) => { setA({ ...a, [k]: e.currentTarget ? e.currentTarget.value : e }); setErr(''); };

  function next() {
    if (step === 0 && a.name.trim().length < 2) { setErr('Votre prénom, au moins'); shake(document.getElementById('oname1')); return; }
    if (step === 1 && !a.city.trim()) { setErr('La ville sert à trouver les adresses'); shake(document.getElementById('ocity1')); return; }
    if (step === 3 && a.crew === 'deux' && a.partner.trim().length < 2) { setErr('Le prénom de votre binôme'); shake(document.getElementById('opartner')); return; }
    feel('tap');
    if (step < STEPS - 1) { setStep(step + 1); return; }
    finish();
  }
  function back() {
    feel('tap');
    if (step === 0) onBack();
    else setStep(step - 1);
  }
  function finish() {
    setOrg({ name: a.org.trim() || 'Amicale', city: a.city.trim(), year: new Date().getMonth() >= 8 ? new Date().getFullYear() + 1 : new Date().getFullYear(), price: a.price, stock: a.stock });
    const meM = addMember({ name: a.name.trim(), role: a.role, color: '#367a6d' });
    const crew = [meM.id];
    if (a.crew === 'deux' && a.partner.trim()) {
      const p = addMember({ name: a.partner.trim(), role: 'pompier', color: '#d9554f' });
      crew.push(p.id);
    }
    setData((d) => ({ ...d, meId: meM.id, crew }));
    if (a.stock) addStock(meM.id, Math.min(a.stock, 200), 'Carton de départ');
    feel('done');
    confetti();
    toast('Votre équipe est prête');
    go('secteurs', { replace: true });
    import('./Start.jsx').then((m) => m.maybeIntro());
    if (account.peek() && !account.peek().team) createTeamOnline().catch(() => toast('Équipe gardée sur ce téléphone. Sauvegarde en ligne dès que le réseau revient.', { error: true }));
  }

  const titles = ['Comment vous appelez-vous ?', 'Votre amicale', 'Votre rôle', 'Seul ou en binôme ?', 'Le don habituel', 'Nokk sur votre écran d\'accueil'];

  return (
    <div class="welcome onboarding">
      <div class="welcome-body">
        <div class="hrow between">
          <button class="icon-btn flat" aria-label="Retour" onClick={back}><Icon name="back" /></button>
          <div class="ob-progress" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS} aria-valuenow={step + 1} aria-label={`Étape ${step + 1} sur ${STEPS}`}>
            {Array.from({ length: STEPS }, (_, i) => <i key={i} class={i <= step ? 'on' : ''} />)}
          </div>
          <span class="tiny muted">{step + 1}/{STEPS}</span>
        </div>
        <form class="stack ob-step" key={step} onSubmit={(e) => { e.preventDefault(); next(); }}>
          <h1 class="welcome-title">{titles[step]}</h1>
          {step === 0 && (
            <Field id="oname1" label="Prénom et nom" error={err}><input id="oname1" class="input" value={a.name} onInput={set('name')} {...inputKinds.name} placeholder="Ex. Lucas Martin" data-autofocus enterKeyHint="next" /></Field>
          )}
          {step === 1 && (
            <>
              <Field id="oorg" label="Nom de l'amicale"><input id="oorg" class="input" value={a.org} onInput={set('org')} {...inputKinds.text} /></Field>
              <Field id="ocity1" label="Ville de la caserne" error={err}><input id="ocity1" class="input" value={a.city} onInput={set('city')} {...inputKinds.name} placeholder="Ex. Rezé" enterKeyHint="next" /></Field>
            </>
          )}
          {step === 2 && (
            <div class="choice-list">
              {Object.entries(ROLES).map(([k, r]) => (
                <button type="button" class={'choice' + (a.role === k ? ' on' : '')} key={k} aria-pressed={a.role === k ? 'true' : 'false'} onClick={() => { feel('tick'); setA({ ...a, role: k }); }}>
                  <DotIcon icon={k === 'chef' ? 'flag' : k === 'tresorier' ? 'cash' : 'walk'} tone={a.role === k ? '' : 'muted'} />
                  <span class="grow"><b>{r.label}</b><span class="small muted" style={{ display: 'block' }}>{r.hint}</span></span>
                </button>
              ))}
            </div>
          )}
          {step === 3 && (
            <>
              <div class="choice-list">
                {[['seul', 'Je tourne seul', 'user'], ['deux', 'En binôme', 'team'], ['plus', 'À plusieurs, je les ajouterai', 'sectors']].map(([k, l, ic]) => (
                  <button type="button" class={'choice' + (a.crew === k ? ' on' : '')} key={k} aria-pressed={a.crew === k ? 'true' : 'false'} onClick={() => { feel('tick'); setA({ ...a, crew: k }); }}>
                    <DotIcon icon={ic} tone={a.crew === k ? '' : 'muted'} /><span class="grow"><b>{l}</b></span>
                  </button>
                ))}
              </div>
              {a.crew === 'deux' && <Field id="opartner" label="Prénom de votre binôme" error={err}><input id="opartner" class="input" value={a.partner} onInput={set('partner')} {...inputKinds.name} placeholder="Ex. Inès Diallo" enterKeyHint="next" /></Field>}
            </>
          )}
          {step === 4 && (
            <>
              <div class="field"><span class="label">Don conseillé</span>
                <div class="chips">{[500, 800, 1000, 1200, 1500, 2000].map((p) => <button type="button" class="chip" key={p} aria-pressed={a.price === p ? 'true' : 'false'} onClick={() => { feel('tick'); setA({ ...a, price: p }); }}>{formatEuro(p)}</button>)}</div>
                <div class="tiny muted">Proposé par défaut à chaque porte. On peut toujours le changer.</div>
              </div>
              <Field id="ostock1" label="Calendriers reçus pour toute l'amicale"><input id="ostock1" class="input" value={a.stock} onInput={(e) => setA({ ...a, stock: parseInt(e.currentTarget.value.replace(/\D/g, '') || '0', 10) })} {...inputKinds.int} enterKeyHint="next" /></Field>
            </>
          )}
          {step === 5 && <div class="install-inline">{installHelp()}</div>}
          <div class="sticky-action">
            <Button kind="full" type="submit" sound="" data-testid="ob-next">{step === STEPS - 1 ? 'C\'est parti' : 'Continuer'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
