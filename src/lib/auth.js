// Connexion : Firebase Auth (Google ou e-mail + mot de passe). Chargé à la demande, marche hors ligne
// une fois connecté (session gardée sur l'appareil).
import { signal } from '@preact/signals';

export const FIREBASE = {
  apiKey: 'AIzaSyAqXjRE7d28NibNpqTUwhDKw6M__ZUM_D4',
  authDomain: 'nokk-acf02.firebaseapp.com',
  projectId: 'nokk-acf02',
  appId: '1:717441239026:web:b9d7695721882bde348d6b',
};

// undefined : on ne sait pas encore · null : déconnecté · { uid, email, name }
export const authUser = signal(undefined);

let implP = null;
function getImpl() {
  if (implP) return implP;
  // Tests automatiques : fausse connexion injectée par la page de test.
  if (typeof window !== 'undefined' && window.__nokkFakeAuth) return (implP = Promise.resolve(window.__nokkFakeAuth));
  implP = Promise.all([import('firebase/app'), import('firebase/auth')]).then(([F, A]) => {
    const app = F.initializeApp(FIREBASE);
    const auth = A.getAuth(app);
    auth.languageCode = 'fr';
    const toUser = (u) => (u ? { uid: u.uid, email: u.email, name: u.displayName } : null);
    return {
      onChange: (cb) => A.onAuthStateChanged(auth, (u) => cb(toUser(u))),
      google: () => A.signInWithPopup(auth, new A.GoogleAuthProvider()),
      signIn: (email, pass) => A.signInWithEmailAndPassword(auth, email, pass),
      signUp: async (email, pass, name) => {
        const c = await A.createUserWithEmailAndPassword(auth, email, pass);
        if (name) await A.updateProfile(c.user, { displayName: name });
        authUser.value = toUser(c.user);
      },
      reset: (email) => A.sendPasswordResetEmail(auth, email, { url: location.origin + location.pathname }),
      token: (force) => (auth.currentUser ? auth.currentUser.getIdToken(!!force) : Promise.resolve(null)),
      signOut: () => A.signOut(auth),
    };
  });
  return implP;
}

let started = false;
export function initAuth() {
  if (started) return;
  started = true;
  getImpl()
    .then((i) => i.onChange((u) => { authUser.value = u; }))
    .catch(() => { authUser.value = null; });
}

export async function idToken(force = false) {
  const i = await getImpl();
  return i.token(force);
}

const MESSAGES = {
  'auth/invalid-credential': 'E-mail ou mot de passe incorrect.',
  'auth/wrong-password': 'E-mail ou mot de passe incorrect.',
  'auth/user-not-found': 'Aucun compte avec cet e-mail. Créez-en un.',
  'auth/invalid-login-credentials': 'E-mail ou mot de passe incorrect.',
  'auth/email-already-in-use': 'Un compte existe déjà avec cet e-mail. Connectez-vous.',
  'auth/weak-password': 'Mot de passe trop court : 6 caractères minimum.',
  'auth/invalid-email': 'Cette adresse e-mail ne semble pas valide.',
  'auth/missing-email': 'Entrez votre adresse e-mail.',
  'auth/missing-password': 'Entrez votre mot de passe.',
  'auth/popup-blocked': 'La fenêtre Google a été bloquée. Réessayez, ou utilisez votre e-mail.',
  'auth/network-request-failed': 'Pas de réseau. Réessayez une fois connecté.',
  'auth/too-many-requests': 'Trop d\'essais. Patientez quelques minutes.',
  'auth/operation-not-supported-in-this-environment': 'Google ne marche pas ici. Utilisez votre e-mail.',
  'auth/web-storage-unsupported': 'Google ne marche pas ici. Utilisez votre e-mail.',
  'auth/unauthorized-domain': 'Connexion Google pas encore autorisée sur cette adresse.',
};
const SILENT = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);

// Renvoie un message en français, ou null si l'utilisateur a juste fermé la fenêtre.
export function authMessage(e) {
  const code = e?.code || '';
  if (SILENT.has(code)) return null;
  return MESSAGES[code] || 'Connexion impossible pour le moment. Réessayez.';
}

export async function signInGoogle() { return (await getImpl()).google(); }
export async function signInEmail(email, pass) { return (await getImpl()).signIn(email.trim(), pass); }
export async function signUpEmail(email, pass, name) { return (await getImpl()).signUp(email.trim(), pass, name?.trim()); }
export async function resetPassword(email) { return (await getImpl()).reset(email.trim()); }
export async function signOutAuth() { return (await getImpl()).signOut(); }
