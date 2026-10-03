import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AuthProvider } from './useAuth'
import { useAttendance } from './useAttendance'
import { getWeekAttendances, setAttendance, deleteWeekVote } from '../services/supabaseService'

vi.mock('../services/supabaseService', () => ({
  getWeekAttendances: vi.fn(),
  setAttendance: vi.fn(),
  deleteWeekVote: vi.fn(),
  getUserProfile: vi.fn(),
  upsertUserProfile: vi.fn(),
  getWeekTallies: vi.fn(),
  getWeekVotes: vi.fn(),
  castWeekVote: vi.fn(),
  getRoster: vi.fn(),
}))

const mockAttendances = vi.mocked(getWeekAttendances)
const mockSet = vi.mocked(setAttendance)
const mockDeleteVote = vi.mocked(deleteWeekVote)

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>

const profile = (over: Partial<Record<string, unknown>> = {}) => ({
  localUserId: 'alice',
  firstName: 'Alice',
  lastName: 'Dupont',
  status: 'going' as const,
  ...over,
})

describe('useAttendance — « pas aujourd’hui » retire le choix de parcours', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    localStorage.setItem(
      'running_user',
      JSON.stringify({ id: 'alice', firstName: 'Alice', lastName: 'Dupont', name: 'Alice Dupont' })
    )
    mockAttendances.mockResolvedValue([])
    mockSet.mockResolvedValue(undefined)
    mockDeleteVote.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('« je viens » NE supprime PAS le vote de parcours', async () => {
    const { result } = renderHook(() => useAttendance(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.setMyStatus('going')
    })

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'going' }))
    expect(mockDeleteVote).not.toHaveBeenCalled()
  })

  it('« pas aujourd’hui » SUPPRIME le vote de parcours', async () => {
    const { result } = renderHook(() => useAttendance(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.setMyStatus('skip')
    })

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'skip' }))
    // Le vote de parcours doit être retiré
    expect(mockDeleteVote).toHaveBeenCalledTimes(1)
    const [, userId, weekKey] = mockDeleteVote.mock.calls[0]
    expect(userId).toBe('alice')
    expect(weekKey).toBe(result.current.weekKey)
  })

  it('« pas aujourd’hui » puis « je viens » : la suppression est faite qu’une fois', async () => {
    const { result } = renderHook(() => useAttendance(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.setMyStatus('skip')
    })
    expect(mockDeleteVote).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.setMyStatus('going')
    })
    // Revenir sur "je viens" ne doit PAS supraire le choix (il n'y en a plus)
    expect(mockDeleteVote).toHaveBeenCalledTimes(1)
  })

  it('annule l’optimisme si la suppression échoue', async () => {
    mockDeleteVote.mockRejectedValue(new Error('network down'))
    mockAttendances.mockResolvedValue([profile({ status: 'going' })])

    const { result } = renderHook(() => useAttendance(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myStatus).toBe('going')

    await act(async () => {
      await result.current.setMyStatus('skip')
    })

    // L'erreur est remontée et l'état est rechargé depuis la base
    expect(result.current.error).toBeTruthy()
  })

  it('masque les préférences de parcours quand skip', async () => {
    const { result } = renderHook(() => useAttendance(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.showParcours).toBe(true)

    await act(async () => {
      await result.current.setMyStatus('skip')
    })

    expect(result.current.showParcours).toBe(false)
  })

  it('ré-affiche les préférences si on revient sur « je viens »', async () => {
    const { result } = renderHook(() => useAttendance(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.setMyStatus('skip')
    })
    expect(result.current.showParcours).toBe(false)

    await act(async () => {
      await result.current.setMyStatus('going')
    })
    expect(result.current.showParcours).toBe(true)
  })

  it('le tableau reflète le statut skip', async () => {
    mockAttendances.mockResolvedValue([
      profile({ status: 'skip' }),
      profile({ localUserId: 'bob', firstName: 'Bob', lastName: 'Martin', status: 'going' }),
    ])

    const { result } = renderHook(() => useAttendance(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.statusOf('alice')).toBe('skip')
    expect(result.current.statusOf('bob')).toBe('going')
  })

  it('refuse une réponse sans être connecté', async () => {
    localStorage.clear()
    const { result } = renderHook(() => useAttendance(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.setMyStatus('skip')
    })

    expect(mockSet).not.toHaveBeenCalled()
    expect(result.current.error).toBeTruthy()
  })
})
