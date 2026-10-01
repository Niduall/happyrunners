import { describe, it, expect } from 'vitest'
import { hashPin } from './useAuth'

describe('hashPin', () => {
  it('produit le même hash pour le même PIN', () => {
    expect(hashPin('1234')).toBe(hashPin('1234'))
  })

  it('produit des hash différents pour PIN différents', () => {
    expect(hashPin('1234')).not.toBe(hashPin('4321'))
  })

  it('prefixe par pin_', () => {
    expect(hashPin('1234').startsWith('pin_')).toBe(true)
  })

  it('retourne un hash base36 sans signe négatif', () => {
    for (const pin of ['0000', '9999', '1111', '5555', '7777']) {
      expect(hashPin(pin)).toMatch(/^pin_[0-9a-z]+$/)
    }
  })

  it('gère les PIN avec zéros en tête', () => {
    expect(hashPin('0123')).toBe(hashPin('0123'))
    expect(hashPin('0123')).not.toBe(hashPin('123'))
  })

  it('gère la chaîne vide', () => {
    expect(hashPin('')).toMatch(/^pin_[0-9a-z]+$/)
  })
})
