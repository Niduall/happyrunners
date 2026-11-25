import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getOfflineStatus,
  markRead,
  resetOfflineStatusForTests,
  subscribeOfflineStatus,
} from './offlineStore'

function setNavigatorOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
}

beforeEach(() => {
  resetOfflineStatusForTests()
  setNavigatorOnline(true)
})

describe('offlineStore — fraîcheur des données', () => {
  it('garde la date la plus ancienne parmi les lectures', () => {
    markRead('parcours', 1_000)
    markRead('attendances:2026-11-25', 2_000)

    expect(getOfflineStatus().oldestAt).toBe(1_000)
  })

  it('ne rajeunit pas une lecture ancienne quand une autre est refaite', () => {
    markRead('parcours', 1_000)
    markRead('attendances:2026-11-25', 2_000)
    markRead('attendances:2026-11-25', 3_000)

    expect(getOfflineStatus().oldestAt).toBe(1_000)
  })

  it('remplace la date d’une clé relue', () => {
    markRead('parcours', 1_000)
    markRead('parcours', 4_000)

    expect(getOfflineStatus().oldestAt).toBe(4_000)
  })

  it('signale la déconnexion puis la reconnexion', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeOfflineStatus(listener)

    setNavigatorOnline(false)
    window.dispatchEvent(new Event('offline'))
    expect(getOfflineStatus().online).toBe(false)

    setNavigatorOnline(true)
    window.dispatchEvent(new Event('online'))
    expect(getOfflineStatus().online).toBe(true)

    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('retire les écouteurs réseau quand plus personne n’écoute', () => {
    const unsubscribe = subscribeOfflineStatus(() => {})
    unsubscribe()

    setNavigatorOnline(false)
    window.dispatchEvent(new Event('offline'))

    // L'état n'a pas bougé : plus aucun abonné n'était branché.
    expect(getOfflineStatus().online).toBe(true)
  })
})
