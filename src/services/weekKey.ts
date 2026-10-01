/**
 * Clé de semaine pour le vote.
 *
 * Le cycle de vote va du jeudi au mercredi suivant (reset le jeudi matin,
 * run le mercredi midi). La clé returned est la date du mercredi cible,
 * au format "YYYY-MM-DD".
 *
 * Exemples (getDay : 0=dim, 3=mer, 4=jeu) :
 *   dimanche  → mercredi de la semaine en cours
 *   lundi      → mercredi de la semaine en cours
 *   mercredi   → aujourd'hui
 *   jeudi      → mercredi SUIVANT (nouveau cycle)
 *   vendredi   → mercredi suivant
 *   samedi     → mercredi suivant
 */

const MS_PER_DAY = 86_400_000

function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Nombre de jours jusqu'au mercredi cible (0 = aujourd'hui est mercredi) */
export function daysUntilWednesday(from: Date = new Date()): number {
  return (3 - from.getDay() + 7) % 7
}

/** Date du mercredi cible du cycle de vote en cours */
export function getTargetWednesday(from: Date = new Date()): Date {
  const target = new Date(from)
  target.setHours(12, 0, 0, 0) // midi, pour éviter les sauts d'heure DST
  target.setDate(target.getDate() + daysUntilWednesday(from))
  return target
}

/** Clé de semaine, format "YYYY-MM-DD" (ex: "2026-10-07") */
export function getCurrentWeekKey(from: Date = new Date()): string {
  return toISODate(getTargetWednesday(from))
}

/** Libellé lisible, ex: "semaine du 7 oct." */
export function formatWeekLabel(weekKey: string, locale = 'fr-FR'): string {
  const [y, m, d] = weekKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return `semaine du ${date.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`
}

/** true si la clé correspond au mercredi affiché (le jour du run) */
export function isRunDay(weekKey: string, from: Date = new Date()): boolean {
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
