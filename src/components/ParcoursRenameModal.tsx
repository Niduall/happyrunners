import { useState, useEffect } from 'react'
import { Pencil, X } from 'lucide-react'
import { Button } from './ui/Button'

interface ParcoursRenameModalProps {
  currentName: string
  onSave: (name: string) => Promise<void>
  onCancel: () => void
}

/**
 * Renommage d'un parcours. Le tracé se remplace séparément depuis la carte
 * (« Remplacer le GPX »), pour ne pas écraser les points par erreur.
 */
export function ParcoursRenameModal({
  currentName,
  onSave,
  onCancel,
}: ParcoursRenameModalProps) {
  const [name, setName] = useState(currentName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, saving])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || saving) return

    setSaving(true)
    setError(null)
    try {
      // Le parent ferme la modale si l'enregistrement réussit.
      await onSave(trimmed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-parcours-title"
    >
      <div className="w-full max-w-md bg-white rounded-lg p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Pencil className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 id="rename-parcours-title" className="text-lg font-semibold text-gray-900">
                Modifier le parcours
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">{currentName}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-700 p-1"
            aria-label="Fermer la fenêtre"
            disabled={saving}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"
            >
              Impossible d’enregistrer : {error}
            </div>
          )}

          <div>
            <label
              htmlFor="parcours-name"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Nom du parcours
            </label>
            <input
              id="parcours-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoFocus
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={saving}
              className="flex-1"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || saving}
              className="flex-1"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
