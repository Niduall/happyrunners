import { useEffect, useState } from 'react'
import { ShieldCheck, ShieldOff, X, Check } from 'lucide-react'
import { Button } from './ui/Button'
import { useAuth } from '../hooks/useAuth'
import { getUserProfile } from '../services/supabaseService'

interface SecurityModalProps {
  onClose: () => void
}

type Action = 'none' | 'add' | 'change' | 'remove'

/** Écran de confirmation affiché après une action réussie */
interface Done {
  title: string
  detail: string
}

export function SecurityModal({ onClose }: SecurityModalProps) {
  const { user, setPin, clearPin } = useAuth()
  const [hasPin, setHasPin] = useState<boolean | null>(null)
  const [action, setAction] = useState<Action>('none')
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState<Done | null>(null)
  const [saving, setSaving] = useState(false)

  // Charge l'état réel du PIN pour proposer la bonne action par défaut
  useEffect(() => {
    if (!user) return
    let cancelled = false
    void getUserProfile(user.id).then((profile) => {
      if (cancelled) return
      setHasPin(!!profile?.pin_hash)
      setAction(profile?.pin_hash ? 'change' : 'add')
    })
    return () => {
      cancelled = true
    }
  }, [user])

  const pinField = (
    id: string,
    value: string,
    onChange: (v: string) => void,
    label: string,
    autoFocus?: boolean
  ) => (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-center tracking-widest text-lg"
          maxLength={4}
          inputMode="numeric"
          autoFocus={autoFocus}
        />
      </div>
    </div>
  )

  const handleSave = async () => {
    setError('')

    // La suppression ne demande que le PIN actuel : pas de nouveau PIN à valider
    if (action !== 'remove') {
      if (newPin.length !== 4) {
        setError('Le PIN doit faire 4 chiffres')
        return
      }
      if (newPin !== confirmPin) {
        setError('Les PIN ne correspondent pas')
        return
      }
    }

    setSaving(true)
    try {
      if (action === 'remove') {
        const ok = await clearPin(currentPin)
        if (ok) {
          setHasPin(false)
          setAction('add')
          setCurrentPin('')
          setDone({
            title: 'PIN retiré',
            detail: 'Ton profil n’est plus protégé.',
          })
        } else {
          setError('PIN actuel incorrect')
        }
      } else if (action === 'change') {
        const ok = await setPin(newPin, currentPin)
        if (ok) {
          setCurrentPin('')
          setNewPin('')
          setConfirmPin('')
          setDone({
            title: 'PIN modifié',
            detail: 'Ton nouveau PIN est actif.',
          })
        } else {
          setError('PIN actuel incorrect')
        }
      } else {
        const ok = await setPin(newPin)
        if (ok) {
          setHasPin(true)
          setAction('change')
          setNewPin('')
          setConfirmPin('')
          setDone({
            title: 'PIN activé',
            detail: 'Il te sera demandé à chaque connexion.',
          })
        } else {
          setError('Impossible d’activer le PIN')
        }
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              {hasPin ? (
                <ShieldCheck className="w-5 h-5 text-green-600" />
              ) : (
                <ShieldOff className="w-5 h-5 text-gray-400" />
              )}
              Sécurité
            </h3>
            {user && (
              <p className="text-sm text-gray-500 mt-0.5">
                {user.firstName} {user.lastName} · #{user.id}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-1"
            aria-label="Fermer la fenêtre"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Confirmation pleine page : pas de formulaire derrière, sinon on
            dirait que l'enregistrement a échoué */}
        {done && (
          <div className="py-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <p className="text-lg font-semibold text-gray-900">{done.title}</p>
            <p className="text-sm text-gray-500 mt-1">{done.detail}</p>
            <Button className="w-full mt-6" onClick={onClose}>
              Fermer
            </Button>
          </div>
        )}

        {!done && action === 'none' && (
          <p className="text-sm text-gray-500">Chargement…</p>
        )}

        {!done && action === 'add' && (
          <>
            <p className="text-sm text-gray-600">
              Un PIN empêche les autres de voter à ta place sur ton téléphone. Personne ne
              peut le réinitialiser — si tu l'oublies, tu perds l'accès à ce profil.
            </p>
            {pinField('add-pin', newPin, setNewPin, 'PIN à 4 chiffres', true)}
            {pinField('add-pin-confirm', confirmPin, setConfirmPin, 'Confirmer le PIN')}
            <Button className="w-full" onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Enregistrement...' : 'Activer le PIN'}
            </Button>
          </>
        )}

        {!done && action === 'change' && (
          <>
            <p className="text-sm text-gray-600">
              Ton PIN actuel protège ton profil. Saisis-le pour le modifier.
            </p>
            {pinField('change-current', currentPin, setCurrentPin, 'PIN actuel', true)}
            {pinField('change-new', newPin, setNewPin, 'Nouveau PIN')}
            {pinField('change-confirm', confirmPin, setConfirmPin, 'Confirmer le nouveau PIN')}
            <Button className="w-full" onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Enregistrement...' : 'Changer le PIN'}
            </Button>
            <button
              onClick={() => {
                setAction('remove')
                setError('')
              }}
              className="w-full text-sm text-gray-500 hover:text-red-600"
            >
              Retirer le PIN
            </button>
          </>
        )}

        {!done && action === 'remove' && (
          <>
            <p className="text-sm text-gray-600">
              Ton profil ne sera plus protégé : n'importe qui pourra voter à ta place depuis
              ton téléphone.
            </p>
            {pinField('remove-current', currentPin, setCurrentPin, 'PIN actuel pour confirmer', true)}
            <Button
              variant="danger"
              className="w-full"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? 'Suppression...' : 'Retirer le PIN'}
            </Button>
            <button
              onClick={() => {
                setAction('change')
                setError('')
              }}
              className="w-full text-sm text-gray-500 hover:text-gray-900"
            >
              Annuler
            </button>
          </>
        )}

        {!done && (
          <Button variant="ghost" className="w-full" onClick={onClose}>
            Fermer
          </Button>
        )}
      </div>
    </div>
  )
}
