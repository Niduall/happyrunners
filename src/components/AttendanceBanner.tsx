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
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-primary">Run du mercredi</p>
            <p className="text-xs text-gray-500">{weekLabel}</p>
          </div>

          <div className="flex gap-2" role="group" aria-label="Participation">
            <Button
              variant={myStatus === 'going' ? 'primary' : 'outline'}
              size="sm"
              disabled={saving}
              onClick={() => onChange('going')}
              aria-pressed={myStatus === 'going'}
              className={myStatus === 'going' ? '' : 'border-gray-300 text-gray-700 hover:bg-white'}
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
              className={myStatus === 'skip' ? '' : 'border-gray-300 text-gray-700 hover:bg-white'}
            >
              <Coffee className="w-4 h-4" />
              Pas aujourd'hui
            </Button>
          </div>
        </div>

        {myStatus === null && (
          <p className="text-xs text-gray-500 mt-2">Tu n'as pas encore répondu pour cette semaine.</p>
        )}

        {myStatus === 'skip' && (
          <p className="text-xs text-gray-500 mt-2">
            Ton choix de parcours a été retiré — tu ne viens pas, donc ça ne compte pas.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
