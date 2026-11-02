import { useNavigate } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import { Button } from './ui/Button'

interface MessagesButtonProps {
  unreadCount: number
}

/**
 * Entrée vers le chat depuis l'en-tête.
 *
 * Le badge est décoratif pour les lecteurs d'écran : le décompte est déjà
 * annoncé dans l'`aria-label` du bouton, l'annoncer deux fois serait du bruit.
 */
export function MessagesButton({ unreadCount }: MessagesButtonProps) {
  const navigate = useNavigate()

  const label =
    unreadCount > 0
      ? `Messages, ${unreadCount} non lu${unreadCount > 1 ? 's' : ''}`
      : 'Messages'

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => navigate('/messages')}
      aria-label={label}
      title="Messages"
      className="relative px-2 sm:px-3 shrink-0"
    >
      <MessageCircle className="w-4 h-4" />
      <span className="hidden sm:inline ml-1">Messages</span>
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-error text-white text-xs font-semibold flex items-center justify-center"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Button>
  )
}
