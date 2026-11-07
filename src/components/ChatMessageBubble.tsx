import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Check, Copy, SmilePlus, Trash2 } from 'lucide-react'
import type { ChatMessage } from '../hooks/useMessages'
import {
  REACTION_EMOJI,
  REACTION_KEYS,
  REACTION_LABELS,
  formatMessageTime,
  summarizeReactions,
} from '../services/messages'
import type { ReactionKey } from '../types/supabase'
import { cn } from '../lib/utils'

/** Durée d'appui avant d'ouvrir la palette (standard des messageries). */
const LONG_PRESS_MS = 450

/** Un doigt qui bouge de plus de 8 px fait défiler : ce n'est pas un appui. */
const MOVE_TOLERANCE_PX = 8

/** Sous cette distance au haut de l'écran, la palette s'ouvre vers le bas. */
const FLIP_THRESHOLD_PX = 190

interface ChatMessageBubbleProps {
  message: ChatMessage
  isMine: boolean
  authorName: string
  /** Même auteur que le message précédent, à moins de cinq minutes. */
  grouped: boolean
  /** Identifiant de la personne connectée, pour marquer sa réaction. */
  me: number | null
  onDelete: () => void
  onRetry: () => void
  onReact: (reaction: ReactionKey) => void
}

/**
 * Une bulle du fil.
 *
 * Les messages de l'utilisateur sont à droite en accent, sans nom ni avatar :
 * il sait déjà que c'est lui. Les autres sont à gauche, avec le prénom une
 * seule fois par groupe de messages consécutifs.
 *
 * Réagir : appui long sur la bulle (comme dans les messageries), ou le petit
 * bouton smiley à côté de l'heure — indispensable au clavier et pour les
 * lecteurs d'écran, qui ne peuvent pas « appuyer longuement ».
 */
