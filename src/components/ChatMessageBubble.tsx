import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Check, Copy, Reply, SmilePlus, Trash2 } from 'lucide-react'
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
  /** `user_number` → prénom affiché, pour nommer les personnes qui ont réagi. */
  names: ReadonlyMap<number, string>
  onDelete: () => void
  onRetry: () => void
  onReact: (reaction: ReactionKey) => void
  /** Citer ce message dans la zone de saisie. */
  onReply: () => void
}

/**
 * Une bulle du fil.
 *
 * Les messages de l'utilisateur sont à droite en accent, sans nom ni avatar :
 * il sait déjà que c'est lui. Les autres sont à gauche, avec le prénom une
 * seule fois par groupe de messages consécutifs.
 *
 * Réagir : appui long sur la bulle (comme dans les messageries). Les messages
 * reçus ont en plus un bouton smiley à droite, affiché au survol ou au focus
 * clavier, pour ceux qui ne peuvent pas « appuyer longuement ». On ne réagit
 * presque jamais à ses propres messages : pas de bouton sur les siens, mais
 * l'appui long reste disponible.
 *
 * Voir qui a réagi : appui sur une pastille, comme sur WhatsApp. La liste
 * s'ouvre à la demande et ne prend aucune place au repos. Le tap ne bascule
 * donc plus la réaction : pour l'ajouter ou la retirer, on passe par la
 * palette, qui marque déjà l'emoji choisi.
 */
