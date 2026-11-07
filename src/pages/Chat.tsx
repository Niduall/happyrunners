import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useMessages } from '../hooks/useMessages'
import { useProfiles } from '../hooks/useProfiles'
import { groupMessagesByDay } from '../services/messages'
import { Button } from '../components/ui/Button'
import { ChatMessageBubble } from '../components/ChatMessageBubble'
import { ChatComposer } from '../components/ChatComposer'

/** Deux messages du même auteur à moins de 5 min forment un groupe visuel. */
const GROUP_WINDOW_MS = 5 * 60 * 1000

/** Distance au bas en dessous de laquelle on suit les nouveaux messages. */
const FOLLOW_THRESHOLD_PX = 120

export function Chat() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const me = user?.id ?? null

  const { messages, loading, error, send, retry, remove, react, markAllRead } =
    useMessages(me)
  const { profiles } = useProfiles(true)

  const names = useMemo(() => {
    // Deux personnes peuvent partager un prénom (le groupe a deux Julie) :
    // on ajoute alors l'initiale du nom, sinon les bulles sont indiscernables.
    const firstNames = new Map<string, number>()
    for (const profile of profiles) {
      firstNames.set(profile.first_name, (firstNames.get(profile.first_name) ?? 0) + 1)
    }

    return new Map(
      profiles.map((profile) => {
        const duplicate = (firstNames.get(profile.first_name) ?? 0) > 1
        const label = duplicate
          ? `${profile.first_name} ${profile.last_name.slice(0, 1).toUpperCase()}.`
          : profile.first_name
        return [profile.user_number, label]
      })
    )
  }, [profiles])

  const days = useMemo(() => groupMessagesByDay(messages), [messages])

  const listRef = useRef<HTMLDivElement>(null)
  const [hasNew, setHasNew] = useState(false)
  const initialScrollRef = useRef(true)
  const previousCountRef = useRef(0)

  const scrollToBottom = useCallback(() => {
    const element = listRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
    setHasNew(false)
  }, [])

  useLayoutEffect(() => {
    if (loading) return
    const element = listRef.current
    if (!element) return

    // Premier affichage : on arrive en bas du fil, comme dans un chat.
    if (initialScrollRef.current) {
      element.scrollTop = element.scrollHeight
      initialScrollRef.current = false
      previousCountRef.current = messages.length
      return
    }

    if (messages.length > previousCountRef.current) {
      const nearBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight <
        FOLLOW_THRESHOLD_PX
      const last = messages[messages.length - 1]

      // On ne saute pas à l'écran si la personne lisait plus haut, sauf si
      // c'est elle qui vient d'envoyer.
      if (nearBottom || last?.user_number === me) scrollToBottom()
      else setHasNew(true)
    }

    previousCountRef.current = messages.length
  }, [messages, me, loading, scrollToBottom])

  // Le chat ouvert vaut lecture : la pastille de l'accueil doit s'éteindre.
  useEffect(() => {
    if (!loading) markAllRead()
  }, [messages.length, loading, markAllRead])

  return (
    <div className="flex h-dvh flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            aria-label="Retour à l'accueil"
            className="shrink-0 px-2 sm:px-3"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">Accueil</span>
          </Button>

          <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-primary">
            Messages
          </h1>

          <span className="shrink-0 text-xs text-gray-500">30 derniers jours</span>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="shrink-0 border-b border-error/20 bg-error/5 px-4 py-2 text-center text-sm text-error"
        >
          {error}
        </p>
      )}

      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label="Messages du groupe"
        className="flex-1 overflow-y-auto"
      >
        <div className="mx-auto max-w-3xl space-y-3 px-4 py-4">
          {loading && messages.length === 0 && (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
            </div>
          )}

          {!loading && messages.length === 0 && (
            <p className="py-16 text-center text-sm text-gray-500">
              Aucun message pour l’instant.
              <br />
              Lance la conversation.
            </p>
          )}

          {days.map((day) => (
            <section key={day.key} aria-label={day.label}>
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200" aria-hidden="true" />
                <span className="text-xs text-gray-500">{day.label}</span>
                <div className="h-px flex-1 bg-gray-200" aria-hidden="true" />
              </div>

              <div className="space-y-2">
                {day.messages.map((message, index) => {
                  const previous = day.messages[index - 1]
                  const grouped = Boolean(
                    previous &&
                      previous.user_number === message.user_number &&
                      Date.parse(message.created_at) -
                        Date.parse(previous.created_at) <
                        GROUP_WINDOW_MS
                  )

                  return (
                    <ChatMessageBubble
                      key={message.id}
                      message={message}
                      isMine={message.user_number === me}
                      authorName={names.get(message.user_number) ?? 'Quelqu’un'}
                      grouped={grouped}
                      me={me}
                      onDelete={() => void remove(message.id)}
                      onRetry={() => void retry(message.id)}
                      onReact={(reaction) => void react(message.id, reaction)}
                    />
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {hasNew && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="fixed bottom-24 left-1/2 z-20 min-h-11 -translate-x-1/2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white shadow-lg"
        >
          Nouveau message
        </button>
      )}

      <div className="shrink-0 border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <ChatComposer
            canWrite={Boolean(user)}
            onSend={send}
            onIdentify={() => navigate('/')}
          />
        </div>
      </div>
    </div>
  )
}
