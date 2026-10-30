import { describe, it, expect, vi } from 'vitest'
import { mergePresenceRows } from './presenceRows'
import type { Attendee } from './supabaseService'
import type { ProfileIdentity } from '../types'

const PROFILES: ProfileIdentity[] = [
  { user_number: 1, first_name: 'Ada', last_name: 'Lovelace' },
  { user_number: 2, first_name: 'Alan', last_name: 'Turing' },
  { user_number: 3, first_name: 'Grace', last_name: 'Hopper' },
]

const attendee = (
  userNumber: number,
  status: 'going' | 'skip',
  firstName = 'X',
  lastName = 'Y'
): Attendee => ({ userNumber, firstName, lastName, status })

describe('mergePresenceRows — tout le groupe dans le tableau', () => {
  it('affiche les présents, les absents et ceux qui n’ont pas répondu', () => {
    const rows = mergePresenceRows(
      PROFILES,
      [attendee(1, 'going'), attendee(3, 'skip')],
      () => null
    )

    expect(rows).toHaveLength(3)
    expect(rows.find((r) => r.userNumber === 1)?.status).toBe('going')
    expect(rows.find((r) => r.userNumber === 2)?.status).toBeNull()
    expect(rows.find((r) => r.userNumber === 3)?.status).toBe('skip')
  })

  it('nomme les sans-réponse depuis l’annuaire', () => {
    const rows = mergePresenceRows(PROFILES, [], () => null)

    expect(rows.map((r) => `${r.firstName} ${r.lastName}`)).toEqual([
      'Ada Lovelace',
      'Alan Turing',
      'Grace Hopper',
    ])
    expect(rows.every((r) => r.status === null)).toBe(true)
  })

  it('ne duplique pas une personne qui a répondu', () => {
    const rows = mergePresenceRows(PROFILES, [attendee(2, 'going')], () => 'Dafy')

    expect(rows.filter((r) => r.userNumber === 2)).toHaveLength(1)
    expect(rows.find((r) => r.userNumber === 2)?.parcoursName).toBe('Dafy')
  })

  it('n’affiche aucun parcours pour un absent, même avec un vote résiduel', () => {
    // Le vote orphelin ne doit jamais apparaître : on ne lit le parcours que
    // pour les présents, sans même appeler le résolveur.
    const parcoursNameOf = vi.fn(() => 'Carrefour')

    const rows = mergePresenceRows(PROFILES, [attendee(1, 'skip')], parcoursNameOf)

    expect(rows[0].parcoursName).toBeNull()
    expect(parcoursNameOf).not.toHaveBeenCalled()
  })

  it('garde une réponse dont le profil manque dans l’annuaire', () => {
    const rows = mergePresenceRows(PROFILES, [attendee(42, 'going', 'Nouveau', 'Membre')], () => null)

    const orphan = rows.find((r) => r.userNumber === 42)
    expect(orphan).toMatchObject({
      firstName: 'Nouveau',
      lastName: 'Membre',
      status: 'going',
    })
    expect(rows).toHaveLength(4)
  })

  it('préfère le nom de l’annuaire à celui de la réponse', () => {
    const rows = mergePresenceRows(PROFILES, [attendee(1, 'going', 'Ancien', 'Nom')], () => null)

    expect(rows[0].firstName).toBe('Ada')
    expect(rows[0].lastName).toBe('Lovelace')
  })

  it('retombe sur les seules réponses quand l’annuaire est vide', () => {
    const rows = mergePresenceRows([], [attendee(7, 'going', 'Paul', 'Martin')], () => 'Dafy')

    expect(rows).toEqual([
      {
        userNumber: 7,
        firstName: 'Paul',
        lastName: 'Martin',
        status: 'going',
        parcoursName: 'Dafy',
      },
    ])
  })
})
