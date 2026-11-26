import { describe, expect, it } from 'vitest'
import source from '../../supabase/functions/send-push/index.ts?raw'

/**
 * Le texte du rappel est recopié à la main dans l'éditeur du dashboard
 * Supabase. Un caractère non ASCII (apostrophe typographique, point médian)
 * mal réencodé lors du copier-coller arrivait vide dans la notification.
 *
 * On verrouille donc la source : le corps reste en ASCII pur, avec les accents
 * écrits sous forme d'échappements `\u00e9` / `\u00e0` qui produisent le bon
 * texte à l'exécution.
 */

const bodyLine =
  source.split('\n').find((line) => line.includes('body: `Tu ')) ?? ''

describe('rappel du mardi — texte de la notification', () => {
  it('garde le corps de la notification en ASCII pur', () => {
    expect(bodyLine).not.toBe('')
    expect(bodyLine).toMatch(/^[\x20-\x7e]+$/)
  })

  it('n’utilise plus de ponctuation typographique', () => {
    expect(source).not.toContain('\u2019')
    expect(source).not.toContain('\u00b7')
  })

  it('annonce toujours la date, l’heure et l’invitation', () => {
    expect(bodyLine).toContain('frenchDate(week)')
    expect(bodyLine).toContain('12h30')
    expect(bodyLine).toContain('Dis-nous si tu viens')
    expect(bodyLine).toContain('r\\u00e9pondu')
    expect(bodyLine).toContain('\\u00e0 12h30')
  })
})
