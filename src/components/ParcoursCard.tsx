import { useState, useCallback } from 'react'
import { MapPin, Calendar, Upload, Trash2, Edit2, Eye } from 'lucide-react'
import { Button } from './ui/Button'
import { Card, CardHeader, CardContent, CardFooter } from './ui/Card'
import { MapView } from './MapView'
import { parseGPX } from '../services/gpxParser'
import type { Parcours } from '../types'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface ParcoursCardProps {
  parcours: Parcours
  isNext?: boolean
  onEdit?: (parcours: Parcours) => void
  onDelete?: (id: string) => void
  onView?: (parcours: Parcours) => void
  showActions?: boolean
}

export function ParcoursCard({ parcours, isNext, onEdit, onDelete, onView, showActions = true }: ParcoursCardProps) {
  const [showMap, setShowMap] = useState(false)
  const [uploading, setUploading] = useState(false)

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const text = await file.text()
    const parsed = parseGPX(text)
    
    if (parsed) {
      parsed.id = parcours.id
      parsed.name = parcours.name
      parsed.updatedAt = new Date().toISOString()
      if (onEdit) onEdit(parsed)
    }
    setUploading(false)
    e.target.value = ''
  }, [parcours.id, onEdit])

  const distance = (parcours.distance || parcours.distance_km || 0).toFixed(1)
  const elevation = (parcours.elevationGain || parcours.elevation_gain_m) ? `${parcours.elevationGain || parcours.elevation_gain_m}m D+` : ''
  const createdAt = parcours.createdAt || parcours.created_at

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

          {showActions && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setShowMap(!showMap)} aria-label={showMap ? 'Masquer la carte' : 'Voir la carte'}>
                <Eye className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onEdit?.(parcours)} aria-label="Modifier">
                <Edit2 className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onDelete?.(parcours.id)} aria-label="Supprimer" className="text-error hover:text-error/80">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      {showMap && parcours.points.length > 0 && (
        <CardContent className="pb-2">
          <div className="relative h-64 rounded-lg overflow-hidden">
            <MapView points={parcours.points} height={256} interactive={false} />
          </div>
        </CardContent>
      )}

      {showActions && (
        <CardFooter className="pt-2">
          <label className="w-full">
            <input
              type="file"
              accept=".gpx"
              onChange={handleFileUpload}
              className="sr-only"
              id={`gpx-upload-${parcours.id}`}
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
              <span>{uploading ? 'Import...' : 'Importer GPX'}</span>
            </Button>
          </label>
        </CardFooter>
      )}

      {onView && !showActions && (
        <CardContent className="pt-2">
          <Button variant="outline" size="sm" className="w-full" onClick={() => onView(parcours)}>
            Voir le parcours
          </Button>
        </CardContent>
      )}
    </Card>
  )
}