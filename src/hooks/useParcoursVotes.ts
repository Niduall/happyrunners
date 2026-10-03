import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  castWeekVote,
  deleteWeekVote,
  getWeekTallies,
  getWeekVotes,
  type ParcoursTally,
  type WeekVote,
} from '../services/supabaseService'
import { useTargetWednesday } from './useTargetWednesday'
import { useAuth } from './useAuth'

const POLL_INTERVAL_MS = 30000

export interface WeekVoteState {
  /** Parcours -> compteurs de la semaine */
  tallies: Record<string, ParcoursTally>
  /** Le parcours que J'ai choisi (un seul), null si aucun */
  myChoice: string | null
  weekKey: string
  weekLabel: string
  loading: boolean
  savingParcoursId: string | null
  error: string | null
  /** Ajoute ou retire ce parcours de mon choix */
  toggleChoice: (parcoursId: string) => Promise<void>
  /** Le parcours choisi par une personne donnée, null si aucun */
  choiceOf: (localUserId: string) => string | null
  /** Parcours trié : plus de votes décroissant */
  rankedParcoursIds: string[]
}

const cellKey = (parcoursId: string, localUserId: string) => `${parcoursId}|${localUserId}`

export function useParcoursVotes(parcoursIds: string[]): WeekVoteState {
  const { user, loading: authLoading } = useAuth()
  const [tallies, setTallies] = useState<Record<string, ParcoursTally>>({})
  const [myChoice, setMyChoice] = useState<string | null>(null)
  const [choices, setChoices] = useState<Record<string, string>>({}) // userId → parcoursId
  const [loading, setLoading] = useState(true)
  const [savingParcoursId, setSavingParcoursId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { weekKey, weekLabel } = useTargetWednesday()

  const parcoursKey = parcoursIds.join(',')
  const ids = useMemo(() => (parcoursKey ? parcoursKey.split(',') : []), [parcoursKey])

  const loadAll = useCallback(
    async (opts?: { keepError?: boolean }) => {
      if (!user?.id) return
      try {
        const [tallyList, voteList] = await Promise.all([
          getWeekTallies(weekKey),
          getWeekVotes(weekKey),
        ])

        const nextTallies: Record<string, ParcoursTally> = {}
        for (const t of tallyList) nextTallies[t.parcoursId] = t
        setTallies(nextTallies)

        // Un seul choix par personne et par semaine
        const nextChoices: Record<string, string> = {}
        for (const v of voteList as WeekVote[]) {
          if (v.localUserId) nextChoices[v.localUserId] = v.parcoursId
        }
        setChoices(nextChoices)
        setMyChoice(nextChoices[user.id] ?? null)

        if (!opts?.keepError) setError(null)
      } catch (err) {
        console.error('[VOTES] Erreur chargement:', err)
        setError(err instanceof Error ? err.message : 'Erreur chargement des votes')
      } finally {
        setLoading(false)
      }
    },
    [user?.id, weekKey]
  )

  useEffect(() => {
    if (authLoading) return
    if (!user?.id) {
      setTallies({})
      setMyChoice(null)
      setChoices({})
      setLoading(false)
      return
    }

    setLoading(true)
    setTallies({})
    setMyChoice(null)
    setChoices({})

    void loadAll()

    pollingRef.current = setInterval(() => {
      void loadAll()
    }, POLL_INTERVAL_MS)

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [authLoading, user?.id, loadAll])

  const toggleChoice = useCallback(
    async (parcoursId: string) => {
      if (!user?.id) {
        console.error('[VOTES] Vote ignoré : non connecté', { parcoursId })
        setError('Connecte-toi pour voter')
        return
      }

      const previousChoice = myChoice
      const isRemoving = previousChoice === parcoursId

      setSavingParcoursId(parcoursId)
      // Optimiste : l'upsert remplace le choix précédent, donc on décrémente
      // l'ancien parcours et on incrémente le nouveau.
      setMyChoice(isRemoving ? null : parcoursId)
      setChoices((prev) => {
        const next = { ...prev }
        if (isRemoving) delete next[user.id]
        else next[user.id] = parcoursId
        return next
      })
      setTallies((prev) => {
        const next = { ...prev }
        if (previousChoice && previousChoice !== parcoursId) {
          const old = next[previousChoice] ?? { parcoursId: previousChoice, yes: 0, no: 0 }
          next[previousChoice] = { ...old, yes: Math.max(0, old.yes - 1) }
        }
        const t = next[parcoursId] ?? { parcoursId, yes: 0, no: 0 }
        next[parcoursId] = { ...t, yes: isRemoving ? Math.max(0, t.yes - 1) : t.yes + 1 }
        return next
      })

      try {
        if (isRemoving) {
          await deleteWeekVote(parcoursId, user.id, weekKey)
        } else {
          await castWeekVote({
            parcoursId,
            localUserId: user.id,
            status: 'yes',
            weekKey,
            identity: { firstName: user.firstName, lastName: user.lastName },
          })
        }
        // Recharge pour refléter l'état réel (l'upsert a pu remplacer un vote)
        await loadAll({ keepError: true })
      } catch (err) {
        console.error('[VOTES] Erreur vote:', err)
        setError(err instanceof Error ? err.message : 'Erreur lors du vote')
        await loadAll({ keepError: true })
      } finally {
        setSavingParcoursId(null)
      }
    },
    [user, myChoice, weekKey, loadAll]
  )

  const choiceOf = useCallback(
    (localUserId: string): string | null => choices[localUserId] ?? null,
    [choices]
  )

  const rankedParcoursIds = useMemo(
    () =>
      [...ids].sort((a, b) => {
        const ta = tallies[a]?.yes ?? 0
        const tb = tallies[b]?.yes ?? 0
        return tb - ta
      }),
    [ids, tallies]
  )

  return {
    tallies,
    myChoice,
    weekKey,
    weekLabel,
    loading: loading || authLoading,
    savingParcoursId,
    error,
    toggleChoice,
    choiceOf,
    rankedParcoursIds,
  }
}
