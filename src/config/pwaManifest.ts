import type { ManifestOptions } from 'vite-plugin-pwa'

/**
 * Manifeste PWA, isolé de `vite.config.ts` pour être testable.
 *
 * Les icônes sont de vrais PNG (et non des SVG renommés) : un fichier au
 * mauvais format est ignoré par Android/iOS, qui retombent alors sur une
 * icône générique. `maskable-512x512.png` garde le dessin dans la zone sûre
 * centrale, pour résister au masquage circulaire des lanceurs.
 */
export const pwaManifest: Partial<ManifestOptions> = {
  name: 'HappyRunners',
  short_name: 'HappyRunners',
  description: 'Sorties running du mercredi midi',
  lang: 'fr',
  theme_color: '#593A5A',
  background_color: '#ffffff',
  display: 'standalone',
  scope: '/',
  start_url: '/',
  icons: [
    {
      src: 'pwa-192x192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: 'pwa-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: 'maskable-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
}
