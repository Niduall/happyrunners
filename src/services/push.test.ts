import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getCurrentSubscription,
  isIos,
  isPushConfigured,
  isPushSupported,
  isStandalone,
  needsInstallForPush,
  permissionState,
  subscribeToPush,
  toSubscriptionRecord,
  unsubscribeFromPush,
  urlBase64ToUint8Array,
} from './push'

const pushSubscription = (over: Partial<Record<string, unknown>> = {}) => ({
  endpoint: 'https://push.example/abc',
  toJSON: () => ({
    endpoint: 'https://push.example/abc',
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  }),
  unsubscribe: vi.fn().mockResolvedValue(true),
  ...over,
})

function stubUserAgent(userAgent: string) {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  })
}

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  stubUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
  Object.defineProperty(navigator, 'platform', {
    configurable: true,
    value: 'MacIntel',
  })
  Object.defineProperty(navigator, 'maxTouchPoints', {
    configurable: true,
    value: 0,
  })
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: undefined,
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('push — configuration', () => {
  it('n’est pas configuré sans clé VAPID', () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '')
    expect(isPushConfigured()).toBe(false)
  })

  it('est configuré dès qu’une clé est présente', () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'BExempleDeCle')
    expect(isPushConfigured()).toBe(true)
  })

  it('refuse un navigateur sans PushManager ni Notification', () => {
    expect(isPushSupported()).toBe(false)
  })

  it('accepte un navigateur complet', () => {
    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', class {})
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {},
    })

    expect(isPushSupported()).toBe(true)
  })
})

describe('push — détection iPhone', () => {
  it('reconnaît les iPhone et iPad', () => {
    stubUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    expect(isIos()).toBe(true)

    stubUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')
    expect(isIos()).toBe(true)
  })

  it('reconnaît iPadOS déguisé en Mac tactile', () => {
    stubUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    })
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      value: 2,
    })

    expect(isIos()).toBe(true)
  })

  it('laisse Android tranquille', () => {
    stubUserAgent('Mozilla/5.0 (Linux; Android 14)')
    expect(isIos()).toBe(false)
  })

  it('détecte le mode installé', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    expect(isStandalone()).toBe(true)

    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(isStandalone()).toBe(false)
  })

  it('exige l’installation seulement sur iOS dans Safari', () => {
    stubUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(needsInstallForPush()).toBe(true)

    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    expect(needsInstallForPush()).toBe(false)

    stubUserAgent('Mozilla/5.0 (Linux; Android 14)')
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(needsInstallForPush()).toBe(false)
  })
})

describe('push — permission', () => {
  it('signale un navigateur non pris en charge', () => {
    expect(permissionState()).toBe('unsupported')
  })

  it('relaie l’état du navigateur', () => {
    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', { permission: 'granted' })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {},
    })

    expect(permissionState()).toBe('granted')
  })
})

describe('push — clé et abonnement', () => {
  it('décode une clé base64url en octets', () => {
    expect(Array.from(urlBase64ToUint8Array('SGVsbG8'))).toEqual([
      72, 101, 108, 108, 111,
    ])
    // Caractères propres au base64url : - et _.
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255])
  })

  it('convertit un abonnement navigateur en ligne de base', () => {
    expect(toSubscriptionRecord(pushSubscription() as never)).toEqual({
      endpoint: 'https://push.example/abc',
      p256dh: 'p256dh-key',
      auth: 'auth-key',
    })
  })

  it('refuse un abonnement sans clés', () => {
    const incomplete = {
      endpoint: 'https://push.example/abc',
      toJSON: () => ({ endpoint: 'https://push.example/abc', keys: {} }),
    }

    expect(toSubscriptionRecord(incomplete as never)).toBeNull()
  })

  it('ne trouve aucun abonnement sans service worker', async () => {
    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', class {})
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue(undefined) },
    })

    expect(await getCurrentSubscription()).toBeNull()
  })

  it('demande la permission puis s’abonne', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'dGVzdC1rZXk')
    const subscription = pushSubscription()
    const subscribe = vi.fn().mockResolvedValue(subscription)
    const registration = {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe,
      },
    }

    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue(registration),
        ready: Promise.resolve(registration),
      },
    })

    await expect(subscribeToPush()).resolves.toEqual({
      endpoint: 'https://push.example/abc',
      p256dh: 'p256dh-key',
      auth: 'auth-key',
    })
    expect(subscribe).toHaveBeenCalledOnce()
  })

  it('n’abonne pas si la permission est refusée', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'dGVzdC1rZXk')
    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('denied'),
    })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager: {} }) },
    })

    await expect(subscribeToPush()).rejects.toThrow('Permission refusée')
  })

  it('réutilise l’abonnement existant au lieu d’en créer un second', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'dGVzdC1rZXk')
    const subscription = pushSubscription()
    const subscribe = vi.fn()
    const registration = {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(subscription),
        subscribe,
      },
    }

    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', {
      permission: 'granted',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue(registration),
        ready: Promise.resolve(registration),
      },
    })

    await subscribeToPush()
    expect(subscribe).not.toHaveBeenCalled()
  })

  it('demande de recharger si le service worker n’est pas actif', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'dGVzdC1rZXk')
    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', {
      permission: 'granted',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue(undefined) },
    })

    await expect(subscribeToPush()).rejects.toThrow(/Recharge la page/)
  })

  it('désabonne l’appareil et renvoie son endpoint', async () => {
    const subscription = pushSubscription()
    const registration = {
      pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) },
    }

    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', class {})
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue(registration) },
    })

    await expect(unsubscribeFromPush()).resolves.toBe('https://push.example/abc')
    expect(subscription.unsubscribe).toHaveBeenCalledOnce()
  })

  it('ne désabonne rien s’il n’y a pas d’abonnement', async () => {
    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', class {})
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue({
          pushManager: { getSubscription: vi.fn().mockResolvedValue(null) },
        }),
      },
    })

    await expect(unsubscribeFromPush()).resolves.toBeNull()
  })
})
