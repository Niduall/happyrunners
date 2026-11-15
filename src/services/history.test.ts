import { describe, it, expect } from 'vitest'
import {
  buildHistoryWeeks,
  computeHistoryStats,
  formatDeclaredAt,
  formatElevation,
  formatKm,
  formatRunDay,
  pastWeekKeys,
  type HistoryWeek,
} from './history'
import type { HistoryAttendance, HistoryVote } from './supabaseService'
import type {
  ParcoursSummary,
  ProfileIdentity,
  WeeklyRun,
} from '../types/supabase'

const ALICE = { user_number: 1, first_name: 'Alice', last_name: 'Martin' }
const BOB = { user_number: 2, first_name: 'Bob', last_name: 'Durand' }

const PROFILES: ProfileIdentity[] = [ALICE, BOB]

function parcours(id: string, name: string): ParcoursSummary {
  return {
    id,
    name,
    description: undefined,
    distance_km: 8,
    elevation_gain_m: 100,
    created_by: 1,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
  }
}

function attendance(
  weekKey: string,
  person: ProfileIdentity,
  status: 'going' | 'skip' = 'going'
): HistoryAttendance {
  return {
    weekKey,
    userNumber: person.user_number,
    firstName: person.first_name,
    lastName: person.last_name,
    status,
  }
}

function vote(
  weekKey: string,
  userNumber: number,
  parcoursId: string,
  status: 'yes' | 'no' = 'yes'
): HistoryVote {
  return { weekKey, parcoursId, userNumber, status }
}

function run(over: Partial<WeeklyRun> = {}): WeeklyRun {
  return {
    week_key: '2026-10-28',
    user_number: 1,
    parcours_id: 'p1',
    parcours_name: 'Bords de Marne',
    source: 'manual',
    distance_km: 8.4,
    elevation_gain_m: 120,
    declared_at: '2026-10-28T18:30:00Z',
    updated_at: '2026-10-28T18:30:00Z',
    ...over,
  }
}

describe('pastWeekKeys', () => {
  it('remonte de semaine en semaine, sans inclure la semaine courante', () => {
    expect(pastWeekKeys('2026-11-11', 3)).toEqual([
      '2026-11-04',
      '2026-10-28',
      '2026-10-21',
    ])
  })

  it('traverse le changement d’année', () => {
    expect(pastWeekKeys('2027-01-06', 2)).toEqual([
      '2026-12-30',
      '2026-12-23',
    ])
  })

  it('renvoie une liste vide pour zéro semaine', () => {
    expect(pastWeekKeys('2026-11-11', 0)).toEqual([])
  })
})

describe('formatters', () => {
  it('écrit la date en toutes lettres, avec une majuscule', () => {
    expect(formatRunDay('2026-11-04')).toBe('Mercredi 4 novembre')
  })

  it('écrit l’heure de déclaration', () => {
    expect(formatDeclaredAt('2026-10-28T18:30:00Z')).toMatch(
      /^28 octobre à \d{2}:\d{2}$/
    )
  })

  it('écrit les km et le dénivelé sans décimale inutile', () => {
    expect(formatKm(8.4)).toBe('8,4 km')
    expect(formatKm(0)).toBe('0 km')
    expect(formatElevation(120)).toBe('120 m')
    expect(formatElevation(0)).toBe('0 m')
  })
})

