import { Smile, Coffee, Calendar } from 'lucide-react'
import type { AttendanceStatus } from '../services/supabaseService'
import { Button } from './ui/Button'
import { Card, CardContent } from './ui/Card'

interface AttendanceBannerProps {
  myStatus: AttendanceStatus | null
  saving: boolean
  /** « Mercredi 28 octobre · 12h30 · dans 3 jours » */
  subtitle: string
  onChange: (status: AttendanceStatus) => void
}

export function AttendanceBanner({ myStatus, saving, subtitle, onChange }: AttendanceBannerProps) {
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
          <div className="min-w-0">
            <p className="text-lg font-semibold text-gray-900">Tu viens ?</p>
            <p className="text-sm text-gray-500 mt-0.5 flex items-start gap-1.5">
              <Calendar className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{subtitle}</span>
            </p>
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
            {/* Refuser une sortie n'est pas une action destructive : gris,
                jamais rouge. Le rouge reste réservé aux suppressions. */}
            <Button
              variant={myStatus === 'skip' ? 'secondary' : 'outline'}
              size="sm"
              disabled={saving}
              onClick={() => onChange('skip')}
              aria-pressed={myStatus === 'skip'}
            >
              <Coffee className="w-4 h-4" />
              Pas cette semaine
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
