// La formation Nokk : on fait connaissance, puis chaque pompier suit SES leçons, avec exercices et quiz.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { computed } from '@preact/signals';
import { Icon, Logo } from '../ui/icons.jsx';
import { Button, DotIcon, toast, confetti, shake } from '../ui/ui.jsx';
import { settings, saveSettings, data, demo, me } from '../lib/store.js';
import { go, openSheet, sheets } from '../lib/nav.js';
import { feel } from '../lib/feedback.js';
import { formatEuro } from '../lib/model.js';
import { simulateOutage } from '../lib/offline.js';
import { QUESTIONS, MODULES, buildPlan, defaultProfile, isComplete, planMinutes, progressOf, profileLine } from '../lib/parcours.js';
import { currentDevice } from '../lib/device.js';
import { InstallGuide } from './Install.jsx';
import { coach, coachTip, IntroArt, markStart } from './Start.jsx';

const state = () => settings.value.parcours || {};
function saveParcours(patch) { saveSettings({ parcours: { ...state(), ...patch } }); }
function markDone(key) { saveParcours({ done: { ...(state().done || {}), [key]: Date.now() } }); }

const ctx = () => { const d = currentDevice(); return { standalone: d.standalone, mobile: d.mobile }; };
export const plan = computed(() => { const s = settings.value.parcours; return s?.profile ? buildPlan(s.profile, ctx()) : []; });
export const progress = computed(() => progressOf(plan.value, settings.value.parcours?.done || {}));

const firstName = () => (me.peek()?.name || '').split(' ')[0];
const isDesktop = () => typeof matchMedia !== 'undefined' && matchMedia('(min-width: 960px)').matches;

// ——— Ouverture ———
export function openWelcome() {
  feel('sheet');
  openSheet(({ close }) => <Welcome close={close} />, { label: 'Bienvenue dans Nokk', class: 'sheet-parcours' });
}
export function openLesson(key) {
  feel('tap');
  openSheet(({ close }) => <Lesson k={key} close={close} />, { label: MODULES[key]?.title || 'Leçon', class: 'sheet-parcours' });
}

/** Au premier passage dans l'appli (créateur d'équipe ou pompier invité) : une seule fois. */
export function maybeWelcome() {
  if (demo.peek() || !me.peek()) return;
  const s = state();
  if (s.profile || s.skipped || (settings.peek().start || {}).intro) return;
  setTimeout(() => {
    if (sheets.peek().length || coachTip.peek() || document.querySelector('[data-testid="creator-map"]')) return;
    if (state().profile || state().skipped) return;
    openWelcome();
  }, 700);
}

