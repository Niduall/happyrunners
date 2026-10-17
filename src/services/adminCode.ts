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
 *
 * ⚠️ Ce module ne mémorise RIEN. Le déverrouillage appartient à la page de
 * gestion des parcours (`ParcoursList`), qui le perd en quittant l'écran.
 * Il n'y a volontairement ni `sessionStorage` ni `localStorage` : un verrou
 * rangé dans le navigateur survivrait à la personne qui l'a ouvert.
 */

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
