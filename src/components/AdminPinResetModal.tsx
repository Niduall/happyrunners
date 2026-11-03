import { useEffect, useState } from 'react'
import { KeyRound, ShieldOff, X } from 'lucide-react'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { isValidPin } from '../services/pin'
import type { ProfileWithPinStatus } from '../services/supabaseService'

interface AdminPinResetModalProps {
  profile: ProfileWithPinStatus
  onClose: () => void
  /** Définit un PIN provisoire ; rejette en cas d'erreur réseau. */
  onResetPin: (pin: string) => Promise<void>
  /** Retire le PIN ; rejette en cas d'erreur réseau. */
  onRemovePin: () => Promise<void>
}

type Action = 'set' | 'remove'

/**
 * Réinitialisation du PIN d'une personne, depuis la console admin.
 *
 * Deux issues possibles : un code provisoire à transmettre, ou le retrait du
 * PIN (la personne se connecte alors sans code et peut en définir un).
 * Le hash n'est jamais affiché ni manipulé ici.
 */
export function AdminPinResetModal({
  profile,
  onClose,
  onResetPin,
  onRemovePin,
}: AdminPinResetModalProps) {
  const [action, setAction] = useState<Action>('set')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ kind: Action; pin?: string } | null>(null)

  const name = `${profile.first_name} ${profile.last_name}`

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    if (action === 'set') {
      if (!isValidPin(pin)) {
        setError('Le PIN doit faire exactement 4 chiffres')
        return
      }
      if (pin !== confirmPin) {
        setError('Les deux PIN ne correspondent pas')
        return
      }
    }

    setSaving(true)
    try {
      if (action === 'remove') {
        await onRemovePin()
        setDone({ kind: 'remove' })
      } else {
        await onResetPin(pin)
        setDone({ kind: 'set', pin })
      }
    } catch (err) {
      console.error('[ADMIN] Erreur réinitialisation PIN:', err)
      setError('Impossible de contacter le serveur. Réessaie.')
    } finally {
      setSaving(false)
    }
  }

  const pinField = (
    id: string,
    value: string,
    onChange: (value: string) => void,
    label: string,
    autoFocus = false
  ) => (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <Input
        id={id}
        type="password"
        value={value}
        onChange={(event) =>
          onChange(event.target.value.replace(/\D/g, '').slice(0, 4))
        }
        maxLength={4}
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        className="text-center text-lg tracking-widest"
      />
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-pin-title"
    >
      <div className="max-h-[90vh] w-full max-w-md space-y-5 overflow-y-auto rounded-lg bg-white p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3
              id="admin-pin-title"
              className="flex items-center gap-2 text-lg font-semibold text-gray-900"
            >
              <KeyRound className="h-5 w-5 text-primary" />
              PIN de {name}
            </h3>
            <p className="mt-0.5 text-sm text-gray-500">Numéro #{profile.user_number}</p>
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

        {done ? (
          <div className="space-y-4">
            <div role="status" className="space-y-2 rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="font-medium text-green-800">
                {done.kind === 'remove' ? 'PIN retiré' : 'PIN réinitialisé'}
              </p>
              {done.kind === 'set' ? (
                <>
                  <p className="text-sm text-green-800">
                    Code provisoire à transmettre à {profile.first_name} :
                  </p>
                  <p className="rounded-lg bg-white px-3 py-2 text-center text-2xl font-semibold tracking-[0.4em] text-gray-900">
                    {done.pin}
                  </p>
                  <p className="text-sm text-green-800">
                    Elle pourra le changer dans « Sécurité (PIN) ».
                  </p>
                </>
              ) : (
                <p className="text-sm text-green-800">
                  {profile.first_name} peut maintenant se connecter sans code et
                  définir un nouveau PIN.
                </p>
              )}
            </div>
            <div className="flex justify-end">
              <Button onClick={onClose}>Terminé</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {profile.hasPin && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-gray-700">Action</legend>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-light">
                  <input
                    type="radio"
                    name="admin-pin-action"
                    value="set"
                    checked={action === 'set'}
                    onChange={() => setAction('set')}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-medium text-gray-900">
                      Définir un PIN provisoire
                    </span>
                    <span className="block text-gray-500">
                      Tu choisis un code à 4 chiffres et tu le lui transmets.
                    </span>
                  </span>
                </label>

                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm has-[:checked]:border-error has-[:checked]:bg-error/5">
                  <input
                    type="radio"
                    name="admin-pin-action"
                    value="remove"
                    checked={action === 'remove'}
                    onChange={() => setAction('remove')}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-medium text-gray-900">Retirer le PIN</span>
                    <span className="block text-gray-500">
                      Le profil ne sera plus protégé jusqu'à ce qu'elle en définisse un.
                    </span>
                  </span>
                </label>
              </fieldset>
            )}

            {action === 'set' ? (
              <div className="grid grid-cols-2 gap-3">
                {pinField('admin-new-pin', pin, setPin, 'Nouveau PIN', true)}
                {pinField(
                  'admin-confirm-pin',
                  confirmPin,
                  setConfirmPin,
                  'Confirmer le PIN'
                )}
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-lg border border-error/20 bg-error/5 p-3 text-sm text-gray-700">
                <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-error" />
                <p>
                  {profile.first_name} pourra se connecter sans code. À utiliser
                  si le PIN est perdu et qu'aucun code provisoire n'est possible.
                </p>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
                Annuler
              </Button>
              <Button
                type="submit"
                variant={action === 'remove' ? 'danger' : 'accent'}
                disabled={saving}
              >
                {saving
                  ? 'Enregistrement…'
                  : action === 'remove'
                    ? 'Retirer le PIN'
                    : 'Définir le PIN'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
