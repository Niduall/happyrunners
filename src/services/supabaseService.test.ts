import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getWeekVotes, getWeekTallies, getRoster } from './supabaseService'
import { supabase } from '../lib/supabase'

// Capture les lignes renvoyées par PostgREST (en snake_case, comme la vraie API)
const mockRows = vi.fn()
const mockError = vi.fn()

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.not = () => q
      q.order = () => q
      q.limit = () => q
      q.maybeSingle = () => Promise.resolve({ data: null, error: null })
      q.then = (resolve: (v: unknown) => unknown) => {
        const result = { data: mockRows(), error: mockError() }
        return Promise.resolve(result).then(resolve)
      }
      return q
    },
  },
}))

const SAMPLE_ROWS = [
  {
    parcours_id: 'p1',
    local_user_id: 'alice',
    status: 'yes',
    first_name: 'Alice',
    last_name: 'Dupont',
  },
  {
    parcours_id: 'p1',
    local_user_id: 'bob',
    status: 'no',
    first_name: 'Bob',
    last_name: 'Martin',
  },
  {
    parcours_id: 'p2',
    local_user_id: 'alice',
    status: 'yes',
    first_name: 'Alice',
    last_name: 'Dupont',
  },
]

describe('getWeekVotes — mapping snake_case → camelCase', () => {
  beforeEach(() => {
    mockRows.mockReset()
    mockError.mockReset()
    mockError.mockReturnValue(null)
  })

  it('convertit les noms de colonnes PostgREST en camelCase', async () => {
    mockRows.mockReturnValue(SAMPLE_ROWS)

    const votes = await getWeekVotes('2026-10-07')

    // C'est exactement le bug : sans mapping, ces champs seraient undefined
    expect(votes[0]).toEqual({
      parcoursId: 'p1',
      localUserId: 'alice',
      status: 'yes',
    })
    expect(votes[0].parcoursId).toBeDefined()
    expect(votes[0].localUserId).toBeDefined()
  })

  it('ne renvoie jamais de champ undefined', async () => {
    mockRows.mockReturnValue(SAMPLE_ROWS)

    const votes = await getWeekVotes('2026-10-07')

    for (const v of votes) {
      expect(v.parcoursId).toBeTruthy()
      expect(v.localUserId).toBeTruthy()
      expect(['yes', 'no']).toContain(v.status)
    }
  })

  it('retourne un tableau vide si aucune ligne', async () => {
    mockRows.mockReturnValue([])
    expect(await getWeekVotes('2026-10-07')).toEqual([])
  })
})

describe('getWeekTallies — dépend du mapping', () => {
  beforeEach(() => {
    mockRows.mockReset()
    mockError.mockReset()
    mockError.mockReturnValue(null)
  })

  it('compte correctement les votes par parcours', async () => {
    mockRows.mockReturnValue(SAMPLE_ROWS)

    const tallies = await getWeekTallies('2026-10-07')
    const byId = new Map(tallies.map((t) => [t.parcoursId, t]))

    // p1 : 1 yes (alice), 1 no (bob)
    expect(byId.get('p1')).toEqual({ parcoursId: 'p1', yes: 1, no: 1 })
    // p2 : 1 yes (alice)
    expect(byId.get('p2')).toEqual({ parcoursId: 'p2', yes: 1, no: 0 })
  })

  it('ignore les lignes sans parcours_id (mapping cassé)', async () => {
    // Simule le bug : lignes non mappées (parcours_id brut, pas de parcoursId)
    mockRows.mockReturnValue([{ parcours_id: undefined, local_user_id: undefined, status: 'yes' }])

    const tallies = await getWeekTallies('2026-10-07')
    // Ne doit créer aucune entrée parasite
    expect(tallies).toEqual([])
  })
})

describe('getRoster — déduplication', () => {
  beforeEach(() => {
    mockRows.mockReset()
    mockError.mockReset()
    mockError.mockReturnValue(null)
  })

  it('déduplique par local_user_id en gardant la 1re occurrence', async () => {
    mockRows.mockReturnValue(SAMPLE_ROWS)

    const roster = await getRoster()
    expect(roster).toHaveLength(2)
    expect(roster.map((r) => r.localUserId)).toEqual(['alice', 'bob'])
  })

  it('trie par nom alphabétique', async () => {
    mockRows.mockReturnValue([
      { local_user_id: 'zoe', first_name: 'Zoe', last_name: 'Zida' },
      { local_user_id: 'al', first_name: 'Alice', last_name: 'Dupont' },
    ])

    const roster = await getRoster()
    expect(roster[0].firstName).toBe('Alice')
    expect(roster[1].firstName).toBe('Zoe')
  })

  it('reconstruit un nom depuis l’ID si les colonnes sont vides', async () => {
    mockRows.mockReturnValue([{ local_user_id: 'marie_dupont', first_name: null, last_name: null }])

    const roster = await getRoster()
    expect(roster[0]).toEqual({
      localUserId: 'marie_dupont',
      firstName: 'marie',
      lastName: 'dupont',
    })
  })
})
