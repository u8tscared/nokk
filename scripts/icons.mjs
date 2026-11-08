// Génère les icônes PNG de l'app à partir du logo (Playwright).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const svg = readFileSync('public/icon.svg', 'utf8');
const b = await chromium.launch();
const p = await b.newPage();
const out = [
  ['public/icon-192.png', 192, '#eef2f0', 0.86],
  ['public/icon-512.png', 512, '#eef2f0', 0.86],
  ['public/icon-maskable-512.png', 512, '#eef2f0', 0.66],
  ['public/apple-touch-icon.png', 180, '#eef2f0', 0.8],
];
for (const [file, size, bg, k] of out) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${bg}"><div style="width:${size * k}px;height:${size * k}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`);
  await p.screenshot({ path: file, omitBackground: false });
}
await b.close();