// ——— Faisons connaissance ———
function Welcome({ close }) {
  const role = me.peek()?.role || 'pompier';
  const [p, setP] = useState(() => state().profile || defaultProfile(role));
  const [step, setStep] = useState(state().profile ? 1 : 0); // 0 = accueil, 1..n = questions, n+1 = parcours prêt
  const n = QUESTIONS.length;
  const q = QUESTIONS[step - 1];
  useEffect(() => { markStart('intro'); }, []);

  const pickOne = (k, v) => { feel('tick'); const np = { ...p, [k]: v }; setP(np); setTimeout(() => setStep((s) => (s === step ? s + 1 : s)), 260); };
  const toggle = (k, v) => { feel('tick'); const cur = p[k] || []; setP({ ...p, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] }); };
  const skip = () => { saveParcours({ skipped: Date.now() }); close(); toast('Votre formation vous attend dans Plus › Formation'); };

  if (step === 0) {
    const name = firstName();
    return (
      <div class="pc-welcome" data-testid="intro">
        <button class="link-btn intro-skip" onClick={skip} data-testid="intro-skip">Plus tard</button>
        <div class="pc-hero"><IntroArt k="route" /><span class="pc-logo"><Logo size={52} animated /></span></div>
        <h2 class="intro-title">{name ? `Bienvenue ${name} !` : 'Bienvenue dans Nokk !'}</h2>
        <p class="muted intro-text">Six questions pour vous connaître, puis une formation faite pour vous : ce que vous ferez vraiment ce soir, avec des exercices pour vous entraîner sans rien abîmer.</p>
        <div class="pc-promise">
          <span><Icon name="clock" size={18} />Moins de 2 minutes</span>
          <span><Icon name="target" size={18} />Rien que ce qui vous sert</span>
          <span><Icon name="repeat" size={18} />À revoir quand vous voulez</span>
        </div>
        <Button kind="coral full" onClick={() => { feel('tap'); setStep(1); }} data-testid="intro-next">Faisons connaissance</Button>
      </div>
    );
  }

  if (step > n) {
    const pl = buildPlan(p, ctx());
    return (
      <div class="pc-ready" data-testid="parcours-ready">
        <div class="tiny muted">Votre formation</div>
        <h2 class="intro-title">C'est prêt{firstName() ? ', ' + firstName() : ''}</h2>
        <p class="pill tone-info pc-profile">{profileLine(p)}</p>
        <ol class="pc-plan">
          {pl.map((m, i) => (
            <li key={m.key} style={{ '--i': i }}>
              <DotIcon icon={m.icon} sm tone={i === 0 ? 'bad' : ''} />
              <span class="grow"><b>{m.title}</b><span class="tiny muted">{m.why}</span></span>
              <span class="tiny muted">{m.min} min</span>
            </li>
          ))}
        </ol>
        {p.comfort === 'peu' && !settings.value.simple && (
          <label class="row toggle-row card tight" for="pc-simple">
            <DotIcon icon="eye" sm tone="info" />
            <span class="grow"><span class="t">Activer la vue simple</span><span class="s">Seulement la carte, la saisie et la caisse. Plus tard, vous pourrez tout afficher.</span></span>
            <input id="pc-simple" type="checkbox" role="switch" class="switch" checked={!!p.simple} onChange={(e) => setP({ ...p, simple: e.currentTarget.checked })} data-testid="pc-simple" />
          </label>
        )}
        <div class="hrow">
          <Button kind="soft grow" onClick={() => setStep(n)}>Retour</Button>
          <Button kind="coral grow" data-testid="parcours-start" onClick={() => {
            const { simple, ...profile } = p;
            saveParcours({ profile, at: state().at || Date.now() });
            if (simple) saveSettings({ simple: true });
            feel('done');
            close();
            setTimeout(() => openLesson(pl[0].key), 380);
          }}>Commencer · {planMinutes(pl)} min</Button>
        </div>
        <button class="link center small" onClick={() => { const { simple, ...profile } = p; saveParcours({ profile, at: Date.now() }); if (simple) saveSettings({ simple: true }); close(); toast('Votre formation vous attend dans Plus › Formation'); }} data-testid="parcours-later">Je la ferai plus tard</button>
      </div>
    );
  }

  const ok = q.multi ? (p[q.key] || []).length > 0 : !!p[q.key];
  return (
    <div class="pc-q" data-testid="intro" key={step}>
      <div class="hrow between">
        <button class="icon-btn flat" aria-label="Retour" onClick={() => { feel('tap'); setStep(step - 1); }}><Icon name="back" /></button>
        <div class="ob-progress" role="progressbar" aria-valuemin={1} aria-valuemax={n} aria-valuenow={step} aria-label={`Question ${step} sur ${n}`}>
          {QUESTIONS.map((_, i) => <i key={i} class={i < step ? 'on' : ''} />)}
        </div>
        <button class="link-btn tiny" onClick={skip} data-testid="intro-skip">Passer</button>
      </div>
      <h2 class="pc-q-title">{q.title}</h2>
      {q.sub && <p class="tiny muted">{q.sub}</p>}
      <div class="choice-list pc-choices">
        {q.options.map((o, i) => {
          const on = q.multi ? (p[q.key] || []).includes(o.value) : p[q.key] === o.value;
          return (
            <button type="button" key={o.value} style={{ '--i': i }} class={'choice' + (on ? ' on' : '')} aria-pressed={on ? 'true' : 'false'} onClick={() => (q.multi ? toggle(q.key, o.value) : pickOne(q.key, o.value))} data-testid={`q-${q.key}-${o.value}`}>
              <DotIcon icon={o.icon} tone={on ? '' : 'muted'} />
              <span class="grow"><b>{o.label}</b>{o.hint && <span class="small muted" style={{ display: 'block' }}>{o.hint}</span>}</span>
              {q.multi && <span class={'pc-tick' + (on ? ' on' : '')}><Icon name="check" size={14} /></span>}
            </button>
          );
        })}
      </div>
      {(q.multi || ok) && <Button kind="full" disabled={!ok} onClick={() => { feel('tap'); setStep(step + 1); }} data-testid="q-next">{step === n ? 'Voir ma formation' : 'Continuer'}</Button>}
    </div>
  );
}

