/**
 * État de connexion partagé et fraîcheur des données affichées.
 *
 * Un seul store de module pour toute l'application : les lectures qui
 * retombent sur un instantané enregistré (`offlineCache.ts`) y déposent la
 * date des données qu'elles viennent de servir, et le bandeau hors ligne
 * affiche la plus ancienne. Pas de `setInterval`, pas de polling : l'état ne
 * change qu'à une lecture, ou quand le navigateur signale `online`/`offline`.
 *
 * ⚠️ `oldestAt` décrit **l'âge des données**, pas l'heure du dernier essai
 * réseau. Un rafraîchissement qui échoue ne le rajeunit donc pas : c'est
 * exactement ce qu'on veut afficher dehors, quand la 4G est incertaine.
 */

export interface OfflineStatus {
  /** Le navigateur se croit-il connecté ? (`navigator.onLine`) */
  online: boolean
  /** Date du plus ancien instantané affiché, ou null si rien n'est connu. */
  oldestAt: number | null
}

type Listener = () => void

const listeners = new Set<Listener>()
/** Date de la donnée servie, par clé de lecture (`parcours`, `attendances:…`). */
const readAt = new Map<string, number>()

let online = typeof navigator === 'undefined' ? true : navigator.onLine !== false
let snapshot: OfflineStatus = { online, oldestAt: null }

function recompute(): void {
  let oldest: number | null = null
  for (const at of readAt.values()) {
    if (oldest === null || at < oldest) oldest = at
  }
  snapshot = { online, oldestAt: oldest }
  for (const listener of listeners) listener()
}

export function getOfflineStatus(): OfflineStatus {
  return snapshot
}

/** Lecture directe : `navigator.onLine` peut changer sans événement. */
export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return online
  return navigator.onLine !== false
}

/**
 * Enregistre la date de la donnée servie pour une clé.
 *
 * Appelée aussi bien après un chargement réussi (date = maintenant) qu'après
 * une relecture du cache (date = date de l'instantané). Un même `at` ne
 * déclenche aucun rendu : le polling ne fait pas clignoter le bandeau.
 */
export function markRead(key: string, at: number): void {
  online = isOnline()
  if (readAt.get(key) === at) return
  readAt.set(key, at)
  recompute()
}

function handleOnline(): void {
  online = true
  recompute()
}

function handleOffline(): void {
  online = false
  recompute()
}

/** Abonnement pour `useSyncExternalStore` ; les écouteurs réseau suivent. */
export function subscribeOfflineStatus(listener: Listener): () => void {
  listeners.add(listener)

  if (listeners.size === 1 && typeof window !== 'undefined') {
    online = isOnline()
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
  }

  return () => {
    listeners.delete(listener)

    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }
}

/** Réservé aux tests : remet le module dans son état de départ. */
export function resetOfflineStatusForTests(): void {
  if (typeof window !== 'undefined') {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
  listeners.clear()
  readAt.clear()
  online = true
  snapshot = { online, oldestAt: null }
}
