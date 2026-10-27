import { useState, useCallback } from 'react'
import { MapPin, Calendar, Upload, Trash2, Edit2, Eye, Lock } from 'lucide-react'
import { Button } from './ui/Button'
import { Card, CardHeader, CardContent, CardFooter } from './ui/Card'
import { LazyMapView } from './LazyMapView'
import { useParcoursPoints } from '../hooks/useParcoursPoints'
import type { ParcoursSummary } from '../types'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface ParcoursCardProps {
  parcours: ParcoursSummary
  isNext?: boolean
  /** Ouvre le renommage (bouton crayon). */
  onEdit?: (parcours: ParcoursSummary) => void
  onDelete?: (id: string) => void
  /** Remplace le tracé par un nouveau GPX (bouton « Remplacer le GPX »). */
  onReplaceGpx?: (id: string, gpxContent: string) => Promise<void>
  /** true → modification et suppression accessibles */
  adminUnlocked?: boolean
  /** Ouvre la demande de code admin (absent → pas de cadenas) */
  onRequestAdmin?: () => void
}

export function ParcoursCard({
  parcours,
  isNext,
  onEdit,
  onDelete,
  onReplaceGpx,
  adminUnlocked = false,
  onRequestAdmin,
}: ParcoursCardProps) {
  const [showMap, setShowMap] = useState(false)
  const { points, loading: loadingPoints, error: pointsError, load: loadPoints } =
    useParcoursPoints(parcours.id)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState(false)

  const toggleMap = useCallback(() => {
    if (showMap) {
      setShowMap(false)
      return
    }
    setShowMap(true)
    // Le tracé n'est pas dans la liste : on le charge au premier dépliage.
    void loadPoints()
  }, [showMap, loadPoints])

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    if (!file || !onReplaceGpx) return

    setUploadError(null)
    setUploadSuccess(false)
    setUploading(true)
    try {
      const text = await file.text()
      await onReplaceGpx(parcours.id, text)
      setUploadSuccess(true)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Impossible de remplacer le tracé')
    } finally {
      setUploading(false)
      input.value = ''
    }
  }, [parcours.id, onReplaceGpx])

  const distance = (parcours.distance_km || 0).toFixed(1)
  const elevation = parcours.elevation_gain_m ? `${Math.round(parcours.elevation_gain_m)}m D+` : ''
  const createdAt = parcours.created_at

  return (
    <Card className={isNext ? 'ring-2 ring-primary' : ''}>
      {isNext && (
        <div className="bg-primary/5 border-b border-primary/20 px-4 py-2">
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
            <MapPin className="w-4 h-4" />
            Prochain mercredi
          </span>
        </div>
      )}

      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{parcours.name}</h3>
            <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {distance} km
              </span>
              {elevation && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {elevation}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {format(new Date(createdAt || new Date()), 'dd MMM yyyy', { locale: fr })}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={toggleMap} aria-label={showMap ? 'Masquer la carte' : 'Voir la carte'}>
              <Eye className="w-4 h-4" />
            </Button>

            {/* Modification et suppression réservées à l'admin : un seul
                cadenas à la place des deux boutons. La carte reste
                visible, elle est inoffensive. */}
            {adminUnlocked ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => onEdit?.(parcours)} aria-label="Modifier">
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onDelete?.(parcours.id)} aria-label="Supprimer" className="text-error hover:text-error/80">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            ) : (
              onRequestAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRequestAdmin}
                  aria-label="Déverrouiller la gestion des parcours"
                  title="Code administrateur requis"
                >
                  <Lock className="w-4 h-4 text-gray-400" />
                </Button>
              )
            )}
          </div>
        </div>
      </CardHeader>

      {showMap && (
        <CardContent className="pb-2">
          {pointsError ? (
            <div className="h-64 rounded-lg bg-red-50 border border-red-200 flex flex-col items-center justify-center gap-2 px-4 text-center">
              <p className="text-sm text-red-700">{pointsError}</p>
              <Button variant="outline" size="sm" onClick={() => void loadPoints()}>
                Réessayer
              </Button>
            </div>
          ) : loadingPoints || points === null ? (
            <div className="h-64 rounded-lg bg-gray-100 flex items-center justify-center text-sm text-gray-500">
              Chargement du tracé…
            </div>
          ) : points.length > 0 ? (
            <div className="relative h-64 rounded-lg overflow-hidden">
              <LazyMapView points={points} height={256} interactive={false} />
            </div>
          ) : (
            <div className="h-64 rounded-lg bg-gray-100 flex items-center justify-center text-sm text-gray-500">
              Aucun tracé disponible
            </div>
          )}
        </CardContent>
      )}

      {onReplaceGpx && (
        <CardFooter className="pt-2 space-y-2">
          <div className="w-full">
            <input
              type="file"
              accept=".gpx"
              onChange={handleFileUpload}
              className="sr-only"
              id={`gpx-upload-${parcours.id}`}
              aria-label="Choisir un fichier GPX"
              disabled={uploading}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center gap-2"
              onClick={() => document.getElementById(`gpx-upload-${parcours.id}`)?.click()}
              disabled={uploading}
            >
              <Upload className="w-4 h-4" />
              <span>{uploading ? 'Remplacement…' : 'Remplacer le GPX'}</span>
            </Button>
          </div>

          {uploadError && (
            <p role="alert" className="text-sm text-error">
              {uploadError}
            </p>
          )}
          {uploadSuccess && (
            <p role="status" className="text-sm text-primary">
              Tracé remplacé.
            </p>
          )}
        </CardFooter>
      )}
    </Card>
  )
}
