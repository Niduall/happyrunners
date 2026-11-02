import { format, isSameDay, isYesterday } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Message } from '../types/supabase'

/**
 * Logique pure du fil de discussion : fenêtre de rétention, validation,
 * regroupement par jour, comptage des non-lus.
 *
 * Séparée du hook et des requêtes pour être testable sans Supabase ni React.
 */

/**
 * Durée de conservation. La fenêtre est GLISSANTE : un message du mercredi
 * précédent reste visible le mardi suivant, puis sort de lui-même.
 *
 * 30 jours plutôt que 7 : le chat remplace le groupe de messagerie du club,
 * il doit rester possible de retrouver « qui avait proposé ce parcours ».
 */
export const MESSAGE_RETENTION_DAYS = 30

/** Longueur maximale, identique au CHECK de la table `messages`. */
export const MAX_MESSAGE_LENGTH = 500

/** Clé localStorage de la dernière lecture (par appareil, pas par compte). */
export const MESSAGES_LAST_READ_KEY = 'happyrunners_messages_last_read'

const MS_PER_DAY = 86_400_000

/**
 * Date plancher de la fenêtre, au format ISO.
 *
 * C'est la même valeur qui sert à lire ( `created_at >= cutoff` ) et à purger
 * ( `created_at < cutoff` ) : les deux bornes ne peuvent pas diverger.
 */
export function retentionCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - MESSAGE_RETENTION_DAYS * MS_PER_DAY).toISOString()
}

/**
 * Nettoie un message avant envoi.
 *
 * - fins de ligne Windows → Unix, pour un comptage stable ;
 * - plus de deux sauts de ligne consécutifs → deux, pour éviter les messages
 *   qui ne sont que du vide ;
 * - espaces de début et de fin retirés.
 *
 * Les sauts de ligne simples sont CONSERVÉS : `Maj+Entrée` doit rester utile.
 */
export function normalizeMessageBody(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Un message est valide s'il reste au moins un caractère une fois nettoyé et
 * qu'il ne dépasse pas la limite de la base.
 */
export function isValidMessageBody(raw: string): boolean {
  const body = normalizeMessageBody(raw)
  return body.length > 0 && body.length <= MAX_MESSAGE_LENGTH
}

export interface MessageDay {
  /** Clé stable `yyyy-MM-dd`, utilisable comme `key` React. */
  key: string
  /** « Aujourd'hui », « Hier », « Mardi 28 octobre ». */
  label: string
  messages: Message[]
}

/**
 * Regroupe les messages par jour calendaire, du plus ancien au plus récent.
 *
 * Un fil de chat se lit dans l'ordre chronologique : les messages arrivent
 * triés, le regroupement ne doit pas les retourner.
 */
export function groupMessagesByDay(
  messages: Message[],
  now: Date = new Date()
): MessageDay[] {
  const sorted = [...messages].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
  )

  const days: MessageDay[] = []

  for (const message of sorted) {
    const date = new Date(message.created_at)
    const last = days[days.length - 1]

    if (last && last.key === format(date, 'yyyy-MM-dd')) {
      last.messages.push(message)
      continue
    }

    days.push({
      key: format(date, 'yyyy-MM-dd'),
      label: dayLabel(date, now),
      messages: [message],
    })
  }

  return days
}

/** Libellé d'un séparateur de jour. */
export function dayLabel(date: Date, now: Date = new Date()): string {
  if (isSameDay(date, now)) return 'Aujourd’hui'
  if (isYesterday(date)) return 'Hier'

  const label = format(date, 'EEEE d MMMM', { locale: fr })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** Heure d'envoi, format 24 h. */
export function formatMessageTime(createdAt: string): string {
  return format(new Date(createdAt), 'HH:mm')
}

/**
 * Nombre de messages non lus.
 *
 * - `lastReadAt` absent = première visite : on n'affiche pas 30 jours de
 *   messages comme « non lus », seulement la pastille à zéro ;
 * - ses propres messages ne comptent jamais comme non lus.
 */
export function countUnread(
  messages: Message[],
  lastReadAt: string | null,
  me: number | null
): number {
  if (!lastReadAt) return 0
  const readAt = Date.parse(lastReadAt)

  return messages.filter(
    (message) =>
      message.user_number !== me && Date.parse(message.created_at) > readAt
  ).length
}

/**
 * Dernière lecture, enregistrée localement.
 *
 * `localStorage` peut être indisponible (navigation privée stricte, quota) :
 * le chat doit continuer à fonctionner, quitte à ne pas mémoriser la lecture.
 */
export function readLastRead(): string | null {
  try {
    return localStorage.getItem(MESSAGES_LAST_READ_KEY)
  } catch {
    return null
  }
}

export function writeLastRead(iso: string): void {
  try {
    localStorage.setItem(MESSAGES_LAST_READ_KEY, iso)
  } catch {
    // Sans stockage, la pastille se recalcule à chaque visite : acceptable.
  }
}
