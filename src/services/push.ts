/**
 * Web Push côté navigateur : support, permission, abonnement.
 *
 * Le service worker est déjà en place pour la PWA ; il ne manquait que le
 * gestionnaire `push` (voir `public/push-handler.js`) et l'abonnement.
 *
 * Sur iPhone, Apple ne fournit le push qu'aux applications ajoutées à
 * l'écran d'accueil (iOS 16.4+). Dans un onglet Safari, `PushManager` existe
 * parfois mais l'abonnement échoue : on préfère le dire explicitement.
 */

/**
 * Clé publique VAPID, générée une fois et partagée par tous les appareils.
 *
 * Lue à l'appel (et non au chargement du module) pour rester testable et pour
 * qu'une variable d'environnement ajoutée après coup soit prise en compte.
 */
export function vapidPublicKey(): string {
  return import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''
}

/** Abonnement tel qu'il est stocké en base. */
export interface PushSubscriptionRecord {
  endpoint: string
  p256dh: string
  auth: string
}

/** Le build connaît-il la clé publique ? Sinon, inutile de proposer le bouton. */
export function isPushConfigured(): boolean {
  return vapidPublicKey().trim().length > 0
}

/** Le navigateur sait-il s'abonner au push ? */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** iPhone / iPad, y compris iPadOS qui se présente comme un Mac tactile. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** L'app tourne-t-elle depuis l'icône de l'écran d'accueil ? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/**
 * Faut-il installer l'app avant de pouvoir s'abonner ?
 * Seul iOS impose ça ; Android et ordinateur acceptent le navigateur.
 */
export function needsInstallForPush(): boolean {
  return isIos() && !isStandalone()
}

export type PushPermission = NotificationPermission | 'unsupported'

/** État de la permission, sans jamais lever. */
export function permissionState(): PushPermission {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

/**
 * Décode une clé VAPID base64url en bytes, format attendu par
 * `PushManager.subscribe`.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** Convertit un abonnement navigateur en lignes prêtes pour Supabase. */
export function toSubscriptionRecord(
  subscription: PushSubscription
): PushSubscriptionRecord | null {
  const json = subscription.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!json.endpoint || !p256dh || !auth) return null
  return { endpoint: json.endpoint, p256dh, auth }
}

/** Abonnement actif pour cet appareil, s'il existe déjà. */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null

  // `getRegistration()` ne bloque pas : sans service worker, on renvoie null
  // plutôt que d'attendre `ready` indéfiniment.
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return null
  return registration.pushManager.getSubscription()
}

/**
 * Crée (ou retrouve) l'abonnement du navigateur, sans toucher à la permission.
 *
 * En développement le service worker est désactivé : sans ce garde-fou,
 * `ready` resterait en attente indéfiniment et le bouton tournerait dans le
 * vide. En production, il est enregistré au chargement de l'app.
 */
async function ensureSubscription(): Promise<PushSubscriptionRecord> {
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) {
    throw new Error(
      'Le service worker n’est pas encore actif. Recharge la page puis réessaie.'
    )
  }

  const existing = await registration.pushManager.getSubscription()
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey()),
    }))

  const record = toSubscriptionRecord(subscription)
  if (!record) throw new Error('Abonnement invalide')
  return record
}

/**
 * Demande la permission puis abonne cet appareil.
 *
 * À appeler **depuis un clic** : iOS refuse une demande de permission qui ne
 * suit pas un geste de l'utilisateur.
 */
export async function subscribeToPush(): Promise<PushSubscriptionRecord> {
  if (!isPushSupported()) {
    throw new Error('Notifications non prises en charge par ce navigateur')
  }
  if (!isPushConfigured()) {
    throw new Error('Notifications non configurées sur cette installation')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Permission refusée')
  }

  return ensureSubscription()
}

/**
 * Recrée l'abonnement **sans redemander la permission**.
 *
 * Utilisé à l'ouverture de l'app quand la permission est déjà accordée mais
 * que l'abonnement a disparu (navigateur qui a évincé les données de site).
 * Aucune boîte de dialogue : iOS n'exige un geste que pour la demande de
 * permission, pas pour un `subscribe()` déjà autorisé.
 */
export async function resubscribeToPush(): Promise<PushSubscriptionRecord> {
  if (!isPushSupported()) {
    throw new Error('Notifications non prises en charge par ce navigateur')
  }
  if (!isPushConfigured()) {
    throw new Error('Notifications non configurées sur cette installation')
  }
  if (Notification.permission !== 'granted') {
    throw new Error('Permission refusée')
  }

  return ensureSubscription()
}

/**
 * Désabonne cet appareil. Retourne l'endpoint supprimé (pour effacer la ligne
 * en base), ou `null` s'il n'y avait rien.
 */
export async function unsubscribeFromPush(): Promise<string | null> {
  const subscription = await getCurrentSubscription()
  if (!subscription) return null

  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  return endpoint
}