// ——— Le contenu des leçons, adapté au profil ———
// Une carte : { art, title, text, tip, drill, quiz, action }
function lessonCards(key, p) {
  const city = data.peek().org?.city;
  const price = data.peek().org?.price || 1000;
  const pay = p?.pay || ['especes'];
  const debut = p?.exp === 'debut';
  const pro = p?.exp === 'pro';
  const binome = p?.crew === 'binome' || p?.crew === 'equipe';
  const C = {
    install: [{ install: true }],
    reflexes: [
      { art: 'hello', title: 'Se présenter', text: `Tenue de l'amicale, sourire, et une phrase simple : « Bonjour, les sapeurs-pompiers${city ? ' de ' + city : ''}, on vous présente notre calendrier. »`, tip: 'Montrez le calendrier tout de suite : on sait pourquoi vous êtes là.' },
      { art: 'gift', title: 'Le don est libre', text: `Proposez le montant habituel de l'amicale (${formatEuro(price)}), sans jamais insister. Chacun donne ce qu'il veut, même rien.`, tip: 'Un « non merci » se respecte : on remercie, on note Refus, on passe.' },
      { art: 'receipt', title: 'Le reçu papier', text: 'Le bon est remis à l\'habitant, comme d\'habitude. Nokk garde la trace du don pour vous et pour le trésorier.' },
      { art: 'safety', title: 'Les règles de sécurité', text: binome ? 'Restez avec votre binôme, n\'entrez pas chez les gens, et gardez l\'argent sur vous, jamais compté devant une porte.' : 'N\'entrez pas chez les gens, prévenez quelqu\'un de votre secteur, et gardez l\'argent sur vous, jamais compté devant une porte.', tip: 'Un chien, un doute ? Notez-le sur la porte : vous et vos collègues serez prévenus l\'an prochain.' },
      { quiz: { q: 'Une dame vous dit « pas cette année, désolée ». Que faites-vous ?', options: ['J\'insiste un peu, c\'est pour la bonne cause', 'Je remercie, je touche « Refus » et je passe', 'Je reviens demain'], ok: 1, why: 'On respecte toujours un refus. Nokk ne vous fera pas repasser à cette porte.' } },
    ],
    carte: [
      { art: 'colors', title: 'Les couleurs des rues', text: 'Vert : c\'est fait. Orange : des absents à revoir. Rouge : une équipe y est en ce moment. Gris : personne n\'y est encore passé.' },
      { art: 'locate', title: 'Où vous êtes', text: 'Le bouton viseur vous place sur la carte et vous suit pendant la tournée. La première fois, le téléphone vous demande la permission : touchez « Autoriser ».', action: { label: 'Me montrer le viseur', route: 'carte', target: 'locate', text: 'Touchez ici pour vous localiser.', title: 'Le viseur' } },
      { art: 'next', title: 'La porte suivante', text: 'Le bandeau du bas annonce la prochaine porte du parcours le plus court, et la distance. Touchez-le pour la saisir.' },
      { quiz: { q: 'Une rue orange sur la carte, ça veut dire…', options: ['Une équipe y est en ce moment', 'Il y a des absents à revoir', 'La rue est finie'], ok: 1, why: 'Orange = des absents. On y repasse plus tard, en mode Repasses.' } },
    ],
    tournee: [
      { art: 'sector', title: 'Votre secteur du soir', text: 'En haut de la carte, la pastille du secteur : touchez-la pour changer. Si votre chef vous a affecté, Nokk l\'ouvre tout seul.', action: { label: 'Me montrer la pastille', route: 'carte', target: 'sector-chip', text: 'Votre secteur : touchez pour en changer.', title: 'Le secteur' } },
      { art: 'start', title: 'Lancer la tournée', text: binome ? 'Au départ, touchez « Lancer la tournée » et choisissez votre binôme : le chrono démarre et l\'équipe vous voit avancer.' : 'Au départ, touchez « Lancer la tournée » : le chrono démarre et Nokk calcule le parcours depuis là où vous êtes.', action: { label: 'Me montrer le bouton', route: 'carte', target: 'start-tour', text: 'Touchez « Lancer la tournée » quand vous partez.', title: 'C\'est parti' } },
      { art: 'route', title: 'Suivez le guide', text: 'La ligne vous emmène de porte en porte. Les petites rues se font en zigzag, les grandes avenues un côté puis l\'autre.' },
      { quiz: { q: 'Votre chef vous a envoyé un lien « tu es affecté au secteur 4 ». Que faites-vous ?', options: ['Je redessine le secteur 4', 'J\'ouvre le lien : Nokk ouvre le secteur 4', 'Je demande les adresses par message'], ok: 1, why: 'Le lien vous fait rejoindre l\'équipe et ouvre votre secteur, avec les rues et le parcours.' } },
    ],
    porte: [
      { art: 'door', title: 'Le gros bouton du milieu', text: 'En bas de l\'écran, le gros bouton « porte » ouvre la porte devant vous, sinon la suivante du parcours.', action: { label: 'Me montrer le bouton', route: 'carte', target: isDesktop() ? 'side-saisir' : 'tab-saisir', text: 'Ce bouton ouvre la porte devant vous.', title: 'Saisir' } },
      { art: 'outcomes', title: 'Un geste par porte', text: 'Absent, Refus, Déjà pris : un toucher et on passe à la suivante. Pour un don : le montant, le moyen de paiement, Valider.', tip: pay.includes('cheque') ? 'Un chèque ? Choisissez « Chèque » : le bordereau pour la banque se fait tout seul.' : 'Le montant se règle d\'un geste, même un montant libre.' },
      { drill: true, title: 'À vous : 4 portes d\'entraînement', text: 'Rien n\'est enregistré. Faites comme si vous étiez devant la porte.' },
      { quiz: { q: 'Vous vous êtes trompé de montant. Que faites-vous ?', options: ['Rien, c\'est trop tard', 'J\'ouvre le Journal et je touche la ligne pour corriger', 'J\'efface toute la tournée'], ok: 1, why: 'Chaque passage se corrige depuis le Journal, ou en rouvrant la porte.' } },
    ],
    immeuble: [
      { art: 'building', title: 'Un immeuble, plusieurs logements', text: 'Devant un immeuble, Nokk ouvre la liste des logements : saisissez-les l\'un après l\'autre, « tac tac », sans repasser par la carte.' },
      { art: 'mailbox', title: 'La photo des boîtes aux lettres', text: 'Prenez les boîtes aux lettres en photo : Nokk lit les noms et les range par étage. Vous savez à qui sonner, et qui il reste.', tip: 'Tout se corrige à la main : un nom mal lu, un étage, un logement en plus.' },
      { art: 'floors', title: '« Immeuble terminé »', text: 'Quand vous avez fait tout l\'immeuble, touchez « Immeuble terminé ». Nokk vous dit où aller ensuite, au plus près.' },
      { quiz: { q: 'Dans un immeuble, comment savoir qui il reste à voir ?', options: ['Je recompte sur un papier', 'La liste des logements, étage par étage', 'Je sonne partout à nouveau'], ok: 1, why: 'Chaque logement garde son état : fait, absent, refus. Les absents ressortent pour la repasse.' } },
    ],
    repasse: [
      { art: 'repasse', title: 'Le mode Repasses', text: 'Sur la carte, basculez de « Tournée » à « Repasses » : le parcours ne passe plus que chez les absents.', action: { label: 'Me montrer la bascule', route: 'carte', target: 'mode-switch', text: 'Tournée ou Repasses : un toucher pour changer.', title: 'Repasses' } },
      { art: 'qr', title: 'La carte « Repassez plus tard »', text: 'Votre chef peut imprimer des cartes numérotées avec un QR code. Absent ? Laissez la carte dont Nokk vous donne le numéro : l\'habitant vous dit quand repasser.' },
      { quiz: { q: 'Personne au 14. Que touchez-vous ?', options: ['Refus', 'Absent', 'Rien, je passe'], ok: 1, why: 'Absent : la porte passe en orange et revient dans les repasses.' } },
    ],
    caisse: [
      { art: 'caisse', title: 'Nokk sait ce que vous avez en poche', text: `Chaque don s'ajoute à votre caisse : ${pay.map((x) => ({ especes: 'espèces', cheque: 'chèques', carte: 'carte' }[x])).join(', ')}. Pas de calculette, pas de carnet.`, action: { label: 'Me montrer la caisse', route: 'caisse' } },
      { art: 'count', title: 'Compter, c\'est vérifier', text: 'En fin de tournée, comptez billets et pièces dans Nokk : l\'écart avec ce qui a été saisi s\'affiche tout de suite.', tip: 'Un écart ? Regardez le Journal : souvent un montant mal tapé.' },
      { art: 'handover', title: 'Remettre au trésorier', text: 'Touchez « Remettre la caisse » : un reçu est prêt à signer, et la caisse repart à zéro pour la tournée suivante.' },
      ...(pay.includes('carte') ? [{ art: 'card', title: 'Et la carte bancaire ?', text: 'Notez les paiements par carte avec « Carte ». Le terminal SumUp branché sur Nokk arrive bientôt : le don s\'enregistrera tout seul.' }] : []),
    ],
    equipe: [
      { art: 'team', title: 'Qui tourne avec vous', text: 'Au lancement de la tournée, choisissez votre binôme. Les dons sont notés à vos deux noms.' },
      { art: 'live', title: 'L\'équipe en direct', text: 'Pendant une tournée lancée, l\'équipe voit où est chaque binôme et les rues faites. Rien n\'est partagé en dehors des tournées.' },
      { art: 'phone', title: 'Un seul téléphone pour deux', text: 'Un code à 4 chiffres permet de changer de profil sur le même téléphone, depuis Plus.' },
    ],
    reseau: [
      { art: 'offline', title: 'Sans réseau, on continue', text: 'Cave, hall, hameau : vous saisissez comme d\'habitude. Tout est gardé dans le téléphone et part en ligne dès que le réseau revient.' },
      { art: 'offline', title: 'Essayez maintenant', text: 'Touchez le bouton : le réseau est coupé 20 secondes pour de faux. Regardez, tout continue de marcher.', try: 'offline' },
    ],
    secteur: [
      { art: 'sector', title: 'Tracer la zone', text: 'Dans Secteurs, « Nouveau secteur » : touchez les coins de la zone sur la carte, ou prenez un cercle autour de vous.', action: { label: 'Me montrer', route: 'secteurs', target: 'new-sector', text: 'Touchez ici pour créer un secteur.', title: 'Nouveau secteur' } },
      { art: 'photo', title: 'Le plan papier en photo', text: 'Vous avez un plan de la mairie ? Prenez-le en photo : Nokk lit les rues et trace les secteurs.' },
      { art: 'assign', title: 'Affecter les binômes', text: 'Touchez un secteur, puis « Prévenir » : chaque équipier reçoit un lien qui ouvre son secteur.' },
    ],
    comptes: [
      { art: 'comptes', title: 'Les comptes se font seuls', text: 'Tout se recalcule depuis le journal : ce qui a été remis, ce qui ne l\'est pas encore, binôme par binôme.' },
      { art: 'export', title: 'Les exports', text: 'Le bilan PDF pour le bureau, le bordereau de chèques pour la banque, le tableur pour Excel.' },
    ],
    astuces: [
      { art: 'tags', title: 'Les notes rapides', text: 'Sur une porte : « chien », « ne pas déranger », « interphone en panne »… L\'an prochain, vous et vos collègues serez prévenus.' },
      { art: 'year', title: 'Comparer avec l\'an dernier', text: 'Après la clôture de campagne, chaque porte garde son don de l\'année passée. Vous savez où les habitants sont généreux.' },
      { art: 'night', title: 'Le thème « Soir »', text: 'Dans Réglages, le thème Soir passe en sombre à la nuit tombée : moins d\'éblouissement, plus de batterie.' },
      ...(pro ? [{ art: 'simple', title: 'Pour les collègues moins à l\'aise', text: 'La vue simple ne garde que la carte, la saisie et la caisse. Parfait pour un équipier qui découvre.' }] : []),
    ],
  };
  const cards = C[key] || [];
  // Une première fois : chaque leçon se termine par un encouragement de plus.
  if (debut && key === 'porte') cards.splice(2, 0, { art: 'gift', title: 'Pas de stress', text: 'Une erreur se corrige toujours. L\'important, c\'est le sourire à la porte, Nokk s\'occupe des comptes.' });
  return cards;
}

