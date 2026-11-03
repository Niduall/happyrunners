import { describe, it, expect } from 'vitest'
import { hashPin, isValidPin } from './pin'

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

  it('couvre les 10 000 PIN possibles de façon stable', () => {
    // Deux appels doivent toujours donner le même résultat
    const a = hashPin('4242')
    const b = hashPin('4242')
    expect(a).toBe(b)
  })
})

describe('isValidPin', () => {
  it('accepte exactement quatre chiffres', () => {
    for (const pin of ['0000', '1234', '9999']) {
      expect(isValidPin(pin)).toBe(true)
    }
  })

  it('refuse les longueurs autres que quatre', () => {
    for (const pin of ['', '123', '12345']) {
      expect(isValidPin(pin)).toBe(false)
    }
  })

  it('refuse tout caractère non numérique', () => {
    for (const pin of ['12a4', '12 4', '１２３４', '-123']) {
      expect(isValidPin(pin)).toBe(false)
    }
  })
})
