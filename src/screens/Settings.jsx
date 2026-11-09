import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Button, Seg, toast, Field, DotIcon, Avatar } from '../ui/ui.jsx';
import { settings, saveSettings, data, setOrg, demo, exitDemo, resetAll, me, role, online } from '../lib/store.js';
import { moreFor, MENU, go, openSheet, ROLES } from '../lib/nav.js';
import { LESSONS } from '../lib/lessons.js';
import { feel } from '../lib/feedback.js';
import { simulateOutage } from '../lib/offline.js';
import { inputKinds } from '../lib/keyboard.js';
import { applyTheme } from '../lib/theme.js';
import { installHelp, canInstall, promptInstall } from '../lib/install.jsx';
import { askSwitch } from './Team.jsx';
import { AccountCard } from './Account.jsx';
import { account } from '../lib/account.js';
import { formatEuro } from '../lib/model.js';
import { versionLabel, updateState, checkUpdate } from '../lib/update.js';

function Toggle({ id, label, sub, icon, tone, checked, onChange }) {
  return (
    <label class="row toggle-row" for={id}>
      <DotIcon icon={icon} sm tone={tone} />
      <span class="grow"><span class="t">{label}</span>{sub && <span class="s">{sub}</span>}</span>
      <input id={id} type="checkbox" role="switch" class="switch" checked={checked} onChange={(e) => { feel('tick'); onChange(e.currentTarget.checked); }} />
    </label>
  );
}

export function SettingsScreen() {
  const s = settings.value;
  const org = data.value.org || {};
  const isChef = role.value === 'chef';
  const [confirm, setConfirm] = useState(false);
  return (
    <div class="page rise">
      <div class="page-head"><div><h1>Réglages</h1><div class="sub">Sur cet appareil</div></div></div>
      {!demo.value && <AccountCard />}
      <div class="card tight list">
        <Toggle id="snd" label="Son" sub="Petits sons discrets à chaque geste" icon="sound" checked={s.sound} onChange={(v) => saveSettings({ sound: v })} />
        <Toggle id="vib" label="Vibration" sub="Android seulement, l'iPhone ne vibre pas depuis le web" icon="phone" checked={s.haptics} onChange={(v) => saveSettings({ haptics: v })} />
        <Toggle id="simple" label="Vue simple" sub="Seulement carte, saisie, caisse" icon="eye" tone="info" checked={s.simple} onChange={(v) => saveSettings({ simple: v })} />
      </div>
      <div class="card">
        <div class="card-title">Thème</div>
        <div style={{ marginTop: 10 }}>
          <Seg label="Thème" value={s.theme} onChange={(v) => { saveSettings({ theme: v }); applyTheme(); }} options={[{ value: 'auto', label: 'Auto' }, { value: 'light', label: 'Clair' }, { value: 'dark', label: 'Sombre' }, { value: 'soir', label: 'Soir' }]} />
        </div>
        <p class="tiny muted" style={{ marginTop: 8 }}>« Soir » passe en sombre de 19 h à 7 h, pour les tournées à la nuit tombée.</p>
      </div>
      <div class="card">
        <div class="card-title">Parcours</div>
        <div style={{ marginTop: 10 }}>
          <Seg label="Côtés de rue" value={s.sides} onChange={(v) => saveSettings({ sides: v })} options={[{ value: 'auto', label: 'Auto' }, { value: 'zigzag', label: 'Zigzag' }, { value: 'cote', label: 'Un côté' }]} />
        </div>
        <p class="tiny muted" style={{ marginTop: 8 }}>Auto : zigzag dans les petites rues, un côté puis l'autre sur les grandes avenues.</p>
      </div>
      {isChef && (
        <div class="card stack s8">
          <div class="card-title">Amicale</div>
          <Field id="oname" label="Nom"><input id="oname" class="input" value={org.name || ''} onChange={(e) => setOrg({ name: e.currentTarget.value })} {...inputKinds.text} /></Field>
          <Field id="ocity" label="Ville"><input id="ocity" class="input" value={org.city || ''} onChange={(e) => setOrg({ city: e.currentTarget.value })} {...inputKinds.name} /></Field>
          <div class="hrow">
            <Field id="oyear" label="Tournée"><input id="oyear" class="input" value={org.year || ''} onChange={(e) => setOrg({ year: parseInt(e.currentTarget.value, 10) || org.year })} {...inputKinds.int} /></Field>
            <Field id="oprice" label="Don conseillé (€)"><input id="oprice" class="input" value={org.price ? org.price / 100 : ''} onChange={(e) => setOrg({ price: Math.round(parseFloat(e.currentTarget.value.replace(',', '.')) * 100) || org.price })} {...inputKinds.number} /></Field>
            <Field id="ostock" label="Calendriers"><input id="ostock" class="input" value={org.stock || ''} onChange={(e) => setOrg({ stock: parseInt(e.currentTarget.value, 10) || 0 })} {...inputKinds.int} enterKeyHint="done" /></Field>
          </div>
        </div>
      )}
      <div class="card tight list">
        <button class="row" onClick={() => { simulateOutage(20); toast('Réseau coupé pendant 20 s : continuez à saisir, rien ne se perd'); }}>
          <DotIcon icon="wifiOff" sm tone="warn" /><span class="grow"><span class="t">Tester une coupure</span><span class="s">{online.value ? 'Simule 20 s sans réseau' : 'Hors ligne en ce moment'}</span></span>
        </button>
        <button class="row" onClick={() => openSheet(() => installHelp(), { label: "Ajouter à l'écran d'accueil" })}>
          <DotIcon icon="install" sm tone="ok" /><span class="grow"><span class="t">Ajouter à l'écran d'accueil</span><span class="s">Nokk s'ouvre en plein écran, comme une app</span></span>
        </button>
        <button class="row" onClick={() => go('formation')}>
          <DotIcon icon="book" sm tone="info" /><span class="grow"><span class="t">Formation</span><span class="s">Une leçon courte par écran</span></span>
        </button>
        <div class="row">
          <DotIcon icon="sumup" sm tone="muted" /><span class="grow"><span class="t">Terminal SumUp</span><span class="s">Paiement carte enregistré tout seul</span></span><span class="badge-soon">Bientôt</span>
        </div>
      </div>
      {demo.value ? (
        <Button kind="coral full" onClick={() => { exitDemo(); go('carte', { replace: true }); toast('Démo terminée'); }}>Quitter la démo</Button>
      ) : isChef && !account.value ? (
        <div class="card">
          {!confirm ? (
            <Button kind="danger full" icon="trash" onClick={() => setConfirm(true)}>Effacer toutes les données</Button>
          ) : (
            <div class="stack s8">
              <p class="small"><b>Tout sera effacé de cet appareil :</b> secteurs, passages, comptes. Exportez une sauvegarde avant si besoin.</p>
              <div class="hrow"><Button kind="ghost small grow" onClick={() => setConfirm(false)}>Garder</Button><Button kind="danger small grow" onClick={() => { resetAll(); location.hash = '#carte'; location.reload(); }}>Tout effacer</Button></div>
            </div>
          )}
        </div>
      ) : null}
      <div class="card update-card" data-testid="update-card">
        <DotIcon icon={updateState.value === 'uptodate' ? 'check' : 'download'} tone={updateState.value === 'uptodate' ? '' : 'muted'} />
        <div class="grow">
          <b>Version du {versionLabel()}</b>
          <div class="tiny muted">{{ checking: 'Recherche d\'une mise à jour…', updating: 'Installation de la nouvelle version…', uptodate: 'À jour ✓', offline: 'Pas de réseau pour vérifier' }[updateState.value] || 'Les mises à jour s\'installent toutes seules'}</div>
        </div>
        <Button kind="ghost small" disabled={updateState.value === 'checking' || updateState.value === 'updating'} onClick={() => checkUpdate()} data-testid="check-update">Vérifier</Button>
      </div>
      <p class="tiny muted center">Nokk v{__APP_VERSION__} · cartes © OpenStreetMap</p>
    </div>
  );
}

