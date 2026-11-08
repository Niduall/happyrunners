/**
 * Configuration Supabase partagée avec le service worker.
 *
 * Le service worker ne lit ni `import.meta.env` ni `localStorage`. Pour
 * pouvoir se réabonner seul quand le navigateur renouvelle l'abonnement
 * (`pushsubscriptionchange`), il a besoin de l'URL du projet, de la clé anon
 * (publique par nature) et du `user_number` courant. On les dépose donc dans
 * IndexedDB, que les deux contextes partagent.
 *
 * Ce n'est **pas** un secret : la clé anon est déjà dans le bundle, et la RLS
 * de `push_subscriptions` est ouverte comme le reste du projet. Aucune clé
 * privée VAPID ni `PUSH_WEBHOOK_SECRET` ne passe ici.
 *
 * jsdom n'implémente pas IndexedDB : toutes les opérations deviennent des
 * no-ops silencieux dans les tests, jamais des erreurs.
 */

export interface PushConfig {
  /** URL du projet Supabase, ex. `https://xxx.supabase.co`. */
  url: string
  /** Clé anon publique, la même que celle du bundle. */
  anonKey: string
  /** Profil à qui appartient l'abonnement de cet appareil. */
  userNumber: number
  /** Repli quand `pushsubscriptionchange` n'a pas d'ancien abonnement. */
  vapidPublicKey: string
}

const DB_NAME = 'happyrunners-push'
const STORE = 'config'
const KEY = 'current'

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)

  return new Promise((resolve) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, 1)
    } catch {
      resolve(null)
      return
    }

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
  const db = await openDb()
  if (!db) return null

  try {
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE, mode)
      const request = action(tx.objectStore(STORE))
      let result: T | null = null

      request.onsuccess = () => {
        result = request.result as T
      }
      request.onerror = () => {
        result = null
      }
      // On attend la fin de la transaction : en écriture, `onsuccess` peut
      // arriver avant que la valeur soit réellement commitée.
      tx.oncomplete = () => resolve(result)
      tx.onerror = () => resolve(null)
      tx.onabort = () => resolve(null)
    })
  } finally {
    db.close()
  }
}

/** Dépose la configuration que le service worker relira. */
export async function savePushConfig(config: PushConfig): Promise<void> {
  await run('readwrite', (store) => store.put(config, KEY))
}

/** Retire la configuration (désactivation, déconnexion). */
export async function clearPushConfig(): Promise<void> {
  await run('readwrite', (store) => store.delete(KEY))
}

/** Configuration à déposer pour ce profil, lue depuis le build. */
export function currentPushConfig(userNumber: number): PushConfig {
  return {
    url: import.meta.env.VITE_SUPABASE_URL ?? '',
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    userNumber,
    vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '',
  }
}
