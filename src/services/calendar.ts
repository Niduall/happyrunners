import { isoToEpoch } from './weatherApi'

/**
 * Fichier d'agenda (.ics) de la sortie du mercredi.
 *
 * L'heure est celle de Paris : `isoToEpoch` la convertit en UTC, puis l'ICS
 * porte des instants UTC (`...Z`). Aucun VTIMEZONE n'est nécessaire et le
 * rendez-vous reste correct au passage à l'heure d'été/hiver.
 */

/** Heure de départ du run, heure de Paris. */
export const RUN_HOUR = 12
export const RUN_MINUTE = 30

/** Durée prévue : le temps de courir, de revenir et de souffler. */
export const RUN_DURATION_MINUTES = 90

const ICS_LINE_MAX_BYTES = 74

export interface RunIcsOptions {
  /** Clé de semaine, ex. "2026-11-11". */
  weekKey: string
  /** URL de l'application, pour la description et le lien. */
  appUrl: string
  /** Instant de génération (injectable pour les tests). */
  now?: Date
}

/** Nom du fichier téléchargé. */
export function calendarFileName(weekKey: string): string {
  return `happyrunners-${weekKey}.ics`
}

/** Échappe une valeur texte selon la RFC 5545. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Pliable une ligne à 75 octets maximum, la suite commençant par une espace.
 * Le comptage se fait en octets UTF-8 : un prénom accentué ne doit pas
 * produire une ligne invalide.
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let current = ''

  for (const char of line) {
    if (encoder.encode(current + char).length > ICS_LINE_MAX_BYTES) {
      parts.push(current)
      current = char
    } else {
      current += char
    }
  }
  if (current) parts.push(current)

  return parts.join('\r\n ')
}

function toIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Construit le calendrier d'une semaine.
 *
 * L'UID est stable par semaine : réimporter le fichier met à jour le même
 * rendez-vous au lieu d'en créer un doublon dans l'agenda.
 */
export function buildRunIcs({
  weekKey,
  appUrl,
  now = new Date(),
}: RunIcsOptions): string {
  // `isoToEpoch` attend une heure murale de Paris et renvoie des secondes.
  const startSeconds = isoToEpoch(
    `${weekKey}T${String(RUN_HOUR).padStart(2, '0')}:${String(RUN_MINUTE).padStart(2, '0')}`
  )
  const start = new Date(startSeconds * 1000)
  const end = new Date((startSeconds + RUN_DURATION_MINUTES * 60) * 1000)
  const url = appUrl.replace(/[\r\n]/g, '')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HappyRunners//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:happyrunners-${weekKey}@happyrunners`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText('HappyRunners — Course du mercredi')}`,
    `DESCRIPTION:${escapeIcsText(
      `Course du mercredi à 12h30. Parcours et détails : ${url}`
    )}`,
    `URL:${url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return lines.map(foldIcsLine).join('\r\n') + '\r\n'
}

/**
 * Télécharge le fichier .ics. Le lien temporaire est révoqué aussitôt :
 * certains navigateurs mobiles ont besoin du clic dans la même tâche.
 */
export function downloadRunIcs({
  weekKey,
  appUrl,
}: Pick<RunIcsOptions, 'weekKey' | 'appUrl'>): string {
  const fileName = calendarFileName(weekKey)
  const blob = new Blob([buildRunIcs({ weekKey, appUrl })], {
    type: 'text/calendar;charset=utf-8',
  })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
  return fileName
}
