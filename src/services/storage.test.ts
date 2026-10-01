import { describe, it, expect } from 'vitest'
import { generateUserId, createUser, getUser } from './storage'

describe('generateUserId', () => {
  it('génère un ID déterministe pour le même nom', () => {
    expect(generateUserId('Paul', 'Martin')).toBe(generateUserId('Paul', 'Martin'))
  })

  it('normalise la casse', () => {
    expect(generateUserId('PAUL', 'MARTIN')).toBe(generateUserId('paul', 'martin'))
  })

  it('retire les accents', () => {
    expect(generateUserId('André', 'Müller')).toBe(generateUserId('Andre', 'Muller'))
  })

  it('gère les espaces internes', () => {
    expect(generateUserId('Jean  Paul', 'De  La Fontaine')).toBe('jeanpaul_delafontaine')
  })

  it('ignore la ponctuation', () => {
    expect(generateUserId("O'Brien", 'Smith-Jones')).toBe('obrien_smithjones')
  })

  it('sépare prénom et nom par un underscore', () => {
    expect(generateUserId('Paul', 'Martin')).toBe('paul_martin')
  })

  it('différencie deux personnes différentes', () => {
    expect(generateUserId('Paul', 'Martin')).not.toBe(generateUserId('Paul', 'Dupont'))
  })

  it('produit un ID vide-safe pour des entrées vides', () => {
    expect(generateUserId('', '')).toBe('_')
  })

  it('gère les caractères Unicode hors ASCII', () => {
    expect(generateUserId('日本語', 'ユーザー')).toBe('_')
  })
})

describe('createUser', () => {
  it('crée un utilisateur avec un ID dérivé du nom', () => {
    const user = createUser('Paul', 'Martin')
    expect(user.id).toBe('paul_martin')
    expect(user.firstName).toBe('Paul')
    expect(user.lastName).toBe('Martin')
    expect(user.name).toBe('Paul Martin')
  })

  it('trim les espaces', () => {
    const user = createUser('  Paul  ', '  Martin  ')
    expect(user.firstName).toBe('Paul')
    expect(user.lastName).toBe('Martin')
    expect(user.name).toBe('Paul Martin')
  })

  it('persiste dans localStorage', () => {
    createUser('Paul', 'Martin')
    expect(getUser()?.id).toBe('paul_martin')
  })

  it('ne stocke aucun secret dans le user local', () => {
    const user = createUser('Paul', 'Martin')
    // Le PIN vit uniquement en base (user_profiles.pin_hash), jamais en localStorage
    expect(Object.keys(user).sort()).toEqual(['firstName', 'id', 'lastName', 'name'])
  })
})
