import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useLastRun } from './useLastRun'
import { useTargetWednesday } from './useTargetWednesday'
import {
  declareWeeklyRun,
  getWeeklyRunSkip,
  getWeeklyRuns,
  skipWeeklyRun,
} from '../services/supabaseService'
import {
  RUN_REMINDER_KEY,
  isRunReminderDismissed,
} from '../services/runReminderDismissal'
import type { WeeklyRun } from '../types/supabase'

vi.mock('./useTargetWednesday', () => ({ useTargetWednesday: vi.fn() }))

vi.mock('../services/supabaseService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/supabaseService')>()
  return {
    ...actual,
    getWeeklyRuns: vi.fn(),
    declareWeeklyRun: vi.fn(),
    getWeeklyRunSkip: vi.fn(),
    skipWeeklyRun: vi.fn(),
  }
})

const mockTarget = vi.mocked(useTargetWednesday)
const mockRuns = vi.mocked(getWeeklyRuns)
const mockDeclare = vi.mocked(declareWeeklyRun)
const mockSkipLookup = vi.mocked(getWeeklyRunSkip)
const mockSkipWrite = vi.mocked(skipWeeklyRun)

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
  localStorage.clear()
  mockTarget.mockReturnValue(target())
  mockRuns.mockResolvedValue([])
  mockDeclare.mockResolvedValue(undefined)
  mockSkipLookup.mockResolvedValue(false)
  mockSkipWrite.mockResolvedValue(undefined)
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

describe('useLastRun — « je n’ai pas couru »', () => {
  it('ne coupe rien au départ', async () => {
    const { result } = renderHook(() => useLastRun(ALICE))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.dismissed).toBe(false)
  })

  it('suit la personne : une réponse en base masque le rappel', async () => {
    // Réponse donnée sur un autre téléphone : rien en local sur celui-ci.
    mockSkipLookup.mockResolvedValue(true)

    const { result } = renderHook(() => useLastRun(ALICE))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.dismissed).toBe(true)
    expect(localStorage.getItem(RUN_REMINDER_KEY)).toBeNull()
  })

  it('coupe le rappel de la semaine déclarable', async () => {
    const { result } = renderHook(() => useLastRun(ALICE))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.dismiss()
    })

    expect(result.current.dismissed).toBe(true)
    expect(isRunReminderDismissed(ALICE, '2026-11-04')).toBe(true)
    // La base porte la réponse pour les autres appareils.
    expect(mockSkipWrite).toHaveBeenCalledWith({
      weekKey: '2026-11-04',
      userNumber: ALICE,
    })
  })

  it('garde la carte masquée si l’écriture en base échoue', async () => {
    mockSkipWrite.mockRejectedValueOnce(new Error('hors ligne'))

    const { result } = renderHook(() => useLastRun(ALICE))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.dismiss()
    })

    // Le repère local prend le relais : pas de carte fantôme hors ligne.
    expect(result.current.dismissed).toBe(true)
    expect(isRunReminderDismissed(ALICE, '2026-11-04')).toBe(true)
  })

  it('oublie le repère local quand une sortie est déclarée', async () => {
    const { result } = renderHook(() => useLastRun(ALICE))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.dismiss()
    })
    expect(isRunReminderDismissed(ALICE, '2026-11-04')).toBe(true)

    await act(async () => {
      await result.current.declare(CHOICE)
    })

    // La base a supprimé la réponse (trigger) : le local ne doit pas la
    // ressusciter si la sortie est retirée plus tard.
    expect(isRunReminderDismissed(ALICE, '2026-11-04')).toBe(false)
  })

  it('laisse revenir le rappel la semaine suivante', async () => {
    const { result, rerender } = renderHook(() => useLastRun(ALICE))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.dismiss()
    })
    expect(result.current.dismissed).toBe(true)

    // La bascule du mercredi suivant change la semaine visée : nouveau rappel.
    mockTarget.mockReturnValue(target({ weekKey: '2026-11-18' }))
    rerender()
    await waitFor(() => expect(result.current.dismissed).toBe(false))

    expect(result.current.weekKey).toBe('2026-11-11')
    expect(mockSkipLookup).toHaveBeenCalledWith({
      weekKey: '2026-11-11',
      userNumber: ALICE,
    })
  })

  it('n’écrit rien sans identité', async () => {
    const { result } = renderHook(() => useLastRun(null))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.dismiss()
    })

    expect(result.current.dismissed).toBe(false)
    expect(localStorage.getItem(RUN_REMINDER_KEY)).toBeNull()
    expect(mockSkipWrite).not.toHaveBeenCalled()
  })
})
