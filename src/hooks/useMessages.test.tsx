import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useMessages } from './useMessages'
import {
  deleteMessage,
  getRecentMessages,
  purgeOldMessages,
  removeMessageReaction,
  sendMessage,
  setMessageReaction,
} from '../services/supabaseService'
import { MESSAGES_LAST_READ_KEY } from '../services/messages'
import type { Message } from '../types/supabase'

vi.mock('../services/supabaseService', () => ({
  getRecentMessages: vi.fn(),
  sendMessage: vi.fn(),
  deleteMessage: vi.fn(),
  purgeOldMessages: vi.fn(),
  setMessageReaction: vi.fn(),
  removeMessageReaction: vi.fn(),
}))

const mockGet = vi.mocked(getRecentMessages)
const mockSend = vi.mocked(sendMessage)
const mockDelete = vi.mocked(deleteMessage)
const mockPurge = vi.mocked(purgeOldMessages)
const mockSetReaction = vi.mocked(setMessageReaction)
const mockRemoveReaction = vi.mocked(removeMessageReaction)

function message(
  id: string,
  createdAt: string,
  userNumber = 2,
  body = `message ${id}`
): Message {
  return { id, user_number: userNumber, body, created_at: createdAt }
}

/** Laisse tourner les microtâches et les minuteurs simulés. */
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

let visibility: DocumentVisibilityState = 'visible'

beforeEach(() => {
  vi.clearAllMocks()
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  })
  mockGet.mockResolvedValue([])
  mockPurge.mockResolvedValue(undefined)
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useMessages — chargement et polling', () => {
  it('charge les messages et coupe le spinner', async () => {
    mockGet.mockResolvedValue([message('m1', '2026-11-02T10:00:00.000Z')])

    const { result } = renderHook(() => useMessages(1))
    expect(result.current.loading).toBe(true)

    await flush()

    expect(result.current.loading).toBe(false)
    expect(result.current.messages.map((m) => m.id)).toEqual(['m1'])
    expect(result.current.error).toBeNull()
  })

  it('interroge la base toutes les 5 s quand l’onglet est visible', async () => {
    renderHook(() => useMessages(1))
    await flush()
    expect(mockGet).toHaveBeenCalledTimes(1)

    await flush(5000)
    expect(mockGet).toHaveBeenCalledTimes(2)

    await flush(5000)
    expect(mockGet).toHaveBeenCalledTimes(3)
  })

  it('ralentit à 30 s quand l’onglet passe en arrière-plan', async () => {
    renderHook(() => useMessages(1))
    await flush()

    visibility = 'hidden'
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Rien à 5 s : le minuteur d'arrière-plan est à 30 s.
    await flush(5000)
    expect(mockGet).toHaveBeenCalledTimes(1)

    await flush(25000)
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('recharge immédiatement au retour sur l’onglet', async () => {
    renderHook(() => useMessages(1))
    await flush()

    visibility = 'hidden'
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    visibility = 'visible'
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await flush()

    // Une requête de plus, sans attendre les 5 s.
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('arrête le polling au démontage', async () => {
    const { unmount } = renderHook(() => useMessages(1))
    await flush()
    expect(mockGet).toHaveBeenCalledTimes(1)

    unmount()
    await flush(30000)

    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('garde les messages en échec d’envoi lors d’un rafraîchissement', async () => {
    mockSend.mockRejectedValue(new Error('hors ligne'))

    const { result } = renderHook(() => useMessages(1))
    await flush()

    await act(async () => {
      await result.current.send('coucou')
    })
    expect(result.current.messages[0].status).toBe('failed')

    await flush(5000)

    // Le serveur ne connaît pas encore ce message : il doit rester affiché.
    expect(result.current.messages.map((m) => m.body)).toEqual(['coucou'])
  })
})

describe('useMessages — envoi', () => {
  it('affiche le message immédiatement, puis le remplace par la ligne serveur', async () => {
    let resolveSend: ((value: Message) => void) | undefined
    mockSend.mockImplementation(
      () =>
        new Promise<Message>((resolve) => {
          resolveSend = resolve
        })
    )

    const { result } = renderHook(() => useMessages(1))
    await flush()

    await act(async () => {
      void result.current.send('  salut  ')
    })

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].body).toBe('salut')
    expect(result.current.messages[0].status).toBe('sending')
    expect(result.current.messages[0].id).toMatch(/^pending-/)

    await act(async () => {
      resolveSend?.(
        message('s1', '2026-11-02T10:00:05.000Z', 1, 'salut')
      )
    })

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].id).toBe('s1')
    expect('status' in result.current.messages[0]).toBe(false)
  })

  it('marque un échec et laisse réessayer', async () => {
    mockSend
      .mockRejectedValueOnce(new Error('réseau'))
      .mockResolvedValueOnce(message('s1', '2026-11-02T10:00:05.000Z', 1, 'coucou'))

    const { result } = renderHook(() => useMessages(1))
    await flush()

    let sent = true
    await act(async () => {
      sent = await result.current.send('coucou')
    })
    expect(sent).toBe(false)
    expect(result.current.messages[0].status).toBe('failed')

    await act(async () => {
      await result.current.retry(result.current.messages[0].id)
    })

    expect(result.current.messages[0].id).toBe('s1')
    expect('status' in result.current.messages[0]).toBe(false)
  })

  it('refuse un message vide, trop long, ou sans identité', async () => {
    const { result } = renderHook(() => useMessages(1))
    await flush()

    await act(async () => {
      expect(await result.current.send('   ')).toBe(false)
      expect(await result.current.send('a'.repeat(501))).toBe(false)
    })
    expect(mockSend).not.toHaveBeenCalled()

    const anonymous = renderHook(() => useMessages(null))
    await flush()
    await act(async () => {
      expect(await anonymous.result.current.send('bonjour')).toBe(false)
    })
    expect(mockSend).not.toHaveBeenCalled()
  })
})

