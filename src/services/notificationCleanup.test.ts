import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NOTIFICATIONS_CLICKED,
  closeAppNotifications,
  startNotificationCleanup,
} from './notificationCleanup'

interface NotificationLike {
  close: () => void
}

/** Faux `ServiceWorkerContainer` : jsdom n'en fournit aucun. */
function fakeContainer(notifications: NotificationLike[] = [{ close: vi.fn() }]) {
  const handlers = new Map<string, Set<(event: MessageEvent) => void>>()
  const registration = {
    getNotifications: vi.fn().mockResolvedValue(notifications),
  }
  const getRegistration = vi.fn().mockResolvedValue(registration)

  const container = {
    getRegistration,
    addEventListener: (type: string, handler: (event: MessageEvent) => void) => {
      if (!handlers.has(type)) handlers.set(type, new Set())
      handlers.get(type)!.add(handler)
    },
    removeEventListener: (type: string, handler: (event: MessageEvent) => void) => {
      handlers.get(type)?.delete(handler)
    },
  } as unknown as ServiceWorkerContainer

  return {
    container,
    registration,
    notifications,
    getRegistration,
    emitMessage: (data: unknown) => {
      for (const handler of [...(handlers.get('message') ?? [])]) {
        handler({ data } as MessageEvent)
      }
    },
    listenerCount: (type: string) => handlers.get(type)?.size ?? 0,
  }
}

let visibility: DocumentVisibilityState = 'visible'

beforeEach(() => {
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('closeAppNotifications', () => {
  it('ferme toutes les notifications et retourne le nombre fermé', async () => {
    const notifications = [{ close: vi.fn() }, { close: vi.fn() }]
    const { container } = fakeContainer(notifications)

    await expect(closeAppNotifications(container)).resolves.toBe(2)
    for (const notification of notifications) {
      expect(notification.close).toHaveBeenCalled()
    }
  })

  it('ne fait rien sans service worker', async () => {
    await expect(
      closeAppNotifications({} as ServiceWorkerContainer)
    ).resolves.toBe(0)
  })

  it('ne fait rien si aucun service worker n’est enregistré', async () => {
    const { container, getRegistration } = fakeContainer()
    getRegistration.mockResolvedValue(undefined)

    await expect(closeAppNotifications(container)).resolves.toBe(0)
  })

  it('avale une erreur de lecture plutôt que de casser la page', async () => {
    const { container, getRegistration } = fakeContainer()
    getRegistration.mockRejectedValue(new Error('worker indisponible'))

    await expect(closeAppNotifications(container)).resolves.toBe(0)
  })

  it('continue si une notification est déjà fermée', async () => {
    const first = { close: vi.fn(() => { throw new Error('déjà fermée') }) }
    const second = { close: vi.fn() }
    const { container } = fakeContainer([first, second])

    await expect(closeAppNotifications(container)).resolves.toBe(2)
    expect(second.close).toHaveBeenCalled()
  })
})

describe('startNotificationCleanup', () => {
  it('nettoie dès l’ouverture de l’app', async () => {
    const { container, registration } = fakeContainer()

    startNotificationCleanup({ container, document, window })

    await vi.waitFor(() => expect(registration.getNotifications).toHaveBeenCalled())
  })

  it('nettoie au retour au premier plan, pas quand la page se cache', async () => {
    const { container, registration } = fakeContainer()
    const stop = startNotificationCleanup({ container, document, window })
    await vi.waitFor(() => expect(registration.getNotifications).toHaveBeenCalled())
    registration.getNotifications.mockClear()

    visibility = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    expect(registration.getNotifications).not.toHaveBeenCalled()

    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(registration.getNotifications).toHaveBeenCalled())

    stop()
  })

  it('nettoie quand le worker signale un clic sur une notification', async () => {
    const { container, registration, emitMessage } = fakeContainer()
    const stop = startNotificationCleanup({ container, document, window })
    await vi.waitFor(() => expect(registration.getNotifications).toHaveBeenCalled())
    registration.getNotifications.mockClear()

    emitMessage({ type: 'autre-chose' })
    expect(registration.getNotifications).not.toHaveBeenCalled()

    emitMessage({ type: NOTIFICATIONS_CLICKED })
    await vi.waitFor(() => expect(registration.getNotifications).toHaveBeenCalled())

    stop()
  })

  it('retire ses écouteurs à l’arrêt', () => {
    const { container, listenerCount } = fakeContainer()
    const stop = startNotificationCleanup({ container, document, window })

    expect(listenerCount('message')).toBe(1)
    stop()
    expect(listenerCount('message')).toBe(0)
  })
})
