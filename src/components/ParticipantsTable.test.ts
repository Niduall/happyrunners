import { describe, it, expect } from 'vitest'
import { sortPresenceRows, type PresenceRow } from './ParticipantsTable'

const row = (
  localUserId: string,
  firstName: string,
  lastName: string,
  attendance: PresenceRow['attendance'],
  parcoursName: string | null = null
): PresenceRow => ({ localUserId, firstName, lastName, attendance, parcoursName })

describe('sortPresenceRows', () => {
  it('met les présents en premier, puis en attente, puis absents', () => {
    const rows = [
      row('sophie', 'Sophie', 'Laurent', 'skip'),
      row('carol', 'Carol', 'Bernard', null),
      row('alice', 'Alice', 'Dupont', 'going'),
    ]

    const sorted = sortPresenceRows(rows)
    expect(sorted.map((r) => r.localUserId)).toEqual(['alice', 'carol', 'sophie'])
  })

  it('trie alphabétiquement à l’intérieur de chaque groupe', () => {
    const rows = [
      row('z', 'Zoe', 'Zida', 'going'),
      row('a', 'Alice', 'Dupont', 'going'),
      row('m', 'Marc', 'Martin', 'going'),
    ]

    const sorted = sortPresenceRows(rows)
    expect(sorted.map((r) => r.firstName)).toEqual(['Alice', 'Marc', 'Zoe'])
  })

  it('ne modifie pas le tableau original', () => {
    const rows = [row('a', 'Alice', 'D', 'skip'), row('b', 'Bob', 'D', 'going')]
    const copy = [...rows]

    sortPresenceRows(rows)
    expect(rows).toEqual(copy)
  })

  it('gère un tableau vide', () => {
    expect(sortPresenceRows([])).toEqual([])
  })

  it('conserve le parcours dans la ligne', () => {
    const rows = [row('a', 'Alice', 'Dupont', 'going', 'Bois de Haye')]
    expect(sortPresenceRows(rows)[0].parcoursName).toBe('Bois de Haye')
  })
})
