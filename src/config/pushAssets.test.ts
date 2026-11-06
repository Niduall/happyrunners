/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PUBLIC_DIR = resolve(process.cwd(), 'public')

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Lit largeur, hauteur et type de couleur depuis l'en-tête IHDR d'un PNG. */
function pngHeader(fileName: string) {
  const buffer = readFileSync(`${PUBLIC_DIR}/${fileName}`)
  return {
    signature: buffer.subarray(0, 8),
    // Le type de couleur est l'octet 25 : 6 = RGBA, donc un canal alpha.
    colorType: buffer.readUInt8(25),
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

describe('badge de notification Android', () => {
  it('fournit une silhouette 96×96 avec transparence', () => {
    const header = pngHeader('notification-badge.png')

    expect(header.signature).toEqual(PNG_SIGNATURE)
    expect(header.width).toBe(96)
    expect(header.height).toBe(96)
    // Android ne garde que le canal alpha pour dessiner l'icône de la barre
    // d'état. Un PNG opaque (type 2) reproduirait le carré blanc.
    expect(header.colorType).toBe(6)
  })

  it('est bien celui utilisé par le service worker', () => {
    const handler = readFileSync(`${PUBLIC_DIR}/push-handler.js`, 'utf8')

    expect(handler).toContain("badge: '/notification-badge.png'")
  })
})