// ——— La leçon ———
function Lesson({ k, close }) {
  const p = state().profile || defaultProfile(me.peek()?.role);
  const cards = useMemo(() => lessonCards(k, p), [k]);
  const [i, setI] = useState(0);
  const [locked, setLocked] = useState(false); // exercice ou quiz pas encore réussi
  const m = MODULES[k];
  const end = i >= cards.length;
  const c = cards[i];
  useEffect(() => { setLocked(!!(c?.drill || c?.quiz)); }, [i]);
  useEffect(() => { if (end) { markDone(k); feel('done'); } }, [end]);

  if (end) return <LessonEnd k={k} close={close} cards={cards} />;

  return (
    <div class="lesson-play" data-testid="lesson" data-lesson={k}>
      <div class="hrow between">
        <button class="icon-btn flat" aria-label="Fermer la leçon" onClick={close} data-testid="lesson-close"><Icon name="x" /></button>
        <div class="ob-progress" aria-label={`Étape ${i + 1} sur ${cards.length}`}>{cards.map((_, j) => <i key={j} class={j <= i ? 'on' : ''} />)}</div>
        <span class="tiny muted">{i + 1}/{cards.length}</span>
      </div>
      <div class="tiny muted lp-kicker"><Icon name={m.icon} size={14} /> {m.title}</div>
      <div class="lp-card" key={i}>
        {c.install ? <InstallGuide inline onDone={() => setI(i + 1)} /> : (
          <>
            {c.art && <div class="intro-art lp-art" aria-hidden="true"><Art k={c.art} /></div>}
            {c.title && <h2 class="intro-title">{c.title}</h2>}
            {c.text && <p class="lp-text">{c.text}</p>}
            {c.tip && <p class="lp-tip"><Icon name="sparkle" size={16} /> {c.tip}</p>}
            {c.drill && <DoorDrill p={p} onDone={() => setLocked(false)} />}
            {c.quiz && <Quiz q={c.quiz} onOk={() => setLocked(false)} />}
            {c.try === 'offline' && <Button kind="soft full" icon="wifiOff" onClick={() => { simulateOutage(20); toast('Réseau coupé 20 s pour de faux : tout continue'); }} data-testid="lp-offline">Couper le réseau 20 s</Button>}
            {c.action && <Button kind="ghost small" icon="target" onClick={() => showMe(c.action, close)} data-testid="lp-show">{c.action.label}</Button>}
          </>
        )}
      </div>
      {!c.install && (
        <div class="hrow sticky-action">
          {i > 0 && <Button kind="soft grow" onClick={() => setI(i - 1)}>Retour</Button>}
          <Button kind="coral grow" disabled={locked} onClick={() => { feel('tap'); setI(i + 1); }} data-testid="lesson-next">{i === cards.length - 1 ? 'Terminer' : locked ? (c.quiz ? 'Répondez pour continuer' : 'Faites l\'exercice') : 'Suivant'}</Button>
        </div>
      )}
      {c.install && <button class="link center small" onClick={() => setI(i + 1)} data-testid="lesson-next">Je le ferai plus tard</button>}
    </div>
  );
}

