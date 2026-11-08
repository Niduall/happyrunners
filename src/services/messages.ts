import { format, isSameDay, startOfDay, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Message, MessageReaction, ReactionKey } from '../types/supabase'

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
  // « Hier » se calcule par rapport à `now`, pas à l'horloge réelle :
  // sinon le libellé change selon le jour où les tests tournent.
  if (isSameDay(date, subDays(startOfDay(now), 1))) return 'Hier'

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

// ===== RÉACTIONS =====

/**
 * Palette fixe, dans l'ordre d'affichage.
 *
 * Une palette plutôt que le clavier complet : les pastilles sous la bulle
 * restent compactes, le rendu est identique sur iOS et Android, et il n'y a
 * pas de clavier à ouvrir/fermer au milieu du fil. Les clés sont stables en
 * base ; changer un emoji ne touche pas aux données.
 */
export const REACTION_KEYS = ['like', 'love', 'laugh', 'run', 'fire'] as const

export const REACTION_EMOJI: Record<ReactionKey, string> = {
  like: '👍',
  love: '❤️',
  laugh: '😂',
  run: '🏃',
  fire: '🔥',
}

/** Libellés lus par les lecteurs d'écran (l'emoji seul est ambigu). */
export const REACTION_LABELS: Record<ReactionKey, string> = {
  like: 'J’aime',
  love: 'J’adore',
  laugh: 'Ça me fait rire',
  run: 'On court',
  fire: 'Bravo',
}

export interface ReactionSummary {
  key: ReactionKey
  emoji: string
  label: string
  count: number
  /** La personne connectée a choisi cette réaction. */
  mine: boolean
  /** Qui a choisi cet emoji, par `user_number` croissant (liste stable). */
  userNumbers: number[]
}

/**
 * Résumé affiché sous la bulle : une entrée par emoji utilisé, dans l'ordre
 * de la palette, avec le nombre, le choix de la personne connectée et les
 * auteurs.
 *
 * Les auteurs sont triés par `user_number` : l'ordre renvoyé par la base n'est
 * pas garanti, et un tri stable évite que la liste « qui a réagi » change
 * d'ordre à chaque polling.
 *
 * Les réactions d'une personne absente (profil supprimé) ne comptent pas :
 * `ON DELETE CASCADE` les retire déjà côté base, ce filtre couvre l'intervalle
 * entre deux pollings.
 */
export function summarizeReactions(
  reactions: readonly MessageReaction[] | undefined,
  me: number | null
): ReactionSummary[] {
  const counts = new Map<
    ReactionKey,
    { count: number; mine: boolean; userNumbers: number[] }
  >()

  for (const reaction of reactions ?? []) {
    const current = counts.get(reaction.reaction) ?? {
      count: 0,
      mine: false,
      userNumbers: [],
    }
    current.count += 1
    if (me !== null && reaction.user_number === me) current.mine = true
    current.userNumbers.push(reaction.user_number)
    counts.set(reaction.reaction, current)
  }

  return REACTION_KEYS.flatMap((key) => {
    const entry = counts.get(key)
    if (!entry) return []
    return [{
      key,
      emoji: REACTION_EMOJI[key],
      label: REACTION_LABELS[key],
      count: entry.count,
      mine: entry.mine,
      userNumbers: [...entry.userNumbers].sort((a, b) => a - b),
    }]
  })
}

/**
 * Effet d'un appui sur `key` : choisir un autre emoji remplace le précédent,
 * réappuyer sur le même le retire (`null`).
 */
export function nextReaction(
  current: ReactionKey | undefined,
  key: ReactionKey
): ReactionKey | null {
  return current === key ? null : key
}

/**
 * Applique une réaction dans la liste locale, sans toucher au serveur.
 *
 * Sert à l'affichage optimiste et au retour arrière : la même fonction dans
 * les deux sens garantit que l'état restauré est exactement l'état d'avant.
 * Le type générique préserve les champs locaux (`status` d'un message en
 * cours d'envoi).
 */
export function withReaction<T extends Message>(
  messages: readonly T[],
  messageId: string,
  userNumber: number,
  reaction: ReactionKey | null
): T[] {
  return messages.map((message) => {
    if (message.id !== messageId) return message

    const others = (message.reactions ?? []).filter(
      (existing) => existing.user_number !== userNumber
    )
    const reactions = reaction
      ? [...others, { user_number: userNumber, reaction }]
      : others

    return { ...message, reactions }
  })
}
