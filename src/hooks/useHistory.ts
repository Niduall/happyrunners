import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  declareWeeklyRun,
  deleteWeeklyRun,
  getAllProfiles,
  getHistoryAttendances,
  getHistoryVotes,
  getParcours,
  getPendingProposals,
  getWeeklyRuns,
  setProposalStatus,
} from '../services/supabaseService'
import {
  buildHistoryWeeks,
  computeHistoryStats,
  pastWeekKeys,
  type HistoryStats,
  type HistoryWeek,
} from '../services/history'
import { weekKeyForRunDate } from '../services/weekKey'
import { clearRunReminderDismissal } from '../services/runReminderDismissal'
import { useTargetWednesday } from './useTargetWednesday'
import type {
  ImportProposal,
  ParcoursSummary,
  ProfileIdentity,
  WeeklyRunSource,
} from '../types/supabase'

/** Douze mercredis : un trimestre, assez pour voir une série et rester léger. */
export const HISTORY_WEEKS = 12

export interface RunChoice {
  parcoursId: string | null
  parcoursName: string
  distanceKm: number | null
  elevationGainM: number | null
  /**
   * D'où viennent la distance et le D+ : `manual` pour un parcours de la
   * liste, `gpx` quand un fichier a été joint à une sortie « autre ».
   * Absent = `manual`.
   */
  source?: WeeklyRunSource
}

