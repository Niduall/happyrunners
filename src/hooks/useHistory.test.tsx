import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useHistory } from './useHistory'
import {
  declareWeeklyRun,
  deleteWeeklyRun,
  getAllProfiles,
  getHistoryAttendances,
  getHistoryVotes,
  getParcours,
  getWeeklyRuns,
} from '../services/supabaseService'

// Semaine figée : les dates ne dépendent pas du jour où la suite tourne.
vi.mock('../hooks/useTargetWednesday', () => ({
  useTargetWednesday: () => ({
    weekKey: '2026-11-11',
    weekLabel: 'semaine du 11 nov.',
    date: new Date(2026, 10, 11),
    isRunDay: false,
  }),
}))

vi.mock('../services/supabaseService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/supabaseService')>()
  return {
    ...actual,
    getHistoryAttendances: vi.fn(),
    getHistoryVotes: vi.fn(),
    getWeeklyRuns: vi.fn(),
    getParcours: vi.fn(),
    getAllProfiles: vi.fn(),
    declareWeeklyRun: vi.fn(),
    deleteWeeklyRun: vi.fn(),
  }
})

const mockAttendances = vi.mocked(getHistoryAttendances)
const mockVotes = vi.mocked(getHistoryVotes)
const mockRuns = vi.mocked(getWeeklyRuns)
const mockParcours = vi.mocked(getParcours)
const mockProfiles = vi.mocked(getAllProfiles)
const mockDeclare = vi.mocked(declareWeeklyRun)
const mockDelete = vi.mocked(deleteWeeklyRun)

const ALICE = 1

const CHOICE = {
  parcoursId: 'p1',
  parcoursName: 'Bords de Marne',
  distanceKm: 8,
  elevationGainM: 100,
}

async function renderLoadedHistory() {
  const view = renderHook(() => useHistory(ALICE))
  await waitFor(() => expect(view.result.current.loading).toBe(false))
  return view
}

beforeEach(() => {
  vi.clearAllMocks()

  mockAttendances.mockResolvedValue([])
  mockVotes.mockResolvedValue([])
  mockRuns.mockResolvedValue([])
  mockParcours.mockResolvedValue([])
  mockProfiles.mockResolvedValue([])
  mockDeclare.mockResolvedValue(undefined)
  mockDelete.mockResolvedValue(undefined)
})

describe('useHistory — verrouillage au mercredi 14h', () => {
  it('ouvre uniquement la semaine la plus récente', async () => {
    const { result } = await renderLoadedHistory()

    expect(result.current.editableWeekKey).toBe('2026-11-04')
  })

  it('refuse une déclaration sur une semaine figée', async () => {
    const { result } = await renderLoadedHistory()

    let ok = true
    await act(async () => {
      ok = await result.current.declare('2026-10-28', CHOICE)
    })

    expect(ok).toBe(false)
    expect(mockDeclare).not.toHaveBeenCalled()
    expect(result.current.error).toMatch(/figée/)
  })

  it('accepte un retrait sur une semaine figée', async () => {
    const { result } = await renderLoadedHistory()

    let ok = false
    await act(async () => {
      ok = await result.current.retract('2026-10-28')
    })

    // Corriger un classement passé reste interdit, mais réparer une sortie
    // déclarée par erreur doit rester possible : un retrait ne peut que
    // baisser ses propres totaux.
    expect(ok).toBe(true)
    expect(mockDelete).toHaveBeenCalledWith({
      weekKey: '2026-10-28',
      userNumber: ALICE,
    })
    expect(result.current.error).toBeNull()
  })

  it('accepte une déclaration sur la semaine ouverte', async () => {
    const { result } = await renderLoadedHistory()

    let ok = false
    await act(async () => {
      ok = await result.current.declare('2026-11-04', CHOICE)
    })

    expect(ok).toBe(true)
    expect(mockDeclare).toHaveBeenCalledWith({
      weekKey: '2026-11-04',
      userNumber: ALICE,
      ...CHOICE,
    })
  })

  it('accepte un retrait sur la semaine ouverte', async () => {
    const { result } = await renderLoadedHistory()

    let ok = false
    await act(async () => {
      ok = await result.current.retract('2026-11-04')
    })

    expect(ok).toBe(true)
    expect(mockDelete).toHaveBeenCalledWith({
      weekKey: '2026-11-04',
      userNumber: ALICE,
    })
  })
})

describe('useHistory — fraîcheur des données', () => {
  it('recharge au retour sur l’onglet, sans repasser par l’écran de chargement', async () => {
    await renderLoadedHistory()
    const callsBefore = mockAttendances.mock.calls.length

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() =>
      expect(mockAttendances.mock.calls.length).toBe(callsBefore + 1)
    )
  })

  it('arrête d’écouter au démontage', async () => {
    const { unmount } = await renderLoadedHistory()
    const callsBefore = mockAttendances.mock.calls.length
    unmount()

    document.dispatchEvent(new Event('visibilitychange'))

    // Aucune requête ne doit partir d'un hook démonté.
    expect(mockAttendances.mock.calls.length).toBe(callsBefore)
  })
})
