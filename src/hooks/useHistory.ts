import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  declareWeeklyRun,
  deleteWeeklyRun,
  getAllProfiles,
  getHistoryAttendances,
  getHistoryVotes,
  getParcours,
  getWeeklyRuns,
} from '../services/supabaseService'
import {
  buildHistoryWeeks,
  computeHistoryStats,
  pastWeekKeys,
  type HistoryStats,
  type HistoryWeek,
} from '../services/history'
import { useTargetWednesday } from './useTargetWednesday'
import type { ParcoursSummary, ProfileIdentity } from '../types/supabase'

/** Douze mercredis : un trimestre, assez pour voir une série et rester léger. */
export const HISTORY_WEEKS = 12

export interface RunChoice {
  parcoursId: string | null
  parcoursName: string
  distanceKm: number | null
  elevationGainM: number | null
}

export function useHistory(userNumber: number | null) {
  const { weekKey } = useTargetWednesday()
  const [weeks, setWeeks] = useState<HistoryWeek[]>([])
  const [parcours, setParcours] = useState<ParcoursSummary[]>([])
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

      if (isStale()) return

      setParcours(parcoursList)
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
        })
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
      if (refuseIfFrozen(weekKeyToSave)) return false

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
    [userNumber, refresh, refuseIfFrozen]
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
    refresh,
  }
}