function showMe(a, close) {
  close();
  setTimeout(() => {
    go(a.route);
    if (a.target) setTimeout(() => coach(a.target, a.text, a.title), 450);
  }, 300);
}

function LessonEnd({ k, close }) {
  const pr = progress.value;
  const all = pr.total > 0 && pr.done === pr.total;
  useEffect(() => { if (all) confetti(); }, []);
  if (all) {
    return (
      <div class="pc-diploma center stack" data-testid="parcours-diploma">
        <div class="pc-badge"><Logo size={60} /><span><Icon name="check" size={20} /></span></div>
        <div class="tiny muted">Formation terminée</div>
        <h2 class="intro-title">Prêt pour la tournée{firstName() ? ', ' + firstName() : ''} !</h2>
        <p class="muted">Vous connaissez tout ce qui vous sert. La formation reste dans Plus › Formation, et chaque écran a son aide.</p>
        <Button kind="coral full" icon="map" onClick={() => { close(); setTimeout(() => go('carte'), 300); }} data-testid="diploma-go">Aller à la carte</Button>
      </div>
    );
  }
  const next = pr.next;
  return (
    <div class="pc-end center stack" data-testid="lesson-end">
      <div class="pc-badge sm"><Icon name={MODULES[k].icon} size={28} /><span><Icon name="check" size={16} /></span></div>
      <h2 class="intro-title">Leçon terminée</h2>
      <p class="muted small">{pr.done} sur {pr.total} · plus que {planMinutes(plan.value.filter((m) => !(state().done || {})[m.key]))} min</p>
      <div class="pc-bar"><i style={{ width: pr.pct + '%' }} /></div>
      {next && <Button kind="coral full" icon="arrowR" onClick={() => { close(); setTimeout(() => openLesson(next.key), 380); }} data-testid="lesson-continue">Leçon suivante : {next.title}</Button>}
      <Button kind="ghost full" onClick={close}>Faire une pause</Button>
    </div>
  );
}

// ——— Quiz ———
function Quiz({ q, onOk }) {
  const [a, setA] = useState(null);
  const good = a === q.ok;
  return (
    <div class="quiz" data-testid="quiz">
      <div class="quiz-q"><Icon name="help" size={18} /> {q.q}</div>
      <div class="stack s8">
        {q.options.map((o, j) => (
          <button key={j} class={'quiz-opt' + (a === j ? (j === q.ok ? ' ok' : ' ko') : '') + (a != null && !good && j === q.ok ? ' hint' : '')} onClick={(e) => {
            if (good) return;
            setA(j);
            if (j === q.ok) { feel('done'); onOk(); } else { feel('err'); shake(e.currentTarget); }
          }} data-testid={'quiz-' + j} data-ok={j === q.ok ? '1' : undefined}>
            <span class="quiz-l">{'ABC'[j]}</span><span class="grow">{o}</span>
            {a === j && <Icon name={j === q.ok ? 'check' : 'x'} size={18} />}
          </button>
        ))}
      </div>
      {a != null && <p class={'small quiz-why ' + (good ? 'ok' : 'ko')}>{good ? 'Bravo ! ' : 'Pas tout à fait. '}{q.why}</p>}
    </div>
  );
}

