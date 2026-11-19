/**
 * Lien « montre » — le jeton personnel qui autorise le téléphone à proposer
 * des sorties.
 *
 * ⚠️ Ce n'est **pas une authentification**. La RLS est ouverte et la clé anon
 * est dans le bundle ; quelqu'un qui connaît le jeton peut poster des sorties
 * pour ce profil, exactement comme il peut déjà en écrire une avec la clé
 * anon. Le jeton sert à ce que la montre d'une personne n'écrive pas chez une
 * autre, pas à prouver une identité.
 *
 * Le jeton en clair ne quitte jamais l'appareil : on n'envoie que son
 * empreinte SHA-256 en base (`device_links.token_hash`). L'Edge Function
 * `ingest` recalcule la même empreinte pour retrouver la personne.
 */

/** Préfixe des jetons stockés localement, un par profil et par appareil. */
const TOKEN_STORAGE_PREFIX = 'watch_token_'

/** 32 octets d'aléa : 256 bits, bien au-delà du besoin. */
const TOKEN_BYTES = 32

/** Nombre d'octets d'un SHA-256 en hexadécimal. */
export const WATCH_TOKEN_HASH_LENGTH = 64

export function watchTokenStorageKey(userNumber: number): string {
  return `${TOKEN_STORAGE_PREFIX}${userNumber}`
}

/**
 * Jeton aléatoire, encodé en base64url (sans `+`, `/` ni `=`) pour survivre
 * au copier-coller dans un champ d'URL.
 */
export function generateWatchToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Empreinte SHA-256 en hexadécimal.
 *
 * Doit rester identique à `sha256Hex` dans `supabase/functions/ingest` :
 * c'est la seule chose qui relie le jeton du téléphone à la ligne en base.
 */
export async function hashWatchToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token)
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** Adresse à coller dans l'application de santé du téléphone. */
export function buildWatchIngestUrl(token: string): string {
  const base = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
  return `${base}/functions/v1/ingest?t=${encodeURIComponent(token)}`
}

export function readStoredWatchToken(userNumber: number): string | null {
  try {
    return localStorage.getItem(watchTokenStorageKey(userNumber))
  } catch {
    return null
  }
}

export function storeWatchToken(userNumber: number, token: string): void {
  try {
    localStorage.setItem(watchTokenStorageKey(userNumber), token)
  } catch {
    // Mode privé saturé : le lien fonctionne quand même, il sera simplement
    // impossible à réafficher.
  }
}

export function clearStoredWatchToken(userNumber: number): void {
  try {
    localStorage.removeItem(watchTokenStorageKey(userNumber))
  } catch {
    // Rien à faire : le lien est de toute façon révoqué côté base.
  }
}
