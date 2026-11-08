import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45000,
  expect: { timeout: 8000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'off', locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: true, timeout: 60000 },
  projects: [
    { name: 'telephone', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } },
    { name: 'tablette', use: { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } },
    { name: 'ordinateur', use: { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 } },
  ],
});
