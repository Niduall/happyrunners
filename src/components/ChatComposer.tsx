import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Send } from 'lucide-react'
import { Button } from './ui/Button'
import {
  MAX_MESSAGE_LENGTH,
  isValidMessageBody,
  normalizeMessageBody,
} from '../services/messages'
import { cn } from '../lib/utils'

interface ChatComposerProps {
  /** Sans identité, on peut lire mais pas écrire. */
  canWrite: boolean
  onSend: (body: string) => Promise<boolean>
  onIdentify: () => void
}

/**
 * Zone de saisie du chat.
 *
 * `Entrée` envoie, `Maj+Entrée` va à la ligne. Le texte est vidé après envoi,
 * même en cas d'échec : le message reste affiché dans le fil avec un bouton
 * « Réessayer ». Le garder dans la zone créerait un doublon visuel.
 */
export function ChatComposer({ canWrite, onSend, onIdentify }: ChatComposerProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const body = normalizeMessageBody(text)
  const tooLong = body.length > MAX_MESSAGE_LENGTH
  const canSend = canWrite && isValidMessageBody(text) && !sending

  // Hauteur adaptée au contenu, plafonnée à quatre lignes environ.
  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 96)}px`
  }, [text])

  const submit = async () => {
    if (!canSend) return
    setSending(true)
    await onSend(body)
    setSending(false)
    setText('')
    textareaRef.current?.focus()
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void submit()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // `isComposing` : ne pas envoyer pendant la composition d'un accent.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void submit()
    }
  }

  if (!canWrite) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">Choisis ton nom pour écrire.</p>
        <Button variant="outline" size="sm" onClick={onIdentify}>
          Se connecter
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <label htmlFor="chat-message" className="sr-only">
          Ton message
        </label>
        <textarea
          id="chat-message"
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Écris un message…"
          aria-describedby={tooLong ? 'chat-message-compteur' : undefined}
          className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 placeholder:text-gray-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 sm:text-sm"
        />
        {(body.length > 400 || tooLong) && (
          <p
            id="chat-message-compteur"
            role={tooLong ? 'alert' : undefined}
            className={cn(
              'mt-1 text-right text-xs',
              tooLong ? 'text-error' : 'text-gray-500'
            )}
          >
            {body.length}/{MAX_MESSAGE_LENGTH}
          </p>
        )}
      </div>

      <Button
        type="submit"
        variant="accent"
        size="sm"
        disabled={!canSend}
        aria-label="Envoyer le message"
        className="shrink-0"
      >
        <Send className="w-4 h-4" />
        <span className="hidden sm:inline">Envoyer</span>
      </Button>
    </form>
  )
}