export function FormationScreen() {
  const [open, setOpen] = useState(null);
  return (
    <div class="page rise">
      <div class="page-head"><div><h1>Formation</h1><div class="sub">2 minutes pour tout savoir</div></div></div>
      {MENU.map((m) => {
        const l = LESSONS[m.route];
        const on = open === m.route;
        return (
          <div class="card lesson" key={m.route} data-lesson={m.route}>
            <button class="hrow lesson-head" onClick={() => { feel('tap'); setOpen(on ? null : m.route); }} aria-expanded={on ? 'true' : 'false'}>
              <DotIcon icon={m.icon} sm />
              <span class="grow card-title">{l.title}</span>
              <Icon name={on ? 'chevD' : 'chevR'} class="chev" />
            </button>
            {on && (
              <ol class="lesson-steps">
                {l.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            )}
            {on && !m.action && m.route !== 'formation' && <Button kind="soft small" onClick={() => go(m.route)}>Ouvrir {m.label.toLowerCase()}</Button>}
          </div>
        );
      })}
    </div>
  );
}

export function MoreScreen() {
  const m = me.value;
  const items = moreFor(m, settings.value.simple);
  const d = data.value;
  return (
    <div class="page rise">
      <div class="page-head"><div><h1>Plus</h1><div class="sub">{d.org?.name || 'Nokk'}{d.org?.city ? ' · ' + d.org.city : ''}</div></div></div>
      {m && (
        <button class="card profile-card hrow" onClick={() => go('equipe')}>
          <Avatar m={m} lg />
          <span class="grow"><span class="card-title">{m.name}</span><span class="small muted" style={{ display: 'block' }}>{ROLES[m.role]?.label}</span></span>
          {d.members.length > 1 && <span class="link-btn" onClick={(e) => { e.stopPropagation(); openSheet(({ close }) => <SwitchUser close={close} />, { label: 'Changer de profil' }); }}>Changer</span>}
        </button>
      )}
      <div class="card tight list">
        {items.map((it) => (
          <button class="row" key={it.route} onClick={() => go(it.route)} data-testid={'more-' + it.route}>
            <DotIcon icon={it.icon} sm />
            <span class="grow t">{it.label}</span>
            <Icon name="chevR" class="chev" />
          </button>
        ))}
      </div>
    </div>
  );
}

function SwitchUser({ close }) {
  const d = data.value;
  return (
    <div class="stack">
      <div class="sheet-head"><h2>Qui utilise le téléphone ?</h2></div>
      <div class="card tight list">
        {d.members.map((m) => (
          <button class="row" key={m.id} onClick={() => { close(); setTimeout(() => askSwitch(m), 300); }}>
            <Avatar m={m} /><span class="grow"><span class="t">{m.name}</span><span class="s">{ROLES[m.role]?.label}{m.pin ? ' · code' : ''}</span></span>
            {m.id === d.meId && <span class="pill">Actuel</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