describe('buildHistoryWeeks', () => {
  const weekKeys = ['2026-11-04', '2026-10-28']

  it('enregistre une sortie par personne et par semaine', () => {
    const weeks = buildHistoryWeeks({
      weekKeys: ['2026-10-28'],
      attendances: [
        attendance('2026-10-28', ALICE),
        attendance('2026-10-28', BOB),
      ],
      votes: [],
      runs: [
        run({ user_number: 2, parcours_id: 'p2', parcours_name: 'Forêt' }),
        run({ user_number: 1 }),
      ],
      parcours: [parcours('p1', 'Bords de Marne'), parcours('p2', 'Forêt')],
      profiles: PROFILES,
      userNumber: 1,
    })

    // Deux personnes, deux parcours différents le même mercredi.
    expect(weeks[0].runs).toEqual([
      {
        userNumber: 1,
        firstName: 'Alice',
        lastName: 'Martin',
        parcoursId: 'p1',
        parcoursName: 'Bords de Marne',
        distanceKm: 8.4,
        elevationGainM: 120,
        declaredAt: '2026-10-28T18:30:00Z',
      },
      {
        userNumber: 2,
        firstName: 'Bob',
        lastName: 'Durand',
        parcoursId: 'p2',
        parcoursName: 'Forêt',
        distanceKm: 8.4,
        elevationGainM: 120,
        declaredAt: '2026-10-28T18:30:00Z',
      },
    ])
    expect(weeks[0].myRun?.parcoursName).toBe('Bords de Marne')
  })

  it('sépare le parcours voté (indice) de ce qui a été couru', () => {
    const weeks = buildHistoryWeeks({
      weekKeys,
      attendances: [
        attendance('2026-11-04', ALICE),
        attendance('2026-11-04', BOB),
        attendance('2026-10-28', ALICE),
      ],
      votes: [
        vote('2026-11-04', 1, 'p1'),
        vote('2026-11-04', 2, 'p1'),
        vote('2026-11-04', 1, 'p2'),
      ],
      runs: [run()],
      parcours: [parcours('p1', 'Bords de Marne'), parcours('p2', 'Forêt')],
      profiles: PROFILES,
      userNumber: 1,
    })

    expect(weeks[0].runs).toEqual([])
    expect(weeks[0].votedParcoursName).toBe('Bords de Marne')
    expect(weeks[0].votedParcoursId).toBe('p1')
    expect(weeks[0].votedYes).toBe(2)

    expect(weeks[1].myRun?.parcoursName).toBe('Bords de Marne')
    expect(weeks[1].votedParcoursName).toBeNull()
    expect(weeks[1].votedParcoursId).toBeNull()
  })

  it('ne compte que les votes des personnes présentes', () => {
    const weeks = buildHistoryWeeks({
      weekKeys: ['2026-11-04'],
      attendances: [attendance('2026-11-04', ALICE)],
      votes: [
        vote('2026-11-04', 1, 'p1'),
        vote('2026-11-04', 2, 'p2'),
        vote('2026-11-04', 2, 'p2'),
      ],
      runs: [],
      parcours: [parcours('p1', 'Bords de Marne'), parcours('p2', 'Forêt')],
      profiles: PROFILES,
      userNumber: 1,
    })

    expect(weeks[0].votedParcoursName).toBe('Bords de Marne')
    expect(weeks[0].votedYes).toBe(1)
  })

  it('garde le nom figé même si le parcours a été supprimé', () => {
    const weeks = buildHistoryWeeks({
      weekKeys: ['2026-10-28'],
      attendances: [attendance('2026-10-28', ALICE)],
      votes: [],
      runs: [run({ parcours_id: null })],
      parcours: [],
      profiles: PROFILES,
      userNumber: 1,
    })

    expect(weeks[0].myRun?.parcoursName).toBe('Bords de Marne')
    expect(weeks[0].myRun?.distanceKm).toBe(8.4)
  })

  it('affiche une personne sans profil sans effacer sa sortie', () => {
    const weeks = buildHistoryWeeks({
      weekKeys: ['2026-10-28'],
      attendances: [],
      votes: [],
      runs: [run({ user_number: 99 })],
      parcours: [],
      profiles: [],
      userNumber: 1,
    })

    expect(weeks[0].runs[0]).toMatchObject({
      firstName: 'Membre',
      lastName: '#99',
    })
  })

  it('ne donne pas de sortie à la personne connectée sans déclaration', () => {
    const weeks = buildHistoryWeeks({
      weekKeys: ['2026-10-28'],
      attendances: [attendance('2026-10-28', ALICE)],
      votes: [],
      runs: [run({ user_number: 2 })],
      parcours: [],
      profiles: PROFILES,
      userNumber: 1,
    })

    expect(weeks[0].myRun).toBeNull()
    expect(weeks[0].runs).toHaveLength(1)
  })

  it('marque la présence de la personne connectée', () => {
    const weeks = buildHistoryWeeks({
      weekKeys,
      attendances: [
        attendance('2026-11-04', ALICE),
        attendance('2026-10-28', BOB),
      ],
      votes: [],
      runs: [],
      parcours: [],
      profiles: PROFILES,
      userNumber: 1,
    })

    expect(weeks[0].iWasGoing).toBe(true)
    expect(weeks[1].iWasGoing).toBe(false)
  })
})

describe('computeHistoryStats', () => {
  const week = (
    myRun: HistoryWeek['myRun'],
    iWasGoing = myRun != null
  ): HistoryWeek =>
    ({
      weekKey: '2026-11-04',
      weekLabel: '',
      dateLabel: '',
      going: [],
      runs: myRun ? [myRun] : [],
      myRun,
      votedParcoursName: null,
      votedParcoursId: null,
      votedYes: 0,
      iWasGoing,
    }) as HistoryWeek

  const mine = (km: number | null, dplus: number | null) => ({
    userNumber: 1,
    firstName: 'Alice',
    lastName: 'Martin',
    parcoursId: 'p1',
    parcoursName: 'Bords de Marne',
    distanceKm: km,
    elevationGainM: dplus,
    declaredAt: '2026-10-28T18:30:00Z',
  })

  it('compte les sorties et la série depuis la plus récente', () => {
    const stats = computeHistoryStats(
      [week(mine(8.4, 120)), week(mine(10, 80)), week(null), week(mine(5, 0))],
      1
    )

    expect(stats).toEqual({
      runs: 3,
      streak: 2,
      distanceKm: 23.4,
      elevationGainM: 200,
    })
  })

  it('ne compte que les distances connues', () => {
    // Une sortie « autre » n'a ni distance ni dénivelé : elle compte comme
    // sortie, mais n'invente aucun kilomètre.
    const stats = computeHistoryStats(
      [week(mine(8.4, 120)), week(mine(null, null))],
      1
    )

    expect(stats).toEqual({
      runs: 2,
      streak: 2,
      distanceKm: 8.4,
      elevationGainM: 120,
    })
  })

  it('remet la série à zéro à la première semaine sans sortie', () => {
    const stats = computeHistoryStats([week(null), week(mine(8, 100))], 1)
    expect(stats.streak).toBe(0)
    expect(stats.runs).toBe(1)
  })

  it('ne compte rien sans identité', () => {
    const stats = computeHistoryStats(
      [week(mine(8, 100)), week(mine(8, 100))],
      null
    )
    expect(stats).toEqual({
      runs: 0,
      streak: 0,
      distanceKm: 0,
      elevationGainM: 0,
    })
  })
})
