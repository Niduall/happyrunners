import { useState, useCallback, useEffect } from 'react'
import { Lock, X } from 'lucide-react'
import { Button } from './ui/Button'

interface AdminCodeModalProps {
  onUnlock: (code: string) => boolean
  onCancel: () => void
}

/**
 * Demande le code administrateur pour déverrouiller la suppression et la
 * modification des parcours.
 *
 * L'état de déverrouillage vit dans la page de gestion (ParcoursList) et n'est
 * mémorisé nulle part : cette modale ne fait que recueillir le code.
 */
export function AdminCodeModal({ onUnlock, onCancel }: AdminCodeModalProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  // Échap ferme la demande de code, comme les autres modales.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault()
      if (code.length === 0) {
        setError('Saisis le code')
        return
      }
      if (!onUnlock(code)) {
        setError('Code incorrect')
        setCode('')
        return
      }
      // Le parent ferme la modale quand le déverrouillage réussit.
    },
    [code, onUnlock]
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-code-title"
    >
      <div className="w-full max-w-sm bg-white rounded-lg p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5 text-primary" />
            </div>
            <h3 id="admin-code-title" className="text-lg font-semibold text-gray-900">
              Code administrateur
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-700 p-1"
            aria-label="Fermer la fenêtre"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600">
          Supprimer ou modifier un parcours demande le code. L'accès reste
          ouvert tant que tu restes sur cet écran.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"
            >
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="admin-code"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Code
            </label>
            <input
              id="admin-code"
              type="password"
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                setError('')
              }}
              autoFocus
              autoComplete="off"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onCancel}>
              Annuler
            </Button>
            <Button type="submit">Déverrouiller</Button>
          </div>
        </form>
      </div>
    </div>
  )
}