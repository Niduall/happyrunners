/**
 * Cible du prochain run : le mercredi le plus proche, ou le mercredi suivant
 * si on est déjà le mercredi après 14h (le run de la journée est terminé).
 *
 * Cycle : mercredi 14h → mercredi 14h suivant.
 * Le run a lieu le mercredi à 12h30 ; à 14h on bascule sur le suivant.
 *
 * Exemples (getDay : 0=dim, 3=mer) :
 *   dimanche   → mercredi de la semaine en cours
 *   lundi       → mercredi de la semaine en cours
 *   mardi       → mercredi en cours
 *   mercredi 10h → mercredi AUJOURD'HUI (le run est en cours)
 *   mercredi 14h → mercredi SUIVANT (bascule)
 *   mercredi 23h → mercredi suivant
 *   jeudi       → mercredi suivant
 */

const MS_PER_DAY = 86_400_000

/** Heure locale de bascule (le run de 12h30 est terminé) */
const SWITCH_HOUR = 14

function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Nombre de jours jusqu'au mercredi cible.
 * 0 = aujourd'hui est le mercredi cible.
 */
export function daysUntilTargetWednesday(from: Date = new Date()): number {
  const days = (3 - from.getDay() + 7) % 7
  // Mercredi après 14h : le run d'aujourd'hui est fini, on vise le suivant.
  if (from.getDay() === 3 && from.getHours() >= SWITCH_HOUR) {
    return days + 7
  }
  return days
}

/** Date du mercredi cible du cycle en cours */
export function getTargetWednesday(from: Date = new Date()): Date {
  const target = new Date(from)
  target.setHours(12, 0, 0, 0) // midi, pour éviter les sauts d'heure DST
  target.setDate(target.getDate() + daysUntilTargetWednesday(from))
  return target
}

/**
 * Clé de semaine (format "YYYY-MM-DD"), ex: "2026-10-07".
 * ⚠️ Calculating with the user's local timezone. If someone votes from
 * another timezone on the day of the run, the switch could happen at the
 * wrong hour for them.
 */
export function getCurrentWeekKey(from: Date = new Date()): string {
  return toISODate(getTargetWednesday(from))
}

/** Libellé lisible, ex: "semaine du 7 oct." */
export function formatWeekLabel(weekKey: string, locale = 'fr-FR'): string {
  const [y, m, d] = weekKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return `semaine du ${date.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`
}

/**
 * true si on est le jour du run.
 * ⚠️ Le mercredi après 14h on a déjà basculé, donc c'est faux même si la
 * clé correspond encore à la date du jour.
 */
export function isRunDay(weekKey: string, from: Date = new Date()): boolean {
  if (from.getDay() === 3 && from.getHours() >= SWITCH_HOUR) return false
  return weekKey === toISODate(from)
}

/** Nombre de semaines entre deux clés (utile pour l'historique) */
export function weeksBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number)
  const [ty, tm, td] = toKey.split('-').map(Number)
  const a = Date.UTC(fy, fm - 1, fd)
  const b = Date.UTC(ty, tm - 1, td)
  return Math.round((b - a) / (7 * MS_PER_DAY))
}

export { SWITCH_HOUR }
