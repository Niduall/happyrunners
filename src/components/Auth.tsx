import { useState } from 'react'
import { Lock, User as UserIcon, LogOut, ChevronDown, Eye, EyeOff, Shield } from 'lucide-react'
import { Button } from './ui/Button'
import { Card, CardContent } from './ui/Card'
import { Input } from './ui/Input'
import { useAuth } from '../hooks/useAuth'

function PinInput({ value, onChange, onSubmit, label, error, autoFocus }: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  label: string
  error?: string
  autoFocus?: boolean
}) {
  const [show, setShow] = useState(false)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSubmit()
  }
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
          onKeyDown={handleKeyDown}
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
        >
          {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  )
}

export function LoginForm() {
  const { createUserProfile, verifyUserPin, isFirstLogin, needsPin, pendingUser, loading, logout } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const doSubmit = async () => {
    if (submitting) return
    setError('')

    if (isFirstLogin && (!firstName.trim() || !lastName.trim())) {
      setError('Veuillez remplir tous les champs')
      return
    }
    if (needsPin && pin.length !== 4) {
      setError('Veuillez entrer votre PIN à 4 chiffres')
      return
    }
    if (isFirstLogin && showPin) {
      if (pin.length !== 4) {
        setError('Le PIN doit faire 4 chiffres')
        return
      }
      if (pin !== confirmPin) {
        setError('Les PIN ne correspondent pas')
        return
      }
    }

    setSubmitting(true)
    try {
      if (isFirstLogin) {
        await createUserProfile(firstName.trim(), lastName.trim(), showPin ? pin : undefined)
        // Pas de reload : le hook passe en 'authenticated' ou bascule en 'pin_verification'
      } else if (needsPin) {
        const ok = await verifyUserPin(pin)
        if (!ok) {
          setError('PIN incorrect')
          setPin('')
        }
      }
    } catch (err) {
      console.error('[AUTH] Erreur connexion:', err)
      setError('Erreur lors de la connexion')
    } finally {
      setSubmitting(false)
    }
  }

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    void doSubmit()
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardContent className="p-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900">HappyRunners</h3>
          <p className="text-gray-500 mt-1">
            {isFirstLogin
              ? 'Entrez votre prénom et nom pour rejoindre le groupe'
              : `Bonjour ${pendingUser?.firstName} ${pendingUser?.lastName}, entrez votre PIN`}
          </p>
        </div>

        <form onSubmit={handleFormSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {isFirstLogin && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="Prénom"
                    className="pl-10"
                    autoFocus
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Nom"
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
          )}

          {isFirstLogin && !showPin && (
            <div className="text-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowPin(true)}
                className="text-primary hover:text-primary/80"
              >
                Ajouter un PIN de protection (recommandé)
              </Button>
            </div>
          )}

          {isFirstLogin && showPin && (
            <>
              <PinInput
                value={pin}
                onChange={setPin}
                onSubmit={() => void doSubmit()}
                label="PIN à 4 chiffres"
                autoFocus
              />
              <PinInput
                value={confirmPin}
                onChange={setConfirmPin}
                onSubmit={() => void doSubmit()}
                label="Confirmer le PIN"
              />
            </>
          )}

          {needsPin && (
            <PinInput
              value={pin}
              onChange={setPin}
              onSubmit={() => void doSubmit()}
              label="PIN à 4 chiffres"
              error={error}
              autoFocus
            />
          )}

          {needsPin && (
            <div className="text-center">
              <Button type="button" variant="ghost" size="sm" onClick={logout} className="text-gray-500">
                J'ai oublié mon PIN
              </Button>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading || submitting}>
            {loading || submitting
              ? 'Connexion...'
              : isFirstLogin
                ? (showPin ? 'Créer mon compte' : 'Rejoindre le groupe')
                : 'Se connecter'}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-gray-400">
          {isFirstLogin
            ? 'Votre nom vous identifie sur tous vos appareils'
            : 'Le PIN protège votre compte sur tous vos appareils'}
        </p>
      </CardContent>
    </Card>
  )
}

export function UserMenu() {
  const { user, logout, updateName, isAuthenticated } = useAuth()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  if (!isAuthenticated) return null

  const handleLogout = async () => {
    await logout()
  }

  const handleSaveName = () => {
    if (firstName.trim() && lastName.trim()) {
      updateName(firstName.trim(), lastName.trim())
      setEditing(false)
    }
  }

  const startEditing = () => {
    setFirstName(user?.firstName || '')
    setLastName(user?.lastName || '')
    setEditing(true)
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        aria-label="Menu utilisateur"
        className="flex items-center gap-1.5 sm:gap-2 px-1.5 sm:px-3"
      >
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          <UserIcon className="w-5 h-5 text-primary" />
        </div>
        {/* Le nom complet déborde sur mobile — masqué sous sm */}
        <span className="hidden sm:inline font-medium text-gray-700 max-w-[10rem] truncate">
          {user?.name || 'Coureur'}
        </span>
        <ChevronDown className="w-4 h-4 shrink-0" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}

      {open && (
        <div className="fixed right-4 top-12 z-50 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="font-medium text-gray-900">{user?.name || 'Coureur'}</p>
            <p className="text-xs text-gray-500">Connecté sur cet appareil</p>
          </div>

          <div className="p-2">
            {editing ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    className="flex-1"
                    placeholder="Prénom"
                    autoFocus
                  />
                  <Input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    className="flex-1"
                    placeholder="Nom"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveName} variant="primary">OK</Button>
                  <Button size="sm" onClick={() => setEditing(false)} variant="ghost">Annuler</Button>
                </div>
              </div>
            ) : (
              <button
                onClick={startEditing}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg"
              >
                <UserIcon className="w-4 h-4" />
                Modifier le nom
              </button>
            )}
          </div>

          <div className="border-t border-gray-100">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
            >
              <LogOut className="w-4 h-4" />
              Déconnexion
            </button>
          </div>
        </div>
      )}
    </div>
  )
}