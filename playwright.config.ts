import { defineConfig, devices } from '@playwright/test'

/**
 * Tests de bout en bout, exécutés **uniquement sur la base de test**.
 *
 * `webServer` lance `npm run dev:test`, qui charge `.env.test` : les scénarios
 * ne peuvent pas écrire dans la prod. Le port est dédié pour ne pas dépendre
 * d'un serveur de développement déjà ouvert.
 *
 * Chromium fourni par Playwright ne s'installe pas sur macOS 13 : on utilise
 * le Chrome du système (`channel: 'chrome'`). Sur une autre machine, retirer
 * cette ligne et lancer `npx playwright install chromium`.
 */
const PORT = 5175
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  // Les scénarios partagent la base de test : un seul worker pour éviter
  // qu'ils se marchent dessus (présence, messages, réactions).
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev:test -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
