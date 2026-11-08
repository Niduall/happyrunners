/**
 * Marqueurs locaux de l'abonnement push, par appareil.
 *
 * Deux informations que la base ne peut pas porter, parce qu'elles décrivent
 * **cet appareil** et pas la personne :
 *
 *   - `optout` : la personne a explicitement désactivé les notifications ici.
 *     Sans ce drapeau, une resynchronisation au démarrage recréerait
 *     silencieusement l'abonnement qu'elle vient de retirer.
 *   - `user` : dernier profil abonné sur cet appareil. Il évite de créer un
 *     abonnement sans clic quand un autre profil se connecte sur un appareil
 *     où la permission du navigateur est déjà accordée.
 *
 * `localStorage` peut lever (navigation privée stricte, quota) : on ne laisse
 * jamais une erreur de stockage empêcher l'écran de s'afficher.
 */

const OPT_OUT_KEY = 'happyrunners_push_optout'
const USER_KEY = 'happyrunners_push_user'

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** La personne a-t-elle désactivé les notifications sur cet appareil ? */
export function isPushOptedOut(): boolean {
  return storage()?.getItem(OPT_OUT_KEY) === '1'
}

/** Mémorise un retrait explicite : la resynchronisation ne le défait pas. */
export function markPushOptedOut(): void {
  storage()?.setItem(OPT_OUT_KEY, '1')
}

/** Lève le retrait après une activation volontaire. */
export function clearPushOptOut(): void {
  storage()?.removeItem(OPT_OUT_KEY)
}

/** Dernier `user_number` abonné sur cet appareil, ou `null`. */
export function getPushDeviceUser(): number | null {
  const raw = storage()?.getItem(USER_KEY)
  if (!raw) return null
  const value = Number(raw)
  return Number.isInteger(value) ? value : null
}

/** Retient que cet appareil est abonné pour cette personne. */
export function markPushDeviceUser(userNumber: number): void {
  storage()?.setItem(USER_KEY, String(userNumber))
}

/** Oublie le profil abonné (désactivation, déconnexion). */
export function clearPushDeviceUser(): void {
  storage()?.removeItem(USER_KEY)
}
