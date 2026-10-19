import { Smile, Coffee } from 'lucide-react'
import type { AttendanceStatus } from '../services/supabaseService'
import { Button } from './ui/Button'
import { Card, CardContent } from './ui/Card'

interface AttendanceBannerProps {
  myStatus: AttendanceStatus | null
  saving: boolean
  weekLabel: string
  onChange: (status: AttendanceStatus) => void
}

export function AttendanceBanner({ myStatus, saving, weekLabel, onChange }: AttendanceBannerProps) {
  // Tant que la question n'a pas reçu de réponse, l'encadré se signale.
  // Une fois répondu, il se calme : la réponse est connue, inutile d'y
  // attirer l'œil à chaque visite.
  const answered = myStatus !== null

  return (
    <Card
      className={
        answered
          ? 'border-primary/20 bg-primary/5'
          : 'border-primary/40 bg-primary/10 ring-1 ring-primary/20'
      }
    >
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {/* Même taille que « Météo pour la course » et « Qui vient ? » */}
            <p className="text-lg font-semibold text-gray-900">Tu viens ?</p>
            <p className="text-xs text-gray-500 mt-0.5">Run du mercredi · {weekLabel}</p>
          </div>

          {/* Rien n'est choisi : les deux boutons restent en contour.
              Un bouton rempli alors que la question est sans réponse donne
              l'illusion d'un choix déjà fait — défaut relevé en usage réel. */}
          <div className="flex gap-2" role="group" aria-label="Participation">
            <Button
              variant={myStatus === 'going' ? 'primary' : 'outline'}
              size="sm"
              disabled={saving}
              onClick={() => onChange('going')}
              aria-pressed={myStatus === 'going'}
            >
              <Smile className="w-4 h-4" />
              Je viens
            </Button>
            <Button
              variant={myStatus === 'skip' ? 'danger' : 'outline'}
              size="sm"
              disabled={saving}
              onClick={() => onChange('skip')}
              aria-pressed={myStatus === 'skip'}
            >
              <Coffee className="w-4 h-4" />
              Pas aujourd'hui
            </Button>
          </div>
        </div>

        {!answered && (
          <p className="mt-3 text-sm font-medium text-primary">
            Tu n'as pas encore répondu pour cette semaine.
          </p>
        )}
      </CardContent>
    </Card>
  )
}