export function useHistory(userNumber: number | null) {
  const { weekKey } = useTargetWednesday()
  const [weeks, setWeeks] = useState<HistoryWeek[]>([])
  const [parcours, setParcours] = useState<ParcoursSummary[]>([])
  const [proposals, setProposals] = useState<ImportProposal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingWeek, setSavingWeek] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const weekKeys = useMemo(
    () => pastWeekKeys(weekKey, HISTORY_WEEKS),
    [weekKey]
  )

  /**
   * Seule la sortie la plus récente reste modifiable, jusqu'à la bascule du
   * mercredi suivant à 14h. `pastWeekKeys` renvoie le plus récent en tête :
   * `weekKeys[0]` est donc la semaine encore ouverte. Après la bascule, la
   * semaine qui vient de se terminer prend sa place.
   *
   * C'est une règle d'interface, pas une sécurité : la RLS est ouverte et la
   * clé anon est dans le bundle. Elle empêche une correction de bonne foi de
   * réécrire un classement passé, pas une écriture délibérée via l'API.
   */
  const editableWeekKey = weekKeys[0] ?? null

  const refuseIfFrozen = useCallback(
    (weekKeyToSave: string): boolean => {
      if (weekKeyToSave === editableWeekKey) return false
      setError(
        'Cette semaine est figée : seule la sortie la plus récente peut être modifiée, jusqu’au mercredi 14h.'
      )
      return true
    },
    [editableWeekKey]
  )

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current
    const isStale = () => requestId !== requestIdRef.current

    try {
      const [attendances, votes, runs, parcoursList] = await Promise.all([
        getHistoryAttendances(weekKeys),
        getHistoryVotes(weekKeys),
        getWeeklyRuns(weekKeys),
        getParcours(),
      ])

      // L'annuaire ne sert qu'à afficher les prénoms. Une panne de cette
      // requête ne doit pas vider l'historique.
      let profiles: ProfileIdentity[] = []
      try {
        profiles = await getAllProfiles()
      } catch (err) {
        console.warn('[HISTORY] Annuaire indisponible:', err)
      }

      // Ce que la montre a proposé. Une panne de ce tuyau ne doit jamais
      // casser l'historique : on affiche simplement « rien à valider ».
      let pending: ImportProposal[] = []
      if (userNumber != null) {
        try {
          pending = await getPendingProposals(userNumber)
        } catch (err) {
          console.warn('[HISTORY] Propositions indisponibles:', err)
        }
      }

      if (isStale()) return

      setParcours(parcoursList)
      setProposals(pending)
      setWeeks(
        buildHistoryWeeks({
          weekKeys,
          attendances,
          votes,
          runs,
          parcours: parcoursList,
          profiles,
          userNumber,
        })
      )
      setError(null)
    } catch (err) {
      if (isStale()) return
      console.error('[HISTORY] Erreur chargement:', err)
      setError(
        err instanceof Error ? err.message : 'Erreur chargement de l’historique'
      )
    } finally {
      if (!isStale()) setLoading(false)
    }
  }, [weekKeys, userNumber])

  useEffect(() => {
    setLoading(true)
    void refresh()
  }, [refresh])

  /**
   * Revenir sur l'onglet recharge l'historique : les autres appareils ne
   * préviennent pas, et une sortie déclarée entre-temps restait invisible
   * jusqu'au rechargement complet de la page. Pas de `loading` ici : on
   * rafraîchit en silence, sans faire clignoter la page.
   */
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [refresh])

  const declare = useCallback(
    async (weekKeyToSave: string, choice: RunChoice): Promise<boolean> => {
      if (userNumber == null) {
        setError('Connecte-toi pour indiquer ton parcours')
        return false
      }
      if (refuseIfFrozen(weekKeyToSave)) return false

      setSavingWeek(weekKeyToSave)
      try {
        await declareWeeklyRun({
          weekKey: weekKeyToSave,
          userNumber,
          parcoursId: choice.parcoursId,
          parcoursName: choice.parcoursName,
          distanceKm: choice.distanceKm,
          elevationGainM: choice.elevationGainM,
          source: choice.source ?? 'manual',
        })
        // Une sortie déclarée annule « je n'ai pas couru » pour la semaine
        // (trigger en base) : le repère local de l'accueil disparaît aussi,
        // pour que le rappel revienne si la sortie est retirée.
        clearRunReminderDismissal(userNumber, weekKeyToSave)
        await refresh()
        return true
      } catch (err) {
        console.error('[HISTORY] Erreur déclaration:', err)
        setError(
          err instanceof Error ? err.message : 'Déclaration impossible'
        )
        return false
      } finally {
        setSavingWeek(null)
      }
    },
    [userNumber, refresh, refuseIfFrozen]
  )

  const retract = useCallback(
    async (weekKeyToSave: string): Promise<boolean> => {
      if (userNumber == null) {
        setError('Connecte-toi pour retirer ta sortie')
        return false
      }
      // Pas de refus sur une semaine figée : un retrait ne peut que baisser
      // ses propres totaux, jamais réécrire le classement des autres. Une
      // sortie déclarée par erreur doit rester réparable, même tard.
      setSavingWeek(weekKeyToSave)
      try {
        await deleteWeeklyRun({ weekKey: weekKeyToSave, userNumber })
        await refresh()
        return true
      } catch (err) {
        console.error('[HISTORY] Erreur retrait:', err)
        setError(err instanceof Error ? err.message : 'Retrait impossible')
        return false
      } finally {
        setSavingWeek(null)
      }
    },
    [userNumber, refresh]
  )

  /**
   * La proposition à afficher : celle de la semaine encore ouverte.
   * Une proposition d'une semaine clôturée n'est plus validable — la règle
   * du mercredi 14h s'applique aussi à la montre.
   */
  const openProposal = useMemo(() => {
    if (editableWeekKey === null) return null
    return (
      proposals.find(
        (proposal) =>
          weekKeyForRunDate(new Date(proposal.started_at)) === editableWeekKey
      ) ?? null
    )
  }, [proposals, editableWeekKey])

  /**
   * Valide la proposition : c'est le seul endroit où une sortie issue de la
   * montre entre dans le classement. La distance est convertie en kilomètres
   * (une décimale, comme la saisie manuelle) ; le D+ n'est pas fourni par le
   * téléphone, donc il reste inconnu — on ne compte que le connu.
   */
  const acceptProposal = useCallback(
    async (proposal: ImportProposal): Promise<boolean> => {
      if (userNumber == null) {
        setError('Connecte-toi pour valider une sortie')
        return false
      }
      if (proposal.distance_m == null) {
        setError('Cette proposition ne contient pas de distance')
        return false
      }

      const weekKeyToSave = weekKeyForRunDate(new Date(proposal.started_at))
      if (weekKeyToSave === null) {
        setError(
          'Seule une sortie du mercredi peut être comptée dans l’historique'
        )
        return false
      }
      if (refuseIfFrozen(weekKeyToSave)) return false

      setSavingWeek(weekKeyToSave)
      try {
        await declareWeeklyRun({
          weekKey: weekKeyToSave,
          userNumber,
          parcoursId: null,
          parcoursName: 'Sortie importée',
          distanceKm: Math.round(proposal.distance_m / 100) / 10,
          elevationGainM: null,
          source: 'health',
        })
        await setProposalStatus(proposal.id, 'accepted')
        clearRunReminderDismissal(userNumber, weekKeyToSave)
        await refresh()
        return true
      } catch (err) {
        console.error('[HISTORY] Erreur validation montre:', err)
        setError(err instanceof Error ? err.message : 'Validation impossible')
        return false
      } finally {
        setSavingWeek(null)
      }
    },
    [userNumber, refresh, refuseIfFrozen]
  )

  /** Écarte une proposition : elle ne reviendra pas, la montre ne la renvoie pas. */
  const ignoreProposal = useCallback(
    async (proposal: ImportProposal): Promise<boolean> => {
      try {
        await setProposalStatus(proposal.id, 'ignored')
        await refresh()
        return true
      } catch (err) {
        console.error('[HISTORY] Erreur ignorance montre:', err)
        setError(err instanceof Error ? err.message : 'Action impossible')
        return false
      }
    },
    [refresh]
  )

  const stats: HistoryStats = useMemo(
    () => computeHistoryStats(weeks, userNumber),
    [weeks, userNumber]
  )

  return {
    weeks,
    stats,
    parcours,
    loading,
    error,
    savingWeek,
    declare,
    retract,
    editableWeekKey,
    openProposal,
    acceptProposal,
    ignoreProposal,
    refresh,
  }
}
