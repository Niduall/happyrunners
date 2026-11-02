import { useCallback, useEffect, useRef, useState } from 'react'
import { countMessagesSince } from '../services/supabaseService'
import { MESSAGES_LAST_READ_KEY, readLastRead } from '../services/messages'

/**
 * Pastille de l'en-tête : combien de messages sont arrivés depuis la dernière
 * ouverture du chat.
 *
 * Requête volontairement légère : un `count` sans corps de message, toutes les
 * 30 s. Le chat lui-même a son propre rythme (5 s) quand il est ouvert.
 */
const UNREAD_POLL_MS = 30000

export function useUnreadMessages(enabled = true): number {
  const [unreadCount, setUnreadCount] = useState(0)
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    // La dernière lecture peut avoir changé dans un autre onglet, ou à
    // l'instant en revenant du chat : on la relit à chaque vérification.
    const lastReadAt = readLastRead()
    if (!lastReadAt) {
      if (mountedRef.current) setUnreadCount(0)
      return
    }

    try {
      const count = await countMessagesSince(lastReadAt)
      if (mountedRef.current) setUnreadCount(count)
    } catch {
      // Hors ligne : on garde la dernière valeur connue, sans alerter.
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    mountedRef.current = true
    void refresh()

    const timer = setInterval(() => void refresh(), UNREAD_POLL_MS)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh()
    }

    // Retour sur l'onglet ou sur la fenêtre : le minuteur a pu être bridé.
    const onFocus = () => void refresh()

    // Marquer comme lu dans un autre onglet doit éteindre la pastille ici.
    const onStorage = (event: StorageEvent) => {
      if (event.key === MESSAGES_LAST_READ_KEY) void refresh()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onFocus)
    window.addEventListener('storage', onStorage)

    return () => {
      mountedRef.current = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('storage', onStorage)
    }
  }, [enabled, refresh])

  return unreadCount
}
