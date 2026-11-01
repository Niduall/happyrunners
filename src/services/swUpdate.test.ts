import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startServiceWorkerUpdates } from './swUpdate'

type Handler = () => void

/**
 * Faux `ServiceWorkerContainer` : jsdom n'en fournit aucun. On garde la main
 * sur `controller` et sur l'émission de `controllerchange`, les deux seules
 * choses que le module observe.
 */
function fakeContainer({ controlled = false } = {}) {
  const handlers = new Map<string, Set<Handler>>()
  const update = vi.fn().mockResolvedValue(undefined)
  const register = vi.fn().mockResolvedValue(undefined)

  const container = {
    controller: controlled ? ({} as ServiceWorker) : null,
    addEventListener: (type: string, handler: Handler) => {
      if (!handlers.has(type)) handlers.set(type, new Set())
      handlers.get(type)!.add(handler)
    },
    removeEventListener: (type: string, handler: Handler) => {
      handlers.get(type)?.delete(handler)
    },
    getRegistration: vi.fn().mockResolvedValue({ update }),
    register,
  } as unknown as ServiceWorkerContainer

  return {
    container,
    update,
    register,
    emit: (type: string) => {
      for (const handler of [...(handlers.get(type) ?? [])]) handler()
    },
    listenerCount: (type: string) => handlers.get(type)?.size ?? 0,
  }
}

let visibility: DocumentVisibilityState = 'visible'

beforeEach(() => {
  vi.useFakeTimers()
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('startServiceWorkerUpdates — enregistrement', () => {
  it('enregistre /sw.js au démarrage', () => {
    const { container, register } = fakeContainer()

    startServiceWorkerUpdates({ container, reload: vi.fn() })

    expect(register).toHaveBeenCalledWith('/sw.js')
  })
})

describe('startServiceWorkerUpdates — rechargement', () => {
  it('ne recharge pas au tout premier chargement', async () => {
    const { container, emit } = fakeContainer({ controlled: false })
    const reload = vi.fn()
    startServiceWorkerUpdates({ container, reload })

    // `clientsClaim` déclenche controllerchange sur une page vierge : ce n'est
    // pas une mise à jour, recharger ici ferait un double affichage.
    emit('controllerchange')
    await vi.advanceTimersByTimeAsync(5000)

    expect(reload).not.toHaveBeenCalled()
  })

  it('recharge une page déjà contrôlée quand la nouvelle version prend la main', async () => {
    const { container, emit } = fakeContainer({ controlled: true })
    const reload = vi.fn()
    startServiceWorkerUpdates({ container, reload })

    emit('controllerchange')
    await vi.advanceTimersByTimeAsync(2000)

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('se met à jour même si l’onglet était ouvert avant la première activation', async () => {
    // Cas réel : première visite, la page n'est pas encore contrôlée. Le
    // premier `controllerchange` vient de `clientsClaim`, pas d'une mise à
    // jour. Un déploiement ultérieur dans le même onglet doit quand même
    // recharger — sinon cet onglet ne se mettrait jamais à jour.
    const { container, emit } = fakeContainer({ controlled: false })
    const reload = vi.fn()
    startServiceWorkerUpdates({ container, reload })

    emit('controllerchange') // activation du tout premier worker
    await vi.advanceTimersByTimeAsync(5000)
    expect(reload).not.toHaveBeenCalled()

    emit('controllerchange') // vraie mise à jour
    await vi.advanceTimersByTimeAsync(2000)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('laisse 2 s pour finir un clic avant de recharger', async () => {
    const { container, emit } = fakeContainer({ controlled: true })
    const reload = vi.fn()
    startServiceWorkerUpdates({ container, reload })

    emit('controllerchange')
    await vi.advanceTimersByTimeAsync(1999)
    expect(reload).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('ne recharge qu’une fois même si controllerchange se répète', async () => {
    const { container, emit } = fakeContainer({ controlled: true })
    const reload = vi.fn()
    startServiceWorkerUpdates({ container, reload })

    emit('controllerchange')
    emit('controllerchange')
    await vi.advanceTimersByTimeAsync(4000)

    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('startServiceWorkerUpdates — cherche la mise à jour', () => {
  it('vérifie toutes les 30 minutes', async () => {
    const { container, update } = fakeContainer()
    startServiceWorkerUpdates({ container, reload: vi.fn() })

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000)
    expect(update).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000)
    expect(update).toHaveBeenCalledTimes(2)
  })

  it('vérifie au retour sur l’onglet, pas quand il passe en arrière-plan', async () => {
    const { container, update } = fakeContainer()
    startServiceWorkerUpdates({ container, reload: vi.fn() })

    visibility = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(update).not.toHaveBeenCalled()

    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('vérifie à la restauration depuis le cache de navigation', async () => {
    const { container, update } = fakeContainer()
    startServiceWorkerUpdates({ container, reload: vi.fn() })

    window.dispatchEvent(new Event('pageshow'))
    await vi.advanceTimersByTimeAsync(0)

    expect(update).toHaveBeenCalledTimes(1)
  })

  it('survit à une vérification en échec (hors ligne)', async () => {
    const { container, update } = fakeContainer()
    update.mockRejectedValueOnce(new Error('hors ligne'))
    startServiceWorkerUpdates({ container, reload: vi.fn() })

    // La promesse rejetée est avalée : aucune erreur ne doit remonter à
    // l'écran, et la vérification suivante repart normalement.
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000)
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000)

    expect(update).toHaveBeenCalledTimes(2)
  })
})

describe('startServiceWorkerUpdates — arrêt', () => {
  it('retire les écouteurs et le minuteur', async () => {
    const { container, emit, update, listenerCount } = fakeContainer({ controlled: true })
    const reload = vi.fn()
    const stop = startServiceWorkerUpdates({ container, reload })

    stop()
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000)
    emit('controllerchange')
    await vi.advanceTimersByTimeAsync(4000)

    expect(update).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    expect(listenerCount('controllerchange')).toBe(0)
  })
})
