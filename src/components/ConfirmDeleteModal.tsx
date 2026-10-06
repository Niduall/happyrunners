import { useState, useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from './ui/Button'

interface ConfirmDeleteModalProps {
  parcoursName: string
  /** Nombre de personnes ayant voté ce parcours cette semaine */
  voteCount: number | null
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmation de suppression d'un parcours.
 *
 * ⚠️ La suppression en base emporte les votes rattachés à ce parcours
 * (contrainte de clé étrangère) : on annonce donc le nombre de personnes
 * concernées avant de valider.
 */
export function ConfirmDeleteModal({
  parcoursName,
  voteCount,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  const [deleting, setDeleting] = useState(false)

  // Échap = annuler, comme dans n'importe quelle boîte de dialogue
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleting) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, deleting])

  const handleConfirm = async () => {
    setDeleting(true)
    await onConfirm()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
    >
      <div className="w-full max-w-md bg-white rounded-lg p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 id="confirm-delete-title" className="text-lg font-semibold text-gray-900">
                Supprimer ce parcours ?
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">{parcoursName}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={deleting}
            className="text-gray-400 hover:text-gray-700 p-1 disabled:opacity-50"
            aria-label="Fermer la fenêtre"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">
            Cette action est définitive. Le parcours et son tracé seront supprimés.
          </p>
          {voteCount != null && voteCount > 0 && (
            <p className="text-sm text-red-800 mt-2">
              <strong>
                {voteCount} {voteCount === 1 ? 'vote sera' : 'votes seront'} perdus
              </strong>{' '}
              : {voteCount === 1 ? 'il a été' : 'ils ont été'} choisi cette semaine.
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={deleting}>
            Annuler
          </Button>
          <Button variant="danger" onClick={() => void handleConfirm()} disabled={deleting}>
            {deleting ? 'Suppression...' : 'Supprimer'}
          </Button>
        </div>
      </div>
    </div>
  )
}