export function ChatMessageBubble({
  message,
  isMine,
  authorName,
  grouped,
  me,
  onDelete,
  onRetry,
  onReact,
}: ChatMessageBubbleProps) {
  const failed = message.status === 'failed'
  const sending = message.status === 'sending'
  // Un message pas encore enregistré n'a pas d'identifiant serveur : il ne
  // peut pas porter de réaction.
  const canReact = !message.status

  const [pickerOpen, setPickerOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const [copied, setCopied] = useState(false)

  const columnRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const firstReactionRef = useRef<HTMLButtonElement>(null)
  const focusOnOpenRef = useRef(false)
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressOriginRef = useRef<{ x: number; y: number } | null>(null)

  const reactions = summarizeReactions(message.reactions, me)
  const myReaction = message.reactions?.find(
    (reaction) => reaction.user_number === me
  )?.reaction

  function cancelPress() {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
    pressOriginRef.current = null
  }

  function openPicker(focusFirst: boolean) {
    const rect = columnRef.current?.getBoundingClientRect()
    // Près du haut, la palette sortirait de la zone visible : on la retourne.
    setDropUp((rect?.top ?? 0) < FLIP_THRESHOLD_PX)
    focusOnOpenRef.current = focusFirst
    setPickerOpen(true)
    setCopied(false)
  }

  function closePicker() {
    setPickerOpen(false)
    setCopied(false)
  }

  function chooseReaction(reaction: ReactionKey) {
    closePicker()
    onReact(reaction)
    // Rendre le focus au bouton d'origine : au clavier, on ne se retrouve pas
    // nulle part après un choix.
    triggerRef.current?.focus()
  }

  async function copyBody() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message.body)
      } else {
        // Repli pour les navigateurs sans Clipboard API (contexte non sûr).
        const textarea = document.createElement('textarea')
        textarea.value = message.body
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        textarea.remove()
      }
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  // Fermeture au clic extérieur et par Échap. Les écouteurs sont sur le
  // document : un appui long n'a pas forcément donné le focus à la palette.
  useEffect(() => {
    if (!pickerOpen) return

    if (focusOnOpenRef.current) {
      focusOnOpenRef.current = false
      firstReactionRef.current?.focus()
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        pickerRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return
      }
      setPickerOpen(false)
      setCopied(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setPickerOpen(false)
      setCopied(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [pickerOpen])

  // Un démontage pendant l'appui ne doit pas laisser un minuteur derrière lui.
  useEffect(
    () => () => {
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current)
    },
    []
  )

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!canReact) return
    // Bouton secondaire de la souris : ce n'est pas un appui long.
    if (event.pointerType === 'mouse' && event.button !== 0) return

    cancelPress()
    pressOriginRef.current = { x: event.clientX, y: event.clientY }
    pressTimerRef.current = setTimeout(() => {
      pressTimerRef.current = null
      pressOriginRef.current = null
      openPicker(false)
    }, LONG_PRESS_MS)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const origin = pressOriginRef.current
    if (!origin) return

    if (
      Math.abs(event.clientX - origin.x) > MOVE_TOLERANCE_PX ||
      Math.abs(event.clientY - origin.y) > MOVE_TOLERANCE_PX
    ) {
      cancelPress()
    }
  }

  function handleContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    if (!canReact) return
    // Sur Android, l'appui long déclenche aussi le menu natif : on le coupe.
    event.preventDefault()
    openPicker(false)
  }

  return (
    <div className={cn('group flex items-end gap-2', isMine && 'justify-end')}>
      {isMine && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Supprimer ce message"
          title="Supprimer"
          className="mb-5 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-400 opacity-60 transition-opacity hover:bg-error/10 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-error sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}

      {!isMine &&
        (grouped ? (
          <div className="w-8 shrink-0" aria-hidden="true" />
        ) : (
          <div
            aria-hidden="true"
            className="mb-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600"
          >
            {authorName.slice(0, 1).toUpperCase()}
          </div>
        ))}

      <div
        ref={columnRef}
        className={cn(
          'relative flex max-w-[78%] flex-col',
          isMine ? 'items-end' : 'items-start'
        )}
      >
        {!isMine && !grouped && (
          <p className="mb-1 px-1 text-xs font-medium text-gray-500">{authorName}</p>
        )}

        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={cancelPress}
          onPointerCancel={cancelPress}
          onPointerLeave={cancelPress}
          onContextMenu={handleContextMenu}
          className={cn(
            // Appui long = réaction : sur mobile, on désactive la sélection de
            // texte (sinon le navigateur ouvre son propre menu et ses poignées).
            'chat-message-text whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm',
            isMine
              ? 'rounded-br-md bg-accent text-white'
              : 'rounded-bl-md border border-gray-100 bg-white text-gray-900',
            sending && 'opacity-60'
          )}
        >
          {message.body}
        </div>

        {reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-2">
            {reactions.map((reaction) => (
              <button
                key={reaction.key}
                type="button"
                onClick={() => onReact(reaction.key)}
                aria-pressed={reaction.mine}
                aria-label={`${reaction.label}, ${reaction.count} ${
                  reaction.count > 1 ? 'personnes' : 'personne'
                }${reaction.mine ? ', votre réaction' : ''}`}
                className={cn(
                  // 36 px de haut, 44 px de cible grâce au pseudo-élément.
                  'relative flex min-h-9 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors after:absolute after:-inset-1 after:content-[""]',
                  reaction.mine
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                )}
              >
                <span aria-hidden="true" className="text-sm">
                  {reaction.emoji}
                </span>
                <span aria-hidden="true">{reaction.count}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-1 flex items-center gap-1 px-1">
          <span className="text-xs text-gray-400">
            {formatMessageTime(message.created_at)}
          </span>
          {sending && <span className="text-xs text-gray-400">Envoi…</span>}
          {failed && (
            <button
              type="button"
              onClick={onRetry}
              className="text-xs font-medium text-error underline-offset-2 hover:underline"
            >
              Non envoyé · Réessayer
            </button>
          )}
          {canReact && (
            <button
              ref={triggerRef}
              type="button"
              onClick={() => (pickerOpen ? closePicker() : openPicker(true))}
              aria-label={
                isMine
                  ? 'Réagir à votre message'
                  : `Réagir au message de ${authorName}`
              }
              aria-haspopup="true"
              aria-expanded={pickerOpen}
              className={cn(
                // 32 px de haut, 44 px de cible ; discret au repos.
                'relative flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors after:absolute after:-inset-1.5 after:content-[""] hover:bg-gray-100 hover:text-accent',
                pickerOpen && 'bg-gray-100 text-accent'
              )}
            >
              <SmilePlus className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {pickerOpen && (
          <div
            ref={pickerRef}
            role="group"
            aria-label="Choisir une réaction"
            className={cn(
              'absolute z-30 w-[236px] rounded-xl border border-gray-200 bg-white p-1 shadow-lg',
              isMine ? 'right-0' : 'left-0',
              dropUp ? 'top-full mt-2' : 'bottom-full mb-2'
            )}
          >
            <div className="flex items-center justify-between">
              {REACTION_KEYS.map((key, index) => (
                <button
                  key={key}
                  ref={index === 0 ? firstReactionRef : undefined}
                  type="button"
                  onClick={() => chooseReaction(key)}
                  aria-label={REACTION_LABELS[key]}
                  aria-pressed={myReaction === key}
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-lg text-xl transition-colors hover:bg-gray-100',
                    myReaction === key && 'bg-accent-light ring-1 ring-accent'
                  )}
                >
                  <span aria-hidden="true">{REACTION_EMOJI[key]}</span>
                </button>
              ))}
            </div>

            <div className="mt-1 border-t border-gray-100 pt-1">
              <button
                type="button"
                onClick={() => void copyBody()}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm text-gray-600 transition-colors hover:bg-gray-50"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-success" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
                {copied ? 'Message copié' : 'Copier le message'}
              </button>
            </div>

            <span role="status" className="sr-only">
              {copied ? 'Message copié' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
