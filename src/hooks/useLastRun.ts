import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  declareWeeklyRun,
  getWeeklyRunSkip,
  getWeeklyRuns,
  skipWeeklyRun,
} from '../services/supabaseService'
import { pastWeekKeys } from '../services/history'
import {
  clearRunReminderDismissal,
  dismissRunReminder,
  isRunReminderDismissed,
} from '../services/runReminderDismissal'
import { useTargetWednesday } from './useTargetWednesday'
import type { RunChoice } from './useHistory'
import type { WeeklyRun } from '../types/supabase'

export interface LastRun {
  /** Le mercredi dont la sortie est encore déclarable, ou null sans identité */
  weekKey: string | null
  /** La sortie de la personne connectée, si elle l'a déjà déclarée */
  myRun: WeeklyRun | null
  /** La personne a répondu « je n'ai pas couru » pour cette semaine */
  dismissed: boolean
  loading: boolean
  saving: boolean
  error: string | null
  declare: (choice: RunChoice) => Promise<boolean>
  /** Répond « je n'ai pas couru » pour cette semaine, en base et sur l'appareil */
  dismiss: () => void
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
  /** Réponse « je n'ai pas couru » lue en base (elle suit la personne). */
  const [skipped, setSkipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  /** Sert uniquement à re-rendre après une réponse mémorisée localement. */
  const [, bumpDismissal] = useState(0)

  /**
   * La base fait foi : une réponse donnée sur un autre téléphone arrive ici au
   * chargement. Le repère local ne sert qu'à masquer la carte tout de suite,
   * ou si l'écriture en base n'a pas abouti (hors ligne).
   */
  const dismissed =
    skipped ||
    (userNumber != null &&
      declarableWeekKey != null &&
      isRunReminderDismissed(userNumber, declarableWeekKey))

  const dismiss = useCallback(() => {
    if (userNumber == null || declarableWeekKey == null) return

    // Retour immédiat, même hors ligne : la carte se masque sans réseau.
    dismissRunReminder(userNumber, declarableWeekKey)
    setSkipped(true)
    bumpDismissal((count) => count + 1)

    // La base porte la réponse pour les autres appareils. Un échec laisse le
    // repère local en place : la carte ne revient pas sur cet appareil.
    void skipWeeklyRun({
      weekKey: declarableWeekKey,
      userNumber,
    }).catch((err) => {
      console.error('[DERNIÈRE SORTIE] Erreur « je n’ai pas couru »:', err)
    })
  }, [userNumber, declarableWeekKey])

  const refresh = useCallback(async () => {
    if (declarableWeekKey == null || userNumber == null) {
      setMyRun(null)
      setSkipped(false)
      setLoading(false)
      return
    }

    const requestId = ++requestIdRef.current
    const isStale = () => requestId !== requestIdRef.current

    try {
      const [runs, skippedInDb] = await Promise.all([
        getWeeklyRuns([declarableWeekKey]),
        getWeeklyRunSkip({ weekKey: declarableWeekKey, userNumber }),
      ])
      if (isStale()) return
      setMyRun(runs.find((run) => run.user_number === userNumber) ?? null)
      setSkipped(skippedInDb)
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
        // La base supprime la réponse « je n'ai pas couru » de la semaine
        // (trigger) : on oublie aussi le repère local, pour que le rappel
        // puisse revenir si la sortie est retirée plus tard.
        clearRunReminderDismissal(userNumber, declarableWeekKey)
        setSkipped(false)
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
    dismissed,
    loading,
    saving,
    error,
    declare,
    dismiss,
  }
}