// ——— L'entraînement : de fausses portes ———
export function drillFor(p) {
  const pay = p?.pay || ['especes'];
  const list = [
    { who: 'Mme Lefèvre', ask: 'Mme Lefèvre vous donne 10 € en espèces.', want: { r: 'donne', amt: 1000, pay: 'especes' } },
    { who: 'Personne', ask: 'Vous sonnez deux fois : personne ne répond.', want: { r: 'absent' } },
    pay.includes('cheque')
      ? { who: 'M. Petit', ask: 'M. Petit fait un chèque de 15 €.', want: { r: 'donne', amt: 1500, pay: 'cheque' } }
      : { who: 'M. Petit', ask: 'M. Petit vous donne 20 € en espèces.', want: { r: 'donne', amt: 2000, pay: 'especes' } },
    { who: 'Mme Roux', ask: '« Vos collègues sont déjà passés hier ! »', want: { r: 'deja' } },
  ];
  if (pay.includes('carte')) list.splice(3, 0, { who: 'M. Garcia', ask: 'M. Garcia paie 12 € par carte.', want: { r: 'donne', amt: 1200, pay: 'carte' } });
  return list;
}

const OUTCOMES = [
  { r: 'donne', icon: 'cash', label: 'Don', tone: 'ok' },
  { r: 'absent', icon: 'absent', label: 'Absent', tone: 'warn' },
  { r: 'refus', icon: 'refus', label: 'Refus', tone: 'bad' },
  { r: 'deja', icon: 'deja', label: 'Déjà pris', tone: 'muted' },
];
const PAYS = [{ v: 'especes', icon: 'coins', label: 'Espèces' }, { v: 'cheque', icon: 'cheque', label: 'Chèque' }, { v: 'carte', icon: 'card', label: 'Carte' }];

function DoorDrill({ p, onDone }) {
  const list = useMemo(() => drillFor(p), []);
  const [n, setN] = useState(0);
  const [don, setDon] = useState(false);
  const [amt, setAmt] = useState(null);
  const [pay, setPay] = useState('especes');
  const [msg, setMsg] = useState(null);
  const ex = list[n];
  const finished = n >= list.length;
  const street = ['12 rue des Lilas', '14 rue des Lilas', '3 allée des Tilleuls', '8 allée des Tilleuls', '21 rue Pasteur'];

  const good = () => { feel('done'); setMsg({ ok: true, t: 'Bien joué !' }); setTimeout(() => { setMsg(null); setDon(false); setAmt(null); setPay('especes'); const nn = n + 1; setN(nn); if (nn >= list.length) { confetti(); onDone(); } }, 900); };
  const bad = (t, el) => { feel('err'); setMsg({ ok: false, t }); if (el) shake(el); };

  if (finished) return <div class="drill done" data-testid="drill-done"><DotIcon icon="check" tone="ok" /><b>{list.length} portes sur {list.length} : vous êtes prêt.</b></div>;

  return (
    <div class="drill" data-testid="drill">
      <div class="drill-ask"><span class="pill tone-info">Porte {n + 1}/{list.length}</span> {ex.ask}</div>
      <div class="drill-door">
        <div class="hrow"><DotIcon icon="door" sm /><span class="grow"><b>{street[n % street.length]}</b><span class="tiny muted" style={{ display: 'block' }}>Entraînement · rien n'est enregistré</span></span></div>
        {!don ? (
          <div class="drill-out">
            {OUTCOMES.map((o) => (
              <button key={o.r} class={'outcome tone-' + o.tone} onClick={(e) => {
                setMsg(null);
                if (o.r === 'donne') { feel('tap'); if (ex.want.r === 'donne') setDon(true); else bad('Ici, pas de don : relisez la situation.', e.currentTarget); return; }
                if (o.r === ex.want.r) good(); else bad(o.r === 'refus' && ex.want.r === 'absent' ? 'Personne n\'a refusé : il n\'y avait personne.' : 'Pas tout à fait, relisez la situation.', e.currentTarget);
              }} data-testid={'drill-' + o.r}><Icon name={o.icon} />{o.label}</button>
            ))}
          </div>
        ) : (
          <div class="stack s8 anim-in">
            <div class="chips">{[500, 1000, 1200, 1500, 2000].map((v) => <button key={v} type="button" class="chip" aria-pressed={amt === v ? 'true' : 'false'} onClick={() => { feel('tick'); setAmt(v); }} data-testid={'drill-amt-' + v}>{formatEuro(v)}</button>)}</div>
            <div class="seg drill-pay" role="group" aria-label="Paiement">{PAYS.map((x) => <button key={x.v} type="button" aria-pressed={pay === x.v ? 'true' : 'false'} onClick={() => { feel('tick'); setPay(x.v); }} data-testid={'drill-pay-' + x.v}><Icon name={x.icon} size={16} /> {x.label}</button>)}</div>
            <div class="hrow">
              <Button kind="soft small" onClick={() => setDon(false)}>Retour</Button>
              <Button kind="small grow" onClick={(e) => {
                if (amt !== ex.want.amt) return bad('Vérifiez le montant.', e.currentTarget);
                if (pay !== ex.want.pay) return bad('Vérifiez le moyen de paiement.', e.currentTarget);
                good();
              }} data-testid="drill-ok">Valider le don</Button>
            </div>
          </div>
        )}
      </div>
      {msg && <p class={'small quiz-why ' + (msg.ok ? 'ok' : 'ko')} role="status">{msg.t}</p>}
    </div>
  );
}

