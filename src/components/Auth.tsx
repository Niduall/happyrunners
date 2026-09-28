import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Mail, Lock, User as UserIcon, LogOut, ChevronDown } from 'lucide-react'
import { Button } from './ui/Button'
import { Card, CardContent } from './ui/Card'
import { useAuth } from '../hooks/useAuth'

export function LoginForm() {
  const { createUserProfile, loading } = useAuth()
  const navigate = useNavigate()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    console.log('=== Form submitted ===', { firstName, lastName, loading })
    setError('')
    if (!firstName.trim() || !lastName.trim()) {
      setError('Veuillez remplir tous les champs')
      return
    }

    try {
      console.log('Calling createUserProfile...')
      createUserProfile(firstName.trim(), lastName.trim())
      console.log('User created successfully, navigating...')
      window.location.href = '/'
      console.log('Navigation triggered')
    } catch (err) {
      console.error('Error creating user:', err)
      setError('Erreur lors de la création du profil')
    }
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardContent className="p-6">
        <div className="text-center mb-6">
          <svg className="w-16 h-16 text-primary mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h3 className="text-xl font-semibold text-gray-900">HappyRunners</h3>
          <p className="text-gray-500 mt-1">Entrez votre prénom et nom pour rejoindre le groupe</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="Prénom"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  autoFocus
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Nom"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={loading || !firstName.trim() || !lastName.trim()}>
            {loading ? 'Connexion...' : 'Rejoindre le groupe'}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-gray-400">
          Votre nom sera mémorisé sur cet appareil
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

  if (!isAuthenticated) return null

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2"
      >
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
          <UserIcon className="w-5 h-5 text-primary" />
        </div>
        <span className="font-medium text-gray-700">{user?.name || 'Coureur'}</span>
        <ChevronDown className="w-4 h-4" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}

      {open && (
        <div className="fixed right-4 top-12 z-50 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="font-medium text-gray-900">{user?.name || 'Coureur'}</p>
          </div>

          <div className="p-2">
            {editing ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Prénom"
                    autoFocus
                  />
                  <input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
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