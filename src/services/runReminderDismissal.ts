/**
 * « Je n'ai pas couru » : couper le rappel de l'accueil sans rien écrire en base.
 *
 * Le rappel ne sert qu'à soi. Il n'apprend rien au groupe, et « pas de sortie
 * déclarée » veut déjà dire « n'a pas couru » pour les statistiques. Écrire une
 * ligne en base pour ça inventerait un fait que personne ne consulte.
 *
 * - Mémorisé dans `localStorage`, par appareil : sur un autre téléphone le
 *   rappel revient. C'est une gêne mineure, jamais une donnée fausse.
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
 * La personne a-t-elle déjà répondu « je n'ai pas couru » pour cette semaine
 * sur cet appareil ?
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