describe('useMessages — suppression', () => {
  it('retire le message tout de suite', async () => {
    mockGet.mockResolvedValue([message('m1', '2026-11-02T10:00:00.000Z')])
    mockDelete.mockResolvedValue(undefined)

    const { result } = renderHook(() => useMessages(1))
    await flush()

    await act(async () => {
      expect(await result.current.remove('m1')).toBe(true)
    })

    expect(result.current.messages).toEqual([])
  })

  it('restaure le message si le serveur refuse', async () => {
    mockGet.mockResolvedValue([message('m1', '2026-11-02T10:00:00.000Z')])
    mockDelete.mockRejectedValue(new Error('refus'))

    const { result } = renderHook(() => useMessages(1))
    await flush()

    await act(async () => {
      expect(await result.current.remove('m1')).toBe(false)
    })

    expect(result.current.messages.map((m) => m.id)).toEqual(['m1'])
  })
})

describe('useMessages — réactions', () => {
  it('ajoute la réaction tout de suite, puis prévient le serveur', async () => {
    mockGet.mockResolvedValue([message('m1', '2026-11-02T10:00:00.000Z')])
    mockSetReaction.mockResolvedValue(undefined)

    const { result } = renderHook(() => useMessages(1))
    await flush()

    await act(async () => {
      expect(await result.current.react('m1', 'like')).toBe(true)
    })

    expect(mockSetReaction).toHaveBeenCalledWith({
      messageId: 'm1',
      userNumber: 1,
      reaction: 'like',
    })
    expect(result.current.messages[0].reactions).toEqual([
      { user_number: 1, reaction: 'like' },
    ])
  })

  it('remplace la réaction précédente au lieu d’en ajouter une seconde', async () => {
    mockGet.mockResolvedValue([
      {
        ...message('m1', '2026-11-02T10:00:00.000Z'),
        reactions: [
          { user_number: 1, reaction: 'like' },
          { user_number: 2, reaction: 'fire' },
        ],
      },
    ])
    mockSetReaction.mockResolvedValue(undefined)

    const { result } = renderHook(() => useMessages(1))
    await flush()

    await act(async () => {
      await result.current.react('m1', 'laugh')
    })

    expect(result.current.messages[0].reactions).toEqual([
      { user_number: 2, reaction: 'fire' },
      { user_number: 1, reaction: 'laugh' },
    ])
  })

  it('retire la réaction quand on réappuie sur le même emoji', async () => {
    mockGet.mockResolvedValue([
      {
        ...message('m1', '2026-11-02T10:00:00.000Z'),
        reactions: [{ user_number: 1, reaction: 'like' }],
      },
    ])
    mockRemoveReaction.mockResolvedValue(undefined)

    const { result } = renderHook(() => useMessages(1))
    await flush()

    await act(async () => {
      expect(await result.current.react('m1', 'like')).toBe(true)
    })

    expect(mockRemoveReaction).toHaveBeenCalledWith({
      messageId: 'm1',
      userNumber: 1,
    })
    expect(result.current.messages[0].reactions).toEqual([])
  })

  it('restaure l’état d’avant si le serveur refuse', async () => {
    mockGet.mockResolvedValue([message('m1', '2026-11-02T10:00:00.000Z')])
    mockSetReaction.mockRejectedValue(new Error('refus'))

    const { result } = renderHook(() => useMessages(1))
    await flush()

    await act(async () => {
      expect(await result.current.react('m1', 'fire')).toBe(false)
    })

    expect(result.current.messages[0].reactions).toEqual([])
  })

  it('refuse de réagir sans identité ou sur un message inconnu', async () => {
    const { result } = renderHook(() => useMessages(null))
    await flush()

    await act(async () => {
      expect(await result.current.react('m1', 'like')).toBe(false)
    })
    expect(mockSetReaction).not.toHaveBeenCalled()
  })
})

