import { useState, useEffect, useCallback } from 'react'
import {
  Lock,
  User as UserIcon,
  Shield,
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Info,
} from 'lucide-react'
import { Button } from './ui/Button'
import { Card, CardContent } from './ui/Card'
import { Input } from './ui/Input'
import { useAuth } from '../hooks/useAuth'

interface PinFieldProps {
  id: string
  value: string
  onChange: (v: string) => void
  label: string
  autoFocus?: boolean
  onEnter?: () => void
}

function PinField({ id, value, onChange, label, autoFocus, onEnter }: PinFieldProps) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onEnter) onEnter()
          }}
          placeholder="••••"
          className="w-full pl-10 pr-12 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-center tracking-widest text-lg"
          autoFocus={autoFocus}
          maxLength={4}
          inputMode="numeric"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          aria-label={show ? 'Masquer le PIN' : 'Afficher le PIN'}
        >
          {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>
    </div>
  )
}

export function LoginForm() {
  const {
    createUserProfile,
    verifyUserPin,
    isFirstLogin,
    needsPin,
    pendingUser,
    loading,
    resetToIdentity,
    logout,
  } = useAuth()

  // 'identity' | 'pin'
  const [step, setStep] = useState<'identity' | 'pin'>('identity')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Un profil existant avec PIN bascule sur l'étape « pin »
  useEffect(() => {
    if (needsPin) setStep('pin')
    if (isFirstLogin) setStep('identity')
  }, [needsPin, isFirstLogin])

  // Le mode PIN peut aussi être atteint juste après une création
  const handleIdentitySubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError('')

      const first = firstName.trim()
      const last = lastName.trim()
      if (!first || !last) {
        setError('Renseigne ton prénom et ton nom')
        return
      }

      setSubmitting(true)
      try {
        // createUserProfile bascule en pin_verification si un PIN existe,
        // ou connecte directement sinon. Pas de PIN à saisir ici :
        // la décision appartient à la base.
        await createUserProfile(first, last)
      } catch (err) {
        console.error('[AUTH] Erreur:', err)
        setError('Impossible de te connecter. Réessaie.')
      } finally {
        setSubmitting(false)
      }
    },
    [firstName, lastName, createUserProfile]
  )

  const handlePinSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault()
      setError('')

      if (pin.length !== 4) {
        setError('Le PIN doit faire 4 chiffres')
        return
      }

      setSubmitting(true)
      try {
        const ok = await verifyUserPin(pin)
        if (!ok) {
          setError('PIN incorrect')
          setPin('')
        }
      } finally {
        setSubmitting(false)
      }
    },
    [pin, verifyUserPin]
  )

  const handleBack = useCallback(() => {
    // On repart d'un écran d'identité vierge : sinon la saisie suivante
    // s'ajoute à l'ancien nom ("Paul" + "Jean" → "PaulJean")
    setFirstName('')
    setLastName('')
    setPin('')
    setConfirmPin('')
    setError('')
    setStep('identity')
    resetToIdentity()
  }, [resetToIdentity])

  // ---------- Écran PIN ----------
  if (step === 'pin' && needsPin && pendingUser) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="p-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <KeyRound className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900">
              Bonjour {pendingUser.firstName}
            </h3>
            <p className="text-gray-500 mt-1">Ton compte est protégé par un PIN</p>
          </div>

          <form onSubmit={handlePinSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <PinField
              id="pin-verification"
              value={pin}
              onChange={setPin}
              label="PIN à 4 chiffres"
              autoFocus
              onEnter={() => void handlePinSubmit()}
            />

            <Button type="submit" className="w-full" disabled={loading || submitting}>
              {submitting ? 'Connexion...' : 'Se connecter'}
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
            >
              <ArrowLeft className="w-4 h-4" />
              Changer de nom
            </button>
            <button
              type="button"
              onClick={logout}
              className="text-sm text-gray-500 hover:text-gray-900"
              title="Le PIN ne peut pas être réinitialisé. Déconnexion puis nouveau compte."
            >
              J'ai oublié mon PIN
            </button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ---------- Écran identité ----------
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardContent className="p-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900">HappyRunners</h3>
        </div>

        <form onSubmit={handleIdentitySubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ton prénom et ton nom
            </label>
            <p className="text-sm text-gray-500 mb-3 flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" />
              <span>
                C'est ton identifiant dans le groupe. Écris-le exactement comme tu veux
                qu'il apparaisse, il ne sera plus modifiable après.
              </span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="first-name" className="block text-sm font-medium text-gray-700 mb-1">
                Prénom
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  id="first-name"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Prénom"
                  className="pl-10"
                  autoFocus
                  autoComplete="given-name"
                />
              </div>
            </div>
            <div>
              <label htmlFor="last-name" className="block text-sm font-medium text-gray-700 mb-1">
                Nom
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  id="last-name"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Nom"
                  className="pl-10"
                  autoComplete="family-name"
                />
              </div>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={loading || submitting}>
            {submitting ? 'Connexion...' : 'Continuer'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}