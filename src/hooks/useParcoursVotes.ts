import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  castWeekVote,
  deleteWeekVote,
  getWeekVotes,
  getWeekAttendances,
  type ParcoursTally,
  type WeekVote,
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

/** Mêmes compteurs — évite de remplacer l'objet au polling. */
function sameTallies(
  a: Record<string, ParcoursTally>,
  b: Record<string, ParcoursTally>
): boolean {
  if (a === b) return true
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key) => {
    const x = a[key]
    const y = b[key]
    return (
      x != null &&
      y != null &&
      x.parcoursId === y.parcoursId &&
      x.yes === y.yes &&
      x.no === y.no
    )
  })
}

/** Mêmes choix (user_number → parcours) — évite de remplacer l'objet au polling. */
function sameChoices(a: Record<number, string>, b: Record<number, string>): boolean {
  if (a === b) return true
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key) => a[Number(key)] === b[Number(key)])
}

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
  // Dernière liste de présents connue, pour recharger les votes seuls après
  // une action sans refetcher les présences.
  const goingRef = useRef<Set<number> | null>(null)
  // Votes bruts du dernier chargement réussi : permet de recalculer les
  // compteurs quand seules les présences changent, sans repasser par le réseau.
  const votesRef = useRef<WeekVote[] | null>(null)
  // Dernière signature de présents traitée : distingue le premier passage
  // (undefined → liste) d'un vrai changement de présence.
  const lastGoingKeyRef = useRef<string | null>(null)

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

  // Liste stable par contenu : les appelants peuvent passer un littéral
  // (`[ALICE]`) sans recréer les callbacks à chaque rendu.
  const goingList = useMemo(() => {
    if (goingKey === 'unknown') return undefined
    return goingKey ? goingKey.split(',').map(Number) : []
  }, [goingKey])

  // Lu par `fetchVotes` : la liste des présents change souvent (quelqu'un
  // répond), mais elle ne doit pas recréer les callbacks ni redémarrer le
  // polling. Le recalcul local s'en charge (effet plus bas).
  const goingListRef = useRef<number[] | undefined>(goingList)
  goingListRef.current = goingList

  const parcoursKey = parcoursIds.join(',')
  const ids = useMemo(() => (parcoursKey ? parcoursKey.split(',') : []), [parcoursKey])

  const applyVotes = useCallback(
    (votes: WeekVote[], going: Set<number> | null) => {
      if (!user?.id) return

      const { tallies: recomputed, choices: nextChoices } = summarizeVotes(votes, going)
      setTallies((prev) => (sameTallies(prev, recomputed) ? prev : recomputed))
      setChoices((prev) => (sameChoices(prev, nextChoices) ? prev : nextChoices))
      setMyChoice((prev) => {
        const next = nextChoices[user.id] ?? null
        return prev === next ? prev : next
      })
    },
    [user?.id]
  )

  const fetchVotes = useCallback(
    async (opts?: { keepError?: boolean; forceAttendances?: boolean }) => {
      if (!user?.id) return

      const requestId = ++requestIdRef.current
      const requestedWeekKey = weekKey
      const isStale = () =>
        requestId !== requestIdRef.current || requestedWeekKey !== weekKeyRef.current

      try {
        // La liste des présents est déjà fournie par Home : inutile de
        // refetcher les présences à chaque cycle. Sans elle, on les charge
        // (premier passage, polling de repli, ou récupération après panne).
        const needAttendances =
          goingListRef.current === undefined &&
          (opts?.forceAttendances === true || goingRef.current === null)

        const [votesResult, attendancesResult] = await Promise.allSettled([
          getWeekVotes(requestedWeekKey),
          needAttendances ? getWeekAttendances(requestedWeekKey) : Promise.resolve(null),
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
        // fournie. Sans elle, on se rabat sur la requête, ou sur la dernière
        // liste connue pour un rechargement de votes seuls.
        //
        // ⚠️ Ne PAS fusionner les deux : une réponse « pas aujourd'hui »
        //    enregistrée en base serait ré-adding par la requête, et le
        //    vote continuerait d'être compté jusqu'au polling suivant.
        // Relue après la réponse : la liste des présents a pu changer pendant
        // la requête (quelqu'un vient de répondre). C'est la plus récente qui
        // fait autorité, même si aucun nouveau chargement n'a été lancé.
        const goingNow = goingListRef.current
        let going: Set<number> | null
        if (goingNow !== undefined) {
          going = new Set(goingNow)
          goingRef.current = going
        } else if (needAttendances) {
          if (attendancesResult.status === 'fulfilled' && attendancesResult.value) {
            going = goingSet(attendancesResult.value)
            goingRef.current = going
          } else {
            // Présences indisponibles : on compte tout plutôt que d'afficher
            // zéro. Une panne de présences ne doit pas effacer des votes
            // qui, eux, ont bien été chargés.
            console.warn('[VOTES] Présences indisponibles : comptage non filtré')
            going = null
            goingRef.current = null
          }
        } else {
          going = goingRef.current
        }

        votesRef.current = votesResult.value
        applyVotes(votesResult.value, going)

        if (!opts?.keepError) setError(null)
      } catch (err) {
        if (isStale()) return
        console.error('[VOTES] Erreur chargement:', err)
        setError(err instanceof Error ? err.message : 'Erreur chargement des votes')
      } finally {
        if (!isStale()) setLoading(false)
      }
    },
    [user?.id, weekKey, applyVotes]
  )

  const loadAll = useCallback(
    (opts?: { keepError?: boolean }) => fetchVotes({ ...opts, forceAttendances: true }),
    [fetchVotes]
  )

  /**
   * Après un vote, seule la table `participations` a changé. On recharge les
   * votes sans refetcher les présences, sauf si on n'a encore aucune liste
   * de présents (repli).
   */
  const loadVotesOnly = useCallback(
    (opts?: { keepError?: boolean }) => fetchVotes({ ...opts, forceAttendances: false }),
    [fetchVotes]
  )

  useEffect(() => {
    if (authLoading) return
    if (!user?.id) {
      goingRef.current = null
      votesRef.current = null
      lastGoingKeyRef.current = null
      setTallies({})
      setMyChoice(null)
      setChoices({})
      setLoading(false)
      return
    }

    goingRef.current = null
    votesRef.current = null
    lastGoingKeyRef.current = null
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

  /**
   * Les présents changent (quelqu'un vient de répondre) : on recalcule les
   * compteurs à partir des votes déjà chargés — aucun écran vidé, aucun
   * `loading`. C'est ce que promettait le commentaire de `goingKey`, mais
   * l'effet de montage se relançait à chaque changement.
   *
   * Un vote a pu être déposé juste après la réponse de présence : on
   * rafraîchit alors les votes seuls, en silence (pas de spinner, pas
   * d'effacement). Une requête rare, une par changement de présence.
   *
   * `undefined` = présences inconnues : on garde l'affichage courant plutôt
   * que de compter tous les votes, comme lors d'une panne.
   *
   * Déclaré après l'effet de montage : au changement de semaine, celui-ci
   * vide `votesRef` d'abord, donc ce recalcul ne peut pas réappliquer les
   * votes de la semaine précédente.
   */
  useEffect(() => {
    if (goingList === undefined) return

    const previousKey = lastGoingKeyRef.current
    lastGoingKeyRef.current = goingKey
    if (!votesRef.current) return

    const going = new Set(goingList)
    goingRef.current = going
    applyVotes(votesRef.current, going)

    // Premier passage (présences inconnues → liste) : le chargement initial
    // s'en occupe déjà, inutile de doubler.
    if (previousKey !== null && previousKey !== goingKey) {
      void loadVotesOnly({ keepError: true })
    }
  }, [goingList, goingKey, applyVotes, loadVotesOnly])

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
      if (goingList !== undefined && !goingList.includes(user.id)) {
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
          // Un vote accepté implique que la personne est présente (le
          // trigger DB le garantit). Sans liste de présents fournie, on
          // l'ajoute au repli pour que le rechargement des votes ne
          // l'écarte pas.
          if (goingList === undefined && goingRef.current) {
            goingRef.current = new Set(goingRef.current).add(user.id)
          }
        }

        // Action lancée avant la bascule : le rechargement de l'ancienne
        // semaine écraserait l'affichage de la nouvelle.
        if (actionWeekKey !== weekKeyRef.current) return
        // Recharge pour refléter l'état réel (l'upsert a pu remplacer un
        // vote). Seule `participations` a changé : on ne refetch pas les
        // présences.
        await loadVotesOnly({ keepError: true })
      } catch (err) {
        console.error('[VOTES] Erreur vote:', err)
        if (actionWeekKey !== weekKeyRef.current) return
        setError(err instanceof Error ? err.message : 'Erreur lors du vote')
        await loadVotesOnly({ keepError: true })
      } finally {
        setSavingParcoursId(null)
      }
    },
    [user, myChoice, weekKey, loadVotesOnly, goingList]
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
