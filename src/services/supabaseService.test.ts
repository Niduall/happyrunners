import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getWeekVotes, getWeekTallies, getWeekAttendances } from './supabaseService'
import { supabase } from '../lib/supabase'

/** Lignes renvoyées par PostgREST (snake_case, comme la vraie API) */
const mockRows = vi.fn()
const mockProfiles = vi.fn()
const mockError = vi.fn()

/**
 * Chaque table a sa propre source de données. `from(table)` capture le nom
 * de la table pour savoir quelle mock renvoyer — plus fiable qu'un compteur.
 */
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.not = () => q
      q.in = () => q
      q.order = () => q
      q.limit = () => q
      q.maybeSingle = () => Promise.resolve({ data: null, error: null })
      q.then = (resolve: (v: unknown) => unknown) => {
        const data = table === 'user_profiles' ? mockProfiles() : mockRows()
        return Promise.resolve({ data, error: mockError() }).then(resolve)
      }
      return q
    },
  },
}))

void supabase

const VOTE_ROWS = [
  { parcours_id: 'p1', user_number: 1, status: 'yes' },
  { parcours_id: 'p1', user_number: 2, status: 'no' },
  { parcours_id: 'p2', user_number: 1, status: 'yes' },
]

describe('getWeekVotes — mapping snake_case → camelCase', () => {
  beforeEach(() => {
    mockRows.mockReset()
    mockProfiles.mockReset()
    mockError.mockReset()

    mockError.mockReturnValue(null)
  })

  it('convertit les noms de colonnes PostgREST en camelCase', async () => {
    mockRows.mockReturnValue(VOTE_ROWS)

    const votes = await getWeekVotes('2026-10-07')

    // Sans mapping, ces champs seraient undefined (le bug historique)
    expect(votes[0]).toEqual({ parcoursId: 'p1', userNumber: 1, status: 'yes' })
    expect(votes[0].parcoursId).toBeDefined()
    expect(votes[0].userNumber).toBeDefined()
  })

  it('userNumber reste un nombre (pas une string)', async () => {
    mockRows.mockReturnValue(VOTE_ROWS)
    const votes = await getWeekVotes('2026-10-07')
    for (const v of votes) {
      expect(typeof v.userNumber).toBe('number')
    }
  })

  it('retourne un tableau vide si aucune ligne', async () => {
    mockRows.mockReturnValue([])
    expect(await getWeekVotes('2026-10-07')).toEqual([])
  })
})

describe('getWeekTallies', () => {
  beforeEach(() => {
    mockRows.mockReset()
    mockProfiles.mockReset()
    mockError.mockReset()

    mockError.mockReturnValue(null)
  })

  it('compte les votes par parcours', async () => {
    mockRows.mockReturnValue(VOTE_ROWS)

    const tallies = await getWeekTallies('2026-10-07')
    const byId = new Map(tallies.map((t) => [t.parcoursId, t]))

    expect(byId.get('p1')).toEqual({ parcoursId: 'p1', yes: 1, no: 1 })
    expect(byId.get('p2')).toEqual({ parcoursId: 'p2', yes: 1, no: 0 })
  })

  it('ignore les lignes sans user_number', async () => {
    mockRows.mockReturnValue([{ parcours_id: 'p1', user_number: null, status: 'yes' }])
    expect(await getWeekTallies('2026-10-07')).toEqual([])
  })
})

describe('getWeekAttendances — les noms viennent du JOIN', () => {
  beforeEach(() => {
    mockRows.mockReset()
    mockProfiles.mockReset()
    mockError.mockReset()
    mockError.mockReturnValue(null)
  })

  it('rattache les noms de user_profiles', async () => {
    mockRows.mockReturnValue([
      { id: 'a', user_number: 1, status: 'going', created_at: '', updated_at: '' },
      { id: 'b', user_number: 2, status: 'skip', created_at: '', updated_at: '' },
    ])
    mockProfiles.mockReturnValue([
      { user_number: 1, first_name: 'Alice', last_name: 'Dupont' },
      { user_number: 2, first_name: 'Bob', last_name: 'Martin' },
    ])

    const attendees = await getWeekAttendances('2026-10-07')

    expect(attendees).toHaveLength(2)
    expect(attendees[0]).toEqual({
      userNumber: 1,
      firstName: 'Alice',
      lastName: 'Dupont',
      status: 'going',
    })
    expect(attendees[1].status).toBe('skip')
  })

  it('retourne [] si personne n’a répondu', async () => {
    mockRows.mockReturnValue([])
    mockProfiles.mockReturnValue([])
    expect(await getWeekAttendances('2026-10-07')).toEqual([])
  })

  it('gère un profil absent du JOIN (nom vide)', async () => {
    mockRows.mockReturnValue([
      { id: 'a', user_number: 99, status: 'going', created_at: '', updated_at: '' },
    ])
    mockProfiles.mockReturnValue([])

    const attendees = await getWeekAttendances('2026-10-07')
    expect(attendees[0].firstName).toBe('')
    expect(attendees[0].userNumber).toBe(99)
  })
})
