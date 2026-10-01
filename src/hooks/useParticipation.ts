import { useState, useEffect, useCallback, useRef } from 'react'
import { vote, getMyVote, getParticipationCounts } from '../services/supabaseService'
import { useAuth } from './useAuth'

const POLL_INTERVAL_MS = 30000

export function useParticipation(parcoursId: string) {
  const { user, loading: authLoading } = useAuth()
  const [myVote, setMyVote] = useState<'yes' | 'no' | null>(null)
  const [yesCount, setYesCount] = useState(0)
  const [noCount, setNoCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadCounts = useCallback(async () => {
    if (!parcoursId) return
    try {
      const counts = await getParticipationCounts(parcoursId)
      setYesCount(counts.yes)
      setNoCount(counts.no)
    } catch (err) {
      console.error('[VOTE] Erreur chargement compteurs:', err)
    }
  }, [parcoursId])

  const loadMyVote = useCallback(async () => {
    if (!user?.id || !parcoursId) return
    try {
      const voteStatus = await getMyVote(parcoursId, user.id)
      setMyVote(voteStatus)
    } catch (err) {
      console.error('[VOTE] Erreur chargement vote:', err)
    }
  }, [parcoursId, user?.id])

  // Chargement initial + polling 30s
  useEffect(() => {
    if (authLoading || !parcoursId) return

    let cancelled = false

    const refresh = async () => {
      await Promise.all([loadMyVote(), loadCounts()])
      if (!cancelled) setLoading(false)
    }

    void refresh()
    pollingRef.current = setInterval(() => {
      void loadMyVote()
      void loadCounts()
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [authLoading, parcoursId, user?.id, loadMyVote, loadCounts])

  const setVote = useCallback(
    async (status: 'yes' | 'no') => {
      if (!user?.id || !parcoursId) return
      setSaving(true)
      const previous = myVote
      try {
        await vote(parcoursId, user.id, status)
        setMyVote(status)
        // Recalcul optimiste des compteurs
        setYesCount(c => c + (status === 'yes' ? 1 : 0) - (previous === 'yes' ? 1 : 0))
        setNoCount(c => c + (status === 'no' ? 1 : 0) - (previous === 'no' ? 1 : 0))
      } catch (err) {
        console.error('[VOTE] Erreur vote:', err)
        throw err
      } finally {
        setSaving(false)
      }
    },
    [user?.id, parcoursId, myVote]
  )

  return {
    myVote,
    yesCount,
    noCount,
    loading: loading || authLoading,
    saving,
    setVote,
    hasVoted: myVote !== null,
  }
}
