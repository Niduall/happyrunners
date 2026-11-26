/**
 * Nettoyage des notifications restées dans le centre, côté page.
 *
 * Le service worker ferme déjà tout le lot quand `notificationclick` arrive
 * (`public/push-handler.js`). Sur iPhone, ce n'est pas garanti : WebKit ne
 * délivre pas toujours l'événement (bug 268797) et `getNotifications()` y a
 * longtemps renvoyé une liste vide (bug 258922). Résultat : le clic ramenait
 * l'app au premier plan en laissant les autres notifications dans le centre.
 *
 * La page, elle, est toujours exécutée quand l'app s'ouvre ou revient au
 * premier plan. On refait donc le nettoyage ici. **Ouvrir l'app vaut lecture
 * du lot** : c'est la règle déjà appliquée par le gestionnaire du worker.
 */

/** Message envoyé par `push-handler.js` quand une notification est cliquée. */
export const NOTIFICATIONS_CLICKED = 'notifications-clicked'

export interface NotificationCleanupOptions {
  /** Conteneur injectable : les tests n'ont pas de vrai service worker. */
  container?: ServiceWorkerContainer
  document?: Document
  window?: Window
}

/** Ferme toutes les notifications de l'app. Retourne le nombre fermé. */
export async function closeAppNotifications(
  container?: ServiceWorkerContainer
): Promise<number> {
  const sw =
    container ??
    (typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined)
  if (!sw || typeof sw.getRegistration !== 'function') return 0

  try {
    const registration = await sw.getRegistration()
    if (!registration || typeof registration.getNotifications !== 'function') {
      return 0
    }

    const notifications = await registration.getNotifications()
    for (const notification of notifications) {
      try {
        notification.close()
      } catch {
        // Déjà fermée par le système : rien à faire.
      }
    }
    return notifications.length
  } catch {
    // Permission retirée, worker en cours de mise à jour : sans conséquence.
    return 0
  }
}

/**
 * Ferme le lot à l'ouverture de l'app, au retour au premier plan et quand le
 * service worker signale un clic (app déjà visible, donc sans
 * `visibilitychange`). Retourne une fonction d'arrêt, utile aux tests.
 */
export function startNotificationCleanup(
  options: NotificationCleanupOptions = {}
): () => void {
  const container =
    options.container ??
    (typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined)
  const doc =
    options.document ?? (typeof document !== 'undefined' ? document : undefined)
  const win = options.window ?? (typeof window !== 'undefined' ? window : undefined)
  if (!container || !doc) return () => {}

  const clear = () => {
    void closeAppNotifications(container)
  }

  const onVisibilityChange = () => {
    if (doc.visibilityState === 'visible') clear()
  }

  const onMessage = (event: MessageEvent) => {
    if (event.data?.type === NOTIFICATIONS_CLICKED) clear()
  }

  // Démarrage à froid depuis une notification : la page est déjà visible,
  // aucun `visibilitychange` n'arrivera.
  clear()

  doc.addEventListener('visibilitychange', onVisibilityChange)
  // Restauration depuis le cache de navigation (bfcache).
  win?.addEventListener('pageshow', clear)
  container.addEventListener('message', onMessage)

  return () => {
    doc.removeEventListener('visibilitychange', onVisibilityChange)
    win?.removeEventListener('pageshow', clear)
    container.removeEventListener('message', onMessage)
  }
}
