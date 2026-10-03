import { useState, useEffect, useMemo } from 'react'
import { getCurrentWeekKey, getTargetWednesday, formatWeekLabel, isRunDay } from '../services/weekKey'

/**
 * Horloge partagée : fournit la clé de semaine et se met à jour pour que la
 * bascule de 14h (mercredi) soit détectée même si l'app reste ouverte.
 *
 * ⚠️ Ce hook doit être monté UNE SEULE FOIS (dans `Home`) et le résultat
 * passé aux enfants via props/context. Si chaque hook consommateur a son
 * propre timer, on obtient N timers → N re-rendus par minute de toute la
 * page, ce qui est visible à l'écran.
 *
 * Le tick ne force un re-render que si la clé a réellement changé (bascule
 * de 14h) : inutile de re-rendre pour rien.
 */

/** On vérifie toutes les 30 s — la bascule ne peut arriver qu'à 14h pile */
const TICK_MS = 30_000

export interface TargetWednesday {
  /** Clé de semaine, ex: "2026-10-07" */
  weekKey: string
  /** Libellé lisible, ex: "semaine du 7 oct." */
  weekLabel: string
  /** La date cible */
  date: Date
  /** true si on est le jour du run (et pas encore 14h) */
  isRunDay: boolean
}

export function useTargetWednesday(): TargetWednesday {
  // Ne contient que la clé de semaine : change uniquement à la bascule
  const [weekKey, setWeekKey] = useState(() => getCurrentWeekKey())

  useEffect(() => {
    const id = setInterval(() => {
      const current = getCurrentWeekKey()
      // setState avec la même valeur = bail-out de React, aucun rendu
      setWeekKey(current)
    }, TICK_MS)
    return () => clearInterval(id)
  }, [])

  // Recalculé uniquement quand weekKey change (pas à chaque tick)
  return useMemo(() => {
    const now = new Date()
    return {
      weekKey,
      weekLabel: formatWeekLabel(weekKey),
      date: getTargetWednesday(now),
      isRunDay: isRunDay(weekKey, now),
    }
  }, [weekKey])
}

export { formatWeekLabel }
