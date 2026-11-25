import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { supabase } from '../lib/supabase'
import {
  clearOfflineCacheForTests,
  writeCache,
} from './offlineCache'
import { resetOfflineStatusForTests } from './offlineStore'
import {
  getHistoryAttendances,
  getHistoryVotes,
  getWeekAttendances,
  getWeekVotes,
  getWeeklyRuns,
} from './supabaseService'

function setNavigatorOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
}

beforeEach(() => {
  clearOfflineCacheForTests()
  resetOfflineStatusForTests()
  setNavigatorOnline(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('supabaseService — lectures hors ligne', () => {
  it('sert les présences de la semaine sans toucher au réseau', async () => {
    const rows = [
      { userNumber: 1, firstName: 'Alice', lastName: 'Martin', status: 'going' as const },
    ]
    writeCache('attendances:2026-11-25', rows)
    setNavigatorOnline(false)
    const from = vi.spyOn(supabase, 'from')

    await expect(getWeekAttendances('2026-11-25')).resolves.toEqual(rows)
    expect(from).not.toHaveBeenCalled()
  })

  it('sert les votes de la semaine sans toucher au réseau', async () => {
    const votes = [{ parcoursId: 'p1', userNumber: 1, status: 'yes' as const }]
    writeCache('votes:2026-11-25', votes)
    setNavigatorOnline(false)
    const from = vi.spyOn(supabase, 'from')

    await expect(getWeekVotes('2026-11-25')).resolves.toEqual(votes)
    expect(from).not.toHaveBeenCalled()
  })

  it('sert les sorties déclarées sans toucher au réseau', async () => {
    writeCache('runs:2026-11-18', [])
    setNavigatorOnline(false)
    const from = vi.spyOn(supabase, 'from')

    await expect(getWeeklyRuns(['2026-11-18'])).resolves.toEqual([])
    expect(from).not.toHaveBeenCalled()
  })

  it('sert les présences passées de l’historique sans toucher au réseau', async () => {
    const rows = [
      {
        weekKey: '2026-11-18',
        userNumber: 1,
        firstName: 'Alice',
        lastName: 'Martin',
        status: 'going' as const,
      },
    ]
    writeCache('history:attendances:2026-11-18', rows)
    setNavigatorOnline(false)
    const from = vi.spyOn(supabase, 'from')

    await expect(getHistoryAttendances(['2026-11-18'])).resolves.toEqual(rows)
    expect(from).not.toHaveBeenCalled()
  })

  it('sert les votes passés de l’historique sans toucher au réseau', async () => {
    const votes = [
      { weekKey: '2026-11-18', parcoursId: 'p1', userNumber: 1, status: 'yes' as const },
    ]
    writeCache('history:votes:2026-11-18', votes)
    setNavigatorOnline(false)
    const from = vi.spyOn(supabase, 'from')

    await expect(getHistoryVotes(['2026-11-18'])).resolves.toEqual(votes)
    expect(from).not.toHaveBeenCalled()
  })

  it('interroge la base quand l’appareil est en ligne', async () => {
    writeCache('history:votes:2026-11-18', [{ weekKey: 'vieux' }])
    const from = vi.spyOn(supabase, 'from')

    // Le mock global renvoie des lignes vides : c'est le réseau qui répond,
    // pas l'instantané.
    await expect(getHistoryVotes(['2026-11-18'])).resolves.toEqual([])
    expect(from).toHaveBeenCalled()
  })
})
