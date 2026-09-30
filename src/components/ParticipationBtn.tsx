import { useState, useEffect, useCallback } from 'react'
import { CheckCircle2, XCircle, HelpCircle, User } from 'lucide-react'
import { Button } from './ui/Button'
import { Card, CardContent } from './ui/Card'
import { useAuth } from '../hooks/useAuth'
import { vote, getMyVote, getParticipationCounts, subscribeToParticipations } from '../services/supabaseService'
import type { ParticipationStatus } from '../types'

interface ParticipationBtnProps {
  parcoursId: string
  userName?: string
}

export function ParticipationBtn({ parcoursId, userName }: ParticipationBtnProps) {
  const { user } = useAuth()
  const [status, setStatus] = useState<ParticipationStatus>(null)
  const [yesCount, setYesCount] = useState(0)
  const [noCount, setNoCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [voting, setVoting] = useState(false)

  const loadCounts = useCallback(async () => {
    try {
      const counts = await getParticipationCounts(parcoursId)
      setYesCount(counts.yes)
      setNoCount(counts.no)
    } catch (err) {
      console.error('Erreur chargement compteurs:', err)
    }
  }, [parcoursId])

  // Écouter les changements temps réel
  useEffect(() => {
    if (!parcoursId) return

    const unsubscribe = subscribeToParticipations(parcoursId, (participations) => {
      const yes = participations.filter((p: any) => p.status === 'yes').length
      const no = participations.filter((p: any) => p.status === 'no').length
      setYesCount(yes)
      setNoCount(no)

      // Mon vote - utilise local_user_id
      const myParticipation = participations.find((p: any) => p.local_user_id === user?.id)
      if (myParticipation) {
        setStatus(myParticipation.status)
      }
    })

    return () => unsubscribe()
  }, [parcoursId, user])

  // Chargement initial
  useEffect(() => {
    loadCounts()
    setLoading(false)
  }, [loadCounts])

  const options: { value: ParticipationStatus; label: string; icon: React.ReactNode; variant: 'primary' | 'danger' | 'outline' }[] = [
    { value: 'yes', label: 'Je participe', icon: <CheckCircle2 className="w-5 h-5" />, variant: 'primary' },
    { value: 'no', label: 'Je ne participe pas', icon: <XCircle className="w-5 h-5" />, variant: 'danger' },
    { value: null, label: 'Pas encore répondu', icon: <HelpCircle className="w-5 h-5" />, variant: 'outline' },
  ]

  const handleVote = async (newStatus: ParticipationStatus) => {
    if (!user || voting || !newStatus) return
    setVoting(true)
    try {
      await vote(parcoursId, user.id, newStatus)
    } catch (err) {
      console.error('Erreur vote:', err)
    } finally {
      setVoting(false)
    }
  }

  if (true) { // Always render, loading handled by parent
    const optionsWithCount = [
      { ...options[0], count: yesCount },
      { ...options[1], count: noCount },
    ]
  }

  return (
    <Card className="w-full">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <User className="w-6 h-6 text-gray-400" />
            <div>
              <p className="font-medium text-gray-900">{userName || 'Vous'}</p>
              <p className="text-sm text-gray-500">
                {status === 'yes' ? 'Je participe' : status === 'no' ? 'Je ne participe pas' : 'Pas encore répondu'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Participation">
            {options.map(opt => (
              <Button
                key={opt.value}
                variant={status === opt.value ? opt.variant : 'outline'}
                size="md"
                onClick={() => handleVote(opt.value)}
                disabled={voting}
                className={status === opt.value ? '' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}
              >
                <span className={opt.value === 'yes' ? 'text-primary' : opt.value === 'no' ? 'text-error' : 'text-gray-500'}>{opt.icon}</span>
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