import { type User } from '../types'

const STORAGE_KEYS = {
  USER: 'running_user',
} as const

export type { User }

// --- User ---
/**
 * Cache local de l'utilisateur. La source de vérité est Supabase
 * (user_profiles) ; ce cache permet un affichage hors ligne du prénom/nom.
 *
 * ⚠️ Migré depuis l'ancien format où `id` était une chaîne dérivée du nom
 * ("paulin_claudin"). Après le passage à `user_number` (entier), un cache
 * résiduel ferait échouer la lecture du profil en base (400 invalid input
 * syntax for type integer). On invalide donc tout cache dont l'id n'est pas
 * un entier : l'utilisateur repasse par l'écran de prénom/nom.
 */
export function getUser(): User | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.USER)
    if (!data) return null

    const parsed = JSON.parse(data) as User

    // Ancien format (id string) → invalider
    if (typeof parsed?.id !== 'number') {
      localStorage.removeItem(STORAGE_KEYS.USER)
      return null
    }

    return parsed
  } catch {
    localStorage.removeItem(STORAGE_KEYS.USER)
    return null
  }
}

export function setUser(user: User): void {
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user))
}

export function clearUser(): void {
  localStorage.removeItem(STORAGE_KEYS.USER)
}
