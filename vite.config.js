import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));
const version = `${pkg.version}+${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;

export default defineConfig({
  base: process.env.NOKK_BASE || './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Nokk · tournée des calendriers',
        short_name: 'Nokk',
        description: 'La tournée des calendriers des sapeurs-pompiers : secteurs, parcours, portes, caisse.',
        lang: 'fr',
        start_url: './#carte',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#eef2f0',
        theme_color: '#367a6d',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Version de cache changée à chaque mise en ligne.
        cacheId: 'nokk-' + version,
        cleanupOutdatedCaches: true,
        // La nouvelle version prend la main tout de suite (sinon elle reste « en attente » tant que l'app est ouverte).
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          { urlPattern: /^https:\/\/tiles\.openfreemap\.org\/.*/, handler: 'CacheFirst', options: { cacheName: 'nokk-tiles-v1', expiration: { maxEntries: 4000, maxAgeSeconds: 60 * 60 * 24 * 60 }, cacheableResponse: { statuses: [0, 200] } } },
          { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, handler: 'StaleWhileRevalidate', options: { cacheName: 'nokk-fonts', cacheableResponse: { statuses: [0, 200] } } },
        ],
      },
    }),
  ],
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
  test: { include: ['tests/unit/**/*.test.js'] },
});
