import { Trash2 } from 'lucide-react'
import type { ChatMessage } from '../hooks/useMessages'
import { formatMessageTime } from '../services/messages'
import { cn } from '../lib/utils'

interface ChatMessageBubbleProps {
  message: ChatMessage
  isMine: boolean
  authorName: string
  /** Même auteur que le message précédent, à moins de cinq minutes. */
  grouped: boolean
  onDelete: () => void
  onRetry: () => void
}

/**
 * Une bulle du fil.
 *
 * Les messages de l'utilisateur sont à droite en accent, sans nom ni avatar :
 * il sait déjà que c'est lui. Les autres sont à gauche, avec le prénom une
 * seule fois par groupe de messages consécutifs.
 */
export function ChatMessageBubble({
  message,
  isMine,
  authorName,
  grouped,
  onDelete,
  onRetry,
}: ChatMessageBubbleProps) {
  const failed = message.status === 'failed'
  const sending = message.status === 'sending'

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

      <div className={cn('flex max-w-[78%] flex-col', isMine ? 'items-end' : 'items-start')}>
        {!isMine && !grouped && (
          <p className="mb-1 px-1 text-xs font-medium text-gray-500">{authorName}</p>
        )}

        <div
          className={cn(
            'whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm',
            isMine
              ? 'rounded-br-md bg-accent text-white'
              : 'rounded-bl-md border border-gray-100 bg-white text-gray-900',
            sending && 'opacity-60'
          )}
        >
          {message.body}
        </div>

        <div className="mt-1 flex items-center gap-2 px-1">
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
        </div>
      </div>
    </div>
  )
}
