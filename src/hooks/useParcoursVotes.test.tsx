import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AuthProvider } from './useAuth'
import { useParcoursVotes } from './useParcoursVotes'
import { getWeekTallies, getWeekVotes, castWeekVote, deleteWeekVote } from '../services/supabaseService'

vi.mock('../services/supabaseService', () => ({
  getWeekTallies: vi.fn(),
  getWeekVotes: vi.fn(),
  castWeekVote: vi.fn(),
  deleteWeekVote: vi.fn(),
  getUserProfile: vi.fn(),
  upsertUserProfile: vi.fn(),
  getWeekAttendances: vi.fn(),
  setAttendance: vi.fn(),
}))

const mockTallies = vi.mocked(getWeekTallies)
const mockVotes = vi.mocked(getWeekVotes)
const mockCast = vi.mocked(castWeekVote)
const mockDelete = vi.mocked(deleteWeekVote)

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>

const PARCOURS = ['p1', 'p2', 'p3']
type StoreVote = { parcoursId: string; localUserId: string; status: 'yes' | 'no' }

/**
 * Store simulé qui reflète la contrainte UNIQUE(local_user_id, week_key) :
 * une personne n'a qu'un choix par semaine.
 */
let store: StoreVote[] = []

const tallyOf = (): { parcoursId: string; yes: number; no: number }[] => {
  const acc: { parcoursId: string; yes: number; no: number }[] = []
  for (const v of store) {
    let t = acc.find((x) => x.parcoursId === v.parcoursId)
    if (!t) {
      t = { parcoursId: v.parcoursId, yes: 0, no: 0 }
      acc.push(t)
    }
    t[v.status] += 1
  }
  return acc
}

