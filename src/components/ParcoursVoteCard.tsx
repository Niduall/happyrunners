import { useEffect } from 'react'
import { Check, Trophy, MapPin, Scale, Eye } from 'lucide-react'
import type { ParcoursSummary } from '../types/supabase'
import { Button } from './ui/Button'
import { Card, CardContent } from './ui/Card'
import { MapView } from './MapView'
import { useParcoursPoints } from '../hooks/useParcoursPoints'

interface ParcoursVoteCardProps {
  parcours: ParcoursSummary
  isMyChoice: boolean
  yesCount: number
  isWinner: boolean
  /** true si le winner est un match nul (badge différent) */
  isTied?: boolean
  saving: boolean
  onToggle: () => void
  /**
   * Vote verrouillé : la présence n'est pas encore confirmée.
   * Les parcours restent visibles et les compteurs lisibles, mais aucun
   * bouton de vote n'est affiché — on n'affiche pas une action qui rejette
   * un clic. Le tracé reste consultable.
   */
  voteLocked?: boolean
  /** Carte du tracé ouverte (contrôlée par le parent). */
  mapOpen?: boolean
  /** Ouvre/ferme la carte ; absent → pas de bouton. */
  onToggleMap?: () => void
}

export function ParcoursVoteCard({
  parcours,
  isMyChoice,
  yesCount,
  isWinner,
  isTied = false,
  saving,
  onToggle,
  voteLocked = false,
  mapOpen = false,
  onToggleMap,
}: ParcoursVoteCardProps) {
  const { points, loading, error, load } = useParcoursPoints(parcours.id)

  useEffect(() => {
    if (mapOpen) void load()
  }, [mapOpen, load])

  return (
    <Card
      className={
        isTied && isWinner
          ? 'border-amber-300 ring-1 ring-amber-200'
          : isWinner
            ? 'border-primary/40 ring-1 ring-primary/20'
            : ''
      }
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {isWinner && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 mb-1 text-xs font-medium rounded-full ${
                  isTied ? 'bg-amber-100 text-amber-800' : 'bg-primary/10 text-primary'
                }`}
              >
                {isTied ? (
                  <>
                    <Scale className="w-3 h-3" />
                    Égalité
                  </>
                ) : (
                  <>
                    <Trophy className="w-3 h-3" />
                    En tête
                  </>
                )}
              </span>
            )}
            <h3 className="font-semibold text-gray-900 truncate">{parcours.name}</h3>
            {/* Tout le secondaire tient sur une ligne : distance, dénivelé,
                participation. Le nombre de votants n'a plus sa propre ligne. */}
            <p className="text-sm text-gray-500 flex items-center gap-x-1.5 gap-y-0.5 mt-0.5 flex-wrap">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">
                {parcours.distance_km.toFixed(1)} km
                {parcours.elevation_gain_m
                  ? ` · +${Math.round(parcours.elevation_gain_m)} m`
                  : ''}
              </span>
              <span aria-hidden="true">·</span>
              <span className="whitespace-nowrap">
                {yesCount} {yesCount > 1 ? 'personnes' : 'personne'}
              </span>
              {voteLocked && isMyChoice && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 font-medium text-primary">
                    <Check className="w-3.5 h-3.5" />
                    Mon choix
                  </span>
                </>
              )}
            </p>
          </div>

          {/* Le tracé n'est plus une ligne à lui seul : une icône suffit,
              avec une cible de 44 px et un libellé pour les lecteurs d'écran. */}
          {onToggleMap && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggleMap}
              aria-expanded={mapOpen}
              aria-controls={`parcours-map-${parcours.id}`}
              aria-label={mapOpen ? 'Masquer le tracé' : 'Voir le tracé'}
              title={mapOpen ? 'Masquer le tracé' : 'Voir le tracé'}
              className="-mr-2 -mt-2 shrink-0"
            >
              <Eye className="w-4 h-4" />
              {mapOpen ? 'Masquer' : 'Tracé'}
            </Button>
          )}
        </div>

        {/* Pas de bouton de vote tant que la présence n'est pas confirmée :
            le parcours reste visible et lisible, mais on n'affiche pas
            d'action qui rejette un clic. */}
        {!voteLocked && (
          <Button
            variant={isMyChoice ? 'primary' : 'outline'}
            size="sm"
            disabled={saving}
            onClick={onToggle}
            aria-pressed={isMyChoice}
            className={`mt-2 w-full sm:w-auto ${
              isMyChoice ? '' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Check className="w-4 h-4" />
            {isMyChoice ? 'Mon choix' : 'Je veux celui-ci'}
          </Button>
        )}

        {mapOpen && (
          <div id={`parcours-map-${parcours.id}`} className="mt-2">
            {error ? (
              <div className="h-60 rounded-lg bg-red-50 border border-red-200 flex flex-col items-center justify-center gap-2 px-4 text-center">
                <p className="text-sm text-red-700">{error}</p>
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  Réessayer
                </Button>
              </div>
            ) : loading || points === null ? (
              <div className="h-60 rounded-lg bg-gray-100 flex items-center justify-center text-sm text-gray-500">
                Chargement du tracé…
              </div>
            ) : points.length > 0 ? (
              <div className="relative h-60 rounded-lg overflow-hidden">
                <MapView points={points} height={240} interactive={false} />
              </div>
            ) : (
              <div className="h-60 rounded-lg bg-gray-100 flex items-center justify-center text-sm text-gray-500">
                Aucun tracé disponible
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
