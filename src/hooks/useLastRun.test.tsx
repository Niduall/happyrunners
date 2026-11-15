import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useLastRun } from './useLastRun'
import { useTargetWednesday } from './useTargetWednesday'
import { declareWeeklyRun, getWeeklyRuns } from '../services/supabaseService'
import type { WeeklyRun } from '../types/supabase'

vi.mock('./useTargetWednesday', () => ({ useTargetWednesday: vi.fn() }))

vi.mock('../services/supabaseService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/supabaseService')>()
  return {
    ...actual,
    getWeeklyRuns: vi.fn(),
    declareWeeklyRun: vi.fn(),
  }
})

const mockTarget = vi.mocked(useTargetWednesday)
const mockRuns = vi.mocked(getWeeklyRuns)
const mockDeclare = vi.mocked(declareWeeklyRun)

const ALICE = 1

const CHOICE = {
  parcoursId: 'p1',
  parcoursName: 'Bords de Marne',
  distanceKm: 8,
  elevationGainM: 100,
}

function run(over: Partial<WeeklyRun> = {}): WeeklyRun {
  return {
    week_key: '2026-11-04',
    user_number: ALICE,
    parcours_id: 'p1',
    parcours_name: 'Bords de Marne',
    source: 'manual',
    distance_km: 8,
    elevation_gain_m: 100,
    declared_at: '2026-11-04T18:30:00Z',
    updated_at: '2026-11-04T18:30:00Z',
    ...over,
  }
}

function target(over: Partial<ReturnType<typeof useTargetWednesday>> = {}) {
  return {
    weekKey: '2026-11-11',
    weekLabel: 'semaine du 11 nov.',
    date: new Date(2026, 10, 11),
    isRunDay: false,
    runStarted: false,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockTarget.mockReturnValue(target())
  mockRuns.mockResolvedValue([])
  mockDeclare.mockResolvedValue(undefined)
})

describe('useLastRun — quelle semaine est encore déclarable', () => {
  it('vise le mercredi précédent hors jour du run', async () => {
    const { result } = renderHook(() => useLastRun(ALICE))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.weekKey).toBe('2026-11-04')
    expect(mockRuns).toHaveBeenCalledWith(['2026-11-04'])
  })

  it('vise aujourd’hui dès 12h30 le jour du run', async () => {
    mockTarget.mockReturnValue(target({ isRunDay: true, runStarted: true }))

    const { result } = renderHook(() => useLastRun(ALICE))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.weekKey).toBe('2026-11-11')
    expect(mockRuns).toHaveBeenCalledWith(['2026-11-11'])
  })

  it('expose la sortie déjà déclarée par la personne connectée', async () => {
    mockRuns.mockResolvedValue([
      run(),
      run({ user_number: 2, parcours_name: 'Forêt' }),
    ])

    const { result } = renderHook(() => useLastRun(ALICE))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myRun?.parcours_name).toBe('Bords de Marne')
  })

  it('ne charge rien sans identité', async () => {
    const { result } = renderHook(() => useLastRun(null))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.weekKey).toBe('2026-11-04')
    expect(result.current.myRun).toBeNull()
    expect(mockRuns).not.toHaveBeenCalled()
  })
})

describe('useLastRun — déclaration', () => {
  it('enregistre sur la semaine déclarable puis recharge', async () => {
    const { result } = renderHook(() => useLastRun(ALICE))
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockRuns.mockResolvedValue([run()])

    let ok = false
    await act(async () => {
      ok = await result.current.declare(CHOICE)
    })

    expect(ok).toBe(true)
    expect(mockDeclare).toHaveBeenCalledWith({
      weekKey: '2026-11-04',
      userNumber: ALICE,
      ...CHOICE,
    })
    expect(result.current.myRun?.parcours_name).toBe('Bords de Marne')
  })

  it('garde l’erreur si l’écriture échoue', async () => {
    mockDeclare.mockRejectedValueOnce(new Error('écriture refusée'))

    const { result } = renderHook(() => useLastRun(ALICE))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let ok = true
    await act(async () => {
      ok = await result.current.declare(CHOICE)
    })

    expect(ok).toBe(false)
    expect(result.current.error).toBe('écriture refusée')
  })
})
