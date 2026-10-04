import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AuthProvider } from './useAuth'
import { useAttendance } from './useAttendance'
import { getWeekAttendances, setAttendance, deleteWeekVote, getUserProfile } from '../services/supabaseService'

vi.mock('../services/supabaseService', () => ({
  getWeekAttendances: vi.fn(),
  setAttendance: vi.fn(),
  deleteWeekVote: vi.fn(),
  getUserProfile: vi.fn(),
  createUserProfile: vi.fn(),
  updateUserProfile: vi.fn(),
  findProfileByName: vi.fn(),
  getWeekTallies: vi.fn(),
  getWeekVotes: vi.fn(),
  castWeekVote: vi.fn(),
}))

const mockAttendances = vi.mocked(getWeekAttendances)
const mockSet = vi.mocked(setAttendance)
const mockDeleteVote = vi.mocked(deleteWeekVote)
const mockGetProfile = vi.mocked(getUserProfile)

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>

/** user_number 1 = Alice Dupont (la personne connectée dans ces tests) */
const ALICE = 1

const dbProfile = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'uuid-1',
  user_number: ALICE,
  first_name: 'Alice',
  last_name: 'Dupont',
  pin_hash: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...over,
})

const attendee = (
  userNumber: number,
  status: 'going' | 'skip',
  firstName = 'Alice',
  lastName = 'Dupont'
) => ({ userNumber, firstName, lastName, status })

const renderAttendance = () => renderHook(() => useAttendance(), { wrapper })

describe('useAttendance — « pas aujourd’hui » retire le choix de parcours', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()

    localStorage.setItem(
      'running_user',
      JSON.stringify({ id: ALICE, firstName: 'Alice', lastName: 'Dupont', name: 'Alice Dupont' })
    )
    // Le profil existe en base, sans PIN → connexion directe
    mockGetProfile.mockResolvedValue(dbProfile() as never)
    mockAttendances.mockResolvedValue([])
    mockSet.mockResolvedValue(undefined)
    mockDeleteVote.mockResolvedValue(undefined)
  })

  it('« je viens » NE supprime PAS le vote de parcours', async () => {
    const { result } = renderAttendance()
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.setMyStatus('going')
    })

    expect(mockSet).toHaveBeenCalledWith({ weekKey: result.current.weekKey, userNumber: ALICE, status: 'going' })
    expect(mockDeleteVote).not.toHaveBeenCalled()
  })

  it('« pas aujourd’hui » SUPPRIME le vote de parcours', async () => {
    const { result } = renderAttendance()
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.setMyStatus('skip')
    })

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'skip', userNumber: ALICE })
    )
    expect(mockDeleteVote).toHaveBeenCalledTimes(1)
    const [userNumber, weekKey] = mockDeleteVote.mock.calls[0]
    expect(userNumber).toBe(ALICE)
    expect(weekKey).toBe(result.current.weekKey)
  })

  it('skip puis going : la suppression n’a lieu qu’une fois', async () => {
    const { result } = renderAttendance()
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.setMyStatus('skip')
    })
    expect(mockDeleteVote).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.setMyStatus('going')
    })
    expect(mockDeleteVote).toHaveBeenCalledTimes(1)
  })

  it('annule l’optimisme si la suppression échoue', async () => {
    mockDeleteVote.mockRejectedValue(new Error('network down'))
    mockAttendances.mockResolvedValue([attendee(ALICE, 'going')])

    const { result } = renderAttendance()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myStatus).toBe('going')

    await act(async () => {
      await result.current.setMyStatus('skip')
    })

    expect(result.current.error).toBeTruthy()
  })

  it('masque les préférences de parcours quand skip', async () => {
    const { result } = renderAttendance()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.showParcours).toBe(true)

    await act(async () => {
      await result.current.setMyStatus('skip')
    })
    expect(result.current.showParcours).toBe(false)
  })

  it('ré-affiche les préférences si on revient sur « je viens »', async () => {
    const { result } = renderAttendance()
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

  it('expose le statut de chacun via statusOf', async () => {
    mockAttendances.mockResolvedValue([
      attendee(ALICE, 'skip'),
      attendee(2, 'going', 'Bob', 'Martin'),
    ])

    const { result } = renderAttendance()
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.statusOf(ALICE)).toBe('skip')
    expect(result.current.statusOf(2)).toBe('going')
    expect(result.current.statusOf(99)).toBeNull()
  })

  it('remplace la ligne existante au lieu de la dupliquer', async () => {
    mockAttendances.mockResolvedValue([attendee(ALICE, 'going')])

    const { result } = renderAttendance()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.attendees).toHaveLength(1)

    await act(async () => {
      await result.current.setMyStatus('skip')
    })

    // Toujours 1 seule ligne pour cette personne
    expect(result.current.attendees.filter((a) => a.userNumber === ALICE)).toHaveLength(1)
    expect(result.current.myStatus).toBe('skip')
  })

  it('refuse une réponse sans être connecté', async () => {
    localStorage.clear()

    const { result } = renderAttendance()
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.setMyStatus('skip')
    })

    expect(mockSet).not.toHaveBeenCalled()
    expect(result.current.error).toBeTruthy()
  })
})
