import { useCallback, useEffect, useState } from 'react'
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  savePushSubscription,
  deletePushSubscription,
} from '../services/supabaseService'
import {
  getCurrentSubscription,
  isPushConfigured,
  isPushSupported,
  needsInstallForPush,
  permissionState,
  subscribeToPush,
  unsubscribeFromPush,
} from '../services/push'
import type { NotificationPreferences } from '../types/supabase'

/**
 * `needs-install` : iPhone dans Safari, où Apple refuse le push tant que
 * l'app n'est pas sur l'écran d'accueil.
 */
export type PushStatus =
  | 'loading'
  | 'unsupported'
  | 'unconfigured'
  | 'needs-install'
  | 'denied'
  | 'subscribed'
  | 'available'

const DEFAULT_PREFERENCES: NotificationPreferences = {
  messages: true,
  runReminder: true,
}

async function resolveStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported'
  if (!isPushConfigured()) return 'unconfigured'
  if (needsInstallForPush()) return 'needs-install'
  if (permissionState() === 'denied') return 'denied'

  const subscription = await getCurrentSubscription()
  return subscription ? 'subscribed' : 'available'
}

/**
 * Abonnement push de l'appareil + préférences de la personne.
 *
 * L'abonnement est par appareil ; les préférences (messages, rappel) sont par
 * personne et vivent en base. L'activation doit partir d'un clic : iOS exige
 * un geste pour la demande de permission.
 */
export function usePushNotifications(userNumber: number | null) {
  const [status, setStatus] = useState<PushStatus>('loading')
  const [preferences, setPreferences] =
    useState<NotificationPreferences>(DEFAULT_PREFERENCES)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const next = await resolveStatus()
      if (cancelled) return
      setStatus(next)

      if (!userNumber) return
      try {
        const saved = await getNotificationPreferences(userNumber)
        if (!cancelled) setPreferences(saved)
      } catch {
        // Valeurs par défaut : on n'empêche pas l'écran de s'afficher.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userNumber])

  const enable = useCallback(async () => {
    if (!userNumber) return
    setSaving(true)
    setError('')
    try {
      const record = await subscribeToPush()
      await savePushSubscription(userNumber, record)
      setStatus('subscribed')
    } catch (err) {
      if (err instanceof Error && err.message === 'Permission refusée') {
        setStatus('denied')
        setError(
          'Le navigateur a refusé les notifications. Autorise-les dans ses réglages, puis réessaie.'
        )
      } else {
        console.error('[PUSH] Erreur activation:', err)
        setError(
          err instanceof Error
            ? err.message
            : 'Impossible d’activer les notifications.'
        )
      }
    } finally {
      setSaving(false)
    }
  }, [userNumber])

  const disable = useCallback(async () => {
    setSaving(true)
    setError('')
    try {
      const endpoint = await unsubscribeFromPush()
      // Le navigateur est déjà désabonné : on ne bloque pas là-dessus. Un
      // envoi vers une ligne restée en base recevra 410 et sera nettoyé.
      if (endpoint) {
        await deletePushSubscription(endpoint).catch(() => {})
      }
      setStatus('available')
    } catch (err) {
      console.error('[PUSH] Erreur désactivation:', err)
      setError('Impossible de désactiver les notifications sur cet appareil.')
    } finally {
      setSaving(false)
    }
  }, [])

  const setPreference = useCallback(
    async (key: keyof NotificationPreferences, value: boolean) => {
      if (!userNumber) return

      const previous = preferences
      const next = { ...preferences, [key]: value }
      setPreferences(next)
      setSaving(true)
      setError('')

      try {
        await saveNotificationPreferences(userNumber, next)
      } catch (err) {
        console.error('[PUSH] Erreur enregistrement du réglage:', err)
        setPreferences(previous)
        setError('Impossible d’enregistrer ce réglage. Réessaie.')
      } finally {
        setSaving(false)
      }
    },
    [userNumber, preferences]
  )

  return {
    status,
    preferences,
    saving,
    error,
    enable,
    disable,
    setPreference,
  }
}
