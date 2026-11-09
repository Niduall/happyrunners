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
 *
 * Il porte aussi `pushsubscriptionchange` : quand le navigateur renouvelle ou
 * termine l'abonnement, le worker se réabonne et met la base à jour tout seul.
 * Sans ça, la base gardait l'ancien endpoint et le serveur continuait d'y
 * envoyer des notifications que plus aucun appareil n'affichait.
 */

// ---------------------------------------------------------------------------
// Configuration partagée avec la page (déposée par `pushConfigStore.ts`)
// ---------------------------------------------------------------------------

const PUSH_DB = 'happyrunners-push'
const PUSH_STORE = 'config'
const PUSH_KEY = 'current'

function openPushDb() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    let request
    try {
      request = indexedDB.open(PUSH_DB, 1)
    } catch {
      resolve(null)
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(PUSH_STORE)) {
        db.createObjectStore(PUSH_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

/** Lit `{ url, anonKey, userNumber, vapidPublicKey }`, ou `null`. */
async function readPushConfig() {
  const db = await openPushDb()
  if (!db) return null

  try {
    return await new Promise((resolve) => {
      const tx = db.transaction(PUSH_STORE, 'readonly')
      const request = tx.objectStore(PUSH_STORE).get(PUSH_KEY)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => resolve(null)
      tx.onabort = () => resolve(null)
    })
  } finally {
    db.close()
  }
}

/** Même décodage que `urlBase64ToUint8Array` côté page. */
function base64UrlToBytes(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function restHeaders(config, extra = {}) {
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${config.anonKey}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

/**
 * Enregistre le nouvel abonnement et retire l'ancien endpoint s'il a changé.
 * Les échecs sont silencieux : la page resynchronise à la prochaine ouverture.
 */
async function persistSubscription(config, subscription, oldEndpoint) {
  const json = subscription.toJSON()
  const keys = json.keys || {}
  if (!json.endpoint || !keys.p256dh || !keys.auth) return

  const base = String(config.url).replace(/\/+$/, '')

  await fetch(
    `${base}/rest/v1/push_subscriptions?on_conflict=endpoint`,
    {
      method: 'POST',
      headers: restHeaders(config, {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify({
        user_number: config.userNumber,
        endpoint: json.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      }),
    }
  )

  if (oldEndpoint && oldEndpoint !== json.endpoint) {
    await fetch(
      `${base}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(
        oldEndpoint
      )}`,
      {
        method: 'DELETE',
        headers: restHeaders(config),
      }
    )
  }
}

// ---------------------------------------------------------------------------
// Réception d'une notification
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Renouvellement / invalidation de l'abonnement par le navigateur
// ---------------------------------------------------------------------------

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const config = await readPushConfig()
        if (!config || !config.url || !config.anonKey || !config.userNumber) {
          return
        }

        const old = event.oldSubscription
        // La clé d'origine est la plus sûre : c'est celle avec laquelle
        // l'abonnement précédent a été créé.
        const applicationServerKey =
          (old && old.options && old.options.applicationServerKey) ||
          (config.vapidPublicKey
            ? base64UrlToBytes(config.vapidPublicKey)
            : null)

        let subscription =
          await self.registration.pushManager.getSubscription()

        if (!subscription) {
          if (!applicationServerKey) return
          subscription = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          })
        }

        await persistSubscription(config, subscription, old && old.endpoint)
      } catch (err) {
        // La page resynchronisera à la prochaine ouverture ; on ne casse pas
        // le worker pour autant.
        console.error('[PUSH] Renouvellement d’abonnement impossible', err)
      }
    })()
  )
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
      // Chaque message a son propre tag : plusieurs notifications peuvent
      // s'empiler. Ouvrir l'app depuis l'une d'elles vaut lecture du lot ;
      // laisser les autres dans le centre de notifications n'apporte rien.
      const notifications = await self.registration.getNotifications()
      for (const notification of notifications) notification.close()

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
