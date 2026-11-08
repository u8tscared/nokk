import { settings } from './store.js';

export function resolveTheme(t = settings.value.theme, now = new Date()) {
  if (t === 'soir') { const h = now.getHours(); return h >= 19 || h < 7 ? 'dark' : 'light'; }
  return t === 'light' || t === 'dark' ? t : null;
}

export function applyTheme() {
  const r = resolveTheme();
  const root = document.documentElement;
  if (r) root.setAttribute('data-theme', r);
  else root.removeAttribute('data-theme');
  const dark = r ? r === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c1618' : '#eef2f0');
}

export function installTheme() {
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  setInterval(() => { if (settings.value.theme === 'soir') applyTheme(); }, 60000);
}
