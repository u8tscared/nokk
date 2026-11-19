// Guide d'installation selon l'appareil, et parcours de formation selon le profil.
import { describe, it, expect } from 'vitest';
import { detect, guideFor } from '../../src/lib/device.js';
import { buildPlan, defaultProfile, isComplete, profileLine } from '../../src/lib/parcours.js';

const UA = {
  iphone26: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  iphone17: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  fbIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]',
  gmailIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  instaAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S921B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36 Instagram 350.0',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

describe('quel téléphone, quel navigateur', () => {
  it('reconnaît Safari iOS 26 malgré le « OS 18_6 » figé', () => {
    const d = detect(UA.iphone26);
    expect(d).toMatchObject({ os: 'ios', browser: 'safari', iosVersion: 26 });
    const g = guideFor(d);
    expect(g.chrome).toBe('safari26');
    expect(g.steps[0].strong).toBe('•••');
    expect(g.steps.some((s) => s.frame.screen === 'confirm' && s.frame.webapp)).toBe(true);
  });
  it('ancien iPhone : bouton Partager en bas', () => {
    const g = guideFor(detect(UA.iphone17));
    expect(g.chrome).toBe('safari');
    expect(g.arrow).toBe('bottom');
    expect(g.steps[0].strong).toBe('Partager');
  });
  it('iPad qui se fait passer pour un Mac', () => {
    const d = detect(UA.mac, { maxTouchPoints: 5, platform: 'MacIntel' });
    expect(d.ios && d.ipad).toBe(true);
    expect(guideFor(d).chrome).toBe('ipad');
  });
  it('Chrome sur iPhone : Partager dans la barre d\'adresse, et Safari en secours', () => {
    const g = guideFor(detect(UA.chromeIos));
    expect(g.chrome).toBe('chromeIos');
    expect(g.fallback).toBe('safari');
  });
  it('appli Facebook ou Gmail : il faut d\'abord ouvrir Safari', () => {
    const fb = guideFor(detect(UA.fbIos));
    expect(fb.kind).toBe('openin');
    expect(fb.app).toBe('Facebook');
    expect(fb.openUrl).toMatch(/^x-safari-https:\/\/nokkapp\.fr\//);
    expect(guideFor(detect(UA.gmailIos)).kind).toBe('openin');
  });
  it('Instagram sur Android : ouvrir dans Chrome', () => {
    const g = guideFor(detect(UA.instaAndroid));
    expect(g.kind).toBe('openin');
    expect(g.openUrl).toContain('package=com.android.chrome');
  });
  it('Android Chrome : un bouton quand le navigateur le permet, sinon le menu ⋮', () => {
    const d = detect(UA.android);
    expect(guideFor(d, { canPrompt: true }).kind).toBe('prompt');
    const g = guideFor(d);
    expect(g.kind).toBe('steps');
    expect(g.steps[0].strong).toBe('⋮');
  });
  it('Samsung Internet et Firefox Android ont leur propre chemin', () => {
    const s = guideFor(detect(UA.samsung));
    expect(s.chrome).toBe('samsung');
    expect(s.steps[1].strong).toBe('Ajouter la page à');
    expect(detect(UA.firefoxAndroid).browser).toBe('firefox');
  });
  it('ordinateur : QR pour continuer au téléphone', () => {
    expect(guideFor(detect(UA.chromeWin)).kind).toBe('desktop');
    expect(guideFor(detect(UA.mac)).tip).toContain('Dock');
  });
  it('déjà installée', () => {
    expect(guideFor(detect(UA.android, { standalone: true })).kind).toBe('installed');
  });
});

describe('la formation sur mesure', () => {
  const base = { does: ['portes'], exp: 'some', terrain: 'maisons', crew: 'binome', pay: ['especes'], comfort: 'aise' };
  const keys = (p, ctx = { mobile: true }) => buildPlan(p, ctx).map((m) => m.key);
  it('un pompier en binôme dans les maisons', () => {
    const k = keys(base);
    expect(k).toEqual(['install', 'carte', 'tournee', 'porte', 'repasse', 'caisse', 'equipe', 'reseau', 'astuces']);
  });
  it('première tournée : les bons réflexes en premier, pas d\'astuces de vétéran', () => {
    const k = keys({ ...base, exp: 'debut' });
    expect(k[1]).toBe('reflexes');
    expect(k).not.toContain('astuces');
  });
  it('immeubles : la leçon immeubles ; seul : pas de binôme', () => {
    const k = keys({ ...base, terrain: 'immeubles', crew: 'seul' });
    expect(k).toContain('immeuble');
    expect(k).not.toContain('equipe');
  });
  it('déjà installée : pas de leçon installation', () => {
    expect(keys(base, { mobile: true, standalone: true })).not.toContain('install');
  });
  it('trésorier seul : la caisse et les comptes, pas les portes', () => {
    const k = keys({ ...base, does: ['caisse'] });
    expect(k).toContain('comptes');
    expect(k).not.toContain('porte');
  });
  it('chef : tracer un secteur', () => {
    expect(keys({ ...base, does: ['portes', 'secteurs'] })).toContain('secteur');
  });
  it('profil complet et résumé', () => {
    expect(isComplete(defaultProfile('pompier'))).toBe(false);
    expect(isComplete(base)).toBe(true);
    expect(profileLine({ ...base, terrain: 'immeubles', exp: 'debut' })).toBe('Pompier en binôme · immeubles · première tournée');
  });
});
