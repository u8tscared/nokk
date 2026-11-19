// Quel téléphone, quel navigateur : de quoi montrer le bon geste pour ajouter Nokk à l'écran d'accueil.
// Fonctions pures (testées dans tests/unit/device.test.js).

export const SITE_URL = 'https://nokkapp.fr/';
// Lien vers l'appli elle-même (sans « # », un nouveau visiteur est envoyé vers la présentation).
export const APP_URL = SITE_URL + '#carte';
// Android : ouvre la page dans Chrome (le « ?app » évite aussi la présentation).
export const CHROME_INTENT = 'intent://nokkapp.fr/?app#Intent;scheme=https;package=com.android.chrome;end';

const INAPP = [
  [/FBAN|FBAV|FB_IAB|FBIOS/, 'Facebook'],
  [/Messenger|MESSENGER/, 'Messenger'],
  [/Instagram/, 'Instagram'],
  [/Snapchat/, 'Snapchat'],
  [/LinkedInApp/, 'LinkedIn'],
  [/TikTok|musical_ly|BytedanceWebview/, 'TikTok'],
  [/Twitter|TwitterAndroid/, 'X'],
  [/Pinterest/, 'Pinterest'],
  [/WhatsApp/, 'WhatsApp'],
  [/GSA\//, 'Google'],
  [/Line\//, 'Line'],
];

/** Décrit l'appareil à partir du user agent. */
export function detect(ua = '', { maxTouchPoints = 0, platform = '', standalone = false } = {}) {
  const ipadDesktop = platform === 'MacIntel' && maxTouchPoints > 1; // iPadOS se fait passer pour un Mac
  const ios = /iPhone|iPad|iPod/.test(ua) || ipadDesktop;
  const ipad = /iPad/.test(ua) || ipadDesktop;
  const android = /Android/.test(ua);
  const os = ios ? 'ios' : android ? 'android' : /Macintosh|Mac OS X/.test(ua) ? 'mac' : /Windows/.test(ua) ? 'windows' : /CrOS/.test(ua) ? 'chromeos' : 'other';
  const mobile = ios || android;
  const app = INAPP.find(([re]) => re.test(ua));
  let browser = 'other';
  let inapp = null;
  if (ios) {
    if (/CriOS/.test(ua)) browser = 'chrome';
    else if (/FxiOS/.test(ua)) browser = 'firefox';
    else if (/EdgiOS/.test(ua)) browser = 'edge';
    else if (/OPiOS|OPT\//.test(ua)) browser = 'opera';
    else if (/DuckDuckGo/.test(ua)) browser = 'other';
    else if (app) { browser = 'inapp'; inapp = app[1]; }
    else if (/Safari\//.test(ua) || ipadDesktop) browser = 'safari';
    else { browser = 'inapp'; inapp = null; } // vue web d'une appli (Gmail, Outlook…)
  } else if (android) {
    if (app || /; wv\)/.test(ua)) { browser = 'inapp'; inapp = app ? app[1] : null; }
    else if (/SamsungBrowser/.test(ua)) browser = 'samsung';
    else if (/Firefox\//.test(ua)) browser = 'firefox';
    else if (/EdgA\//.test(ua)) browser = 'edge';
    else if (/OPR\/|Opera/.test(ua)) browser = 'opera';
    else if (/MiuiBrowser|XiaoMi/.test(ua)) browser = 'miui';
    else if (/Chrome\//.test(ua)) browser = 'chrome';
  } else {
    if (/Edg\//.test(ua)) browser = 'edge';
    else if (/OPR\//.test(ua)) browser = 'opera';
    else if (/Firefox\//.test(ua)) browser = 'firefox';
    else if (/Chrome\//.test(ua)) browser = 'chrome';
    else if (/Safari\//.test(ua)) browser = 'safari';
  }
  const sv = /Version\/(\d+)/.exec(ua);
  const osv = /OS (\d+)_/.exec(ua);
  // Safari 26 garde « OS 18_6 » dans le user agent : c'est « Version/26 » qui compte.
  const iosVersion = ios ? Math.max(sv ? +sv[1] : 0, osv ? +osv[1] : 0) : 0;
  return { os, ios, ipad, android, mobile, browser, inapp, iosVersion, standalone };
}

/** L'appareil de la personne, lu dans le navigateur. */
export function currentDevice() {
  if (typeof navigator === 'undefined') return detect('');
  const standalone = (typeof matchMedia !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches)) || navigator.standalone === true;
  return detect(navigator.userAgent, { maxTouchPoints: navigator.maxTouchPoints || 0, platform: navigator.platform || '', standalone });
}

// Les menus des navigateurs, tels qu'ils apparaissent à l'écran (libellés français).
const MENUS = {
  safariMore: ['Partager', 'Ajouter un signet', 'Ajouter à la liste de lecture', 'Rechercher sur la page', 'Réglages du site'],
  iosShare: ['Copier', 'Ajouter à la liste de lecture', 'Ajouter un signet', "Sur l'écran d'accueil", 'Imprimer'],
  chromeAndroid: ['Nouvel onglet', 'Historique', 'Téléchargements', 'Favoris', "Ajouter à l'écran d'accueil", 'Paramètres'],
  samsung: ['Favoris', 'Ajouter la page à', 'Historique', 'Téléchargements', 'Paramètres'],
  samsungTo: ['Favoris', 'Accès rapide', "Écran d'accueil", 'Pages enregistrées'],
  firefoxAndroid: ['Nouvel onglet', 'Favoris', 'Historique', "Ajouter à l'écran d'accueil", 'Paramètres'],
  edgeAndroid: ['Favoris', 'Historique', 'Partager', 'Ajouter au téléphone', 'Paramètres'],
  firefoxIos: ['Nouvel onglet', 'Favoris', 'Historique', 'Partager', 'Paramètres'],
  generic: ['Nouvel onglet', 'Favoris', 'Partager', "Ajouter à l'écran d'accueil", 'Paramètres'],
};

const HOME = { screen: 'home' };
const pick = (list, label) => ({ screen: 'menu', items: list, hi: list.indexOf(label) });

/**
 * Le guide d'installation pour cet appareil.
 * kind : 'installed' | 'prompt' (un bouton suffit) | 'steps' | 'openin' (sortir de l'appli) | 'desktop'
 * chrome : l'habillage du navigateur dessiné dans le téléphone de démonstration.
 * steps : [{ text, strong, frame }] — frame dit ce que montre le téléphone de démonstration.
 * arrow : où se trouve le bouton sur le vrai écran ('bottom' | 'bottom-right' | 'top-right' | null).
 */
export function guideFor(dev, { canPrompt = false } = {}) {
  if (dev.standalone) return { kind: 'installed', label: 'Nokk est installée' };
  const g = (o) => ({ kind: 'steps', arrow: null, chrome: 'generic', ...o });

  if (dev.browser === 'inapp') {
    const where = dev.inapp ? `l'appli ${dev.inapp}` : 'une appli';
    return {
      kind: 'openin',
      label: dev.ios ? 'Ouvrir dans Safari' : 'Ouvrir dans Chrome',
      browser: dev.ios ? 'Safari' : 'Chrome',
      app: dev.inapp,
      intro: `Vous avez ouvert le lien depuis ${where} : elle ne sait pas installer Nokk. Ouvrez la page dans ${dev.ios ? 'Safari' : 'Chrome'}, puis revenez à ce guide.`,
      chrome: 'inapp',
      steps: [
        { strong: dev.ios ? 'Ouvrir dans Safari' : 'Ouvrir dans Chrome', text: 'Touchez le gros bouton ci-dessous.', frame: { screen: 'page', tap: 'open' } },
        { strong: '•••', text: `Si rien ne s'ouvre : touchez les trois points de ${where}, puis « Ouvrir dans le navigateur ».`, frame: { screen: 'menu', items: ['Copier le lien', dev.ios ? 'Ouvrir dans Safari' : 'Ouvrir dans le navigateur', 'Partager'], hi: 1 } },
        { strong: 'nokkapp.fr', text: `Ou copiez le lien et collez-le dans ${dev.ios ? 'Safari' : 'Chrome'}.`, frame: { screen: 'page', tap: 'url' } },
      ],
      openUrl: dev.ios ? 'x-safari-' + APP_URL : CHROME_INTENT,
    };
  }

  if (dev.ios) {
    const confirm = { screen: 'confirm', title: 'Sur l\'écran d\'accueil', button: 'Ajouter', webapp: dev.iosVersion >= 26 };
    const end = { strong: 'C\'est fait', text: 'L\'icône Nokk est sur votre écran d\'accueil. Ouvrez Nokk depuis elle, désormais.', frame: HOME };
    const addStep = { strong: 'Ajouter', text: dev.iosVersion >= 26 ? 'Laissez « Ouvrir comme app web » activé, puis touchez Ajouter en haut à droite.' : 'Touchez Ajouter en haut à droite.', frame: confirm };
    const homeItem = { strong: 'Sur l\'écran d\'accueil', text: 'Faites glisser la liste vers le haut si besoin, puis touchez « Sur l\'écran d\'accueil ».', frame: pick(MENUS.iosShare, "Sur l'écran d'accueil") };
    if (dev.browser === 'safari') {
      if (dev.ipad) {
        return g({ label: 'iPad · Safari', chrome: 'ipad', arrow: 'top-right', steps: [
          { strong: 'Partager', text: 'Touchez le bouton Partager, le carré avec une flèche, en haut à droite.', frame: { screen: 'page', tap: 'share' } },
          homeItem, addStep, end] });
      }
      if (dev.iosVersion >= 26) {
        return g({ label: 'iPhone · Safari', chrome: 'safari26', arrow: 'bottom-right', steps: [
          { strong: '•••', text: 'Touchez les trois points, à droite de l\'adresse, tout en bas de l\'écran.', frame: { screen: 'page', tap: 'more' } },
          { strong: 'Partager', text: 'Dans le menu, touchez « Partager ».', frame: pick(MENUS.safariMore, 'Partager') },
          { ...homeItem, text: 'Faites glisser vers le haut, touchez « Plus » si besoin, puis « Sur l\'écran d\'accueil ».' },
          addStep, end] });
      }
      return g({ label: 'iPhone · Safari', chrome: 'safari', arrow: 'bottom', steps: [
        { strong: 'Partager', text: 'Touchez le bouton Partager, le carré avec une flèche, en bas au milieu.', frame: { screen: 'page', tap: 'share' } },
        homeItem, addStep, end] });
    }
    if (dev.browser === 'chrome') {
      return g({ label: 'iPhone · Chrome', chrome: 'chromeIos', arrow: 'top-right', fallback: 'safari', steps: [
        { strong: 'Partager', text: 'Touchez le bouton Partager, dans la barre d\'adresse en haut à droite.', frame: { screen: 'page', tap: 'share' } },
        { ...homeItem, text: 'Faites glisser la liste, puis touchez « Sur l\'écran d\'accueil ».' },
        addStep, end] });
    }
    if (dev.browser === 'firefox') {
      return g({ label: 'iPhone · Firefox', chrome: 'firefoxIos', arrow: 'bottom-right', fallback: 'safari', steps: [
        { strong: '≡', text: 'Touchez le menu, les trois traits en bas à droite.', frame: { screen: 'page', tap: 'menu' } },
        { strong: 'Partager', text: 'Touchez « Partager ».', frame: pick(MENUS.firefoxIos, 'Partager') },
        homeItem, addStep, end] });
    }
    return g({ label: dev.browser === 'edge' ? 'iPhone · Edge' : 'iPhone', chrome: 'safari', arrow: null, fallback: 'safari', steps: [
      { strong: 'Partager', text: 'Ouvrez le menu du navigateur et touchez « Partager ».', frame: { screen: 'page', tap: 'share' } },
      homeItem, addStep, end] });
  }

  if (dev.android) {
    const end = { strong: 'C\'est fait', text: 'L\'icône Nokk est sur votre écran d\'accueil, comme une vraie appli.', frame: HOME };
    if (canPrompt) {
      return { kind: 'prompt', label: 'Android', chrome: 'chromeAndroid', steps: [
        { strong: 'Installer Nokk', text: 'Touchez le bouton vert ci-dessous.', frame: { screen: 'page', tap: 'none' } },
        { strong: 'Installer', text: 'Confirmez dans la fenêtre qui s\'ouvre.', frame: { screen: 'confirm', title: 'Installer l\'application ?', button: 'Installer', android: true } },
        end] };
    }
    const install = { strong: 'Installer', text: 'Confirmez avec « Installer » (ou « Ajouter »).', frame: { screen: 'confirm', title: 'Installer l\'application ?', button: 'Installer', android: true } };
    if (dev.browser === 'samsung') {
      return g({ label: 'Samsung Internet', chrome: 'samsung', arrow: 'bottom-right', steps: [
        { strong: '≡', text: 'Touchez le menu, les trois traits en bas à droite.', frame: { screen: 'page', tap: 'menu' } },
        { strong: 'Ajouter la page à', text: 'Touchez « Ajouter la page à ».', frame: pick(MENUS.samsung, 'Ajouter la page à') },
        { strong: 'Écran d\'accueil', text: 'Choisissez « Écran d\'accueil », puis « Ajouter ».', frame: pick(MENUS.samsungTo, "Écran d'accueil") },
        end] });
    }
    if (dev.browser === 'firefox') {
      return g({ label: 'Android · Firefox', chrome: 'chromeAndroid', arrow: 'top-right', steps: [
        { strong: '⋮', text: 'Touchez les trois points, en haut à droite.', frame: { screen: 'page', tap: 'more' } },
        { strong: 'Ajouter à l\'écran d\'accueil', text: 'Touchez « Ajouter à l\'écran d\'accueil » (ou « Installer »).', frame: pick(MENUS.firefoxAndroid, "Ajouter à l'écran d'accueil") },
        install, end] });
    }
    if (dev.browser === 'edge') {
      return g({ label: 'Android · Edge', chrome: 'edgeAndroid', arrow: 'bottom', steps: [
        { strong: '≡', text: 'Touchez le menu, les trois traits en bas au milieu.', frame: { screen: 'page', tap: 'menu' } },
        { strong: 'Ajouter au téléphone', text: 'Touchez « Ajouter au téléphone ».', frame: pick(MENUS.edgeAndroid, 'Ajouter au téléphone') },
        install, end] });
    }
    const label = dev.browser === 'chrome' ? 'Android · Chrome' : 'Android';
    return g({ label, chrome: 'chromeAndroid', arrow: 'top-right', fallback: dev.browser === 'chrome' ? null : 'chrome', steps: [
      { strong: '⋮', text: 'Touchez les trois points, en haut à droite de l\'écran.', frame: { screen: 'page', tap: 'more' } },
      { strong: 'Ajouter à l\'écran d\'accueil', text: 'Touchez « Ajouter à l\'écran d\'accueil » ou « Installer l\'application ».', frame: pick(MENUS.chromeAndroid, "Ajouter à l'écran d'accueil") },
      install, end] });
  }

  // Ordinateur : Nokk se vit au téléphone, on propose le QR, et l'installation si le navigateur sait faire.
  const desk = { kind: 'desktop', label: 'Ordinateur', canPrompt };
  if (dev.browser === 'chrome' || dev.browser === 'edge') desk.tip = 'Sur cet ordinateur : cliquez sur l\'icône d\'installation à droite de la barre d\'adresse, puis « Installer ».';
  else if (dev.browser === 'safari') desk.tip = 'Sur ce Mac : menu Fichier, puis « Ajouter au Dock ».';
  else desk.tip = 'Ce navigateur ne sait pas installer d\'appli : utilisez plutôt votre téléphone.';
  return desk;
}

/** Les appareils qu'on peut choisir à la main quand la détection se trompe. */
export const MANUAL = [
  { key: 'iphone', label: 'iPhone · Safari', dev: { os: 'ios', ios: true, mobile: true, browser: 'safari', iosVersion: 26 } },
  { key: 'iphone-old', label: 'iPhone ancien (iOS 18 ou avant)', dev: { os: 'ios', ios: true, mobile: true, browser: 'safari', iosVersion: 18 } },
  { key: 'iphone-chrome', label: 'iPhone · Chrome', dev: { os: 'ios', ios: true, mobile: true, browser: 'chrome', iosVersion: 26 } },
  { key: 'android', label: 'Android · Chrome', dev: { os: 'android', android: true, mobile: true, browser: 'chrome' } },
  { key: 'samsung', label: 'Samsung Internet', dev: { os: 'android', android: true, mobile: true, browser: 'samsung' } },
  { key: 'android-autre', label: 'Android · autre navigateur', dev: { os: 'android', android: true, mobile: true, browser: 'firefox' } },
];
