import { Check, Trophy, MapPin } from 'lucide-react'
import type { Parcours } from '../types/supabase'
import { Button } from './ui/Button'
import { Card, CardContent } from './ui/Card'

interface ParcoursVoteCardProps {
  parcours: Parcours
  isMyChoice: boolean
  yesCount: number
  isWinner: boolean
  saving: boolean
  onToggle: () => void
}

export function ParcoursVoteCard({
  parcours,
  isMyChoice,
  yesCount,
  isWinner,
  saving,
  onToggle,
}: ParcoursVoteCardProps) {
  return (
    <Card className={isWinner ? 'border-primary/40 ring-1 ring-primary/20' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              {isWinner && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded-full">
                  <Trophy className="w-3 h-3" />
                  En tête
                </span>
              )}
              <span className="text-xs text-gray-500">
                {yesCount} {yesCount > 1 ? 'personnes' : 'personne'}
              </span>
            </div>
            <h3 className="font-semibold text-gray-900 truncate">{parcours.name}</h3>
            <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3.5 h-3.5" />
              {parcours.distance_km?.toFixed(1)} km
              {parcours.elevation_gain_m ? ` · +${Math.round(parcours.elevation_gain_m)} m` : ''}
            </p>
          </div>

          <Button
            variant={isMyChoice ? 'primary' : 'outline'}
            size="sm"
            disabled={saving}
            onClick={onToggle}
            aria-pressed={isMyChoice}
            className={isMyChoice ? '' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}
          >
            <Check className="w-4 h-4" />
            {isMyChoice ? 'Mon choix' : 'Je veux celui-ci'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