// ——— Les illustrations ———
export function Art({ k }) {
  if (['sector', 'route', 'door', 'team'].includes(k)) return <IntroArt k={k} />;
  const road = <path class="ia-road" d="M0 40h240M0 110h240M60 0v150M170 0v150" />;
  const svg = (children) => <svg viewBox="0 0 240 150" class="ia">{children}</svg>;
  switch (k) {
    case 'colors': return svg(<>{road}<path class="ia-done" d="M0 40h60v70" /><path class="ia-st rep" d="M60 110h110" /><path class="ia-st live" d="M170 0v40" /><circle class="ia-mate m1" cx="170" cy="20" r="7" /></>);
    case 'locate': case 'live': return svg(<>{road}<circle class="ia-pulse" cx="120" cy="75" r="26" /><circle class="ia-me" cx="120" cy="75" r="9" />{k === 'live' && <><circle class="ia-mate m2" cx="60" cy="40" r="8" /><circle class="ia-mate m3" cx="170" cy="110" r="8" /></>}</>);
    case 'next': return svg(<>{road}<path class="ia-path" d="M60 40h110" /><rect class="ia-card" x="30" y="96" width="180" height="40" rx="12" /><rect class="ia-go" x="44" y="108" width="16" height="16" rx="5" /><rect class="ia-line" x="70" y="110" width="90" height="6" rx="3" /><rect class="ia-line soft" x="70" y="120" width="60" height="5" rx="2.5" /></>);
    case 'start': return svg(<><rect class="ia-card" x="45" y="22" width="150" height="106" rx="16" /><circle class="ia-clock" cx="120" cy="62" r="22" /><path class="ia-hand" d="M120 62V48M120 62l10 6" /><rect class="ia-go" x="62" y="96" width="116" height="22" rx="8" /></>);
    case 'outcomes': return <IntroArt k="door" />;
    case 'hello': return svg(<><rect class="ia-house" x="70" y="50" width="100" height="80" rx="6" /><path class="ia-roof" d="M60 56 120 18l60 38" /><rect class="ia-dooro" x="108" y="88" width="24" height="42" rx="4" /><rect class="ia-cal" x="150" y="86" width="30" height="34" rx="4" /><path class="ia-cal-r" d="M150 94h30" /></>);
    case 'gift': return svg(<><circle class="ia-coin c1" cx="90" cy="80" r="20" /><circle class="ia-coin c2" cx="135" cy="70" r="24" /><text class="ia-amt" x="135" y="78" text-anchor="middle">€</text><path class="ia-heart" d="M178 52c-6-8-18-2-14 7l14 13 14-13c4-9-8-15-14-7Z" /></>);
    case 'receipt': case 'handover': return svg(<><path class="ia-card" d="M80 18h80v114l-10-7-10 7-10-7-10 7-10-7-10 7-10-7-10 7Z" /><rect class="ia-line" x="94" y="40" width="52" height="7" rx="3" /><rect class="ia-line soft" x="94" y="56" width="40" height="6" rx="3" /><rect class="ia-line soft" x="94" y="70" width="46" height="6" rx="3" /><text class="ia-amt" x="120" y="104" text-anchor="middle">{k === 'handover' ? '✓' : '10 €'}</text></>);
    case 'safety': return svg(<><path class="ia-shield" d="M120 18 168 36v34c0 30-22 50-48 60-26-10-48-30-48-60V36Z" /><path class="ia-check" d="M100 74l14 14 28-30" /></>);
    case 'building': case 'floors': return svg(<><rect class="ia-house" x="80" y="14" width="80" height="124" rx="6" />{[0, 1, 2, 3].map((r) => [0, 1, 2].map((c) => <rect key={r + '-' + c} class={'ia-win' + (k === 'floors' || r * 3 + c < 7 ? ' on' : '')} style={{ '--d': (r * 3 + c) * 0.12 + 's' }} x={92 + c * 20} y={26 + r * 24} width="14" height="14" rx="3" />))}<rect class="ia-dooro" x="110" y="118" width="20" height="20" rx="3" /></>);
    case 'mailbox': return svg(<><rect class="ia-card" x="50" y="20" width="140" height="110" rx="10" />{[0, 1, 2].map((r) => [0, 1, 2].map((c) => <g key={r + '' + c}><rect class="ia-box" x={62 + c * 42} y={32 + r * 32} width="36" height="26" rx="4" /><rect class="ia-line soft" style={{ '--d': (r * 3 + c) * 0.1 + 's' }} x={67 + c * 42} y={38 + r * 32} width="22" height="5" rx="2.5" /></g>))}<rect class="ia-scan" x="50" y="20" width="140" height="6" rx="3" /></>);
    case 'repasse': return svg(<>{road}<path class="ia-st rep" d="M0 110h240" /><circle class="ia-dot d1" cx="90" cy="110" r="6" /><circle class="ia-dot d3" cx="150" cy="110" r="6" /><path class="ia-path" d="M60 40v70h110" /></>);
    case 'qr': return svg(<><rect class="ia-card" x="70" y="18" width="100" height="114" rx="10" /><rect class="ia-qr" x="92" y="34" width="56" height="56" rx="4" /><path class="ia-qrp" d="M98 40h14v14H98zM128 40h14v14h-14zM98 70h14v14H98zM120 62h6v6h-6zM130 72h12v12h-12z" /><text class="ia-amt sm" x="120" y="116" text-anchor="middle">n° 7</text></>);
    case 'caisse': case 'count': case 'card': return svg(<><rect class="ia-card" x="40" y="40" width="110" height="70" rx="10" /><rect class="ia-note" x="52" y="52" width="60" height="30" rx="4" /><circle class="ia-coin c1" cx="170" cy="92" r="18" /><circle class="ia-coin c2" cx="185" cy="66" r="14" /><text class="ia-amt sm" x="95" y="100" text-anchor="middle">{k === 'card' ? 'Carte' : '245 €'}</text></>);
    case 'offline': return svg(<><path class="ia-wave w1" d="M70 70a70 70 0 0 1 100 0" /><path class="ia-wave w2" d="M88 88a44 44 0 0 1 64 0" /><circle class="ia-me" cx="120" cy="108" r="8" /><path class="ia-slash" d="M74 40l92 84" /></>);
    case 'phone': return svg(<><rect class="ia-card" x="88" y="12" width="64" height="126" rx="12" />{[0, 1, 2, 3, 4, 5].map((j) => <circle key={j} class="ia-pin" style={{ '--d': j * 0.1 + 's' }} cx={104 + (j % 3) * 16} cy={70 + Math.floor(j / 3) * 18} r="5" />)}<rect class="ia-line" x="102" y="38" width="36" height="8" rx="4" /></>);
    case 'photo': return svg(<><rect class="ia-card" x="60" y="30" width="120" height="90" rx="12" /><circle class="ia-lens" cx="120" cy="75" r="24" /><rect class="ia-go" x="140" y="38" width="22" height="10" rx="4" /></>);
    case 'assign': return svg(<>{road}<path class="ia-zone" d="M10 10h100v120H10Z" /><path class="ia-zone z2" d="M130 10h100v120H130Z" /><circle class="ia-mate m1" cx="60" cy="70" r="10" /><circle class="ia-mate m2" cx="180" cy="70" r="10" /></>);
    case 'comptes': case 'export': return svg(<><rect class="ia-card" x="50" y="20" width="140" height="110" rx="12" />{[0, 1, 2, 3].map((j) => <rect key={j} class="ia-bar" style={{ '--d': j * 0.12 + 's' }} x={72 + j * 26} y={110 - (j + 2) * 14} width="16" height={(j + 2) * 14} rx="4" />)}</>);
    case 'tags': return svg(<><rect class="ia-card" x="40" y="30" width="160" height="90" rx="14" /><rect class="ia-tag t1" x="54" y="50" width="56" height="22" rx="11" /><rect class="ia-tag t2" x="118" y="50" width="68" height="22" rx="11" /><rect class="ia-tag t3" x="54" y="80" width="80" height="22" rx="11" /></>);
    case 'year': return svg(<><rect class="ia-card" x="40" y="30" width="160" height="90" rx="14" /><text class="ia-amt sm" x="80" y="70" text-anchor="middle">2025</text><text class="ia-amt" x="160" y="72" text-anchor="middle">12 €</text><path class="ia-path" d="M64 96h112" /></>);
    case 'night': case 'simple': return svg(<><rect class="ia-card dark" x="88" y="12" width="64" height="126" rx="12" /><circle class="ia-moon" cx="120" cy="56" r="16" /><rect class="ia-go" x="100" y="100" width="40" height="18" rx="8" /></>);
    default: return <IntroArt k="route" />;
  }
}

