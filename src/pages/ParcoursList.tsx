import { useState, useCallback, useEffect } from 'react'
import { Plus, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card, CardContent } from '../components/ui/Card'
import { ParcoursCard } from '../components/ParcoursCard'
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal'
import { parseGPX } from '../services/gpxParser'
import { addParcours, deleteParcours, getWeekTallies } from '../services/supabaseService'
import { useParcours } from '../hooks/useParcours'
import { useTargetWednesday } from '../hooks/useTargetWednesday'
import type { Parcours } from '../types/supabase'

export function ParcoursList() {
  const navigate = useNavigate()
  const { parcoursList, loading, createParcours, removeParcours } = useParcours()
  const { weekKey } = useTargetWednesday()
  const [showAddForm, setShowAddForm] = useState(false)
  const [newParcoursName, setNewParcoursName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [parsedParcours, setParsedParcours] = useState<any>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  // Parcours en attente de confirmation de suppression
  const [pendingDelete, setPendingDelete] = useState<Parcours | null>(null)
  // Nombre de votes par parcours, pour annoncer ce qui sera perdu
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({})

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError(null)
    setUploading(true)

    try {
      const text = await file.text()
      const parsed = parseGPX(text)

      if (parsed) {
        setParsedParcours(parsed)
      } else {
        setUploadError('Impossible de parser le GPX. Vérifiez : export Strava > "Exporter GPX", fichier non vide, format .gpx')
      }
    } catch (err) {
      console.error('GPX parse error:', err)
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      setUploadError(`Erreur lecture GPX : ${msg}`)
    } finally {
      setUploading(false)
    }
  }

  const handleCreateParcours = async () => {
    if (!parsedParcours || !newParcoursName.trim()) return

    setUploading(true)
    try {
      await createParcours(
        JSON.stringify({ points: parsedParcours.points }), // Le GPX sera reparsé côté serveur
        newParcoursName.trim()
      )
      setShowAddForm(false)
      setNewParcoursName('')
      setParsedParcours(null)
      const fileInput = document.getElementById('gpx-upload-parcours') as HTMLInputElement
      if (fileInput) fileInput.value = ''
    } catch (err) {
      console.error('Erreur création parcours:', err)
      alert('Erreur lors de la création du parcours')
    } finally {
      setUploading(false)
    }
  }

  // Un clic sur la poubelle ouvre la confirmation, rien n'est supprimé avant
  const handleDelete = useCallback((id: string) => {
    const parcours = parcoursList.find((p) => p.id === id)
    if (parcours) setPendingDelete(parcours)
  }, [parcoursList])

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return
    const { id, name } = pendingDelete

    try {
      await removeParcours(id)
      setPendingDelete(null)
      // Le vote venait d'être perdu : on ne l'affiche plus
      setVoteCounts((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    } catch (err) {
      console.error('Erreur suppression parcours:', err)
      alert(`Impossible de supprimer « ${name} »`)
    }
  }, [pendingDelete, removeParcours])

  const cancelDelete = useCallback(() => setPendingDelete(null), [])

  // Comptes de votes de la semaine, pour la confirmation
  useEffect(() => {
    let cancelled = false
    void getWeekTallies(weekKey)
      .then((tallies) => {
        if (cancelled) return
        const counts: Record<string, number> = {}
        for (const t of tallies) counts[t.parcoursId] = t.yes
        setVoteCounts(counts)
      })
      .catch(() => {
        /* le compteur est informatif : on ne bloque pas la suppression */
      })
    return () => {
      cancelled = true
    }
  }, [weekKey, parcoursList])

  const handleCancel = () => {
    setShowAddForm(false)
    setNewParcoursName('')
    setParsedParcours(null)
    setUploadError(null)
    setUploading(false)
    const fileInput = document.getElementById('gpx-upload-parcours') as HTMLInputElement
    if (fileInput) fileInput.value = ''
  }

  const handleCreateParcoursClick = () => {
    document.getElementById('gpx-upload-parcours')?.click()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            aria-label="Retour à l'accueil"
            className="px-2 sm:px-3 shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">Accueil</span>
          </Button>
          <h1 className="text-lg sm:text-xl font-bold text-primary truncate">HappyRunners</h1>
          <Button
            variant="accent"
            size="sm"
            onClick={() => setShowAddForm(true)}
            aria-label="Ajouter un parcours"
            className="px-2 sm:px-3 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">Ajouter</span>
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : parcoursList.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900">Aucun parcours</h3>
              <p className="text-gray-500 mt-1">Ajoutez votre premier parcours GPX</p>
              <Button variant="primary" onClick={() => setShowAddForm(true)} className="mt-4">
                <Plus className="w-4 h-4 mr-1" />
                Créer un parcours
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {parcoursList.map((parcours, index) => (
              <ParcoursCard
                key={parcours.id}
                parcours={parcours}
                isNext={index === 0}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {/* Confirmation avant suppression — rien n'est effacé avant « Supprimer » */}
        {pendingDelete && (
          <ConfirmDeleteModal
            parcoursName={pendingDelete.name}
            voteCount={voteCounts[pendingDelete.id] ?? 0}
            onConfirm={() => void confirmDelete()}
            onCancel={cancelDelete}
          />
        )}

        {/* Formulaire d'ajout */}
        {showAddForm && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Nouveau parcours</h3>
                <Button variant="ghost" size="sm" onClick={handleCancel}>
                  ✕
                </Button>
              </div>

              <input
                type="text"
                placeholder="Nom du parcours (ex: Boucle du lac)"
                value={newParcoursName}
                onChange={e => setNewParcoursName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                autoFocus
              />

              <div className="space-y-2">
                <label className="block text-sm text-gray-500">Fichier GPX (depuis Strava → Exporter GPX)</label>
                <input
                  type="file"
                  id="gpx-upload-parcours"
                  accept=".gpx"
                  onChange={handleFileUpload}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  disabled={uploading}
                />
                {uploadError && (
                  <p className="text-sm text-error flex items-center gap-1">
                    <span className="w-4 h-4">⚠</span>
                    {uploadError}
                  </p>
                )}
                {parsedParcours && (
                  <p className="text-sm text-primary flex items-center gap-1">
                    <span className="w-4 h-4">✓</span>
                    GPX chargé : {parsedParcours.distance_km.toFixed(1)} km, {parsedParcours.elevation_gain_m || 0}m D+
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="secondary" onClick={handleCancel} className="flex-1">
                  Annuler
                </Button>
                <Button onClick={handleCreateParcours} disabled={!newParcoursName.trim() || !parsedParcours || uploading} className="flex-1">
                  {uploading ? 'Import...' : 'Créer le parcours'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}