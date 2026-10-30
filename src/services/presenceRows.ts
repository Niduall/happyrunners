import type { PresenceRow, ProfileIdentity } from '../types'
import type { Attendee } from './supabaseService'

/**
 * Fusionne l'annuaire complet et les réponses de la semaine.
 *
 * Le tableau « Qui vient ? » doit montrer **tout le monde** : les présents,
 * les absents, et ceux qui n'ont pas encore répondu (`status: null`).
 * L'ancien affichage ne listait que les réponses : une personne silencieuse
 * était invisible, donc impossible à relancer.
 *
 * Une réponse dont le profil manque dans l'annuaire — cache en retard, nouvel
 * inscrit — est tout de même affichée. Mieux vaut une ligne de plus qu'une
 * réponse qui disparaît du tableau.
 */
export function mergePresenceRows(
  profiles: ProfileIdentity[],
  attendees: Attendee[],
  parcoursNameOf: (userNumber: number) => string | null
): PresenceRow[] {
  const byNumber = new Map(profiles.map((p) => [p.user_number, p]))
  const rows: PresenceRow[] = []
  const seen = new Set<number>()

  for (const attendee of attendees) {
    seen.add(attendee.userNumber)
    const profile = byNumber.get(attendee.userNumber)
    rows.push({
      userNumber: attendee.userNumber,
      firstName: profile?.first_name ?? attendee.firstName,
      lastName: profile?.last_name ?? attendee.lastName,
      status: attendee.status,
      // Un vote résiduel d'un absent ne doit jamais apparaître dans le tableau.
      parcoursName: attendee.status === 'going' ? parcoursNameOf(attendee.userNumber) : null,
    })
  }

  for (const profile of profiles) {
    if (seen.has(profile.user_number)) continue
    rows.push({
      userNumber: profile.user_number,
      firstName: profile.first_name,
      lastName: profile.last_name,
      status: null,
      parcoursName: null,
    })
  }

  return rows
}
