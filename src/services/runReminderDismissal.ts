/**
 * « Je n'ai pas couru » : repère local, en secours de la base.
 *
 * La réponse de référence vit dans `weekly_run_skips`, **par personne** : elle
 * suit la personne d'un téléphone à l'autre. Ce module ne garde qu'un repère
 * par appareil, pour deux cas :
 *
 * - la carte disparaît tout de suite, sans attendre le réseau ;
 * - la réponse tient même si l'écriture en base échoue (hors ligne).
 *
 * - Mémorisé dans `localStorage`, par appareil. Une réponse donnée sur un
 *   autre téléphone ne passe pas par ici : c'est la base qui la rapporte.
 * - **Une seule semaine par personne** : la carte ne vise qu'une semaine à la
 *   fois, donc la dernière réponse remplace la précédente et le repère ne
 *   grossit pas au fil des semaines.
 * - `localStorage` indisponible : le rappel reste affiché, rien ne casse.
 */

/** Clé locale : un numéro de profil → la semaine où le rappel a été coupé. */
export const RUN_REMINDER_KEY = 'happyrunners_run_reminder_dismissed'

type Dismissals = Record<string, string>

/** Lit le repère sans jamais faire échouer l'appelant. */
function read(): Dismissals {
  try {
    const raw = localStorage.getItem(RUN_REMINDER_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    const clean: Dismissals = {}
    for (const [userNumber, weekKey] of Object.entries(
      parsed as Record<string, unknown>
    )) {
      if (typeof weekKey === 'string' && weekKey !== '') {
        clean[userNumber] = weekKey
      }
    }
    return clean
  } catch {
    return {}
  }
}

/**
 * Le repère LOCAL dit-il « je n'ai pas couru » pour cette semaine ?
 *
 * Répond pour cet appareil seulement : la réponse de référence est en base
 * (`weekly_run_skips`), lue par `useLastRun`.
 */
export function isRunReminderDismissed(
  userNumber: number,
  weekKey: string
): boolean {
  return read()[String(userNumber)] === weekKey
}

/** Coupe le rappel pour cette semaine. La semaine suivante en aura un neuf. */
export function dismissRunReminder(userNumber: number, weekKey: string): void {
  try {
    const all = read()
    all[String(userNumber)] = weekKey
    localStorage.setItem(RUN_REMINDER_KEY, JSON.stringify(all))
  } catch {
    // Sans stockage, la carte revient au prochain chargement : acceptable.
  }
}

/**
 * Oublie la réponse locale d'une semaine.
 *
 * Une sortie déclarée la rend inutile — et si elle est retirée plus tard, le
 * rappel doit pouvoir revenir. On ne touche qu'à la semaine concernée : une
 * réponse mémorisée pour une autre semaine reste valable.
 */
export function clearRunReminderDismissal(
  userNumber: number,
  weekKey: string
): void {
  try {
    const all = read()
    if (all[String(userNumber)] !== weekKey) return
    delete all[String(userNumber)]
    localStorage.setItem(RUN_REMINDER_KEY, JSON.stringify(all))
  } catch {
    // Sans stockage, il n'y a rien à oublier.
  }
}
