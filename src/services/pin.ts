/**
 * Hash du PIN (4 chiffres) côté client.
 *
 * ⚠️ Ce n'est PAS du hachage sécurisé : c'est de l'obfuscation.
 * La clé est stockée en clair dans le payload Supabase (anon key, RLS ouverte).
 * C'est suffisant pour empêcher de voter à la place d'un collègue sur son
 * téléphone, pas pour une vraie authentification.
 *
 * Si un jour il faut une vraie sécurité : passer par Supabase Auth
 * (email + mot de passe) et hasher côté serveur avec bcrypt/argon2.
 */
export function hashPin(pin: string): string {
  let hash = 0
  for (let i = 0; i < pin.length; i++) {
    hash = ((hash << 5) - hash) + pin.charCodeAt(i)
    hash |= 0
  }
  return 'pin_' + Math.abs(hash).toString(36)
}