describe('useMessages — non-lus et purge', () => {
  it('compte les messages des autres arrivés après la dernière lecture', async () => {
    localStorage.setItem(MESSAGES_LAST_READ_KEY, '2026-11-02T10:00:00.000Z')
    mockGet.mockResolvedValue([
      message('old', '2026-11-02T09:00:00.000Z', 2),
      message('new', '2026-11-02T11:00:00.000Z', 2),
      message('mine', '2026-11-02T11:30:00.000Z', 1),
    ])

    const { result } = renderHook(() => useMessages(1))
    await flush()

    expect(result.current.unreadCount).toBe(1)
  })

  it('remet la pastille à zéro quand on marque comme lu', async () => {
    localStorage.setItem(MESSAGES_LAST_READ_KEY, '2026-11-02T10:00:00.000Z')
    mockGet.mockResolvedValue([message('new', '2026-11-02T11:00:00.000Z', 2)])

    const { result } = renderHook(() => useMessages(1))
    await flush()
    expect(result.current.unreadCount).toBe(1)

    await act(async () => {
      result.current.markAllRead()
    })

    expect(result.current.unreadCount).toBe(0)
    expect(localStorage.getItem(MESSAGES_LAST_READ_KEY)).toBe(
      '2026-11-02T11:00:00.000Z'
    )
  })

  it('avance la dernière lecture à l’heure serveur après un envoi', async () => {
    // L'heure locale du message optimiste peut précéder de quelques
    // centaines de millisecondes le created_at serveur. Si on garde la
    // première, la pastille compte son propre message comme non lu.
    localStorage.setItem(MESSAGES_LAST_READ_KEY, '2026-11-02T10:00:00.000Z')
    mockGet.mockResolvedValue([])
    mockSend.mockResolvedValue(message('s1', '2026-11-02T10:00:05.000Z', 1))

    const { result } = renderHook(() => useMessages(1))
    await flush()

    await act(async () => {
      await result.current.send('coucou')
    })

    expect(localStorage.getItem(MESSAGES_LAST_READ_KEY)).toBe(
      '2026-11-02T10:00:05.000Z'
    )
    expect(result.current.unreadCount).toBe(0)
  })

  it('purge ce qui est sorti de la fenêtre au chargement', async () => {
    renderHook(() => useMessages(1))
    await flush()

    expect(mockPurge).toHaveBeenCalledTimes(1)

    const cutoff = mockPurge.mock.calls[0][0]
    const days = (Date.now() - Date.parse(cutoff)) / 86_400_000
    expect(days).toBeGreaterThan(29.9)
    expect(days).toBeLessThan(30.1)
  })
})

describe('useMessages — course entre polling et envoi', () => {
  it('n’efface pas un message envoyé pendant qu’un polling était en vol', async () => {
    // 1. chargement initial, 2. polling contrôlé (réponse tardive), 3. envoi.
    let resolveStale: ((rows: Message[]) => void) | undefined
    mockGet
      .mockResolvedValueOnce([])
      .mockImplementationOnce(
        () =>
          new Promise<Message[]>((resolve) => {
            resolveStale = resolve
          })
      )
    mockSend.mockResolvedValue(message('s1', '2026-11-02T11:00:00.000Z', 1, 'coucou'))

    const { result } = renderHook(() => useMessages(1))
    await flush()

    await flush(5000) // le polling part, il ne répond pas encore

    await act(async () => {
      await result.current.send('coucou')
    })
    expect(result.current.messages.map((m) => m.id)).toEqual(['s1'])

    // La réponse du polling, partie AVANT l'envoi, arrive enfin : elle ne
    // contient pas le nouveau message. Elle doit être ignorée.
    await act(async () => {
      resolveStale?.([])
    })
    await flush()

    await waitFor(() =>
      expect(result.current.messages.map((m) => m.id)).toEqual(['s1'])
    )
  })
})
