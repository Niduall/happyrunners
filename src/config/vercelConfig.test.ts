/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Vercel sert d'abord les fichiers statiques, puis applique les réécritures.
 * Le repli vers `index.html` est donc sans risque pour `assets/`, `sw.js` ou
 * les icônes — mais sans lui, ouvrir `/messages` ou `/parcours` directement
 * (lien partagé, rechargement, retour depuis un raccourci) renvoie un 404.
 */
const CONFIG = JSON.parse(
  readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')
) as { rewrites?: Array<{ source: string; destination: string }> }

describe('configuration Vercel', () => {
  it('renvoie l’application pour les routes du routeur', () => {
    expect(CONFIG.rewrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ destination: '/index.html' }),
      ])
    )
  })

  it('capture toutes les profondeurs de chemin', () => {
    const catchAll = CONFIG.rewrites?.find(
      (rewrite) => rewrite.destination === '/index.html'
    )

    expect(catchAll?.source).toBe('/(.*)')
  })
})
