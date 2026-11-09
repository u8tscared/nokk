// Écrans du compte : connexion (Google ou e-mail), mot de passe oublié, rejoindre une équipe,
// état de la sauvegarde.
import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Button, Field, DotIcon, toast, shake } from '../ui/ui.jsx';
import { feel } from '../lib/feedback.js';
import { inputKinds } from '../lib/keyboard.js';
import { signInGoogle, signInEmail, signUpEmail, resetPassword, authMessage, authUser } from '../lib/auth.js';
import { account, accountStep, accountError, joinTeam, signOut, downloadBackup, inviteLink, retryAccount, pendingJoin } from '../lib/account.js';
import { syncState, flush } from '../lib/sync.js';
import { online } from '../lib/store.js';
import { shareFile } from '../lib/share.js';

export function GoogleMark() {
  return (
    <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8Z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.7-2.8Z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4Z" />
    </svg>
  );
}

// Boutons de connexion + formulaire e-mail (connexion, création, mot de passe oublié).
export function SignIn({ intro }) {
  const [mode, setMode] = useState(null); // null | signin | signup | reset | sent
  const [f, setF] = useState({ email: '', pass: '', name: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setF({ ...f, [k]: e.currentTarget.value }); setErr(''); };

  async function google() {
    setBusy(true); setErr('');
    try { await signInGoogle(); feel('ok'); } catch (e) { const m = authMessage(e); if (m) { setErr(m); feel('error'); } }
    setBusy(false);
  }
  async function submit(e) {
    e.preventDefault();
    const email = f.email.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { setErr('Entrez une adresse e-mail valide.'); shake(document.getElementById('au-email')); return; }
    if (mode !== 'reset' && f.pass.length < 6) { setErr('Mot de passe : 6 caractères minimum.'); shake(document.getElementById('au-pass')); return; }
    if (mode === 'signup' && f.name.trim().length < 2) { setErr('Votre prénom, au moins.'); shake(document.getElementById('au-name')); return; }
    setBusy(true); setErr('');
    try {
      if (mode === 'signin') await signInEmail(email, f.pass);
      else if (mode === 'signup') await signUpEmail(email, f.pass, f.name);
      else { await resetPassword(email); setMode('sent'); }
      feel('ok');
    } catch (e2) {
      const m = authMessage(e2);
      if (m) { setErr(m); feel('error'); }
    }
    setBusy(false);
  }

  if (!mode) {
    return (
      <div class="stack s8 auth-buttons">
        {intro}
        <Button kind="full google-btn" onClick={google} disabled={busy} data-testid="google"><GoogleMark /> Continuer avec Google</Button>
        <Button kind="soft full" icon="note" onClick={() => setMode('signin')} data-testid="email-auth">Continuer avec un e-mail</Button>
        {err && <div class="auth-err" role="alert">{err}</div>}
      </div>
    );
  }
  if (mode === 'sent') {
    return (
      <div class="card stack s8 auth-card anim-in" data-testid="reset-sent">
        <DotIcon icon="check" tone="ok" />
        <h2 class="h2">E-mail envoyé</h2>
        <p class="small">Si un compte existe pour <b>{f.email.trim()}</b>, un lien vient de partir. Ouvrez-le pour choisir un nouveau mot de passe, puis revenez ici. Pensez à regarder dans les spams.</p>
        <Button kind="full" onClick={() => { setMode('signin'); setF({ ...f, pass: '' }); }}>Revenir à la connexion</Button>
      </div>
    );
  }
  const titles = { signin: 'Se connecter', signup: 'Créer mon compte', reset: 'Mot de passe oublié' };
  return (
    <form class="card stack s8 auth-card anim-in" onSubmit={submit} noValidate data-testid="auth-form">
      <div class="hrow between">
        <h2 class="h2">{titles[mode]}</h2>
        <button type="button" class="icon-btn flat" aria-label="Fermer" onClick={() => { setMode(null); setErr(''); }}><Icon name="x" /></button>
      </div>
      {mode === 'reset' && <p class="small muted">Entrez l'adresse de votre compte : on vous envoie un lien pour choisir un nouveau mot de passe.</p>}
      {mode === 'signup' && (
        <Field id="au-name" label="Prénom et nom"><input id="au-name" class="input" value={f.name} onInput={set('name')} {...inputKinds.name} autoComplete="name" placeholder="Ex. Lucas Martin" /></Field>
      )}
      <Field id="au-email" label="E-mail"><input id="au-email" class="input" value={f.email} onInput={set('email')} {...inputKinds.email} autoComplete={mode === 'signup' ? 'email' : 'username'} placeholder="prenom@exemple.fr" data-autofocus enterKeyHint={mode === 'reset' ? 'send' : 'next'} /></Field>
      {mode !== 'reset' && (
        <Field id="au-pass" label="Mot de passe" hint={mode === 'signup' ? '6 caractères minimum' : null}>
          <input id="au-pass" class="input" type="password" value={f.pass} onInput={set('pass')} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} enterKeyHint="go" />
        </Field>
      )}
      {err && <div class="auth-err" role="alert">{err}</div>}
      <Button kind="full" type="submit" disabled={busy} data-testid="auth-submit">
        {busy ? 'Un instant…' : mode === 'signin' ? 'Se connecter' : mode === 'signup' ? 'Créer mon compte' : 'Envoyer le lien'}
      </Button>
      {mode === 'signin' && (
        <div class="auth-links">
          <button type="button" class="link" onClick={() => { setMode('reset'); setErr(''); }} data-testid="forgot">Mot de passe oublié ?</button>
          <button type="button" class="link" onClick={() => { setMode('signup'); setErr(''); }} data-testid="to-signup">Pas de compte ? <b>En créer un</b></button>
        </div>
      )}
      {mode === 'signup' && <button type="button" class="link" onClick={() => { setMode('signin'); setErr(''); }}>J'ai déjà un compte</button>}
      {mode === 'reset' && <button type="button" class="link" onClick={() => { setMode('signin'); setErr(''); }}>Je me souviens, me connecter</button>}
    </form>
  );
}

export function JoinForm({ onDone }) {
  const [code, setCode] = useState(pendingJoin() || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length !== 6) { setErr('Le code fait 6 caractères.'); shake(document.getElementById('jcode')); return; }
    setBusy(true); setErr('');
    try { await joinTeam(c); feel('done'); toast('Bienvenue dans l\'équipe'); onDone?.(); }
    catch (e2) { setErr(e2?.status === 404 ? 'Ce code ne correspond à aucune équipe.' : e2?.code === 'network' ? 'Pas de réseau. Réessayez.' : 'Impossible de rejoindre pour le moment.'); feel('error'); }
    setBusy(false);
  }
  return (
    <form class="card stack s8 anim-in" onSubmit={submit} noValidate>
      <Field id="jcode" label="Code de l'équipe" error={err} hint="Demandez-le au chef d'équipe (écran Équipe).">
        <input id="jcode" class="input code-input" value={code} onInput={(e) => { setCode(e.currentTarget.value.toUpperCase()); setErr(''); }} autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="off" maxLength={8} placeholder="ABC234" data-autofocus enterKeyHint="go" data-testid="join-code" />
      </Field>
      <Button kind="full" type="submit" disabled={busy} data-testid="join-submit">{busy ? 'Un instant…' : 'Rejoindre'}</Button>
    </form>
  );
}

// Connecté, sans équipe : créer la sienne ou rejoindre celle du chef.
export function TeamChoice({ onCreate }) {
  const [joining, setJoining] = useState(!!pendingJoin());
  const a = account.value;
  return (
    <div class="welcome">
      <div class="welcome-body">
        <div class="hrow"><DotIcon icon="check" tone="ok" /><span class="small muted grow">Connecté : {a?.email || a?.name}</span></div>
        <h1 class="welcome-title">Votre équipe</h1>
        <p class="muted">Tout ce que vous saisissez est sauvegardé en ligne et partagé avec les équipiers.</p>
        <div class="choice-list">
          <button class="choice" onClick={() => { feel('tap'); onCreate(); }} data-testid="create-team">
            <DotIcon icon="flag" /><span class="grow"><b>Créer mon équipe</b><span class="small muted" style={{ display: 'block' }}>Je suis chef d'équipe ou je démarre seul</span></span><Icon name="chevR" class="chev" />
          </button>
          <button class={'choice' + (joining ? ' on' : '')} onClick={() => { feel('tap'); setJoining(true); }} data-testid="join-team">
            <DotIcon icon="team" tone="info" /><span class="grow"><b>Rejoindre une équipe</b><span class="small muted" style={{ display: 'block' }}>J'ai un code ou un lien d'invitation</span></span><Icon name="chevR" class="chev" />
          </button>
        </div>
        {joining && <JoinForm />}
        <button class="link center" onClick={() => signOut()}>Changer de compte</button>
      </div>
    </div>
  );
}

// Écran d'attente pendant la connexion ou la récupération des tournées de l'équipe.
export function AccountBusy({ text = 'Récupération de vos tournées…' }) {
  return (
    <div class="welcome">
      <div class="welcome-body center-body" role="status" aria-live="polite">
        <div class="sync-orb" aria-hidden="true"><i /><i /><i /></div>
        <h1 class="welcome-title center">{text}</h1>
        <p class="muted center">Quelques secondes.</p>
      </div>
    </div>
  );
}

export function AccountFailed() {
  const code = accountError.value;
  return (
    <div class="welcome">
      <div class="welcome-body">
        <DotIcon icon="wifiOff" tone="warn" />
        <h1 class="welcome-title">Connexion au serveur impossible</h1>
        <p class="muted">{code === 'network' || !online.value ? 'Pas de réseau pour l\'instant. Réessayez une fois connecté.' : 'Le serveur ne répond pas. Réessayez dans un instant.'}</p>
        <Button kind="full" onClick={retryAccount}>Réessayer</Button>
        <button class="link center" onClick={() => signOut({ force: true })}>Se déconnecter</button>
      </div>
    </div>
  );
}

const ago = (t) => {
  if (!t) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 50) return 'à l\'instant';
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  return 'à ' + new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

export function syncLabel(s = syncState.value) {
  if (s.status === 'off') return { tone: 'muted', icon: 'wifiOff', text: 'Sauvegarde en ligne arrêtée' };
  if (s.status === 'syncing') return { tone: 'info', icon: 'repeat', text: s.pending ? `Envoi de ${s.pending} modification${s.pending > 1 ? 's' : ''}…` : 'Mise à jour…' };
  if (s.status === 'offline') return { tone: 'warn', icon: 'wifiOff', text: s.pending ? `Hors ligne · ${s.pending} en attente, envoi au retour du réseau` : 'Hors ligne · tout est gardé sur le téléphone' };
  if (s.status === 'error') return { tone: 'warn', icon: 'wifiOff', text: s.error === 'signed_out' || s.error === 'unauthorized' ? 'Reconnectez-vous pour sauvegarder' : `${s.pending} en attente · nouvel essai bientôt` };
  if (s.pending) return { tone: 'info', icon: 'repeat', text: `${s.pending} en attente d'envoi` };
  return { tone: 'ok', icon: 'check', text: 'Tout est sauvegardé' + (s.last ? ' · ' + ago(s.last) : '') };
}

// Réglages : compte, état de la sauvegarde, copie, déconnexion.
export function AccountCard() {
  const a = account.value;
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!a) {
    return (
      <div class="card stack s8" data-testid="account-card">
        <div class="hrow"><DotIcon icon="lock" tone="warn" /><div class="grow"><div class="card-title">Sauvegarde en ligne</div><div class="small muted">Connectez-vous : vos tournées seront gardées en sécurité et partagées avec l'équipe.</div></div></div>
        <SignIn />
      </div>
    );
  }
  const l = syncLabel();
  return (
    <div class="card stack s8" data-testid="account-card">
      <div class="hrow">
        <DotIcon icon="user" tone="ok" />
        <div class="grow"><div class="card-title">{a.name || 'Mon compte'}</div><div class="small muted">{a.email}</div></div>
      </div>
      {a.team && (
        <button class="sync-line" onClick={() => flush()} data-testid="sync-status" data-status={syncState.value.status}>
          <DotIcon icon={l.icon} sm tone={l.tone} /><span class="grow">{l.text}</span><span class="tiny muted">Actualiser</span>
        </button>
      )}
      {a.team && (
        <Button kind="soft small full" icon="download" disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            const j = await downloadBackup();
            await shareFile(`nokk-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(j), 'application/json', 'Sauvegarde Nokk');
          } catch { toast('Copie impossible sans réseau', { error: true }); }
          setBusy(false);
        }}>Télécharger une copie de l'équipe</Button>
      )}
      {!confirm ? (
        <Button kind="ghost small full" onClick={() => setConfirm(true)} data-testid="signout">Se déconnecter</Button>
      ) : (
        <div class="stack s8">
          <p class="small">Les tournées restent sauvegardées en ligne. Ce téléphone sera vidé.</p>
          <div class="hrow">
            <Button kind="ghost small grow" onClick={() => setConfirm(false)}>Rester</Button>
            <Button kind="danger small grow" data-testid="signout-confirm" onClick={async () => {
              const ok = await signOut();
              if (!ok) toast('Des saisies ne sont pas encore envoyées. Retrouvez du réseau puis réessayez.', { error: true });
              else { location.hash = '#carte'; toast('Déconnecté'); }
            }}>Se déconnecter</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Équipe : code et lien d'invitation.
export function InviteCard() {
  const t = account.value?.team;
  if (!t) return null;
  const link = inviteLink(t.code);
  return (
    <div class="card" data-testid="invite-card">
      <div class="hrow"><DotIcon icon="team" tone="ok" /><div class="grow"><div class="card-title">Inviter dans l'équipe</div><div class="small muted">Chacun se connecte avec son compte et voit les tournées en direct.</div></div></div>
      <div class="invite-code" aria-label={'Code ' + t.code.split('').join(' ')} data-testid="invite-code">{t.code}</div>
      <div class="hrow">
        <Button kind="small grow" icon="share" onClick={async () => {
          const text = `Rejoins l'équipe ${t.name} sur Nokk : ${link} (code ${t.code})`;
          try {
            import('./Start.jsx').then((m) => m.markStart('team'));
            if (navigator.share) await navigator.share({ title: 'Nokk', text, url: link });
            else { await navigator.clipboard.writeText(text); toast('Lien copié'); }
          } catch {}
        }}>Envoyer le lien</Button>
        <Button kind="soft small grow" onClick={async () => { try { await navigator.clipboard.writeText(t.code); toast('Code copié'); } catch { toast('Code : ' + t.code); } }}>Copier le code</Button>
      </div>
    </div>
  );
}

export { authUser, accountStep };
