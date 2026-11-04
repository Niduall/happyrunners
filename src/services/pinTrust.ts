/**
 * Confiance accordée à l'appareil après une saisie de PIN réussie.
 *
 * Le PIN protège le profil contre quelqu'un qui prend ton téléphone. Le
 * redemander à chaque ouverture de l'app est vite insupportable : on mémorise
 * donc localement que CET appareil a déjà prouvé le PIN de CE profil.
 *
 * - La confiance est liée au `user_number` : un autre profil sur le même
 *   téléphone devra saisir son propre PIN.
 * - Elle expire au bout de 30 jours : une personne qui reprend un téléphone
 *   perdu ne bénéficie pas d'un accès illimité.
 * - `localStorage` peut être indisponible : dans ce cas on redemande le PIN,
 *   sans jamais bloquer l'application.
 */

/** Clé locale : un seul profil de confiance par appareil. */
export const PIN_TRUST_KEY = 'happyrunners_pin_trust'

/** Durée de confiance à partir de la dernière saisie réussie. */
export const PIN_TRUST_DAYS = 30

const MS_PER_DAY = 86_400_000

interface TrustedDevice {
  userNumber: number
  verifiedAt: string
}

/** Lit le repère sans jamais faire échouer l'appelant. */
function read(): TrustedDevice | null {
  try {
    const raw = localStorage.getItem(PIN_TRUST_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<TrustedDevice>
    if (
      typeof parsed?.userNumber !== 'number' ||
      typeof parsed?.verifiedAt !== 'string'
    ) {
      return null
    }

    return { userNumber: parsed.userNumber, verifiedAt: parsed.verifiedAt }
  } catch {
    return null
  }
}

/**
 * Cet appareil a-t-il prouvé le PIN de ce profil il y a moins de 30 jours ?
 *
 * `now` est injectable pour les tests ; l'appelant n'a pas à le fournir.
 */
export function isDeviceTrusted(
  userNumber: number,
  now: Date = new Date()
): boolean {
  const saved = read()
  if (!saved || saved.userNumber !== userNumber) return false

  const verifiedAt = Date.parse(saved.verifiedAt)
  if (Number.isNaN(verifiedAt)) return false

  const age = now.getTime() - verifiedAt
  return age >= 0 && age < PIN_TRUST_DAYS * MS_PER_DAY
}

/** Mémorise que cet appareil vient de prouver le PIN de ce profil. */
export function trustDevice(userNumber: number, now: Date = new Date()): void {
  try {
    const saved: TrustedDevice = {
      userNumber,
      verifiedAt: now.toISOString(),
    }
    localStorage.setItem(PIN_TRUST_KEY, JSON.stringify(saved))
  } catch {
    // Sans stockage, le PIN sera simplement redemandé : acceptable.
  }
}

/** Oublie la confiance (déconnexion, changement d'appareil partagé). */
export function forgetDevice(): void {
  try {
    localStorage.removeItem(PIN_TRUST_KEY)
  } catch {
    // Rien à faire : le pire est de redemander le PIN.
  }
}
