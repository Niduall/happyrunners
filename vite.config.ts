// `defineConfig` vient de Vitest : c'est lui qui type la section `test`.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { pwaManifest } from './src/config/pwaManifest.ts'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // L'enregistrement est fait par `src/services/swUpdate.ts` : avec
      // `injectRegister`, le plugin injecterait un `registerSW.js` qui
      // enregistrerait le worker une seconde fois, sans jamais surveiller les
      // mises à jour.
      injectRegister: false,
      // Explicite : sans `injectRegister`, le plugin n'ajoute plus
      // `skipWaiting`/`clientsClaim` tout seul. Sans eux, la nouvelle version
      // resterait en attente jusqu'à la fermeture de tous les onglets — donc
      // aucun `controllerchange`, donc aucun rechargement.
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // `public/push-handler.js` ajoute les écouteurs `push` et
        // `notificationclick` au service worker généré. Workbox ne sait pas
        // les produire lui-même.
        importScripts: ['push-handler.js'],
      },
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'notification-badge.png'],
      // En dev, ne pas enregistrer de service worker : il sert l'ancien bundle
      // en cache et masque les modifications (logs 406 fantômes, code obsolète).
      devOptions: {
        enabled: false,
      },
      manifest: pwaManifest,
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  // Playwright écrit ses traces et captures dans le projet pendant les tests
  // E2E. Sans cette exclusion, Vite les voit comme des fichiers modifiés et
  // recharge la page en pleine action — ce qui annule l'envoi d'un message.
  server: {
    watch: {
      ignored: ['**/test-results/**', '**/playwright-report/**'],
    },
  },
})
