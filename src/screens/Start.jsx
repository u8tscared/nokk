// Premiers pas : la micro-formation qui montre où toucher, le partage de Nokk, et ce qui arrive bientôt.
import { useEffect, useState, useLayoutEffect } from 'preact/hooks';
import { signal, computed } from '@preact/signals';
import { Icon } from '../ui/icons.jsx';
import { Button, DotIcon, toast } from '../ui/ui.jsx';
import { data, demo, settings, saveSettings, role } from '../lib/store.js';
import { account, inviteLink } from '../lib/account.js';
import { go, openSheet, route, sheets } from '../lib/nav.js';
import { feel } from '../lib/feedback.js';
import { qrPath } from '../lib/qr.js';
import { api } from '../lib/api.js';

// ——— Projecteur : un cercle autour du bouton à toucher, avec une bulle ———
export const coachTip = signal(null); // { target, text, title }

export function coach(target, text, title) {
  coachTip.value = { target, text, title, at: Date.now() };
}

export function Coach() {
  const tip = coachTip.value;
  const [rect, setRect] = useState(null);
  useLayoutEffect(() => {
    if (!tip) { setRect(null); return; }
    let alive = true;
    let tries = 0;
    const find = () => {
      if (!alive) return;
      const el = [...document.querySelectorAll(`[data-testid="${tip.target}"]`)].find((x) => x.offsetParent || x.getClientRects().length);
      if (!el) { if (++tries < 40) setTimeout(find, 100); else coachTip.value = null; return; }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(() => { if (alive) setRect(el.getBoundingClientRect()); }, 320);
    };
    find();
    const off = () => { coachTip.value = null; };
    const t = setTimeout(() => window.addEventListener('pointerdown', off, { capture: true, once: true }), 400);
    const re = () => { const el = document.querySelector(`[data-testid="${tip.target}"]`); if (el) setRect(el.getBoundingClientRect()); };
    window.addEventListener('resize', re);
    return () => { alive = false; clearTimeout(t); window.removeEventListener('pointerdown', off, { capture: true }); window.removeEventListener('resize', re); };
  }, [tip?.at]);
  if (!tip || !rect) return null;
  const pad = 8;
  const box = { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 };
  const below = rect.top < innerHeight / 2;
  const bubble = below ? { top: box.top + box.height + 14 } : { bottom: innerHeight - box.top + 14 };
  return (
    <div class="coach" role="dialog" aria-live="polite" aria-label={tip.title || 'Astuce'} data-testid="coach">
      <div class="coach-hole" style={{ left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px' }} />
      <div class={'coach-bubble ' + (below ? 'down' : 'up')} style={{ ...Object.fromEntries(Object.entries(bubble).map(([k, v]) => [k, v + 'px'])), '--x': Math.min(innerWidth - 40, Math.max(40, rect.left + rect.width / 2)) + 'px' }}>
        {tip.title && <b>{tip.title}</b>}
        <span>{tip.text}</span>
        <span class="tiny coach-skip">Touchez n'importe où pour continuer</span>
      </div>
    </div>
  );
}

// ——— Les étapes de la campagne ———
const flags = () => settings.value.start || {};
export function markStart(k) { saveSettings({ start: { ...flags(), [k]: Date.now() } }); }

export const STEPS = [
  { key: 'sector', icon: 'draw', title: 'Tracez votre premier secteur', text: 'Dessinez la zone sur la carte ou prenez le plan papier en photo : Nokk trouve les rues et les numéros.',
    done: (d) => d.sectors.length > 0, cta: 'Créer un secteur', run: () => { go('secteurs'); setTimeout(() => coach('new-sector', 'Touchez ici, puis tracez la zone avec le doigt ou ajoutez la photo du plan.', 'Nouveau secteur'), 250); } },
  { key: 'team', icon: 'team', title: 'Invitez votre équipe', text: 'Un lien suffit : chacun rejoint la caserne et sait dans quel secteur il tourne, avec qui.',
    done: (d, f) => !!f.team || d.members.length > 2, cta: 'Inviter', run: () => { go('equipe'); setTimeout(() => coach(account.peek()?.team ? 'invite-card' : 'add-member', account.peek()?.team ? 'Envoyez ce lien par message : un toucher et ils sont dans l\'équipe.' : 'Ajoutez vos équipiers ici.', 'Votre équipe'), 250); } },
  { key: 'tour', icon: 'walk', title: 'Lancez la tournée', text: 'Le chrono démarre, la carte vous guide de porte en porte par le chemin le plus court.',
    done: (d) => (d.sessions || []).length > 0 || d.visits.length > 0, cta: 'Aller à la carte', run: () => { go('carte'); setTimeout(() => coach('start-tour', 'Touchez « Lancer la tournée » quand vous partez.', 'C\'est parti'), 450); } },
  { key: 'door', icon: 'door', title: 'Saisissez votre première porte', text: 'Don, absent, refus : un toucher. Nokk compte l\'argent, les calendriers et ce qu\'il reste.',
    done: (d) => d.visits.length > 0, cta: 'Saisir une porte', run: () => { go('carte'); setTimeout(() => coach(matchMedia('(min-width: 960px)').matches ? 'side-saisir' : 'tab-saisir', 'Ce gros bouton ouvre la porte devant vous.', 'Saisir'), 450); } },
];

export const startProgress = computed(() => {
  const d = data.value;
  const f = flags();
  const list = STEPS.map((s) => ({ ...s, ok: !!s.done(d, f) }));
  return { list, done: list.filter((s) => s.ok).length, next: list.find((s) => !s.ok) };
});

/** Carte « Votre campagne en 4 étapes ». */
export function StartCard({ compact }) {
  const p = startProgress.value;
  const f = flags();
  if (demo.value || f.hidden || role.value === 'tresorier') return null;
  if (p.done === STEPS.length) {
    if (f.celebrated) return null;
    return (
      <div class="card start-card done" data-testid="start-card">
        <div class="hrow"><DotIcon icon="check" tone="ok" /><div class="grow"><div class="card-title">Votre campagne est lancée</div><div class="small muted">Vous connaissez l'essentiel. Bonne tournée !</div></div></div>
        <Button kind="soft small" onClick={() => markStart('celebrated')}>Fermer</Button>
      </div>
    );
  }
  return (
    <div class={'card start-card' + (compact ? ' compact' : '')} data-testid="start-card">
      <div class="hrow between">
        <div><div class="tiny muted">Premiers pas · {p.done}/{STEPS.length}</div><div class="card-title">Votre campagne en {STEPS.length} étapes</div></div>
        <button class="link-btn tiny" onClick={() => { markStart('hidden'); toast('Retrouvez la formation dans Réglages'); }} data-testid="start-hide">Masquer</button>
      </div>
      <div class="start-bar" aria-hidden="true">{STEPS.map((s, i) => <i key={s.key} class={p.list[i].ok ? 'on' : ''} />)}</div>
      <ol class="start-steps">
        {p.list.map((s, i) => {
          const isNext = s === p.next;
          return (
            <li key={s.key} class={(s.ok ? 'ok' : '') + (isNext ? ' next' : '')}>
              <span class="start-num">{s.ok ? <Icon name="check" size={16} /> : i + 1}</span>
              <div class="grow">
                <b>{s.title}</b>
                {isNext && !compact && <p class="small muted">{s.text}</p>}
                {isNext && <Button kind="coral small" icon={s.icon} onClick={() => { feel('tap'); s.run(); }} data-testid={'start-' + s.key}>{s.cta}</Button>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Micro-formation en 4 écrans animés, juste après la création de l'équipe. */
export function openIntro() {
  openSheet(({ close }) => <Intro close={close} />, { label: 'Bienvenue dans Nokk' });
}

const SLIDES = [
  { k: 'sector', title: 'Tracez vos secteurs', text: 'Du doigt sur la carte, ou en photo du plan papier. Nokk trouve chaque rue et chaque numéro.' },
  { k: 'route', title: 'Suivez le guide', text: 'La carte vous emmène de porte en porte par le chemin le plus court. Les rues faites passent au vert.' },
  { k: 'door', title: 'Un toucher par porte', text: 'Don, absent, refus. Le montant, les calendriers et la caisse se calculent tout seuls.' },
  { k: 'team', title: 'Toute l\'équipe en direct', text: 'Chacun voit les secteurs, les binômes et l\'argent collecté, même sans réseau.' },
];

function Intro({ close }) {
  const [i, setI] = useState(0);
  const s = SLIDES[i];
  const last = i === SLIDES.length - 1;
  useEffect(() => { markStart('intro'); }, []);
  return (
    <div class="intro" data-testid="intro">
      <button class="link-btn intro-skip" onClick={() => { close(); }} data-testid="intro-skip">Passer</button>
      <div class="intro-art" key={s.k} aria-hidden="true"><IntroArt k={s.k} /></div>
      <div class="intro-dots" aria-hidden="true">{SLIDES.map((x, j) => <i key={x.k} class={j === i ? 'on' : ''} />)}</div>
      <h2 class="intro-title" key={'t' + i}>{s.title}</h2>
      <p class="muted intro-text" key={'p' + i}>{s.text}</p>
      <div class="hrow">
        {i > 0 && <Button kind="soft grow" onClick={() => setI(i - 1)}>Retour</Button>}
        <Button kind="coral grow" data-testid="intro-next" onClick={() => {
          feel('tap');
          if (!last) { setI(i + 1); return; }
          close();
          setTimeout(() => startProgress.peek().next?.run(), 350);
        }}>{last ? 'Créer mon premier secteur' : 'Suivant'}</Button>
      </div>
    </div>
  );
}

function IntroArt({ k }) {
  if (k === 'sector') return (
    <svg viewBox="0 0 240 150" class="ia">
      <path class="ia-road" d="M0 40h240M0 110h240M60 0v150M170 0v150" />
      <path class="ia-zone" d="M40 25 L195 30 L205 125 L45 130 Z" />
      <circle class="ia-dot d1" cx="70" cy="40" r="5" /><circle class="ia-dot d2" cx="120" cy="40" r="5" /><circle class="ia-dot d3" cx="170" cy="70" r="5" /><circle class="ia-dot d4" cx="110" cy="110" r="5" /><circle class="ia-dot d5" cx="60" cy="85" r="5" />
      <path class="ia-finger" d="M195 30c6 4 9 10 8 17" />
    </svg>
  );
  if (k === 'route') return (
    <svg viewBox="0 0 240 150" class="ia">
      <path class="ia-road" d="M0 40h240M0 110h240M60 0v150M170 0v150" />
      <path class="ia-done" d="M0 40h60" /><path class="ia-path" d="M60 40h110v70H60" />
      <circle class="ia-me" cx="60" cy="40" r="8" />
    </svg>
  );
  if (k === 'door') return (
    <svg viewBox="0 0 240 150" class="ia">
      <rect class="ia-card" x="45" y="18" width="150" height="114" rx="14" />
      <rect class="ia-btn b1" x="60" y="70" width="38" height="22" rx="7" /><rect class="ia-btn b2" x="101" y="70" width="38" height="22" rx="7" /><rect class="ia-btn b3" x="142" y="70" width="38" height="22" rx="7" />
      <rect class="ia-go" x="60" y="100" width="120" height="22" rx="8" />
      <text class="ia-amt" x="120" y="54" text-anchor="middle">10 €</text>
    </svg>
  );
  return (
    <svg viewBox="0 0 240 150" class="ia">
      <path class="ia-road" d="M0 40h240M0 110h240M60 0v150M170 0v150" />
      <circle class="ia-mate m1" cx="60" cy="40" r="9" /><circle class="ia-mate m2" cx="170" cy="110" r="9" /><circle class="ia-mate m3" cx="170" cy="40" r="9" />
      <path class="ia-done" d="M0 110h60M170 0v40" />
    </svg>
  );
}

// ——— Faire connaître Nokk ———
export const SITE = 'https://u8tscared.github.io/nokk/';
export const refCode = computed(() => (account.value?.uid ? account.value.uid.slice(0, 8) : null));
export const shareUrl = computed(() => SITE + 'decouvrir/' + (refCode.value ? '?ref=' + refCode.value : ''));
const pitch = () => `Je fais la tournée des calendriers avec Nokk : la carte de nos secteurs, le parcours porte à porte, la caisse et les comptes, tout est dans le téléphone. C'est gratuit pour les amicales. ${shareUrl.value}`;

export function ShareNokkCard() {
  return (
    <div class="card share-nokk" data-testid="share-nokk">
      <div class="hrow"><DotIcon icon="heart" tone="bad" /><div class="grow"><div class="card-title">Faites connaître Nokk</div><div class="small muted">Gratuit pour toutes les amicales. Envoyez-le à une autre caserne.</div></div></div>
      <div class="hrow" style={{ marginTop: 12 }}>
        <Button kind="small grow" icon="share" onClick={() => shareNokk()} data-testid="share-nokk-btn">Partager Nokk</Button>
        <Button kind="soft small grow" icon="qr" onClick={() => openShareQr()} data-testid="share-nokk-qr">Montrer le QR</Button>
      </div>
    </div>
  );
}

export async function shareNokk() {
  feel('tap');
  markStart('shared');
  const text = pitch();
  try {
    if (navigator.share) { await navigator.share({ title: 'Nokk', text, url: shareUrl.value }); return; }
  } catch (e) { if (e?.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); toast('Lien copié, collez-le dans un message'); } catch { toast(shareUrl.value); }
}

export function openShareQr() {
  markStart('shared');
  openSheet(() => <ShareQr />, { label: 'QR Nokk' });
}

function ShareQr() {
  const { n, d } = qrPath(shareUrl.value);
  const [count, setCount] = useState(null);
  useEffect(() => { if (account.peek()) api('/ref/count').then((r) => setCount(r.count), () => {}); }, []);
  return (
    <div class="stack center share-qr" data-testid="share-qr">
      <div class="sheet-head"><div><div class="tiny muted">À scanner avec l'appareil photo</div><h2>Nokk pour votre caserne</h2></div></div>
      <div class="qr-frame"><svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} role="img" aria-label="QR code vers Nokk"><rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" /><path d={d} fill="#12262a" /></svg></div>
      <p class="small muted">Le collègue scanne, ouvre Nokk et crée son équipe en deux minutes. Gratuit.</p>
      {count != null && count > 0 && <p class="pill tone-ok">{count} {count > 1 ? 'personnes ont' : 'personne a'} rejoint Nokk grâce à vous</p>}
      <Button kind="soft full" icon="share" onClick={() => shareNokk()}>Envoyer le lien</Button>
    </div>
  );
}

/** Au premier passage : on garde le code du parrain (lien ?ref=). */
export function captureRef() {
  try {
    const m = /[?&]ref=([\w-]{4,16})/.exec(location.search);
    if (m) {
      localStorage.setItem('nokk:ref', m[1]);
      history.replaceState(history.state, '', location.pathname + location.hash);
    }
  } catch {}
}
export async function sendRef() {
  let code;
  try { code = localStorage.getItem('nokk:ref'); } catch {}
  if (!code) return;
  try { await api('/ref', { method: 'POST', body: { code } }); localStorage.removeItem('nokk:ref'); } catch {}
}

// ——— Bientôt disponible ———
export function SoonCard() {
  return (
    <div class="card soon" data-testid="soon-card">
      <div class="hrow between"><div class="card-title">Bientôt dans Nokk</div><span class="pill">Prochainement</span></div>
      <div class="soon-row"><DotIcon icon="sumup" tone="info" /><div class="grow"><b>Paiement par carte SumUp</b><div class="small muted">Encaissez la carte bancaire depuis Nokk, le don s'enregistre tout seul.</div></div></div>
      <div class="soon-row"><DotIcon icon="receipt" tone="warn" /><div class="grow"><b>Souches numériques</b><div class="small muted">Le bon remis à l'habitant reste en papier. La souche du pompier et celle de la caserne passent dans Nokk : chaque montant est contrôlé automatiquement.</div></div></div>
    </div>
  );
}

// Quand une équipe vient d'être créée, la micro-formation s'ouvre une seule fois.
export function maybeIntro() {
  if (demo.peek() || flags().intro) return;
  setTimeout(() => { if (route.peek() === 'secteurs' && !sheets.peek().length && !document.querySelector('[data-testid="creator-map"]') && !data.peek().sectors.length) openIntro(); }, 250);
}
