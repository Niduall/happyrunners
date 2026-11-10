import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteMessage,
  getRecentMessages,
  purgeOldMessages,
  removeMessageReaction,
  sendMessage,
  setMessageReaction,
} from '../services/supabaseService'
import {
  MAX_MESSAGE_LENGTH,
  countUnread,
  nextReaction,
  normalizeMessageBody,
  readLastRead,
  retentionCutoff,
  withReaction,
  writeLastRead,
  type ReplyTarget,
} from '../services/messages'
import type { Message, ReactionKey } from '../types/supabase'

/**
 * Le chat est le seul écran où 30 s d'attente se voient. Cinq secondes est un
 * compromis : la conversation paraît vivante sans marteler la base. En
 * arrière-plan, on retombe sur le rythme habituel du projet.
 */
export const CHAT_POLL_MS = 5000
export const CHAT_HIDDEN_POLL_MS = 30000

/** Marqueur local d'un message pas encore confirmé par le serveur. */
export type MessageStatus = 'sending' | 'failed'

export type ChatMessage = Message & { status?: MessageStatus }

export interface UseMessagesOptions {
  pollMs?: number
  hiddenPollMs?: number
}

function sortByCreatedAt(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
  )
}

/**
 * Fil de discussion : chargement, polling adapté à la visibilité, envoi
 * optimiste, suppression, non-lus et purge de la fenêtre de rétention.
 *
 * `userNumber` est l'auteur des messages que l'on écrit. Il peut être `null`
 * (visiteur non identifié) : la lecture reste possible, l'envoi est refusé.
 */
