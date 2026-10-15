/**
 * Code administrateur — verrouillage de la suppression et de la
 * modification des parcours.
 *
 * ⚠️ SÉCURITÉ : ce code vit dans une variable d'environnement, donc il est
 * lisible dans le bundle JavaScript par quiconque ouvre les outils de
 * développement. Il empêche la suppression accidentelle ou curieuse en un
 * clic ; ce n'est PAS une barrière contre une attaque délibérée (une clé
 * anon permet un fetch écrit à la main).
 *
 * Verrouillage réel → Supabase Auth (voir README § Sécurité).
 */

const STORAGE_KEY = 'happyrunners_admin_unlocked'

/**
 * Lit le code depuis la configuration de build.
 * Absent = aucun verrou : l'admin n'est bloqué nulle part.
 */
export function getAdminCode(): string | null {
  const code = import.meta.env.VITE_ADMIN_CODE
  return typeof code === 'string' && code.length > 0 ? code : null
}

/** Le verrou est-il configuré ? Sinon on n'affiche aucun cadenas. */
export function isAdminLockEnabled(): boolean {
  return getAdminCode() !== null
}

/**
 * Compare le code saisi.
 *
 * Comparaison à temps constant : évite qu'une mesure de temps révèle
 * le caractère attendu. Sans effet réel ici (le code est dans le bundle),
 * mais c'est le bon réflexe et ça ne coûte rien.
 */
export function verifyAdminCode(input: string): boolean {
  const expected = getAdminCode()
  if (expected === null) return false
  if (input.length !== expected.length) return false

  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= input.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

/**
 * L'admin est-il déverrouillé pour cet onglet ?
 *
 * `sessionStorage` et non `localStorage` : le verrouillage disparaît à la
 * fermeture de l'onglet. Avec localStorage, un téléphone qui reste ouvert
 * garderait l'accès admin indéfiniment.
 */
export function isAdminUnlocked(): boolean {
  // Pas de code configuré → pas de verrou à déverrouiller. On renvoie false
  // plutôt que de croire un sessionStorage résiduel : le code a été retiré
  // de la configuration, l'accès doit être considéré comme fermé.
  if (!isAdminLockEnabled()) return false

  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    // Mode privé strict, ou storage désactivé → considéré comme verrouillé
    return false
  }
}

export function setAdminUnlocked(value: boolean): void {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, '1')
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Sans storage, le verrouillage ne tient pas le temps de la session.
    // Mieux vaut l'appeler que de laisser l'accès ouvert.
  }
}