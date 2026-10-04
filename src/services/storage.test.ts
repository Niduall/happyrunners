import { describe, it, expect, beforeEach } from 'vitest'
import { getUser, setUser, clearUser, type User } from './storage'

const user = (over: Partial<User> = {}): User => ({
  id: 1,
  firstName: 'Paul',
  lastName: 'Martin',
  name: 'Paul Martin',
  ...over,
})

describe('storage — user local', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('getUser retourne null quand rien n’est stocké', () => {
    expect(getUser()).toBeNull()
  })

  it('setUser puis getUser fait un aller-retour', () => {
    setUser(user())
    expect(getUser()?.id).toBe(1)
    expect(getUser()?.name).toBe('Paul Martin')
  })

  it('l’identifiant est un entier (user_number)', () => {
    setUser(user({ id: 42 }))
    expect(typeof getUser()?.id).toBe('number')
    expect(getUser()?.id).toBe(42)
  })

  it('conserve un id 0 valide (pas de falsy check)', () => {
    setUser(user({ id: 0 }))
    expect(getUser()?.id).toBe(0)
  })

  it('clearUser supprime l’entrée', () => {
    setUser(user())
    clearUser()
    expect(getUser()).toBeNull()
  })

  it('retourne null si le JSON est corrompu', () => {
    localStorage.setItem('running_user', '{ pas du json')
    expect(getUser()).toBeNull()
  })

  describe('migration depuis l’ancien format', () => {
    it('invalide un cache dont l’id est une chaîne', () => {
      // Ancien format : id dérivé du nom
      localStorage.setItem(
        'running_user',
        JSON.stringify({
          id: 'paulin_claudin',
          firstName: 'Paulin',
          lastName: 'Claudin',
          name: 'Paulin Claudin',
        })
      )

      expect(getUser()).toBeNull()
      // Le cache doit avoir été purgé, sinon le 400 revient
      expect(localStorage.getItem('running_user')).toBeNull()
    })

    it('accepte un id numérique (nouveau format)', () => {
      localStorage.setItem(
        'running_user',
        JSON.stringify({ id: 1, firstName: 'Paulin', lastName: 'Claudin', name: 'Paulin Claudin' })
      )

      expect(getUser()?.id).toBe(1)
      expect(localStorage.getItem('running_user')).not.toBeNull()
    })

    it('invalide un objet sans id', () => {
      localStorage.setItem('running_user', JSON.stringify({ firstName: 'X' }))
      expect(getUser()).toBeNull()
    })

    it('invalide un id null', () => {
      localStorage.setItem('running_user', JSON.stringify({ id: null }))
      expect(getUser()).toBeNull()
    })
  })

  it('ne stocke aucun secret dans le user local', () => {
    setUser(user())
    const stored = JSON.parse(localStorage.getItem('running_user')!)
    // Le PIN vit en base (user_profiles.pin_hash), jamais en localStorage
    expect(Object.keys(stored).sort()).toEqual(['firstName', 'id', 'lastName', 'name'])
  })

  it('changer de nom ne touche pas l’identifiant', () => {
    setUser(user({ id: 3, firstName: 'Paul' }))
    // Simule updateName : le user_number reste
    const renamed: User = { ...getUser()!, firstName: 'Paulin', name: 'Paulin Martin' }
    setUser(renamed)

    expect(getUser()?.id).toBe(3)
    expect(getUser()?.name).toBe('Paulin Martin')
  })
})
