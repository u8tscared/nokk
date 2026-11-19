// Ajouter Nokk à l'écran d'accueil : un guide animé, adapté au téléphone et au navigateur de la personne.
import { useEffect, useState } from 'preact/hooks';
import { Icon, Logo } from '../ui/icons.jsx';
import { Button, toast, confetti } from '../ui/ui.jsx';
import { canInstall, promptInstall } from '../lib/install.jsx';
import { currentDevice, guideFor, MANUAL, APP_URL, CHROME_INTENT } from '../lib/device.js';
import { settings, saveSettings, demo } from '../lib/store.js';
import { openSheet } from '../lib/nav.js';
import { feel } from '../lib/feedback.js';
import { qrPath } from '../lib/qr.js';

export function openInstall() {
  feel('tap');
  openSheet(({ close }) => <InstallGuide onDone={close} />, { label: "Ajouter à l'écran d'accueil", class: 'sheet-install' });
}

// ——— Le téléphone de démonstration ———
const Tap = ({ on }) => (on ? <span class="pm-touch" aria-hidden="true"><i /></span> : null);

function Btn({ id, tap, children, class: cls = '' }) {
  return <span class={'pm-b ' + cls + (tap === id ? ' tap' : '')}>{children}<Tap on={tap === id} /></span>;
}

function Url({ tap, share }) {
  return (
    <span class={'pm-url' + (tap === 'url' ? ' tap' : '')}>
      <Icon name="lock" size={9} /> nokkapp.fr
      {share && <Btn id="share" tap={tap} class="in-url"><Icon name="share" size={11} /></Btn>}
      <Tap on={tap === 'url'} />
    </span>
  );
}

function Chrome({ chrome, tap, where }) {
  // where : 'top' | 'bottom'
  const share = <Btn id="share" tap={tap}><Icon name="share" size={13} /></Btn>;
  if (where === 'top') {
    if (chrome === 'safari26') return null;
    if (chrome === 'safari') return <div class="pm-top slim"><span class="pm-url mini">nokkapp.fr</span></div>;
    if (chrome === 'ipad') return <div class="pm-top"><span class="pm-b">‹</span><Url tap={tap} />{share}<span class="pm-b">⧉</span></div>;
    if (chrome === 'chromeIos') return <div class="pm-top"><Url tap={tap} share /></div>;
    if (chrome === 'inapp') return <div class="pm-top"><span class="pm-b">✕</span><Url tap={tap} /><Btn id="dots" tap={tap}>•••</Btn></div>;
    if (chrome === 'chromeAndroid' || chrome === 'generic') return <div class="pm-top"><span class="pm-b">⌂</span><Url tap={tap} /><span class="pm-b">⧉</span><Btn id="more" tap={tap}>⋮</Btn></div>;
    return <div class="pm-top"><Url tap={tap} /></div>;
  }
  if (chrome === 'safari26') return <div class="pm-bottom float"><span class="pm-b">‹</span><Url tap={tap} /><Btn id="more" tap={tap}>•••</Btn></div>;
  if (chrome === 'safari') return <div class="pm-bottom"><span class="pm-b">‹</span><span class="pm-b dim">›</span>{share}<span class="pm-b"><Icon name="book" size={12} /></span><span class="pm-b">⧉</span></div>;
  if (chrome === 'chromeIos') return <div class="pm-bottom"><span class="pm-b">‹</span><span class="pm-b dim">›</span><span class="pm-b">＋</span><span class="pm-b">⧉</span><span class="pm-b">•••</span></div>;
  if (chrome === 'firefoxIos') return <div class="pm-bottom"><span class="pm-b">‹</span><span class="pm-b dim">›</span><span class="pm-b">＋</span><span class="pm-b">⧉</span><Btn id="menu" tap={tap}>≡</Btn></div>;
  if (chrome === 'samsung') return <div class="pm-bottom"><span class="pm-b">‹</span><span class="pm-b dim">›</span><span class="pm-b">⌂</span><span class="pm-b">☆</span><span class="pm-b">⧉</span><Btn id="menu" tap={tap}>≡</Btn></div>;
  if (chrome === 'edgeAndroid') return <div class="pm-bottom"><span class="pm-b">‹</span><span class="pm-b dim">›</span><Btn id="menu" tap={tap}>≡</Btn><span class="pm-b">⧉</span><span class="pm-b">⌂</span></div>;
  return null;
}

