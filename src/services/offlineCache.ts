/**
 * Cache de lecture pour le mode hors ligne.
 *
 * Chaque lecture passe par `readThrough` : en ligne, elle interroge la base et
 * enregistre l'instantané ; hors ligne, elle sert directement le dernier
 * instantané au lieu d'afficher une page vide.
 *
 * ⚠️ Ce cache ne sert **que des lectures**. Aucune écriture n'est rejouée au
 * retour du réseau : voter, déclarer une sortie ou envoyer un message hors
 * ligne échoue comme avant, et l'interface le dit. Un cache qui prétendrait
 * avoir enregistré une réponse serait pire qu'une erreur franche.
 *
 * ⚠️ La fraîcheur a une limite : l'instantané est réécrit par la lecture
 * suivante. Après une écriture réussie, il peut donc décrire l'état d'avant
 * pendant au plus un polling (30 s). C'est assumé : le mode hors ligne est un
 * filet pour consulter, pas une seconde base.
 */

import { isOnline, markRead } from './offlineStore'

/** Changer la forme d'un instantané impose de changer la version. */
const CACHE_VERSION = 1
const PREFIX = `happyrunners:cache:v${CACHE_VERSION}:`

/** Au-delà, l'instantané n'apprend plus rien : on préfère une page vide. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export interface CacheEntry<T> {
  /** Date de la donnée (fin du chargement réussi, ou date de l'instantané). */
  at: number
  data: T
}

function storageKey(key: string): string {
  return `${PREFIX}${key}`
}

/** Lit un instantané ; `null` s'il est absent, illisible ou trop vieux. */
export function readCache<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(storageKey(key))
    if (!raw) return null

    const entry = JSON.parse(raw) as CacheEntry<T>
    if (
      !entry ||
      typeof entry.at !== 'number' ||
      !Number.isFinite(entry.at) ||
      !('data' in entry)
    ) {
      return null
    }
    if (Date.now() - entry.at > MAX_AGE_MS) return null

    return entry
  } catch {
    // JSON corrompu ou localStorage indisponible : on ignore, sans casser.
    return null
  }
}

/**
 * Enregistre un instantané. Un quota plein ou un mode privé strict ne doit
 * jamais faire échouer une lecture réseau déjà réussie.
 */
export function writeCache<T>(key: string, data: T, at = Date.now()): void {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify({ at, data }))
    pruneOldEntries()
  } catch {
    // Cache best-effort.
  }
}

/**
 * Lecture avec repli hors ligne.
 *
 * - hors ligne : l'instantané est servi sans même tenter le réseau ;
 * - en ligne : la requête part, et son succès rafraîchit l'instantané ;
 * - si le réseau tombe **pendant** la requête, l'instantané prend le relais ;
 * - en ligne avec une erreur serveur, l'erreur remonte : on ne masque pas une
 *   panne réelle derrière des données périmées.
 */
export async function readThrough<T>(
  key: string,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = readCache<T>(key)

  if (!isOnline() && cached) {
    markRead(key, cached.at)
    return cached.data
  }

  try {
    const data = await fetcher()
    const at = Date.now()
    writeCache(key, data, at)
    markRead(key, at)
    return data
  } catch (error) {
    // `navigator.onLine` peut encore dire « en ligne » alors que la requête
    // vient d'échouer : on ne sert le cache que si l'appareil est bien hors
    // ligne, jamais pour couvrir une erreur serveur.
    if (!isOnline() && cached) {
      markRead(key, cached.at)
      return cached.data
    }
    throw error
  }
}

/** Supprime les instantanés trop vieux (et ceux d'une autre version). */
function pruneOldEntries(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(PREFIX)) keys.push(key)
    }

    const now = Date.now()
    for (const key of keys) {
      try {
        const entry = JSON.parse(localStorage.getItem(key) ?? 'null') as CacheEntry<unknown>
        if (!entry || typeof entry.at !== 'number' || now - entry.at > MAX_AGE_MS) {
          localStorage.removeItem(key)
        }
      } catch {
        localStorage.removeItem(key)
      }
    }
  } catch {
    // localStorage indisponible : rien à purger.
  }
}

/** Réservé aux tests : vide tous les instantanés. */
export function clearOfflineCacheForTests(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(PREFIX)) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    // Rien à faire.
  }
}
