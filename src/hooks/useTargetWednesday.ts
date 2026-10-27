import { useSyncExternalStore } from 'react'
import { getCurrentWeekKey, getTargetWednesday, formatWeekLabel, isRunDay } from '../services/weekKey'

/**
 * Horloge partagée : fournit la clé de semaine et se met à jour pour que la
 * bascule de 14h (mercredi) soit détectée même si l'app reste ouverte.
 *
 * L'horloge vit au niveau du module : un seul `setInterval` pour toute
 * l'application, quel que soit le nombre de composants qui appellent le hook.
 * Il n'y a donc plus besoin de le monter une seule fois ni de passer le
 * résultat par contexte — et un composant ajouté plus tard ne peut pas
 * réintroduire un timer par appelant.
 *
 * Le tick ne réveille les abonnés que si la clé a réellement changé (bascule
 * de 14h) : inutile de re-rendre la page toutes les 30 s.
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

/** Instantané courant. Son identité ne change qu'à la bascule de 14h. */
function read(): TargetWednesday {
  const now = new Date()
  const weekKey = getCurrentWeekKey()
  return {
    weekKey,
    weekLabel: formatWeekLabel(weekKey),
    date: getTargetWednesday(now),
    isRunDay: isRunDay(weekKey, now),
  }
}

let snapshot = read()
let ticker: ReturnType<typeof setInterval> | null = null
const subscribers = new Set<() => void>()

function tick(): void {
  const next = read()
  // Même clé → aucun rendu : l'identité de l'instantané reste stable.
  if (next.weekKey === snapshot.weekKey) return
  snapshot = next
  for (const notify of subscribers) notify()
}

function subscribe(notify: () => void): () => void {
  // Premier abonné d'un nouveau cycle : le module peut dater d'un montage
  // précédent (ou d'un test), on repart de l'heure courante.
  if (subscribers.size === 0) snapshot = read()

  subscribers.add(notify)
  ticker ??= setInterval(tick, TICK_MS)

  return () => {
    subscribers.delete(notify)
    if (subscribers.size === 0 && ticker !== null) {
      clearInterval(ticker)
      ticker = null
    }
  }
}

function getSnapshot(): TargetWednesday {
  return snapshot
}

export function useTargetWednesday(): TargetWednesday {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export { formatWeekLabel }
