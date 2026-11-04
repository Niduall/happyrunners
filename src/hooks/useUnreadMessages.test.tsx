import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useUnreadMessages } from './useUnreadMessages'
import { countMessagesSince } from '../services/supabaseService'
import { MESSAGES_LAST_READ_KEY } from '../services/messages'

vi.mock('../services/supabaseService', () => ({
  countMessagesSince: vi.fn(),
}))

const mockCount = vi.mocked(countMessagesSince)

let visibility: DocumentVisibilityState = 'visible'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  })
  mockCount.mockResolvedValue(0)
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('useUnreadMessages — pastille', () => {
  it('ne compte rien tant que le chat n’a jamais été ouvert', async () => {
    const { result } = renderHook(() => useUnreadMessages())
    await flush()

    expect(result.current).toBe(0)
    expect(mockCount).not.toHaveBeenCalled()
  })

  it('compte les messages arrivés depuis la dernière lecture', async () => {
    localStorage.setItem(MESSAGES_LAST_READ_KEY, '2026-11-02T09:00:00.000Z')
    mockCount.mockResolvedValue(3)

    const { result } = renderHook(() => useUnreadMessages(true, 14))
    await flush()

    // Le numéro exclu évite de compter ses propres messages.
    expect(mockCount).toHaveBeenCalledWith('2026-11-02T09:00:00.000Z', 14)
    expect(result.current).toBe(3)
  })

  it('vérifie toutes les 30 s', async () => {
    localStorage.setItem(MESSAGES_LAST_READ_KEY, '2026-11-02T09:00:00.000Z')

    renderHook(() => useUnreadMessages())
    await flush()
    expect(mockCount).toHaveBeenCalledTimes(1)

    await flush(30000)
    expect(mockCount).toHaveBeenCalledTimes(2)
  })

  it('revérifie au retour sur l’onglet', async () => {
    localStorage.setItem(MESSAGES_LAST_READ_KEY, '2026-11-02T09:00:00.000Z')

    renderHook(() => useUnreadMessages())
    await flush()

    visibility = 'hidden'
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(mockCount).toHaveBeenCalledTimes(1)

    visibility = 'visible'
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await flush()

    expect(mockCount).toHaveBeenCalledTimes(2)
  })

  it('garde la dernière valeur connue si la vérification échoue', async () => {
    localStorage.setItem(MESSAGES_LAST_READ_KEY, '2026-11-02T09:00:00.000Z')
    mockCount.mockResolvedValueOnce(2).mockRejectedValueOnce(new Error('hors ligne'))

    const { result } = renderHook(() => useUnreadMessages())
    await flush()
    expect(result.current).toBe(2)

    await flush(30000)
    expect(result.current).toBe(2)
  })

  it('s’arrête au démontage', async () => {
    localStorage.setItem(MESSAGES_LAST_READ_KEY, '2026-11-02T09:00:00.000Z')

    const { unmount } = renderHook(() => useUnreadMessages())
    await flush()
    expect(mockCount).toHaveBeenCalledTimes(1)

    unmount()
    await flush(60000)

    expect(mockCount).toHaveBeenCalledTimes(1)
  })

  it('ne vérifie rien quand la pastille est désactivée', async () => {
    localStorage.setItem(MESSAGES_LAST_READ_KEY, '2026-11-02T09:00:00.000Z')

    const { result } = renderHook(() => useUnreadMessages(false))
    await flush(60000)

    expect(result.current).toBe(0)
    expect(mockCount).not.toHaveBeenCalled()
  })

  it('met à jour la valeur après un rafraîchissement', async () => {
    localStorage.setItem(MESSAGES_LAST_READ_KEY, '2026-11-02T09:00:00.000Z')
    mockCount.mockResolvedValueOnce(1).mockResolvedValueOnce(4)

    const { result } = renderHook(() => useUnreadMessages())
    await flush()
    expect(result.current).toBe(1)

    await flush(30000)

    await waitFor(() => expect(result.current).toBe(4))
  })
})
