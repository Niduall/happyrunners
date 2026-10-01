import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AuthProvider } from './useAuth'
import { useParcoursVotes } from './useParcoursVotes'
import {
  getWeekTallies,
  getWeekVotes,
  getRoster,
  castWeekVote,
  deleteWeekVote,
} from '../services/supabaseService'

vi.mock('../services/supabaseService', () => ({
  getWeekTallies: vi.fn(),
  getWeekVotes: vi.fn(),
  getRoster: vi.fn(),
  castWeekVote: vi.fn(),
  deleteWeekVote: vi.fn(),
  getUserProfile: vi.fn(),
  upsertUserProfile: vi.fn(),
  getWeekAttendances: vi.fn(),
  setAttendance: vi.fn(),
}))

const mockTallies = vi.mocked(getWeekTallies)
const mockVotes = vi.mocked(getWeekVotes)
const mockRoster = vi.mocked(getRoster)
const mockCast = vi.mocked(castWeekVote)
const mockDelete = vi.mocked(deleteWeekVote)

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>

const PARCOURS = ['p1', 'p2', 'p3']

describe('useParcoursVotes — choix unique', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    localStorage.setItem(
      'running_user',
      JSON.stringify({ id: 'alice', firstName: 'Alice', lastName: 'Dupont', name: 'Alice Dupont' })
    )
    mockRoster.mockResolvedValue([])
    mockVotes.mockResolvedValue([])
    mockTallies.mockResolvedValue([])
    mockCast.mockResolvedValue(undefined)
    mockDelete.mockResolvedValue(undefined)
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
    mockVotes.mockResolvedValue([{ parcoursId: 'p2', localUserId: 'alice', status: 'yes' }])
    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChoice).toBe('p2')
  })

  it('trie les parcours par votes décroissants', async () => {
    mockTallies.mockResolvedValue([
      { parcoursId: 'p1', yes: 1, no: 0 },
      { parcoursId: 'p2', yes: 5, no: 0 },
      { parcoursId: 'p3', yes: 2, no: 0 },
    ])
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
    mockVotes.mockResolvedValue([{ parcoursId: 'p2', localUserId: 'alice', status: 'yes' }])
    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChoice).toBe('p2')

    await act(async () => {
      await result.current.toggleChoice('p2')
    })

    expect(mockDelete).toHaveBeenCalledWith('p2', 'alice', result.current.weekKey)
    expect(mockCast).not.toHaveBeenCalled()
    expect(result.current.myChoice).toBeNull()
  })

  it('changer de parcours décrémente l’ancien et incrémente le nouveau', async () => {
    mockVotes.mockResolvedValue([{ parcoursId: 'p1', localUserId: 'alice', status: 'yes' }])
    mockTallies.mockResolvedValue([
      { parcoursId: 'p1', yes: 3, no: 0 },
      { parcoursId: 'p2', yes: 2, no: 0 },
    ])

    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChoice).toBe('p1')

    await act(async () => {
      await result.current.toggleChoice('p2')
    })

    expect(result.current.tallies.p1?.yes).toBe(2)
    expect(result.current.tallies.p2?.yes).toBe(3)
    expect(result.current.myChoice).toBe('p2')
  })

  it('ne descend jamais sous zéro', async () => {
    mockVotes.mockResolvedValue([{ parcoursId: 'p1', localUserId: 'alice', status: 'yes' }])
    mockTallies.mockResolvedValue([{ parcoursId: 'p1', yes: 1, no: 0 }])

    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.toggleChoice('p1')
    })

    expect(result.current.tallies.p1?.yes).toBe(0)
  })

  it('recharge l’état si le vote échoue', async () => {
    mockTallies.mockResolvedValue([{ parcoursId: 'p1', yes: 2, no: 0 }])
    mockCast.mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useParcoursVotes(PARCOURS), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.toggleChoice('p1')
    })

    await waitFor(() => {
      expect(result.current.tallies.p1?.yes).toBe(2)
    })
    expect(result.current.myChoice).toBeNull()
    expect(result.current.error).toBeTruthy()
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
    mockVotes.mockResolvedValue([{ parcoursId: 'p1', localUserId: 'alice', status: 'yes' }])
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
