import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { render, screen } from '@testing-library/react'
import { ParticipantsTable, sortPresenceRows, type PresenceRow } from './ParticipantsTable'

let nextUserNumber = 1
const row = (
  firstName: string,
  lastName: string,
  status: PresenceRow['status'],
  parcoursName: string | null = null
): PresenceRow => ({ userNumber: nextUserNumber++, firstName, lastName, status, parcoursName })

const withNumber = (
  userNumber: number,
  firstName: string,
  status: PresenceRow['status']
): PresenceRow => ({ userNumber, firstName, lastName: 'X', status, parcoursName: null })

const renderTable = (rows: PresenceRow[], currentUserNumber?: number) =>
  render(
    createElement(ParticipantsTable, {
      rows,
      currentUserNumber,
    })
  )

const heading = (label: string) =>
  screen.getByRole('heading', { level: 3, name: new RegExp(label) })

describe('sortPresenceRows', () => {
  it('met les présents en premier, puis les absents, puis ceux qui n’ont pas répondu', () => {
    const rows = [
      row('Sophie', 'Laurent', 'skip'),
      row('Carol', 'Bernard', null),
      row('Alice', 'Dupont', 'going'),
    ]

    const sorted = sortPresenceRows(rows)
    expect(sorted.map((r) => r.firstName)).toEqual(['Alice', 'Sophie', 'Carol'])
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

  it('remonte la personne connectée en tête de son groupe', () => {
    const rows = [withNumber(1, 'Alice', null), withNumber(2, 'Bruno', null)]

    expect(sortPresenceRows(rows, 2).map((r) => r.firstName)).toEqual(['Bruno', 'Alice'])
    // Le groupe garde la priorité : être soi-même ne fait pas passer devant un présent.
    expect(sortPresenceRows([...rows, withNumber(3, 'Chloé', 'going')], 2)[0].firstName).toBe(
      'Chloé'
    )
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

describe('ParticipantsTable — trois groupes', () => {
  it('affiche présents, sans-réponse et absents avec leur compte', () => {
    renderTable([
      row('Alice', 'Dupont', 'going', 'Bois de Haye'),
      row('Bruno', 'Martin', null),
      row('Chloé', 'Petit', null),
      row('David', 'Roux', 'skip'),
    ])

    expect(heading('Présents').textContent).toContain('1')
    expect(heading('N’ont pas répondu').textContent).toContain('2')
    expect(heading('Absents').textContent).toContain('1')
  })

  it('range les sections : présents, absents, puis sans-réponse', () => {
    renderTable([
      row('Alice', 'Dupont', 'going', 'Bois de Haye'),
      row('Bruno', 'Martin', null),
      row('David', 'Roux', 'skip'),
    ])

    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titles[0]).toContain('Présents')
    expect(titles[1]).toContain('Absents')
    expect(titles[2]).toContain('N’ont pas répondu')
  })

  it('masque un groupe vide', () => {
    renderTable([row('Alice', 'Dupont', 'going', 'Bois de Haye')])

    expect(screen.queryByRole('heading', { level: 3, name: /Absents/ })).toBeNull()
    expect(screen.queryByRole('heading', { level: 3, name: /répondu/ })).toBeNull()
  })

  it('affiche le parcours du présent, et un tiret s’il n’a rien choisi', () => {
    renderTable([
      row('Alice', 'Dupont', 'going', 'Bois de Haye'),
      row('Bruno', 'Martin', 'going'),
    ])

    expect(screen.getByText('Bois de Haye')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('garde les noms des sans-réponse visibles', () => {
    renderTable([row('Bruno', 'Martin', null), row('Alice', 'Dupont', 'going')])

    expect(screen.getByText(/Bruno Martin/)).toBeInTheDocument()
  })

  it('signale la personne connectée', () => {
    const rows = [withNumber(7, 'Julie', null), withNumber(8, 'Marc', null)]
    renderTable(rows, 7)

    // « (vous) » suit le nom de la personne connectée
    const chips = screen.getAllByRole('listitem')
    expect(chips[0].textContent).toMatch(/Julie.*\(vous\)/)
  })

  it('invite à répondre quand personne ne l’a fait', () => {
    renderTable([])

    expect(screen.getByText(/Personne n'a encore répondu/)).toBeInTheDocument()
  })
})
