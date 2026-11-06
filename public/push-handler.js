/**
 * Gestionnaire `push` du service worker HappyRunners.
 *
 * Ce fichier est copié tel quel dans `dist/` (dossier `public`), puis importé
 * par le service worker généré par Workbox — voir `workbox.importScripts`
 * dans `vite.config.ts`. Il ne doit donc contenir que du JavaScript de
 * service worker, sans import.
 *
 * Le payload vient de l'Edge Function `send-push` :
 *   { title, body, url, tag? }
 */

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    // Une charge non JSON reste affichable : mieux qu'une notification vide.
    payload = { title: 'HappyRunners', body: event.data.text() }
  }

  const title = payload.title || 'HappyRunners'
  const options = {
    body: payload.body || '',
    icon: '/pwa-192x192.png',
    // Android dessine la petite icône de la barre d'état à partir du seul
    // canal alpha du badge. L'icône de l'application, opaque et colorée,
    // donnait donc un carré blanc : ce PNG est une silhouette blanche sur
    // fond transparent.
    badge: '/notification-badge.png',
    // Une notification par message : sans tag, Android les empile toutes,
    // ce qui noie le fil. Le tag vient de l'identifiant du message.
    tag: payload.tag || undefined,
    data: { url: payload.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

/**
 * Clic sur une notification : réutilise un onglet déjà ouvert sur la cible,
 * sinon en ouvre un. Sans ça, le clic peut laisser l'app sur l'accueil.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const target = new URL(
    event.notification.data?.url || '/',
    self.location.origin
  ).href

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      const exact = clients.find((client) => client.url === target)
      if (exact) return exact.focus()

      // Un autre onglet de l'app est déjà ouvert : on le réutilise plutôt
      // que d'en empiler un troisième.
      const sameApp = clients.find((client) =>
        client.url.startsWith(self.location.origin)
      )
      if (sameApp) {
        await sameApp.focus()
        if ('navigate' in sameApp) await sameApp.navigate(target)
        return undefined
      }

      return self.clients.openWindow(target)
    })()
  )
})
