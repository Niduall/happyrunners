import { describe, it, expect } from 'vitest'
import { sortPresenceRows, type PresenceRow } from './ParticipantsTable'

let nextUserNumber = 1
const row = (
  firstName: string,
  lastName: string,
  attendance: PresenceRow['attendance'],
  parcoursName: string | null = null
): PresenceRow => ({ userNumber: nextUserNumber++, firstName, lastName, attendance, parcoursName })

describe('sortPresenceRows', () => {
  it('met les présents en premier, puis en attente, puis absents', () => {
    const rows = [
      row('Sophie', 'Laurent', 'skip'),
      row('Carol', 'Bernard', null),
      row('Alice', 'Dupont', 'going'),
    ]

    const sorted = sortPresenceRows(rows)
    expect(sorted.map((r) => r.firstName)).toEqual(['Alice', 'Carol', 'Sophie'])
  })

  it('trie alphabétiquement à l’intérieur de chaque groupe', () => {
    const rows = [
      row('Zoe', 'Zida', 'going'),
      row('Alice', 'Dupont', 'going'),
      row('Marc', 'Martin', 'going'),
    ]

    const sorted = sortPresenceRows(rows)
    expect(sorted.map((r) => r.firstName)).toEqual(['Alice', 'Marc', 'Zoe'])
  })

  it('ne modifie pas le tableau original', () => {
    const rows = [row('Alice', 'D', 'skip'), row('Bob', 'D', 'going')]
    const copy = [...rows]

    sortPresenceRows(rows)
    expect(rows).toEqual(copy)
  })

  it('gère un tableau vide', () => {
    expect(sortPresenceRows([])).toEqual([])
  })

  it('conserve le parcours dans la ligne', () => {
    const rows = [row('Alice', 'Dupont', 'going', 'Bois de Haye')]
    expect(sortPresenceRows(rows)[0].parcoursName).toBe('Bois de Haye')
  })
})
