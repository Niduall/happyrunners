import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { declareWeeklyRun, getWeeklyRuns } from '../services/supabaseService'
import { pastWeekKeys } from '../services/history'
import { useTargetWednesday } from './useTargetWednesday'
import type { RunChoice } from './useHistory'
import type { WeeklyRun } from '../types/supabase'

export interface LastRun {
  /** Le mercredi dont la sortie est encore déclarable, ou null sans identité */
  weekKey: string | null
  /** La sortie de la personne connectée, si elle l'a déjà déclarée */
  myRun: WeeklyRun | null
  loading: boolean
  saving: boolean
  error: string | null
  declare: (choice: RunChoice) => Promise<boolean>
}

/**
 * La sortie la plus récente qui peut encore être déclarée.
 *
 * Même règle que l'historique : une semaine se déclare jusqu'au mercredi
 * suivant 14h. La cible est donc le mercredi qui vient de se terminer — ou
 * celui d'aujourd'hui dès 12h30, pour ne pas faire attendre la bascule de 14h
 * au moment où l'on rentre du run.
 *
 * Sert de rappel sur l'accueil : une carte n'apparaît que tant que la sortie
 * n'est pas déclarée. La correction et le retrait restent dans l'historique.
 */
export function useLastRun(userNumber: number | null): LastRun {
  const { weekKey, runStarted } = useTargetWednesday()

  const declarableWeekKey = useMemo(() => {
    if (runStarted) return weekKey
    return pastWeekKeys(weekKey, 1)[0] ?? null
  }, [runStarted, weekKey])

  const [myRun, setMyRun] = useState<WeeklyRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const refresh = useCallback(async () => {
    if (declarableWeekKey == null || userNumber == null) {
      setMyRun(null)
      setLoading(false)
      return
    }

    const requestId = ++requestIdRef.current
    const isStale = () => requestId !== requestIdRef.current

    try {
      const runs = await getWeeklyRuns([declarableWeekKey])
      if (isStale()) return
      setMyRun(runs.find((run) => run.user_number === userNumber) ?? null)
      setError(null)
    } catch (err) {
      if (isStale()) return
      console.error('[DERNIÈRE SORTIE] Erreur chargement:', err)
      setError(err instanceof Error ? err.message : 'Chargement impossible')
    } finally {
      if (!isStale()) setLoading(false)
    }
  }, [declarableWeekKey, userNumber])

  useEffect(() => {
    setLoading(true)
    void refresh()
  }, [refresh])

  const declare = useCallback(
    async (choice: RunChoice): Promise<boolean> => {
      if (userNumber == null || declarableWeekKey == null) {
        setError('Connecte-toi pour indiquer ton parcours')
        return false
      }

      setSaving(true)
      try {
        await declareWeeklyRun({
          weekKey: declarableWeekKey,
          userNumber,
          parcoursId: choice.parcoursId,
          parcoursName: choice.parcoursName,
          distanceKm: choice.distanceKm,
          elevationGainM: choice.elevationGainM,
        })
        await refresh()
        return true
      } catch (err) {
        console.error('[DERNIÈRE SORTIE] Erreur déclaration:', err)
        setError(
          err instanceof Error ? err.message : 'Déclaration impossible'
        )
        return false
      } finally {
        setSaving(false)
      }
    },
    [userNumber, declarableWeekKey, refresh]
  )

  return {
    weekKey: declarableWeekKey,
    myRun,
    loading,
    saving,
    error,
    declare,
  }
}
