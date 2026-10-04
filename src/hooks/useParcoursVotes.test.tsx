import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AuthProvider } from './useAuth'
import { useParcoursVotes } from './useParcoursVotes'
import {
  getWeekTallies,
  getWeekVotes,
  castWeekVote,
  deleteWeekVote,
  getUserProfile,
} from '../services/supabaseService'

vi.mock('../services/supabaseService', () => ({
  getWeekTallies: vi.fn(),
  getWeekVotes: vi.fn(),
  castWeekVote: vi.fn(),
  deleteWeekVote: vi.fn(),
  getUserProfile: vi.fn(),
  createUserProfile: vi.fn(),
  updateUserProfile: vi.fn(),
  findProfileByName: vi.fn(),
  getWeekAttendances: vi.fn(),
  setAttendance: vi.fn(),
}))

const mockTallies = vi.mocked(getWeekTallies)
const mockVotes = vi.mocked(getWeekVotes)
const mockCast = vi.mocked(castWeekVote)
const mockDelete = vi.mocked(deleteWeekVote)
const mockGetProfile = vi.mocked(getUserProfile)

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>

const PARCOURS = ['p1', 'p2', 'p3']

/** ALICE = user_number 1 (le user connecté dans les tests) */
const ALICE = 1

interface StoreVote {
  parcoursId: string
  userNumber: number
  status: 'yes' | 'no'
}

