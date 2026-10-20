import type { ParcoursTally, WeekVote } from './supabaseService'

/** Le minimum dont le décompte a besoin d'une présence. */
export interface AttendanceLike {
  userNumber: number
  status: 'going' | 'skip'
}

/** user_number des personnes qui viennent cette semaine. */
export function goingSet(attendances: AttendanceLike[]): Set<number> {
  return new Set(
    attendances.filter((a) => a.status === 'going').map((a) => a.userNumber)
  )
}

export interface VoteSummary {
  /** parcoursId → compteurs yes/no */
  tallies: Record<string, ParcoursTally>
  /** userNumber → parcoursId choisi (un seul par personne et par semaine) */
  choices: Record<number, string>
}

/**
 * Source unique du décompte des votes.
 *
 * `going === null` signifie « présences inconnues » (panne de chargement) :
 * on compte alors tous les votes plutôt que d'afficher zéro. Une panne de
 * présences ne doit pas effacer des votes qui, eux, ont bien été chargés.
 */
export function summarizeVotes(
  votes: WeekVote[],
  going: Set<number> | null
): VoteSummary {
  const tallies: Record<string, ParcoursTally> = {}
  const choices: Record<number, string> = {}

  for (const vote of votes) {
    if (!vote.userNumber || !vote.parcoursId) continue
    if (going && !going.has(vote.userNumber)) continue

    const tally = tallies[vote.parcoursId] ?? {
      parcoursId: vote.parcoursId,
      yes: 0,
      no: 0,
    }
    if (vote.status === 'yes') tally.yes += 1
    else tally.no += 1
    tallies[vote.parcoursId] = tally

    choices[vote.userNumber] = vote.parcoursId
  }

  return { tallies, choices }
}
