import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  castWeekVote,
  deleteWeekVote,
  getWeekVotes,
  getWeekAttendances,
  type ParcoursTally,
} from '../services/supabaseService'
import { goingSet, summarizeVotes } from '../services/voteTallies'
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
  choiceOf: (userNumber: number) => string | null
  /** Parcours trié : plus de votes décroissant */
  rankedParcoursIds: string[]
  /** Les parcours les plus plébiscités (plusieurs si égalité) */
  winners: string[]
  /** true si 2+ parcours sont à égalité au premier rang */
  isTie: boolean
}

const cellKey = (parcoursId: string, userNumber: number) => `${parcoursId}|${userNumber}`

export function useParcoursVotes(
  parcoursIds: string[],
  /** Noms des parcours — sert au tri alphabétique stable en cas d'égalité */
  parcoursNames: Record<string, string> = {},
  /**
   * user_number des personnes ayant répondu « je viens » cette semaine.
   *
   * Un vote ne compte que si elle figure dans cette liste. Sans elle, le
   * vote de quelqu'un qui vient de dire « pas aujourd'hui » continuerait
   * d'être compté jusqu'au prochain polling.
   */
  goingUserNumbers?: number[]
): WeekVoteState {
  const { user, loading: authLoading } = useAuth()
  const [tallies, setTallies] = useState<Record<string, ParcoursTally>>({})
  const [myChoice, setMyChoice] = useState<string | null>(null)
  const [choices, setChoices] = useState<Record<number, string>>({}) // userNumber → parcoursId
  const [loading, setLoading] = useState(true)
  const [savingParcoursId, setSavingParcoursId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const requestIdRef = useRef(0)

  const { weekKey, weekLabel } = useTargetWednesday()
  // Voir useAttendance : une réponse de l'ancienne semaine ne doit jamais
  // écraser l'affichage de la nouvelle.
  const weekKeyRef = useRef(weekKey)
  weekKeyRef.current = weekKey

  // Signature des présents : change dès que quelqu'un répond, ce qui
  // recalcule les compteurs sans attendre le polling.
  //
  // `undefined` = présences inconnues (chargement ou panne), à distinguer
  // d'une liste vide = personne ne vient. Sinon le hook ne réagirait pas
  // au passage de l'un à l'autre.
  const goingKey = goingUserNumbers === undefined ? 'unknown' : goingUserNumbers.join(',')

  const parcoursKey = parcoursIds.join(',')
  const ids = useMemo(() => (parcoursKey ? parcoursKey.split(',') : []), [parcoursKey])

  const loadAll = useCallback(
    async (opts?: { keepError?: boolean }) => {
      if (!user?.id) return

      const requestId = ++requestIdRef.current
      const requestedWeekKey = weekKey
      const isStale = () =>
        requestId !== requestIdRef.current || requestedWeekKey !== weekKeyRef.current

      try {
        const [votesResult, attendancesResult] = await Promise.allSettled([
          getWeekVotes(requestedWeekKey),
          getWeekAttendances(requestedWeekKey),
        ])
        if (isStale()) return

        // Les votes sont la donnée principale : sans eux, rien à afficher.
        if (votesResult.status === 'rejected') throw votesResult.reason

        // ⚠️ Un vote ne compte que si la personne a dit « je viens ».
        // Deux cas réels de votes qui ne doivent pas peser :
        //  - elle a répondu « pas aujourd'hui » (la suppression en base peut
        //    avoir échoué, ou le client n'a pas encore rechargé)
        //  - elle a voté sans jamais répondre à la présence
        //
        // La prop est l'état d'affichage : elle fait autorité quand elle est
        // fournie. Sans elle, on se rabat sur la requête.
        //
        // ⚠️ Ne PAS fusionner les deux : une réponse « pas aujourd'hui »
        //    enregistrée en base serait ré-adding par la requête, et le
        //    vote continuerait d'être compté jusqu'au polling suivant.
        let going: Set<number> | null
        if (goingUserNumbers !== undefined) {
          going = new Set(goingUserNumbers)
        } else if (attendancesResult.status === 'fulfilled') {
          going = goingSet(attendancesResult.value)
        } else {
          // Présences indisponibles : on compte tout plutôt que d'afficher
          // zéro. Une panne de présences ne doit pas effacer des votes
          // qui, eux, ont bien été chargés.
          console.warn('[VOTES] Présences indisponibles : comptage non filtré')
          going = null
        }

        const { tallies: recomputed, choices: nextChoices } = summarizeVotes(
          votesResult.value,
          going
        )
        setTallies(recomputed)
        setChoices(nextChoices)
        setMyChoice(nextChoices[user.id] ?? null)

        if (!opts?.keepError) setError(null)
      } catch (err) {
        if (isStale()) return
        console.error('[VOTES] Erreur chargement:', err)
        setError(err instanceof Error ? err.message : 'Erreur chargement des votes')
      } finally {
        if (!isStale()) setLoading(false)
      }
    },
    [user?.id, weekKey, goingKey]
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

      // Le bouton est désactivé tant que la présence n'est pas confirmée,
      // mais l'interface n'est pas une garantie : cette garde empêche
      // d'écrire un vote depuis un état obsolète (autre onglet, cache,
      // appel direct à toggleChoice).
      if (goingUserNumbers !== undefined && !goingUserNumbers.includes(user.id)) {
        console.error('[VOTES] Vote ignoré : présence non confirmée', { parcoursId })
        return
      }

      const previousChoice = myChoice
      const isRemoving = previousChoice === parcoursId
      const actionWeekKey = weekKey

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
          await deleteWeekVote(user.id, actionWeekKey)
        } else {
          await castWeekVote({
            parcoursId,
            userNumber: user.id,
            weekKey: actionWeekKey,
          })
        }

        // Action lancée avant la bascule : le rechargement de l'ancienne
        // semaine écraserait l'affichage de la nouvelle.
        if (actionWeekKey !== weekKeyRef.current) return
        // Recharge pour refléter l'état réel (l'upsert a pu remplacer un vote)
        await loadAll({ keepError: true })
      } catch (err) {
        console.error('[VOTES] Erreur vote:', err)
        if (actionWeekKey !== weekKeyRef.current) return
        setError(err instanceof Error ? err.message : 'Erreur lors du vote')
        await loadAll({ keepError: true })
      } finally {
        setSavingParcoursId(null)
      }
    },
    [user, myChoice, weekKey, loadAll, goingUserNumbers]
  )

  const choiceOf = useCallback(
    (userNumber: number): string | null => choices[userNumber] ?? null,
    [choices]
  )

  const rankedParcoursIds = useMemo(
    () =>
      [...ids].sort((a, b) => {
        const ta = tallies[a]?.yes ?? 0
        const tb = tallies[b]?.yes ?? 0
        if (tb !== ta) return tb - ta
        // Égalité → tri alphabétique déterministe, sinon l'ordre dépend de
        // l'implémentation de sort() et peut changer d'un rechargement à l'autre.
        return (parcoursNames[a] ?? '').localeCompare(parcoursNames[b] ?? '', 'fr')
      }),
    [ids, tallies, parcoursNames]
  )

  /**
   * Parcours en tête : le(s) plus plébiscité(s).
   * - 1 seul gagnant  → [id]
   * - égalité de voix  → tous les ids concernés (départage hors app)
   * - aucun vote      → []
   */
  const winners = useMemo(() => {
    const max = Math.max(0, ...ids.map((id) => tallies[id]?.yes ?? 0))
    if (max === 0) return []
    return ids.filter((id) => (tallies[id]?.yes ?? 0) === max)
  }, [ids, tallies])

  /** true s'il y a une égalité entre 2+ parcours (au moins un vote) */
  const isTie = winners.length > 1

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
    winners,
    isTie,
  }
}
