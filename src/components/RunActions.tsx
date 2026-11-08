import { useState } from 'react'
import { CalendarPlus, Share2 } from 'lucide-react'
import { Button } from './ui/Button'
import { downloadRunIcs } from '../services/calendar'

type ShareStatus = 'idle' | 'copied' | 'error'

/**
 * Copie avec repli `execCommand` : certains navigateurs (ou contextes sans
 * permission presse-papiers) refusent `navigator.clipboard`. C'est le même
 * repli que « Copier le message » dans le chat.
 */
async function copyUrl(url: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
      return
    }
  } catch {
    // On tente le repli ci-dessous.
  }

  const textarea = document.createElement('textarea')
  textarea.value = url
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Copie impossible')
}

/**
 * Deux actions discrètes sous « Tu viens ? » : mettre la sortie dans son
 * agenda, ou envoyer le lien de l'app à un collègue. Aucun appel serveur.
 */
export function RunActions({ weekKey }: { weekKey: string }) {
  const [status, setStatus] = useState<ShareStatus>('idle')

  function handleCalendar() {
    downloadRunIcs({ weekKey, appUrl: window.location.origin })
  }

  async function handleShare() {
    const url = window.location.origin
    try {
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'HappyRunners',
            text: 'Les courses du mercredi midi entre collègues.',
            url,
          })
          return
        } catch (error) {
          // Annulation du partage natif : ce n'est pas une erreur.
          if (error instanceof DOMException && error.name === 'AbortError') return
          // Autre échec du partage natif : on tente la copie.
        }
      }
      await copyUrl(url)
      setStatus('copied')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCalendar}
        className="px-2"
      >
        <CalendarPlus className="h-4 w-4" aria-hidden="true" />
        Ajouter à l’agenda
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void handleShare()}
        className="px-2"
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        Partager
      </Button>
      <span role="status" className="text-xs text-gray-600">
        {status === 'copied'
          ? 'Lien copié'
          : status === 'error'
            ? 'Copie impossible'
            : ''}
      </span>
    </div>
  )
}