function MiniPage({ tap, chrome }) {
  return (
    <div class="pm-page">
      <svg viewBox="0 0 120 120" class="pm-map" aria-hidden="true">
        <path d="M-5 30H125M-5 86H125M34-5V125M90-5V125" />
        <path class="done" d="M-5 30H34V86" /><path class="live" d="M34 86H90" />
        <circle cx="90" cy="86" r="5" />
      </svg>
      <div class="pm-card"><Logo size={16} /><b>Porte suivante</b><span>12 rue des Lilas</span></div>
      {chrome === 'inapp' && <span class={'pm-open' + (tap === 'open' ? ' tap' : '')}>Ouvrir dans le navigateur<Tap on={tap === 'open'} /></span>}
    </div>
  );
}

function Home() {
  return (
    <div class="pm-home">
      <div class="pm-grid">
        {Array.from({ length: 11 }, (_, i) => <i key={i} style={{ '--h': (i * 37) % 360 }} />)}
        <span class="pm-app"><Logo size={34} /><small>Nokk</small></span>
      </div>
      <div class="pm-dock">{[0, 1, 2, 3].map((i) => <i key={i} />)}</div>
    </div>
  );
}

export function PhoneMock({ chrome = 'generic', frame = { screen: 'page' } }) {
  const tap = frame.screen === 'page' ? frame.tap : null;
  return (
    <div class={'pm pm-' + chrome} aria-hidden="true">
      <div class="pm-screen">
        <div class="pm-status"><b>9:41</b><span>▮▮▮ ◔</span></div>
        {frame.screen === 'home' ? <Home /> : (
          <>
            <Chrome chrome={chrome} tap={tap} where="top" />
            <MiniPage tap={tap} chrome={chrome} />
            <Chrome chrome={chrome} tap={tap} where="bottom" />
            {frame.screen === 'menu' && (
              <div class={'pm-menu' + (/Android|samsung|edge|chromeAndroid|generic/i.test(chrome) ? ' drop' : '')} key={frame.items.join()}>
                {frame.items.map((x, j) => <span key={x} class={j === frame.hi ? 'tap' : ''}>{x}<Tap on={j === frame.hi} /></span>)}
              </div>
            )}
            {frame.screen === 'confirm' && (
              <div class={'pm-confirm' + (frame.android ? ' android' : '')}>
                {frame.android ? (
                  <>
                    <div class="pm-c-row"><Logo size={22} /><span><b>Nokk</b><small>nokkapp.fr</small></span></div>
                    <div class="pm-c-title">{frame.title}</div>
                    <div class="pm-c-acts"><span>Annuler</span><span class="tap">{frame.button}<Tap on /></span></div>
                  </>
                ) : (
                  <>
                    <div class="pm-c-head"><span>Annuler</span><b>{frame.title}</b><span class="tap">{frame.button}<Tap on /></span></div>
                    <div class="pm-c-row"><Logo size={22} /><span><b>Nokk</b><small>nokkapp.fr</small></span></div>
                    {frame.webapp && <div class="pm-c-sw"><span>Ouvrir comme app web</span><i /></div>}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ——— Le guide ———
const ARROW = {
  bottom: { icon: '↓', text: 'Le bouton se trouve dans la barre tout en bas de votre écran.' },
  'bottom-right': { icon: '↘', text: 'Le bouton se trouve en bas à droite de votre écran.' },
  'top-right': { icon: '↗', text: 'Le bouton se trouve en haut à droite de votre écran.' },
};

function useAutoplay(n, key) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => { setI(0); setPaused(false); }, [key]);
  useEffect(() => {
    if (paused || n < 2) return;
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => setI((x) => (x + 1) % n), i === n - 1 ? 3600 : reduce ? 4200 : 2900);
    return () => clearTimeout(t);
  }, [i, paused, n, key]);
  return [i, (x) => { setPaused(true); setI(x); }, paused, setPaused];
}

export function InstallGuide({ inline = false, onDone }) {
  const auto = currentDevice();
  const [manual, setManual] = useState(null);
  const [choose, setChoose] = useState(false);
  const dev = manual ? { ...manual.dev, standalone: false } : auto;
  const gd = guideFor(dev, { canPrompt: canInstall.value && !manual });
  const steps = gd.steps || [];
  const [i, setI, paused, setPaused] = useAutoplay(steps.length, gd.label + gd.kind);
  const step = steps[i];

  if (gd.kind === 'installed') {
    return (
      <div class="ig stack center" data-testid="install-guide" data-kind="installed">
        <div class="ig-done"><Logo size={56} /><span class="ig-check"><Icon name="check" size={18} /></span></div>
        <h2 class="ig-title">Nokk est sur votre écran d'accueil</h2>
        <p class="muted small">Elle s'ouvre en plein écran, marche sans réseau, et se met à jour toute seule.</p>
        {onDone && <Button kind="full" onClick={onDone}>Super</Button>}
      </div>
    );
  }

  if (gd.kind === 'desktop') return <DesktopGuide gd={gd} onDone={onDone} />;

  const done = () => {
    saveSettings({ installClaimed: Date.now() });
    feel('done');
    toast('Parfait. Ouvrez Nokk depuis son icône, maintenant.');
    onDone?.();
  };

  return (
    <div class={'ig stack' + (inline ? ' inline' : '')} data-testid="install-guide" data-kind={gd.kind} data-chrome={gd.chrome}>
      <div class="hrow between ig-detect">
        <span class="pill tone-info" data-testid="install-device"><Icon name="phone" size={14} /> {gd.label}</span>
        <button class="link-btn tiny" onClick={() => { feel('tap'); setChoose(!choose); }} data-testid="install-other">{choose ? 'Fermer' : 'Pas votre téléphone ?'}</button>
      </div>
      {choose && (
        <div class="chips ig-choose anim-in">
          {MANUAL.map((m) => <button type="button" key={m.key} class="chip" aria-pressed={manual?.key === m.key ? 'true' : 'false'} onClick={() => { feel('tick'); setManual(m); setChoose(false); }} data-testid={'install-pick-' + m.key}>{m.label}</button>)}
        </div>
      )}
      {!inline && <h2 class="ig-title">Nokk sur votre écran d'accueil</h2>}
      <div class="ig-perks">
        <span><Icon name="phone" size={16} />Plein écran</span>
        <span><Icon name="wifiOff" size={16} />Sans réseau</span>
        <span><Icon name="rocket" size={16} />Un toucher</span>
      </div>
      {gd.kind === 'openin' && <p class="small ig-warn"><Icon name="help" size={16} /> {gd.intro}</p>}
      <div class="ig-stage">
        <PhoneMock chrome={gd.chrome} frame={step?.frame} key={gd.chrome} />
        <ol class="ig-steps" role="list">
          {steps.map((s, j) => (
            <li key={j} class={(j === i ? 'on' : '') + (j < i ? ' past' : '')}>
              <button type="button" onClick={() => { feel('tick'); setI(j); }} data-testid={'install-step-' + j} aria-current={j === i ? 'step' : undefined}>
                <span class="ig-n">{j === steps.length - 1 ? <Icon name="check" size={14} /> : j + 1}</span>
                <span class="grow"><b class="ig-key">{s.strong}</b><span class="ig-t">{s.text}</span></span>
              </button>
              {j === i && !paused && <i class="ig-timer" key={i} />}
            </li>
          ))}
        </ol>
      </div>
      <div class="hrow ig-play">
        <button class="link-btn tiny" onClick={() => setPaused(!paused)}>{paused ? '▶ Relancer l\'animation' : '❚❚ Pause'}</button>
      </div>
      {gd.arrow && i === 0 && <div class={'ig-arrow ' + gd.arrow} data-testid="install-arrow"><span>{ARROW[gd.arrow].icon}</span>{ARROW[gd.arrow].text}</div>}

      {gd.kind === 'prompt' && (
        <Button kind="full" icon="install" data-testid="install-prompt" onClick={async () => {
          const ok = await promptInstall();
          if (ok) { confetti(); done(); }
        }}>Installer Nokk</Button>
      )}
      {gd.kind === 'openin' && (
        <div class="stack s8">
          <a class="btn full" href={gd.openUrl} data-testid="install-open" onClick={() => feel('tap')}><Icon name="arrowR" /> {gd.label}</a>
          <CopyLink />
        </div>
      )}
      {gd.fallback === 'safari' && <a class="link center small" href={'x-safari-' + APP_URL}>Ça ne marche pas ? Ouvrir Nokk dans Safari</a>}
      {gd.fallback === 'chrome' && <a class="link center small" href={CHROME_INTENT}>Ça ne marche pas ? Ouvrir Nokk dans Chrome</a>}
      {dev.ios && gd.kind === 'steps' && (
        <p class="tiny muted ig-note"><Icon name="lock" size={13} /> Sur iPhone, l'appli de l'écran d'accueil est séparée de Safari : à la première ouverture, reconnectez-vous avec le même compte. Vos tournées sont sauvegardées en ligne, rien ne se perd.</p>
      )}
      {gd.kind !== 'openin' && <Button kind={gd.kind === 'prompt' ? 'ghost full' : 'full'} onClick={done} data-testid="install-done">C'est fait, j'ai l'icône Nokk</Button>}
    </div>
  );
}

function CopyLink() {
  const [ok, setOk] = useState(false);
  return (
    <Button kind="soft full" icon={ok ? 'check' : 'share'} onClick={async () => {
      try { await navigator.clipboard.writeText(APP_URL); setOk(true); feel('ok'); toast('Lien copié : collez-le dans la barre d\'adresse'); } catch { toast(APP_URL); }
    }} data-testid="install-copy">{ok ? 'Lien copié' : 'Copier le lien nokkapp.fr'}</Button>
  );
}

function DesktopGuide({ gd, onDone }) {
  const { n, d } = qrPath(APP_URL);
  return (
    <div class="ig stack center" data-testid="install-guide" data-kind="desktop">
      <h2 class="ig-title">Nokk se vit au téléphone</h2>
      <p class="muted small">Scannez ce code avec l'appareil photo de votre téléphone : Nokk s'ouvre, et ce guide vous montre comment la mettre sur l'écran d'accueil.</p>
      <div class="qr-frame ig-qr"><svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} role="img" aria-label="QR code vers nokkapp.fr"><rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" /><path d={d} fill="#12262a" /></svg></div>
      <span class="pill">nokkapp.fr</span>
      <p class="tiny muted">{gd.tip}</p>
      {gd.canPrompt && <Button kind="soft full" icon="install" onClick={() => promptInstall()}>Installer sur cet ordinateur</Button>}
      {onDone && <Button kind="ghost full" onClick={onDone}>Fermer</Button>}
    </div>
  );
}

// ——— Le rappel discret, en haut des écrans, tant que Nokk n'est pas installée ———
export function InstallNudge() {
  const dev = currentDevice();
  const s = settings.value;
  if (demo.value || !dev.mobile || dev.standalone || s.installClaimed) return null;
  if (s.installLater && Date.now() - s.installLater < 3 * 86400000) return null;
  return (
    <div class="card install-nudge" data-testid="install-nudge">
      <span class="in-icon"><Logo size={30} /><i><Icon name="plus" size={12} /></i></span>
      <span class="grow"><b>Mettez Nokk sur votre écran d'accueil</b><span class="small muted">Plein écran, sans réseau, un toucher pour l'ouvrir.</span></span>
      <span class="stack s4">
        <Button kind="small" onClick={openInstall} data-testid="install-nudge-go">Montrer</Button>
        <button class="link-btn tiny" onClick={() => saveSettings({ installLater: Date.now() })}>Plus tard</button>
      </span>
    </div>
  );
}

/** Première ouverture depuis l'écran d'accueil : on félicite, une seule fois. */
export function noteInstalled() {
  if (!currentDevice().standalone || settings.peek().installedAt) return;
  const p = settings.peek().parcours || {};
  saveSettings({ installedAt: Date.now(), parcours: { ...p, done: { ...(p.done || {}), install: Date.now() } } });
  setTimeout(() => { toast('Nokk est installée sur votre écran d\'accueil. Bravo !'); feel('done'); }, 900);
}