// ——— Le haut de l'écran Formation ———
export function ParcoursCard() {
  const s = settings.value.parcours || {};
  const pl = plan.value;
  const pr = progress.value;
  if (!s.profile) {
    return (
      <button class="card pc-cta" onClick={openWelcome} data-testid="parcours-cta">
        <DotIcon icon="target" tone="bad" />
        <span class="grow"><span class="card-title">Ma formation sur mesure</span><span class="small muted" style={{ display: 'block' }}>Six questions, puis les leçons qui vous servent vraiment, avec des exercices.</span></span>
        <Icon name="chevR" class="chev" />
      </button>
    );
  }
  const done = s.done || {};
  return (
    <div class="card pc-card" data-testid="parcours-card">
      <div class="hrow">
        <div class="pc-ring" style={{ '--p': pr.pct }} aria-label={`${pr.pct} % fait`}><span>{pr.done}/{pr.total}</span></div>
        <div class="grow">
          <div class="tiny muted">Ma formation</div>
          <div class="card-title">{pr.done === pr.total ? 'Prêt pour la tournée' : `${planMinutes(pl.filter((m) => !done[m.key]))} min pour finir`}</div>
          <div class="tiny muted">{profileLine(s.profile)}</div>
        </div>
      </div>
      {pr.next && <Button kind="coral full" icon="arrowR" onClick={() => openLesson(pr.next.key)} data-testid="parcours-continue">{pr.done ? 'Continuer' : 'Commencer'} : {pr.next.title}</Button>}
      <ol class="pc-plan compact">
        {pl.map((m) => (
          <li key={m.key} class={done[m.key] ? 'ok' : ''}>
            <button onClick={() => openLesson(m.key)} data-testid={'module-' + m.key}>
              <span class="pc-st">{done[m.key] ? <Icon name="check" size={14} /> : <Icon name={m.icon} size={14} />}</span>
              <span class="grow"><b>{m.title}</b><span class="tiny muted">{m.why}</span></span>
              <span class="tiny muted">{done[m.key] ? 'Revoir' : m.min + ' min'}</span>
            </button>
          </li>
        ))}
      </ol>
      <button class="link-btn tiny" onClick={openWelcome} data-testid="parcours-redo">Modifier mes réponses</button>
    </div>
  );
}