export function useMessages(
  userNumber: number | null,
  options: UseMessagesOptions = {}
) {
  const { pollMs = CHAT_POLL_MS, hiddenPollMs = CHAT_HIDDEN_POLL_MS } = options

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastReadAt, setLastReadAt] = useState<string | null>(() => readLastRead())

  const requestIdRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tempIdRef = useRef(0)
  /**
   * Toute écriture locale incrémente ce compteur. Une réponse de polling
   * partie AVANT l'écriture est ignorée : elle ne connaît pas encore le
   * message qu'on vient d'envoyer et l'effacerait de l'écran.
   */
  const mutationRef = useRef(0)
  const messagesRef = useRef<ChatMessage[]>([])
  const pollMsRef = useRef(pollMs)
  const hiddenPollMsRef = useRef(hiddenPollMs)

  pollMsRef.current = pollMs
  hiddenPollMsRef.current = hiddenPollMs

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    // Deux chargements peuvent se chevaucher (polling + retour sur l'onglet) :
    // seule la réponse la plus récente écrit l'état.
    const requestId = ++requestIdRef.current
    const mutationsAtStart = mutationRef.current
    const isStale = () =>
      requestId !== requestIdRef.current || mutationRef.current !== mutationsAtStart

    // ⚠️ Les rafraîchissements de fond ne doivent pas afficher le spinner.
    if (!opts?.silent) setLoading(true)

    try {
      const rows = await getRecentMessages(retentionCutoff())
      if (isStale()) return

      // Les messages en cours d'envoi ou en échec n'existent pas encore côté
      // serveur : le polling ne doit pas les faire disparaître.
      setMessages((prev) => {
        const pending = prev.filter((message) => message.status)
        return [...rows, ...pending]
      })
      setError(null)
    } catch (err) {
      if (isStale()) return
      setError(
        err instanceof Error ? err.message : 'Impossible de charger les messages'
      )
    } finally {
      if (!isStale()) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()

    // La purge n'a pas besoin d'être planifiée : un DELETE conditionnel au
    // chargement du chat suffit, et ne fait rien s'il n'y a rien à purger.
    void purgeOldMessages(retentionCutoff()).catch(() => {})

    const schedule = () => {
      if (timerRef.current) clearInterval(timerRef.current)
      const delay =
        document.visibilityState === 'hidden'
          ? hiddenPollMsRef.current
          : pollMsRef.current
      timerRef.current = setInterval(() => {
        void load({ silent: true })
      }, delay)
    }

    schedule()

    const onVisibilityChange = () => {
      // Retour sur l'onglet : on rafraîchit tout de suite, puis on reprend le
      // rythme rapide. En arrière-plan, le minuteur passe à 30 s.
      if (document.visibilityState === 'visible') void load({ silent: true })
      schedule()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [load])

  /**
   * Avance la dernière lecture sans jamais la reculer.
   *
   * On enregistre l'heure **serveur** du message enregistré : l'horloge de
   * l'appareil peut être en retard de quelques centaines de millisecondes, et
   * comparer cette heure locale au `created_at` serveur rallumait la pastille
   * après chaque envoi.
   */
  const markReadAt = useCallback((iso: string) => {
    const current = readLastRead()
    if (current && Date.parse(current) >= Date.parse(iso)) return
    writeLastRead(iso)
    setLastReadAt(iso)
  }, [])

  const send = useCallback(
    async (raw: string, replyTo: ReplyTarget | null = null): Promise<boolean> => {
      const body = normalizeMessageBody(raw)
      if (!userNumber || body.length === 0 || body.length > MAX_MESSAGE_LENGTH) {
        return false
      }

      const temp: ChatMessage = {
        id: `pending-${++tempIdRef.current}`,
        user_number: userNumber,
        body,
        created_at: new Date().toISOString(),
        status: 'sending',
        // Instantané de la citation : l'aperçu s'affiche dès l'envoi, sans
        // attendre la réponse du serveur ni dépendre de l'original.
        reply_to_id: replyTo?.id ?? null,
        reply_to_body: replyTo?.body ?? null,
        reply_to_user_number: replyTo?.userNumber ?? null,
      }

      setMessages((prev) => [...prev, temp])

      try {
        const saved = await sendMessage({ userNumber, body, replyTo })
        mutationRef.current += 1
        setMessages((prev) =>
          sortByCreatedAt(prev.map((m) => (m.id === temp.id ? saved : m)))
        )
        // Envoyer un message, c'est l'avoir lu : la pastille de l'accueil ne
        // doit pas s'allumer pour son propre message.
        markReadAt(saved.created_at)
        return true
      } catch {
        setMessages((prev) =>
          prev.map((m) => (m.id === temp.id ? { ...m, status: 'failed' } : m))
        )
        return false
      }
    },
    [userNumber, markReadAt]
  )

  /** Renvoie un message en échec. Sans effet sur un message déjà parti. */
  const retry = useCallback(async (id: string): Promise<boolean> => {
    const target = messagesRef.current.find(
      (message) => message.id === id && message.status === 'failed'
    )
    if (!target) return false

    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: 'sending' } : m))
    )

    try {
      const saved = await sendMessage({
        userNumber: target.user_number,
        body: target.body,
        // Le réessai conserve la citation : sans elle, le message partirait
        // sans l'aperçu que la personne avait choisie.
        replyTo:
          target.reply_to_body && target.reply_to_user_number != null
            ? {
                id: target.reply_to_id ?? null,
                body: target.reply_to_body,
                userNumber: target.reply_to_user_number,
              }
            : null,
      })
      mutationRef.current += 1
      setMessages((prev) =>
        sortByCreatedAt(prev.map((m) => (m.id === id ? saved : m)))
      )
      markReadAt(saved.created_at)
      return true
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: 'failed' } : m))
      )
      return false
    }
  }, [markReadAt])

  /**
   * Supprime un message. Retiré tout de suite de l'écran ; restauré à sa place
   * si le serveur refuse, pour ne pas laisser croire à une suppression.
   */
  const remove = useCallback(async (id: string): Promise<boolean> => {
    const target = messagesRef.current.find((message) => message.id === id)
    if (!target) return false

    setMessages((prev) => prev.filter((message) => message.id !== id))

    try {
      await deleteMessage(id)
      mutationRef.current += 1
      return true
    } catch {
      setMessages((prev) =>
        prev.some((message) => message.id === id)
          ? prev
          : sortByCreatedAt([...prev, target])
      )
      return false
    }
  }, [])

  /**
   * Ajoute, remplace ou retire la réaction de la personne connectée.
   *
   * Bascule optimiste : la pastille change au doigt levé, puis le serveur est
   * prévenu. En cas d'échec, l'état d'avant est restauré — sans quoi on
   * laisserait croire que la réaction est enregistrée.
   *
   * Un message encore en cours d'envoi n'a pas d'identifiant serveur : il ne
   * peut pas recevoir de réaction.
   */
  const react = useCallback(
    async (messageId: string, key: ReactionKey): Promise<boolean> => {
      if (!userNumber) return false

      const target = messagesRef.current.find(
        (message) => message.id === messageId
      )
      if (!target || target.status) return false

      const previous = target.reactions?.find(
        (reaction) => reaction.user_number === userNumber
      )?.reaction
      const next = nextReaction(previous, key)

      // Invalide les pollings déjà partis : leur réponse ne connaît pas
      // encore ce choix et le ferait disparaître.
      mutationRef.current += 1
      setMessages((prev) => withReaction(prev, messageId, userNumber, next))

      try {
        if (next) {
          await setMessageReaction({ messageId, userNumber, reaction: next })
        } else {
          await removeMessageReaction({ messageId, userNumber })
        }
        mutationRef.current += 1
        return true
      } catch {
        setMessages((prev) =>
          withReaction(prev, messageId, userNumber, previous ?? null)
        )
        mutationRef.current += 1
        return false
      }
    },
    [userNumber]
  )

  /** Marque tout ce qui est affiché comme lu (chat ouvert). */
  const markAllRead = useCallback(() => {
    const newest = messagesRef.current.reduce<string | null>((latest, message) => {
      if (!latest) return message.created_at
      return Date.parse(message.created_at) > Date.parse(latest)
        ? message.created_at
        : latest
    }, null)

    const iso = newest ?? new Date().toISOString()
    writeLastRead(iso)
    setLastReadAt(iso)
  }, [])

  const refresh = useCallback(() => load({ silent: true }), [load])

  const unreadCount = useMemo(
    () => countUnread(messages, lastReadAt, userNumber),
    [messages, lastReadAt, userNumber]
  )

  return {
    messages,
    loading,
    error,
    unreadCount,
    send,
    retry,
    remove,
    react,
    markAllRead,
    refresh,
  }
}
