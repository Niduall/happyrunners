import { useEffect } from 'react'
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  Info,
  Smartphone,
  X,
} from 'lucide-react'
import { Button } from './ui/Button'
import { cn } from '../lib/utils'
import type { PushStatus } from '../hooks/usePushNotifications'
import type { NotificationPreferences } from '../types/supabase'

interface NotificationsModalProps {
  status: PushStatus
  preferences: NotificationPreferences
  saving: boolean
  error: string
  onEnable: () => void
  onDisable: () => void
  onPreferenceChange: (
    key: keyof NotificationPreferences,
    value: boolean
  ) => void
  onClose: () => void
}

function PreferenceToggle({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  disabled: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-sm font-medium text-gray-900">
          {label}
        </p>
        <p className="mt-0.5 text-sm text-gray-500">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          aria-hidden="true"
          className={cn(
            'relative h-6 w-11 rounded-full transition-colors',
            checked ? 'bg-accent' : 'bg-gray-300'
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
              checked ? 'translate-x-5' : 'translate-x-0.5'
            )}
          />
        </span>
      </button>
    </div>
  )
}

/**
 * Réglages de notifications : abonnement de l'appareil et catégories reçues.
 *
 * L'abonnement est un geste explicite par appareil ; les cases ci-dessous
 * sont enregistrées par personne et valent pour tous ses appareils.
 */
export function NotificationsModal({
  status,
  preferences,
  saving,
  error,
  onEnable,
  onDisable,
  onPreferenceChange,
  onClose,
}: NotificationsModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const showPreferences =
    status === 'available' ||
    status === 'subscribed' ||
    status === 'denied' ||
    status === 'needs-install'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notifications-title"
    >
      <div className="max-h-[90vh] w-full max-w-md space-y-5 overflow-y-auto rounded-lg bg-white p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3
              id="notifications-title"
              className="flex items-center gap-2 text-lg font-semibold text-gray-900"
            >
              <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
              Notifications
            </h3>
            <p className="mt-0.5 text-sm text-gray-500">
              Choisis ce que tu veux recevoir sur cet appareil.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-700"
            aria-label="Fermer la fenêtre"
            disabled={saving}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {status === 'loading' && (
          <div className="flex justify-center py-6">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
          </div>
        )}

        {status === 'unsupported' && (
          <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
            <p>
              Ce navigateur ne prend pas en charge les notifications. Essaie avec
              un autre navigateur, ou installe l’application sur ton téléphone.
            </p>
          </div>
        )}

        {status === 'unconfigured' && (
          <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
            <p>
              Les notifications ne sont pas configurées sur cette installation.
              Demande à l’administrateur.
            </p>
          </div>
        )}

        {status === 'needs-install' && (
          <div className="space-y-2 rounded-lg border border-accent/30 bg-accent-light p-4 text-sm text-gray-700">
            <p className="flex items-center gap-2 font-medium text-gray-900">
              <Smartphone className="h-4 w-4 text-accent" aria-hidden="true" />
              Sur iPhone, installe d’abord l’application
            </p>
            <p>
              Ouvre le menu <strong>Partager</strong> de Safari, choisis{' '}
              <strong>Sur l’écran d’accueil</strong>, puis relance HappyRunners
              depuis l’icône. Apple ne permet les notifications qu’aux
              applications installées (iOS 16.4 ou plus récent).
            </p>
          </div>
        )}

        {status === 'denied' && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-gray-700">
            <AlertTriangle
              className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
              aria-hidden="true"
            />
            <p>
              Le navigateur bloque les notifications pour HappyRunners. Autorise-les
              dans les réglages du site, puis reviens sur cet écran.
            </p>
          </div>
        )}

        {status === 'available' && (
          <div className="space-y-3 rounded-lg border border-accent/30 bg-accent-light p-4">
            <p className="text-sm text-gray-700">
              Active les notifications pour être prévenu des nouveaux messages et
              du rappel du mardi soir.
            </p>
            <Button
              variant="accent"
              className="w-full"
              onClick={onEnable}
              disabled={saving}
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              {saving ? 'Activation…' : 'Activer sur cet appareil'}
            </Button>
          </div>
        )}

        {status === 'subscribed' && (
          <div className="space-y-3 rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-green-800">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Notifications actives sur cet appareil
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={onDisable}
              disabled={saving}
            >
              {saving ? 'Désactivation…' : 'Désactiver sur cet appareil'}
            </Button>
          </div>
        )}

        {showPreferences && (
          <div>
            <h4 className="text-sm font-semibold text-gray-900">
              Ce que je veux recevoir
            </h4>
            <div className="divide-y divide-gray-100">
              <PreferenceToggle
                id="notify-messages"
                label="Nouveaux messages"
                description="Quand quelqu’un écrit dans le chat."
                checked={preferences.messages}
                disabled={saving}
                onChange={(value) => onPreferenceChange('messages', value)}
              />
              <PreferenceToggle
                id="notify-run"
                label="Rappel du mardi soir"
                description="La veille du run, si tu n’as pas encore répondu."
                checked={preferences.runReminder}
                disabled={saving}
                onChange={(value) => onPreferenceChange('runReminder', value)}
              />
            </div>
          </div>
        )}

        <p className="flex items-start gap-2 px-1 text-xs text-gray-500">
          <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            L’abonnement concerne cet appareil. Les deux réglages suivent ton
            profil sur tous tes appareils.
          </span>
        </p>
      </div>
    </div>
  )
}
