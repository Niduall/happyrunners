import { describe, expect, it, vi } from 'vitest'
import source from '../../public/push-handler.js?raw'

interface NotificationLike {
  close: () => void
  data?: { url?: string }
}

interface NotificationClickEvent {
  notification: NotificationLike
  waitUntil: (promise: Promise<unknown>) => void
}

type Listener = (event: NotificationClickEvent) => void

/**
 * Exécute `public/push-handler.js` avec un faux `self` de service worker.
 * Le fichier n'est pas un module : il s'enregistre au chargement.
 */
function loadPushHandler() {
  const listeners: Record<string, Listener> = {}
  const notifications: NotificationLike[] = [
    { close: vi.fn() },
    { close: vi.fn() },
  ]
  const registration = {
    getNotifications: vi.fn().mockResolvedValue(notifications),
    showNotification: vi.fn(),
  }
  const clients = {
    matchAll: vi.fn().mockResolvedValue([]),
    openWindow: vi.fn().mockResolvedValue(undefined),
  }
  const self = {
    addEventListener: (type: string, listener: Listener) => {
      listeners[type] = listener
    },
    location: { origin: 'https://happyrunners.test' },
    registration,
    clients,
  }

  new Function('self', source)(self)
  return { listeners, notifications, registration }
}

describe('push-handler — clic sur une notification', () => {
  it('ferme toutes les notifications de l’app, pas seulement celle cliquée', async () => {
    const { listeners, notifications, registration } = loadPushHandler()
    let work: Promise<unknown> | undefined

    const clicked: NotificationLike = {
      close: vi.fn(),
      data: { url: '/messages' },
    }
    const event: NotificationClickEvent = {
      notification: clicked,
      waitUntil: (promise) => {
        work = promise
      },
    }

    listeners.notificationclick(event)
    await work

    expect(clicked.close).toHaveBeenCalled()
    expect(registration.getNotifications).toHaveBeenCalled()
    for (const notification of notifications) {
      expect(notification.close).toHaveBeenCalled()
    }
  })
})
