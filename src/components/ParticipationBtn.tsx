import { CheckCircle2, XCircle, HelpCircle, User } from 'lucide-react'
import { Button } from './ui/Button'
import { Card, CardContent } from './ui/Card'
import { useAuth } from '../hooks/useAuth'
import { useParticipation } from '../hooks/useParticipation'

interface ParticipationBtnProps {
  parcoursId: string
  userName?: string
}

export function ParticipationBtn({ parcoursId, userName }: ParticipationBtnProps) {
  const { user } = useAuth()
  const { myVote, yesCount, noCount, setVote, loading } = useParticipation(parcoursId)

  const options: {
    value: 'yes' | 'no' | null
    label: string
    icon: React.ReactNode
    variant: 'primary' | 'danger' | 'outline'
  }[] = [
    { value: 'yes', label: 'Je participe', icon: <CheckCircle2 className="w-5 h-5" />, variant: 'primary' },
    { value: 'no', label: 'Je ne participe pas', icon: <XCircle className="w-5 h-5" />, variant: 'danger' },
    { value: null, label: 'Pas encore répondu', icon: <HelpCircle className="w-5 h-5" />, variant: 'outline' },
  ]

  const status = loading ? null : myVote
  const statusLabel =
    status === 'yes' ? 'Je participe' : status === 'no' ? 'Je ne participe pas' : 'Pas encore répondu'

  const handleVote = async (newStatus: 'yes' | 'no' | null) => {
    if (!user || !newStatus) return
    try {
      await setVote(newStatus)
    } catch (err) {
      console.error('[VOTE] Erreur:', err)
    }
  }

  return (
    <Card className="w-full">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <User className="w-6 h-6 text-gray-400" />
            <div>
              <p className="font-medium text-gray-900">{userName || 'Vous'}</p>
              <p className="text-sm text-gray-500">{statusLabel}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Participation">
            {options.map(opt => (
              <Button
                key={String(opt.value)}
                variant={status === opt.value ? opt.variant : 'outline'}
                size="md"
                onClick={() => void handleVote(opt.value)}
                disabled={loading}
                className={status === opt.value ? '' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}
              >
                <span className={opt.value === 'yes' ? 'text-primary' : opt.value === 'no' ? 'text-error' : 'text-gray-500'}>
                  {opt.icon}
                </span>
                <span>{opt.label}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Compteurs */}
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-center gap-4 text-sm">
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle2 className="w-4 h-4" />
            {yesCount} oui
          </span>
          <span className="flex items-center gap-1 text-red-600">
            <XCircle className="w-4 h-4" />
            {noCount} non
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