/** Store simulé respectant UNIQUE(user_number, week_key) */
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
      JSON.stringify({ id: ALICE, firstName: 'Alice', lastName: 'Dupont', name: 'Alice Dupont' })
    )
    // Profil en base sans PIN → connexion directe (l'utilisateur est authentifié)
    mockGetProfile.mockResolvedValue({
      id: 'uuid-1',
      user_number: ALICE,
      first_name: 'Alice',
      last_name: 'Dupont',
      pin_hash: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)

    mockVotes.mockImplementation(() => Promise.resolve([...store]))
    mockTallies.mockImplementation(() => Promise.resolve(tallyOf()))
    mockCast.mockImplementation(({ parcoursId, userNumber }) => {
      store = store.filter((v) => v.userNumber !== userNumber)
      store.push({ parcoursId, userNumber, status: 'yes' })
      return Promise.resolve()
    })
    mockDelete.mockImplementation((userNumber: number) => {
      store = store.filter((v) => v.userNumber !== userNumber)
      return Promise.resolve()
    })
  })

  afterEach(() => {
    vi.useRealTimers()
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
    store = [{ parcoursId: 'p2', userNumber: ALICE, status: 'yes' }]
    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChoice).toBe('p2')
    expect(result.current.choiceOf(ALICE)).toBe('p2')
  })

  it('trie les parcours par votes décroissants', async () => {
    store = [
      { parcoursId: 'p1', userNumber: 1, status: 'yes' },
      ...[2, 3, 4, 5, 6].map((u) => ({ parcoursId: 'p2', userNumber: u, status: 'yes' as const })),
      { parcoursId: 'p3', userNumber: 7, status: 'yes' },
      { parcoursId: 'p3', userNumber: 8, status: 'yes' },
    ]
    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rankedParcoursIds).toEqual(['p2', 'p3', 'p1'])
  })

  it('choisir un parcours envoie le user_number et la semaine', async () => {
    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.toggleChoice('p2')
    })

    expect(mockCast).toHaveBeenCalledWith({
      parcoursId: 'p2',
      userNumber: ALICE,
      weekKey: result.current.weekKey,
    })
    expect(result.current.myChoice).toBe('p2')
  })

  it('re-cliquer sur le parcours déjà choisi le retire', async () => {
    store = [{ parcoursId: 'p2', userNumber: ALICE, status: 'yes' }]
    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.toggleChoice('p2')
    })

    expect(mockDelete).toHaveBeenCalledWith(ALICE, result.current.weekKey)
    expect(mockCast).not.toHaveBeenCalled()
    expect(result.current.myChoice).toBeNull()
    expect(store).toHaveLength(0)
  })

  it('changer de parcours remplace le choix (pas de doublon)', async () => {
    store = [
      { parcoursId: 'p1', userNumber: 1, status: 'yes' },
      { parcoursId: 'p1', userNumber: 2, status: 'yes' },
      { parcoursId: 'p1', userNumber: 3, status: 'yes' },
      { parcoursId: 'p2', userNumber: 4, status: 'yes' },
      { parcoursId: 'p2', userNumber: 5, status: 'yes' },
    ]

    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChoice).toBe('p1')

    await act(async () => {
      await result.current.toggleChoice('p2')
    })

    // user_number 1 n'a plus de vote sur p1, seulement sur p2
    expect(store.filter((v) => v.userNumber === ALICE)).toHaveLength(1)
    expect(result.current.myChoice).toBe('p2')
    expect(result.current.choiceOf(ALICE)).toBe('p2')
    expect(result.current.tallies.p1?.yes).toBe(2)
    expect(result.current.tallies.p2?.yes).toBe(3)
  })

  it('retire le choix plutôt que de laisser un compteur négatif', async () => {
    store = [{ parcoursId: 'p1', userNumber: ALICE, status: 'yes' }]
    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tallies.p1?.yes).toBe(1)

    await act(async () => {
      await result.current.toggleChoice('p1')
    })

    expect(store).toHaveLength(0)
    expect(result.current.tallies.p1).toBeUndefined()
    expect(result.current.myChoice).toBeNull()
  })

  it('recharge l’état si le vote échoue', async () => {
    store = [
      { parcoursId: 'p1', userNumber: 2, status: 'yes' },
      { parcoursId: 'p1', userNumber: 3, status: 'yes' },
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
    store = [{ parcoursId: 'p1', userNumber: ALICE, status: 'yes' }]
    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChoice).toBe('p1')

    act(() => localStorage.clear())

    const { result: offline } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(offline.current.loading).toBe(false))
    expect(offline.current.myChoice).toBeNull()
    expect(offline.current.tallies).toEqual({})
  })

  describe('égalités', () => {
    it('signale l’égalité entre 2 parcours', async () => {
      store = [
        { parcoursId: 'p1', userNumber: 1, status: 'yes' },
        { parcoursId: 'p1', userNumber: 2, status: 'yes' },
        { parcoursId: 'p2', userNumber: 1, status: 'yes' },
        { parcoursId: 'p2', userNumber: 2, status: 'yes' },
        { parcoursId: 'p3', userNumber: 1, status: 'yes' },
      ]

      const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(result.current.isTie).toBe(true)
      expect(result.current.winners).toHaveLength(2)
      expect(result.current.winners).toContain('p1')
      expect(result.current.winners).toContain('p2')
    })

    it('signale l’égalité entre 3 parcours', async () => {
      store = [
        { parcoursId: 'p1', userNumber: 1, status: 'yes' },
        { parcoursId: 'p2', userNumber: 1, status: 'yes' },
        { parcoursId: 'p3', userNumber: 1, status: 'yes' },
      ]

      const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(result.current.isTie).toBe(true)
      expect(result.current.winners).toHaveLength(3)
    })

    it('pas d’égalité quand un parcours domine', async () => {
      store = [
        { parcoursId: 'p1', userNumber: 1, status: 'yes' },
        { parcoursId: 'p1', userNumber: 2, status: 'yes' },
        { parcoursId: 'p2', userNumber: 1, status: 'yes' },
      ]

      const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(result.current.isTie).toBe(false)
      expect(result.current.winners).toEqual(['p1'])
    })

    it('pas d’égalité si personne n’a voté', async () => {
      const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(result.current.isTie).toBe(false)
      expect(result.current.winners).toEqual([])
    })

    it('le tri reste déterministe en cas d’égalité', async () => {
      store = [
        { parcoursId: 'p3', userNumber: 1, status: 'yes' },
        { parcoursId: 'p1', userNumber: 2, status: 'yes' },
        { parcoursId: 'p2', userNumber: 3, status: 'yes' },
      ]

      const names = { p1: 'Bois', p2: 'Canal', p3: 'Standard' }

      const first = renderHook(() => useParcoursVotes(PARCOURS, names), { wrapper })
      await waitFor(() => expect(first.result.current.loading).toBe(false))
      const order1 = first.result.current.rankedParcoursIds

      const second = renderHook(() => useParcoursVotes(PARCOURS, names), { wrapper })
      await waitFor(() => expect(second.result.current.loading).toBe(false))
      const order2 = second.result.current.rankedParcoursIds

      expect(order1).toEqual(order2)
      expect(order1).toEqual(['p1', 'p2', 'p3']) // alphabétique
    })

    it('un vote supplémentaire rompt l’égalité', async () => {
      // p1 et p2 sont à 1 voix chacun. Alice (user_number 1) n'a pas encore voté.
      store = [
        { parcoursId: 'p1', userNumber: 2, status: 'yes' },
        { parcoursId: 'p2', userNumber: 3, status: 'yes' },
      ]

      const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.isTie).toBe(true)
      expect(result.current.myChoice).toBeNull()

      // Alice vote pour p1 → 2 voix contre 1, plus d'égalité
      await act(async () => {
        await result.current.toggleChoice('p1')
      })

      expect(result.current.isTie).toBe(false)
      expect(result.current.winners).toEqual(['p1'])
    })
  })
})