describe('useParcoursVotes — un choix unique par semaine', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    store = []
    localStorage.setItem(
      'running_user',
      JSON.stringify({ id: 'alice', firstName: 'Alice', lastName: 'Dupont', name: 'Alice Dupont' })
    )

    mockVotes.mockImplementation(() => Promise.resolve([...store]))
    mockTallies.mockImplementation(() => Promise.resolve(tallyOf()))
    // L'upsert remplace le choix précédent (UNIQUE user+week)
    mockCast.mockImplementation(({ parcoursId, localUserId, status }) => {
      store = store.filter((v) => v.localUserId !== localUserId)
      store.push({ parcoursId, localUserId, status: status as 'yes' | 'no' })
      return Promise.resolve()
    })
    mockDelete.mockImplementation((_p, localUserId) => {
      store = store.filter((v) => v.localUserId !== localUserId)
      return Promise.resolve()
    })
  })

  it('expose la semaine courante', async () => {
    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.weekKey).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.current.weekLabel).toContain('semaine du')
  })

  it('myChoice est null quand je n’ai rien choisi', async () => {
    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChoice).toBeNull()
  })

  it('dérive myChoice du vote existant', async () => {
    store = [{ parcoursId: 'p2', localUserId: 'alice', status: 'yes' }]
    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChoice).toBe('p2')
    expect(result.current.choiceOf('alice')).toBe('p2')
  })

  it('trie les parcours par votes décroissants', async () => {
    store = [
      { parcoursId: 'p1', localUserId: 'a', status: 'yes' },
      ...['b', 'c', 'd', 'e', 'f'].map((u) => ({ parcoursId: 'p2', localUserId: u, status: 'yes' as const })),
      { parcoursId: 'p3', localUserId: 'g', status: 'yes' },
      { parcoursId: 'p3', localUserId: 'h', status: 'yes' },
    ]
    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rankedParcoursIds).toEqual(['p2', 'p3', 'p1'])
  })

  it('choisir un parcours envoie l’identité et la semaine', async () => {
    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.toggleChoice('p2')
    })

    expect(mockCast).toHaveBeenCalledWith({
      parcoursId: 'p2',
      localUserId: 'alice',
      status: 'yes',
      weekKey: result.current.weekKey,
      identity: { firstName: 'Alice', lastName: 'Dupont' },
    })
    expect(result.current.myChoice).toBe('p2')
  })

  it('re-cliquer sur le parcours déjà choisi le retire', async () => {
    store = [{ parcoursId: 'p2', localUserId: 'alice', status: 'yes' }]
    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.toggleChoice('p2')
    })

    expect(mockDelete).toHaveBeenCalled()
    expect(mockCast).not.toHaveBeenCalled()
    expect(result.current.myChoice).toBeNull()
    expect(store).toHaveLength(0)
  })

  it('changer de parcours remplace le choix (pas de doublon)', async () => {
    store = [
      { parcoursId: 'p1', localUserId: 'alice', status: 'yes' },
      { parcoursId: 'p1', localUserId: 'bob', status: 'yes' },
      { parcoursId: 'p1', localUserId: 'carol', status: 'yes' },
      { parcoursId: 'p2', localUserId: 'dan', status: 'yes' },
      { parcoursId: 'p2', localUserId: 'eve', status: 'yes' },
    ]

    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChoice).toBe('p1')

    await act(async () => {
      await result.current.toggleChoice('p2')
    })

    // alice n'a plus de vote sur p1, seulement sur p2
    expect(store.filter((v) => v.localUserId === 'alice')).toHaveLength(1)
    expect(result.current.myChoice).toBe('p2')
    expect(result.current.choiceOf('alice')).toBe('p2')
    // p1 perd alice, p2 la gagne
    expect(result.current.tallies.p1?.yes).toBe(2)
    expect(result.current.tallies.p2?.yes).toBe(3)
  })

  it('signale l’égalité entre 2 parcours à égalité', async () => {
    store = [
      { parcoursId: 'p1', localUserId: 'a', status: 'yes' },
      { parcoursId: 'p1', localUserId: 'b', status: 'yes' },
      { parcoursId: 'p2', localUserId: 'a', status: 'yes' },
      { parcoursId: 'p2', localUserId: 'b', status: 'yes' },
      { parcoursId: 'p3', localUserId: 'a', status: 'yes' },
    ]

    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    // p1 et p2 sont à 2 voix, p3 à 1
    expect(result.current.isTie).toBe(true)
    expect(result.current.winners).toHaveLength(2)
    expect(result.current.winners).toContain('p1')
    expect(result.current.winners).toContain('p2')
  })

  it('signale l’égalité entre 3 parcours', async () => {
    store = [
      { parcoursId: 'p1', localUserId: 'a', status: 'yes' },
      { parcoursId: 'p2', localUserId: 'a', status: 'yes' },
      { parcoursId: 'p3', localUserId: 'a', status: 'yes' },
    ]

    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.isTie).toBe(true)
    expect(result.current.winners).toHaveLength(3)
  })

  it('pas d’égalité quand un parcours domine', async () => {
    store = [
      { parcoursId: 'p1', localUserId: 'a', status: 'yes' },
      { parcoursId: 'p1', localUserId: 'b', status: 'yes' },
      { parcoursId: 'p2', localUserId: 'a', status: 'yes' },
    ]

    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.isTie).toBe(false)
    expect(result.current.winners).toEqual(['p1'])
  })

  it('pas d’égalité si personne n’a voté', async () => {
    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Tous à 0 → pas de gagnant, pas d'égalité
    expect(result.current.isTie).toBe(false)
    expect(result.current.winners).toEqual([])
  })

  it('le tri reste déterministe en cas d’égalité', async () => {
    store = [
      { parcoursId: 'p3', localUserId: 'a', status: 'yes' },
      { parcoursId: 'p1', localUserId: 'b', status: 'yes' },
      { parcoursId: 'p2', localUserId: 'c', status: 'yes' },
    ]

    const names = { p1: 'Bois', p2: 'Canal', p3: 'Standard' }

    // Deux rendus successifs doivent donner le même ordre
    const first = renderHook(() => useParcoursVotes(PARCOURS, names), { wrapper })
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    const order1 = first.result.current.rankedParcoursIds

    const second = renderHook(() => useParcoursVotes(PARCOURS, names), { wrapper })
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    const order2 = second.result.current.rankedParcoursIds

    expect(order1).toEqual(order2)
    // Ordre alphabétique : Bois, Canal, Standard
    expect(order1).toEqual(['p1', 'p2', 'p3'])
  })

  it('un vote supplémentaire rompt l’égalité', async () => {
    store = [
      { parcoursId: 'p1', localUserId: 'a', status: 'yes' },
      { parcoursId: 'p2', localUserId: 'b', status: 'yes' },
    ]

    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isTie).toBe(true)

    // Alice vote pour p1 → 2 vs 1, plus d'égalité
    await act(async () => {
      await result.current.toggleChoice('p1')
    })

    expect(result.current.isTie).toBe(false)
    expect(result.current.winners).toEqual(['p1'])
  })

  it('retire un choix de parcours du store plutôt que de laisser un zéro négatif', async () => {
    store = [{ parcoursId: 'p1', localUserId: 'alice', status: 'yes' }]
    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tallies.p1?.yes).toBe(1)

    await act(async () => {
      await result.current.toggleChoice('p1')
    })

    // Le vote est supprimé → plus d'entrée pour p1 (pas de compteur négatif)
    expect(store).toHaveLength(0)
    expect(result.current.tallies.p1).toBeUndefined()
    expect(result.current.myChoice).toBeNull()
  })

  it('recharge l’état si le vote échoue', async () => {
    store = [
      { parcoursId: 'p1', localUserId: 'bob', status: 'yes' },
      { parcoursId: 'p1', localUserId: 'carol', status: 'yes' },
    ]
    mockCast.mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.toggleChoice('p1')
    })

    expect(result.current.myChoice).toBeNull()
    expect(result.current.error).toBeTruthy()
    expect(store).toHaveLength(2) // rien n'a été écrit
  })

  it('refuse de voter sans être connecté', async () => {
    localStorage.clear()
    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.toggleChoice('p1')
    })

    expect(mockCast).not.toHaveBeenCalled()
    expect(result.current.error).toBeTruthy()
  })

  it('vide l’état à la déconnexion', async () => {
    store = [{ parcoursId: 'p1', localUserId: 'alice', status: 'yes' }]
    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChoice).toBe('p1')

    act(() => localStorage.clear())

    const { result: offline } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(offline.current.loading).toBe(false))
    expect(offline.current.myChoice).toBeNull()
    expect(offline.current.tallies).toEqual({})
  })
})
