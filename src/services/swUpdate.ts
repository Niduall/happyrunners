/**
 * Mise à jour de la PWA : un onglet ouvert ne se met jamais à jour tout seul.
 *
 * Le service worker est généré en `autoUpdate` (`skipWaiting` +
 * `clientsClaim`) : dès qu'une nouvelle version est installée, elle prend la
 * main. Mais la page, elle, continue d'exécuter le JS déjà chargé. Il faut donc
 * deux choses côté client :
 *
 * 1. **Chercher** la mise à jour : le navigateur ne le fait qu'à la navigation,
 *    or un onglet peut rester ouvert des jours. D'où un `update()` périodique,
 *    plus un au retour sur l'onglet (les minuteurs des onglets en arrière-plan
 *    sont bridés par le navigateur, le retour est le vrai déclencheur).
 * 2. **Recharger** quand la nouvelle version prend la main (`controllerchange`).
 *
 * Le rechargement est différé de 2 s : le temps de finir un clic en cours.
 * Rien ne se recharge s'il n'y a pas de nouvelle version — `update()` renvoie
 * un 304 et aucun `controllerchange` ne survient.
 */

/** Trente minutes : compromis entre fraîcheur et bruit réseau. */
const UPDATE_INTERVAL_MS = 30 * 60 * 1000

/** Laisse le temps de terminer un clic avant de recharger. */
const RELOAD_DELAY_MS = 2000

export interface SwUpdateOptions {
  /** Conteneur injectable : les tests n'ont pas de vrai service worker. */
  container?: ServiceWorkerContainer
  /** Rechargement injectable : jsdom n'implémente pas la navigation. */
  reload?: () => void
  intervalMs?: number
  reloadDelayMs?: number
  swUrl?: string
}

/**
 * Enregistre le service worker et surveille les mises à jour.
 * Retourne une fonction d'arrêt (utile aux tests, jamais appelée par l'app).
 */
export function startServiceWorkerUpdates(options: SwUpdateOptions = {}): () => void {
  const container =
    options.container ??
    (typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined)
  if (!container) return () => {}

  const reload = options.reload ?? (() => window.location.reload())
  const intervalMs = options.intervalMs ?? UPDATE_INTERVAL_MS
  const reloadDelayMs = options.reloadDelayMs ?? RELOAD_DELAY_MS

  /**
   * Au tout premier chargement, la page n'est contrôlée par personne :
   * `clientsClaim` déclenche alors `controllerchange` sans qu'il y ait de
   * nouvelle version à charger. Recharger ici ferait un double affichage.
   *
   * On ne fige donc pas l'état au démarrage : le **premier** événement ne
   * fait que marquer la page comme contrôlée. Les suivants ne peuvent être
   * qu'un nouveau service worker — y compris pour un onglet ouvert avant la
   * première activation, qui doit tout de même se mettre à jour ensuite.
   */
  let controlled = Boolean(container.controller)
  let reloading = false

  const onControllerChange = () => {
    if (!controlled) {
      controlled = true
      return
    }
    if (reloading) return
    reloading = true
    window.setTimeout(reload, reloadDelayMs)
  }

  container.addEventListener('controllerchange', onControllerChange)

  const check = () => {
    void container
      .getRegistration()
      .then((registration) => registration?.update())
      .catch(() => {
        // Hors ligne ou onglet fermé pendant la requête : la prochaine
        // vérification repartira. Inutile de remonter une erreur à l'écran.
      })
  }

  void container.register(options.swUrl ?? '/sw.js').catch(() => {})

  const timer = window.setInterval(check, intervalMs)

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') check()
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  // Restauration depuis le cache de navigation (bfcache) : pas de
  // `visibilitychange` garanti, mais `pageshow` l'est.
  window.addEventListener('pageshow', check)

  return () => {
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pageshow', check)
    container.removeEventListener('controllerchange', onControllerChange)
  }
}
