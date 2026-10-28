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
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
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
})
