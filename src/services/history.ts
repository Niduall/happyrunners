import type {
  ParcoursSummary,
  ProfileIdentity,
  WeeklyRun,
} from '../types/supabase'
import type { HistoryAttendance, HistoryVote } from './supabaseService'
import { summarizeVotes } from './voteTallies'
import { formatWeekLabel } from './weekKey'

const MS_PER_WEEK = 7 * 86_400_000

/**
 * Les `count` mercredis passés, du plus récent au plus ancien.
 *
 * La semaine courante est exclue : son run n'a pas encore eu lieu. Le calcul
 * se fait en UTC sur la clé `YYYY-MM-DD`, comme `weeksBetween`, pour éviter
 * les surprises de changement d'heure.
 */
export function pastWeekKeys(currentWeekKey: string, count: number): string[] {
  const [year, month, day] = currentWeekKey.split('-').map(Number)
  const base = Date.UTC(year, month - 1, day)

  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    const date = new Date(base - (index + 1) * MS_PER_WEEK)
    const y = date.getUTCFullYear()
    const m = String(date.getUTCMonth() + 1).padStart(2, '0')
    const d = String(date.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  })
}

/** « mercredi 5 novembre » — la date d'une sortie passée. */
export function formatRunDay(weekKey: string, locale = 'fr-FR'): string {
  const [year, month, day] = weekKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const label = date.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** « 11 novembre à 18:32 » — quand la sortie a été déclarée. */
export function formatDeclaredAt(iso: string, locale = 'fr-FR'): string {
  return new Date(iso).toLocaleString(locale, {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** « 8,4 km » — la distance d'un parcours, telle qu'elle a été figée. */
export function formatKm(km: number, locale = 'fr-FR'): string {
  return `${km.toLocaleString(locale, { maximumFractionDigits: 1 })} km`
}

/** « 320 m » — le dénivelé d'un parcours, tel qu'il a été figé. */
export function formatElevation(meters: number, locale = 'fr-FR'): string {
  return `${Math.round(meters).toLocaleString(locale)} m`
}

export interface HistoryPerson {
  userNumber: number
  firstName: string
  lastName: string
}

/** Une sortie déclarée : ce qu'une personne dit avoir couru ce mercredi-là. */
export interface HistoryRun {
  userNumber: number
  firstName: string
  lastName: string
  /** NULL pour une sortie « autre », non enregistrée */
  parcoursId: string | null
  parcoursName: string
  distanceKm: number | null
  elevationGainM: number | null
  declaredAt: string
}

export interface HistoryWeek {
  weekKey: string
  /** « semaine du 5 nov. » */
  weekLabel: string
  /** « Mercredi 5 novembre » */
  dateLabel: string
  going: HistoryPerson[]
  /** Toutes les sorties déclarées pour ce mercredi */
  runs: HistoryRun[]
  /** Celle de la personne connectée, s'il y en a une */
  myRun: HistoryRun | null
  /** Parcours le plus voté — un indice, pas ce qui a été couru */
  votedParcoursName: string | null
  /**
   * Son identifiant, pour préselectionner la modale.
   * Le vote est le meilleur indice disponible : partir d'un autre parcours
   * ferait enregistrer un choix arbitraire d'un seul clic.
   */
  votedParcoursId: string | null
  votedYes: number
  /** La personne connectée était-elle présente ? */
  iWasGoing: boolean
}

export interface BuildHistoryParams {
  weekKeys: string[]
  attendances: HistoryAttendance[]
  votes: HistoryVote[]
  runs: WeeklyRun[]
  parcours: ParcoursSummary[]
  profiles: ProfileIdentity[]
  userNumber: number | null
}

/**
 * Assemble les semaines passées à partir des données brutes.
 *
 * Fonction pure : la page et les tests passent les mêmes tableaux et
 * obtiennent le même résultat, sans Supabase ni horloge.
 *
 * Les noms des personnes qui ont déclaré viennent de `user_profiles`, pas de
 * la ligne `weekly_runs` : un changement de nom suit donc l'historique. Le nom
 * du **parcours**, lui, est figé dans la ligne — un parcours renommé ou
 * supprimé ne réécrit pas une sortie passée.
 */
export function buildHistoryWeeks({
  weekKeys,
  attendances,
  votes,
  runs,
  parcours,
  profiles,
  userNumber,
}: BuildHistoryParams): HistoryWeek[] {
  const names = new Map(
    profiles.map((p) => [
      p.user_number,
      { firstName: p.first_name, lastName: p.last_name },
    ])
  )
  const parcoursNames = new Map(parcours.map((p) => [p.id, p.name]))

  return weekKeys.map((weekKey) => {
    const weekAttendances = attendances.filter((a) => a.weekKey === weekKey)
    const going = weekAttendances
      .filter((a) => a.status === 'going')
      .map((a) => ({
        userNumber: a.userNumber,
        firstName: a.firstName,
        lastName: a.lastName,
      }))

    const weekRuns: HistoryRun[] = runs
      .filter((run) => run.week_key === weekKey)
      .map((run) => ({
        userNumber: run.user_number,
        firstName: names.get(run.user_number)?.firstName ?? 'Membre',
        lastName: names.get(run.user_number)?.lastName ?? `#${run.user_number}`,
        parcoursId: run.parcours_id,
        parcoursName: run.parcours_name,
        distanceKm: run.distance_km,
        elevationGainM: run.elevation_gain_m,
        declaredAt: run.declared_at,
      }))
      .sort((a, b) => a.firstName.localeCompare(b.firstName, 'fr'))

    const myRun =
      userNumber == null
        ? null
        : weekRuns.find((run) => run.userNumber === userNumber) ?? null

    const weekVotes = votes.filter((vote) => vote.weekKey === weekKey)
    const { tallies } = summarizeVotes(
      weekVotes,
      new Set(going.map((person) => person.userNumber))
    )
    const topVote = Object.values(tallies)
      .filter((tally) => tally.yes > 0)
      .sort((a, b) => b.yes - a.yes || a.no - b.no)[0]

    return {
      weekKey,
      weekLabel: formatWeekLabel(weekKey),
      dateLabel: formatRunDay(weekKey),
      going,
      runs: weekRuns,
      myRun,
      votedParcoursName: topVote
        ? parcoursNames.get(topVote.parcoursId) ?? null
        : null,
      votedParcoursId: topVote?.parcoursId ?? null,
      votedYes: topVote?.yes ?? 0,
      iWasGoing:
        userNumber != null &&
        going.some((person) => person.userNumber === userNumber),
    }
  })
}

/**
 * Une semaine sans présence ni sortie n'apprend rien : la page la masque par
 * défaut, sauf la semaine encore ouverte où l'on peut déclarer. Une réponse
 * « pas cette semaine » n'est pas une présence : elle ne suffit pas non plus à
 * rendre la semaine intéressante.
 */
export function isEmptyWeek(week: HistoryWeek): boolean {
  return week.going.length === 0 && week.runs.length === 0
}

export interface HistoryStats {
  /** Semaines où la personne a déclaré une sortie */
  runs: number
  /** Semaines consécutives avec une sortie, en remontant depuis la plus récente */
  streak: number
  /** Somme des distances connues de ses sorties */
  distanceKm: number
  /** Somme des dénivelés connus de ses sorties */
  elevationGainM: number
}

/**
 * Statistiques personnelles, calculées sur les sorties **déclarées**.
 *
 * `weeks` doit être trié du plus récent au plus ancien (c'est ce que renvoie
 * `pastWeekKeys`). La série s'arrête à la première semaine sans sortie
 * déclarée : une absence, une semaine non renseignée ou une réponse manquante
 * la remet à zéro. C'est la seule lecture honnête sans données d'activité.
 *
 * Les distances ne comptent que si elles sont connues (parcours enregistré au
 * moment de la déclaration) : une sortie « autre » n'ajoute rien plutôt que
 * d'inventer un chiffre.
 */
export function computeHistoryStats(
  weeks: HistoryWeek[],
  userNumber: number | null
): HistoryStats {
  if (userNumber == null) {
    return { runs: 0, streak: 0, distanceKm: 0, elevationGainM: 0 }
  }

  let streak = 0
  for (const week of weeks) {
    if (!week.myRun) break
    streak += 1
  }

  let runs = 0
  let distanceKm = 0
  let elevationGainM = 0

  for (const week of weeks) {
    if (!week.myRun) continue
    runs += 1
    distanceKm += week.myRun.distanceKm ?? 0
    elevationGainM += week.myRun.elevationGainM ?? 0
  }

  return { runs, streak, distanceKm, elevationGainM }
}
