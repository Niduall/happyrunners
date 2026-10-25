/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pwaManifest } from './pwaManifest'

const PUBLIC_DIR = resolve(process.cwd(), 'public')

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Lit largeur et hauteur depuis l'en-tête IHDR d'un PNG. */
function pngSize(fileName: string) {
  const buffer = readFileSync(`${PUBLIC_DIR}/${fileName}`)
  return {
    signature: buffer.subarray(0, 8),
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

describe('manifeste PWA', () => {
  it('porte le nom et la langue de l’application', () => {
    expect(pwaManifest.name).toBe('HappyRunners')
    expect(pwaManifest.short_name).toBe('HappyRunners')
    // Sans `lang`, les lecteurs d'écran et le lanceur peuvent prononcer
    // les libellés avec la mauvaise langue.
    expect(pwaManifest.lang).toBe('fr')
    // Couleur de marque (`--color-primary` dans `src/index.css`).
    expect(pwaManifest.theme_color).toBe('#593A5A')
  })

  it('fournit des icônes 192, 512 et maskable', () => {
    const icons = pwaManifest.icons ?? []
    expect(icons.map((icon) => icon.sizes)).toEqual(
      expect.arrayContaining(['192x192', '512x512'])
    )
    expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true)
  })

  it('les icônes sont de vrais PNG aux bonnes dimensions', () => {
    // ⚠️ Régression corrigée : les anciens `pwa-*.png` étaient des SVG
    // renommés (309 octets), silencieusement ignorés par les lanceurs.
    for (const icon of pwaManifest.icons ?? []) {
      const size = pngSize(icon.src)
      expect(size.signature).toEqual(PNG_SIGNATURE)

      const [width, height] = (icon.sizes ?? '').split('x').map(Number)
      expect(size.width).toBe(width)
      expect(size.height).toBe(height)
    }
  })

  it('l’icône Apple est un PNG 180×180', () => {
    const size = pngSize('apple-touch-icon.png')
    expect(size.signature).toEqual(PNG_SIGNATURE)
    expect(size.width).toBe(180)
    expect(size.height).toBe(180)
  })
})
