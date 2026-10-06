import { useState } from 'react'
import { User as UserIcon, LogOut, ChevronDown, Pencil, ShieldCheck } from 'lucide-react'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { SecurityModal } from './SecurityModal'
import { useAuth } from '../hooks/useAuth'

export function UserMenu() {
  const { user, logout, updateName, isAuthenticated } = useAuth()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [securityOpen, setSecurityOpen] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [nameError, setNameError] = useState('')
  const [savingName, setSavingName] = useState(false)

  if (!isAuthenticated || !user) return null

  const startEditing = () => {
    setFirstName(user.firstName)
    setLastName(user.lastName)
    setNameError('')
    setEditing(true)
    setOpen(false)
  }

  const handleSaveName = async () => {
    const first = firstName.trim()
    const last = lastName.trim()
    if (!first || !last) {
      setNameError('Renseigne les deux champs')
      return
    }
    setSavingName(true)
    try {
      const ok = await updateName(first, last)
      if (ok) {
        setEditing(false)
      } else {
        setNameError('Modification impossible')
      }
    } catch {
      setNameError('Une erreur est survenue')
    } finally {
      setSavingName(false)
    }
  }

  return (
    <>
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
          <span className="hidden sm:inline font-medium text-gray-700 max-w-[10rem] truncate">
            {user.name}
          </span>
          <ChevronDown className="w-4 h-4 shrink-0" />
        </Button>

        {open && (
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        )}

        {open && (
          <div className="fixed right-4 top-12 z-50 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="font-medium text-gray-900">{user.name}</p>
              <p className="text-xs text-gray-500">Numéro #{user.id}</p>
            </div>

            <div className="p-2">
              <button
                onClick={startEditing}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg"
              >
                <Pencil className="w-4 h-4" />
                Modifier le nom
              </button>
              <button
                onClick={() => {
                  setSecurityOpen(true)
                  setOpen(false)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg"
              >
                <ShieldCheck className="w-4 h-4" />
                Sécurité (PIN)
              </button>
            </div>

            <div className="border-t border-gray-100">
              <button
                onClick={logout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
              >
                <LogOut className="w-4 h-4" />
                Déconnexion
              </button>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md bg-white rounded-lg p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Modifier le nom</h3>
              <p className="text-sm text-gray-500 mt-1">
                Ton numéro d'identifiant (#{user.id}) ne change pas : tes votes et ton PIN
                restent attachés.
              </p>
            </div>

            {nameError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {nameError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
                <Input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                <Input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={savingName}>
                Annuler
              </Button>
              <Button onClick={() => void handleSaveName()} disabled={savingName}>
                {savingName ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {securityOpen && <SecurityModal onClose={() => setSecurityOpen(false)} />}
    </>
  )
}