export function ChatMessageBubble({
  message,
  isMine,
  authorName,
  grouped,
  me,
  names,
  onDelete,
  onRetry,
  onReact,
  onReply,
}: ChatMessageBubbleProps) {
  const failed = message.status === 'failed'
  const sending = message.status === 'sending'
  // Un message pas encore enregistré n'a pas d'identifiant serveur : il ne
  // peut pas porter de réaction.
  const canReact = !message.status

  const [pickerOpen, setPickerOpen] = useState(false)
  const [reactorsKey, setReactorsKey] = useState<ReactionKey | null>(null)
  const [dropUp, setDropUp] = useState(false)
  const [copied, setCopied] = useState(false)

  const columnRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const reactorsRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const reactorsTriggerRef = useRef<HTMLButtonElement>(null)
  const firstReactionRef = useRef<HTMLButtonElement>(null)
  const focusOnOpenRef = useRef(false)
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressOriginRef = useRef<{ x: number; y: number } | null>(null)

  const reactions = summarizeReactions(message.reactions, me)
  const reactorsOpen = reactorsKey !== null
  const myReaction = message.reactions?.find(
    (reaction) => reaction.user_number === me
  )?.reaction

  // Auteur de la citation : l'instantané garde le numéro, le prénom vient de
  // l'annuaire déjà chargé par la page. Un profil supprimé laisse le texte,
  // sans nom : « Message cité » reste compréhensible.
  const replyAuthor =
    message.reply_to_user_number != null
      ? names.get(message.reply_to_user_number) ?? 'Quelqu’un'
      : 'Message cité'

  // Une ligne par personne (une seule réaction par personne et par message),
  // triée par prénom : la liste reste lisible et stable d'un polling à l'autre.
  const reactorRows = reactions
    .flatMap((reaction) =>
      reaction.userNumbers.map((userNumber) => ({
        userNumber,
        emoji: reaction.emoji,
        label: reaction.label,
      }))
    )
    .sort((a, b) => {
      const nameA = names.get(a.userNumber) ?? ''
      const nameB = names.get(b.userNumber) ?? ''
      return nameA.localeCompare(nameB, 'fr') || a.userNumber - b.userNumber
    })

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
    setReactorsKey(null)
    setCopied(false)
  }

  function closePicker() {
    setPickerOpen(false)
    setCopied(false)
  }

  function openReactors(key: ReactionKey, trigger: HTMLButtonElement) {
    const rect = columnRef.current?.getBoundingClientRect()
    setDropUp((rect?.top ?? 0) < FLIP_THRESHOLD_PX)
    reactorsTriggerRef.current = trigger
    setReactorsKey(key)
    setPickerOpen(false)
    setCopied(false)
  }

  function closeReactors(restoreFocus: boolean) {
    setReactorsKey(null)
    if (restoreFocus) reactorsTriggerRef.current?.focus()
  }

  function chooseReaction(reaction: ReactionKey) {
    closePicker()
    setReactorsKey(null)
    onReact(reaction)
    // Rendre le focus au bouton d'origine : au clavier, on ne se retrouve pas
    // nulle part après un choix.
    triggerRef.current?.focus()
  }

  function chooseReply() {
    closePicker()
    setReactorsKey(null)
    // La zone de saisie prend le focus d'elle-même quand la cible change.
    onReply()
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

  // Liste « qui a réagi » : même fermeture que la palette, mais le panneau
  // reçoit le focus pour que le clavier et les lecteurs d'écran y entrent.
  useEffect(() => {
    if (!reactorsOpen) return

    reactorsRef.current?.focus({ preventScroll: true })

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        reactorsRef.current?.contains(target) ||
        reactorsTriggerRef.current?.contains(target)
      ) {
        return
      }
      setReactorsKey(null)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setReactorsKey(null)
      reactorsTriggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [reactorsOpen])

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
    <div
      className={cn(
        'group flex gap-2',
        isMine ? 'items-end justify-end' : 'items-start'
      )}
    >
      {isMine && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Supprimer ce message"
          title="Supprimer"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-400 opacity-60 transition-opacity hover:bg-error/10 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-error sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
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
            className="mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600"
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

        <div className="relative">
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
              'chat-message-text flow-root rounded-2xl px-3 py-2 text-sm',
              isMine
                ? 'rounded-br-md bg-accent text-white'
                : 'rounded-bl-md border border-gray-100 bg-white text-gray-900',
              sending && 'opacity-60'
            )}
          >
            {message.reply_to_body && (
              <div
                className={cn(
                  // Citation : un bloc avant le texte, avec une barre à gauche
                  // comme dans les messageries. Le texte est un instantané :
                  // il reste lisible même si l'original a été purgé.
                  'mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs',
                  isMine
                    ? 'border-white/70 bg-white/15 text-white'
                    : 'border-accent/50 bg-gray-50 text-gray-600'
                )}
              >
                <p
                  className={cn(
                    'font-medium',
                    isMine ? 'text-white' : 'text-accent'
                  )}
                >
                  {replyAuthor}
                </p>
                <p className="line-clamp-2 whitespace-pre-wrap break-words">
                  {message.reply_to_body}
                </p>
              </div>
            )}

            <span className="whitespace-pre-wrap break-words">
              {message.body}
            </span>
            <span
              className={cn(
                // Métadonnée : 10 px, seule exception à la règle des 12 px.
                // Elle flotte sur la dernière ligne, comme sur WhatsApp : sa
                // place est réservée à droite du texte, sans seconde ligne.
                'float-right ml-2 mt-1 translate-y-0.5 text-[10px] leading-none',
                isMine ? 'text-white' : 'text-gray-500'
              )}
            >
              {formatMessageTime(message.created_at)}
            </span>
          </div>

          {canReact && !isMine && (
            <button
              ref={triggerRef}
              type="button"
              onClick={() => (pickerOpen ? closePicker() : openPicker(true))}
              aria-label={`Réagir au message de ${authorName}`}
              aria-haspopup="true"
              aria-expanded={pickerOpen}
              className={cn(
                // Design de la prod : 32 px, 44 px de cible. Au repos il est
                // invisible et non cliquable (mobile) ; il apparaît au survol
                // ou au focus clavier, et reste affiché tant que la palette est
                // ouverte.
                'absolute bottom-0 -right-9 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors after:absolute after:-inset-1.5 after:content-[""] hover:bg-gray-100 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                pickerOpen
                  ? 'pointer-events-auto bg-gray-100 text-accent opacity-100'
                  : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100'
              )}
            >
              <SmilePlus className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {reactions.length > 0 && (
          <div
            className={cn(
              // Comme sur WhatsApp : la pastille chevauche le bord bas de la
              // bulle et se cale sur son coin extérieur (gauche pour un message
              // reçu, droite pour le sien), avec un anneau de la couleur du fond
              // pour la détacher de la bulle.
              'relative z-10 -mt-2 flex flex-wrap gap-2',
              isMine ? 'self-end mr-2' : 'self-start ml-2'
            )}
          >
            {reactions.map((reaction) => (
              <button
                key={reaction.key}
                type="button"
                onClick={(event) => {
                  // Comme sur WhatsApp : la pastille sert à voir qui a réagi.
                  // Ajouter ou retirer sa réaction passe par la palette.
                  if (reactorsKey === reaction.key) closeReactors(true)
                  else openReactors(reaction.key, event.currentTarget)
                }}
                aria-haspopup="dialog"
                aria-expanded={reactorsKey === reaction.key}
                aria-label={`${reaction.label}, ${reaction.count} ${
                  reaction.count > 1 ? 'personnes' : 'personne'
                }${reaction.mine ? ', votre réaction' : ''}`}
                className={cn(
                  // 36 px de haut, 44 px de cible grâce au pseudo-élément.
                  // L'anneau reprend la couleur du fond du chat : la pastille
                  // posée sur le bord de la bulle paraît découpée, comme sur
                  // WhatsApp.
                  'relative flex min-h-9 items-center gap-1 rounded-full border px-2.5 text-xs font-medium ring-2 ring-gray-50 transition-colors after:absolute after:-inset-1 after:content-[""]',
                  reaction.mine
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                  reactorsKey === reaction.key && 'ring-accent/30'
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

        {(sending || failed) && (
          <div className="mt-1 flex items-center gap-1 px-1">
            {sending && <span className="text-xs text-gray-500">Envoi…</span>}
            {failed && (
              <button
                type="button"
                onClick={onRetry}
                className="text-xs font-medium text-error underline-offset-2 hover:underline"
              >
                Non envoyé · Réessayer
              </button>
            )}
          </div>
        )}

        {pickerOpen && (
          <div
            ref={pickerRef}
            role="group"
            aria-label="Actions du message"
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
                onClick={chooseReply}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm text-gray-600 transition-colors hover:bg-gray-50"
              >
                <Reply className="h-4 w-4" aria-hidden="true" />
                Répondre
              </button>
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

        {reactorsOpen && (
          <div
            ref={reactorsRef}
            role="dialog"
            aria-label="Personnes ayant réagi"
            tabIndex={-1}
            className={cn(
              'absolute z-30 w-[248px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg outline-none',
              isMine ? 'right-0' : 'left-0',
              dropUp ? 'top-full mt-2' : 'bottom-full mb-2'
            )}
          >
            <p className="px-3 pt-2 pb-1 text-xs font-medium text-gray-500">
              Qui a réagi ?
            </p>
            <ul className="max-h-56 overflow-y-auto pb-1">
              {reactorRows.map((row) => {
                const name = names.get(row.userNumber) ?? 'Quelqu’un'
                return (
                  <li
                    key={row.userNumber}
                    className="flex items-center gap-2 px-3 py-2 text-sm"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600"
                    >
                      {name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-gray-900">
                      {name}
                      {row.userNumber === me && (
                        <span className="text-gray-500"> (vous)</span>
                      )}
                    </span>
                    <span aria-hidden="true" className="shrink-0 text-base">
                      {row.emoji}
                    </span>
                    <span className="sr-only">{row.label}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
