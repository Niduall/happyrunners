import { useState, useEffect, useCallback, useRef } from 'react'
import { vote, getMyVote, getParticipationCounts, subscribeToParticipations } from '../services/supabaseService'
import { useAuth } from './useAuth'

export function useParticipation(parcoursId: string) {
  const { user, loading: authLoading } = useAuth()
  const [myVote, setMyVote] = useState<'yes' | 'no' | null>(null)
  const [yesCount, setYesCount] = useState(0)
  const [noCount, setNoCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadCounts = useCallback(async () => {
    if (!user || !parcoursId) return
    try {
      const counts = await getParticipationCounts(parcoursId)
      setYesCount(counts.yes)
      setNoCount(counts.no)
    } catch (err) {
      console.error('Erreur chargement compteurs:', err)
    }
  }, [parcoursId, user])

  const loadMyVote = useCallback(async () => {
    if (!user || !parcoursId) return
    try {
      const myVoteData = await getMyVote(parcoursId, user.id)
      setMyVote(myVoteData)
    } catch (err) {
      console.error('Erreur chargement vote:', err)
    }
  }, [parcoursId, user])

  const loadVote = useCallback(async () => {
    await Promise.all([loadMyVote(), loadCounts()])
    setLoading(false)
  }, [loadMyVote, loadCounts])

  useEffect(() => {
    if (!authLoading) {
      loadVote()
    }
  }, [authLoading, loadVote])

  useEffect(() => {
    if (!parcoursId) return

    // Temps réel Supabase (peut échouer sur plan gratuit)
    let unsubscribeRealtime = () => {}
    try {
      unsubscribeRealtime = subscribeToParticipations(parcoursId, (participations) => {
        const yes = participations.filter((p: any) => p.status === 'yes').length
        const no = participations.filter((p: any) => p.status === 'no').length
        setYesCount(yes)
        setNoCount(no)

        // Mon vote
        const myParticipation = participations.find((p: any) => p.user_id === user?.id)
        if (myParticipation) {
          setMyVote(myParticipation.status)
        }
      })
    } catch (err) {
      console.warn('Realtime non disponible pour participations:', err)
    }

    // Polling de secours (30s) - simule le temps réel sur plan gratuit
    pollingRef.current = setInterval(() => {
      loadCounts()
      loadMyVote()
    }, 30000)

    return () => {
      unsubscribeRealtime()
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [parcoursId, user, loadCounts, loadMyVote])

  const setVote = useCallback(async (status: 'yes' | 'no') => {
    if (!user || !parcoursId) return
    try {
      await vote(parcoursId, user.id, status)
      setMyVote(status)
      if (status === 'yes') {
        setYesCount(c => c + 1)
      } else {
        setNoCount(c => c + 1)
      }
      // Si on change de vote, décrémenter l'autre
      if (myVote && myVote !== status) {
        if (myVote === 'yes') setYesCount(c => c - 1)
        else setNoCount(c => c - 1)
      }
    } catch (err) {
      console.error('Erreur vote:', err)
      throw err
    }
  }, [user, parcoursId, myVote])

  const hasVoted = myVote !== null

  return {
    user,
    myVote,
    yesCount,
    noCount,
    loading: loading || true,
    setVote,
    hasVoted,
  }
}