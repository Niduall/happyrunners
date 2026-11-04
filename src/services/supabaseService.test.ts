import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getParcours,
  getParcoursPoints,
  updateParcours,
  getWeekVotes,
  getWeekTallies,
  getWeekAttendances,
  getAllProfiles,
  getProfilesWithPinStatus,
  resetUserPin,
  removeUserPin,
  countMessagesSince,
} from './supabaseService'
import { hashPin } from './pin'
import { supabase } from '../lib/supabase'

/** Lignes renvoyées par PostgREST (snake_case, comme la vraie API) */
const mockRows = vi.fn()
const mockProfiles = vi.fn()
const mockProfilesError = vi.fn()
const mockAttendanceRows = vi.fn()
const mockError = vi.fn()
const mockAttendanceError = vi.fn()
const mockSelectColumns = vi.fn()
const mockUpdateValues = vi.fn()
const mockGt = vi.fn()
const mockNeq = vi.fn()
const mockCount = vi.fn()

/**
 * Chaque table a sa propre source de données. `from(table)` capture le nom
 * de la table pour savoir quelle mock renvoyer — plus fiable qu'un compteur.
 */
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      q.select = (columns?: string) => {
        mockSelectColumns(columns)
        return q
      }
      q.eq = () => q
      q.update = (values?: unknown) => {
        mockUpdateValues(values)
        return q
      }
      q.not = () => q
      q.in = () => q
      q.gt = (column?: string, value?: unknown) => {
        mockGt(column, value)
        return q
      }
      q.neq = (column?: string, value?: unknown) => {
        mockNeq(column, value)
        return q
      }
      q.order = () => q
      q.limit = () => q
      q.single = () => q
      q.maybeSingle = () => Promise.resolve({ data: null, error: null })
      q.then = (resolve: (v: unknown) => unknown) => {
        if (table === 'user_profiles') {
          return Promise.resolve({ data: mockProfiles(), error: mockProfilesError() }).then(resolve)
        }
        if (table === 'attendances') {
          return Promise.resolve({
            data: mockAttendanceRows(),
            error: mockAttendanceError(),
          }).then(resolve)
        }
        return Promise.resolve({
          data: mockRows(),
          error: mockError(),
          count: mockCount(),
        }).then(resolve)
      }
      return q
    },
  },
}))

void supabase

beforeEach(() => {
  mockRows.mockReset()
  mockProfiles.mockReset()
  mockProfilesError.mockReset()
  mockAttendanceRows.mockReset()
  mockError.mockReset()
  mockAttendanceError.mockReset()
  mockSelectColumns.mockReset()
  mockUpdateValues.mockReset()
  mockGt.mockReset()
  mockNeq.mockReset()
  mockCount.mockReset()

  mockRows.mockReturnValue([])
  mockProfiles.mockReturnValue([])
  mockProfilesError.mockReturnValue(null)
  mockAttendanceRows.mockReturnValue([])
  mockError.mockReturnValue(null)
  mockAttendanceError.mockReturnValue(null)
  mockCount.mockReturnValue(0)
})

const VOTE_ROWS = [
  { parcours_id: 'p1', user_number: 1, status: 'yes' },
  { parcours_id: 'p1', user_number: 2, status: 'no' },
  { parcours_id: 'p2', user_number: 1, status: 'yes' },
]

describe('getParcours — le tracé n’est pas dans la liste', () => {
  it('demande toutes les colonnes sauf points', async () => {
    mockRows.mockReturnValue([
      {
        id: 'p1',
        name: 'Bois de Haye',
        distance_km: 4.2,
        elevation_gain_m: 93,
        created_by: null,
        created_at: '',
        updated_at: '',
      },
    ])

    const list = await getParcours()

    expect(mockSelectColumns).toHaveBeenCalledWith(expect.not.stringContaining('points'))
    expect(list[0]).not.toHaveProperty('points')
  })

  it('ne charge que la colonne points pour un parcours donné', async () => {
    mockRows.mockReturnValue({ points: [{ lat: 48.6, lng: 6.1 }] })

    const points = await getParcoursPoints('p1')

    expect(mockSelectColumns).toHaveBeenCalledWith('points')
    expect(points).toEqual([{ lat: 48.6, lng: 6.1 }])
  })
})

describe('getAllProfiles — l’annuaire complet', () => {
  it('ne lit que les trois colonnes d’identité', async () => {
    mockProfiles.mockReturnValue([
      { user_number: 1, first_name: 'Ada', last_name: 'Lovelace' },
      { user_number: 2, first_name: 'Alan', last_name: 'Turing' },
    ])

    const list = await getAllProfiles()

    expect(mockSelectColumns).toHaveBeenCalledWith('user_number,first_name,last_name')
    expect(list).toEqual([
      { user_number: 1, first_name: 'Ada', last_name: 'Lovelace' },
      { user_number: 2, first_name: 'Alan', last_name: 'Turing' },
    ])
  })

  it('propage une erreur de lecture', async () => {
    mockProfilesError.mockReturnValue(new Error('lecture refusée'))

    await expect(getAllProfiles()).rejects.toThrow('lecture refusée')
  })

  it('retourne un tableau vide quand il n’y a personne', async () => {
    mockProfiles.mockReturnValue(null)

    await expect(getAllProfiles()).resolves.toEqual([])
  })
})

describe('getProfilesWithPinStatus — console admin', () => {
  it('ne renvoie qu’un booléen, jamais le hash', async () => {
    mockProfiles.mockReturnValue([
      { user_number: 9, first_name: 'Julie', last_name: 'Dalla Valle', pin_hash: 'pin_abc' },
      { user_number: 14, first_name: 'Julie', last_name: 'Moudin', pin_hash: null },
    ])

    const list = await getProfilesWithPinStatus()

    expect(mockSelectColumns).toHaveBeenLastCalledWith(
      'user_number,first_name,last_name,pin_hash'
    )
    expect(list).toEqual([
      { user_number: 9, first_name: 'Julie', last_name: 'Dalla Valle', hasPin: true },
      { user_number: 14, first_name: 'Julie', last_name: 'Moudin', hasPin: false },
    ])
    // Le hash reste dans le service : aucun composant ne doit le recevoir.
    expect(list[0]).not.toHaveProperty('pin_hash')
  })

  it('déduit l’absence de PIN d’une valeur nulle', async () => {
    mockProfiles.mockReturnValue([
      { user_number: 3, first_name: 'Paulin', last_name: 'Claudin', pin_hash: null },
    ])

    await expect(getProfilesWithPinStatus()).resolves.toEqual([
      { user_number: 3, first_name: 'Paulin', last_name: 'Claudin', hasPin: false },
    ])
  })

  it('propage une erreur de lecture', async () => {
    mockProfilesError.mockReturnValue(new Error('lecture refusée'))

    await expect(getProfilesWithPinStatus()).rejects.toThrow('lecture refusée')
  })
})

describe('réinitialisation du PIN — console admin', () => {
  it('écrit le hash du PIN provisoire, jamais le code en clair', async () => {
    mockProfiles.mockReturnValue({ user_number: 9 })

    await resetUserPin(9, '1234')

    const written = mockUpdateValues.mock.calls[0][0] as { pin_hash: string }
    expect(written.pin_hash).toBe(hashPin('1234'))
    expect(written.pin_hash).not.toContain('1234')
  })

  it('retire le PIN en écrivant null', async () => {
    mockProfiles.mockReturnValue({ user_number: 9 })

    await removeUserPin(9)

    expect(mockUpdateValues).toHaveBeenCalledWith(
      expect.objectContaining({ pin_hash: null })
    )
  })

  it('propage une erreur d’écriture', async () => {
    mockProfiles.mockReturnValue({ user_number: 9 })
    mockProfilesError.mockReturnValue(new Error('écriture refusée'))

    await expect(resetUserPin(9, '1234')).rejects.toThrow('écriture refusée')
  })
})

describe('countMessagesSince — pastille de non-lus', () => {
  it('exclut les messages de la personne elle-même', async () => {
    mockCount.mockReturnValue(2)

    const total = await countMessagesSince('2026-11-02T09:00:00.000Z', 14)

    expect(total).toBe(2)
    expect(mockGt).toHaveBeenCalledWith('created_at', '2026-11-02T09:00:00.000Z')
    expect(mockNeq).toHaveBeenCalledWith('user_number', 14)
  })

  it('ne filtre personne quand aucun numéro n’est fourni', async () => {
    mockCount.mockReturnValue(3)

    const total = await countMessagesSince('2026-11-02T09:00:00.000Z')

    expect(total).toBe(3)
    expect(mockNeq).not.toHaveBeenCalled()
  })

  it('propage une erreur de comptage', async () => {
    mockError.mockReturnValue(new Error('comptage refusé'))

    await expect(
      countMessagesSince('2026-11-02T09:00:00.000Z', 14)
    ).rejects.toThrow('comptage refusé')
  })
})

describe('updateParcours — le nom et le tracé se modifient séparément', () => {
  it('écrit les champs demandés et met à jour updated_at', async () => {
    mockRows.mockReturnValue({
      id: 'p1',
      name: 'Boucle du lac',
      distance_km: 4.2,
      elevation_gain_m: 93,
      points: [],
      created_by: null,
      created_at: '',
      updated_at: '2026-10-25T10:00:00.000Z',
    })

    const updated = await updateParcours('p1', { name: 'Boucle du lac' })

    // Le trigger SQL est désactivé (voir A9) : l'horodatage est écrit ici.
    expect(mockUpdateValues).toHaveBeenCalledWith({
      name: 'Boucle du lac',
      updated_at: expect.any(String),
    })
    // La date envoyée est une date ISO valide
    const sent = mockUpdateValues.mock.calls[0][0] as { updated_at: string }
    expect(Number.isNaN(Date.parse(sent.updated_at))).toBe(false)
    expect(updated.name).toBe('Boucle du lac')
  })

  it('propage une erreur d’écriture', async () => {
    mockError.mockReturnValue(new Error('écriture refusée'))

    await expect(updateParcours('p1', { name: 'X' })).rejects.toThrow('écriture refusée')
  })
})

describe('getWeekVotes — mapping snake_case → camelCase', () => {
  it('convertit les noms de colonnes PostgREST en camelCase', async () => {
    mockRows.mockReturnValue(VOTE_ROWS)

    const votes = await getWeekVotes('2026-10-07')

    // Sans mapping, ces champs seraient undefined (le bug historique)
    expect(votes[0]).toEqual({ parcoursId: 'p1', userNumber: 1, status: 'yes' })
    expect(votes[0].parcoursId).toBeDefined()
    expect(votes[0].userNumber).toBeDefined()
  })

  it('userNumber reste un nombre (pas une string)', async () => {
    mockRows.mockReturnValue(VOTE_ROWS)
    const votes = await getWeekVotes('2026-10-07')
    for (const v of votes) {
      expect(typeof v.userNumber).toBe('number')
    }
  })

  it('retourne un tableau vide si aucune ligne', async () => {
    mockRows.mockReturnValue([])
    expect(await getWeekVotes('2026-10-07')).toEqual([])
  })
})

describe('getWeekTallies — votes des présents uniquement', () => {
  it('compte les votes par parcours', async () => {
    mockRows.mockReturnValue(VOTE_ROWS)
    mockAttendanceRows.mockReturnValue([
      { user_number: 1, status: 'going' },
      { user_number: 2, status: 'going' },
    ])

    const tallies = await getWeekTallies('2026-10-07')
    const byId = new Map(tallies.map((t) => [t.parcoursId, t]))

    expect(byId.get('p1')).toEqual({ parcoursId: 'p1', yes: 1, no: 1 })
    expect(byId.get('p2')).toEqual({ parcoursId: 'p2', yes: 1, no: 0 })
  })

  it('ignore le vote de quelqu’un qui ne vient pas', async () => {
    mockRows.mockReturnValue([
      { parcours_id: 'p1', user_number: 1, status: 'yes' },
      { parcours_id: 'p1', user_number: 3, status: 'yes' },
    ])
    mockAttendanceRows.mockReturnValue([
      { user_number: 1, status: 'going' },
      { user_number: 3, status: 'skip' },
    ])

    expect(await getWeekTallies('2026-10-07')).toEqual([
      { parcoursId: 'p1', yes: 1, no: 0 },
    ])
  })

  it('ignore un vote sans aucune présence', async () => {
    // Le vote orphelin observé en prod : un votant qui n'a jamais répondu.
    mockRows.mockReturnValue([{ parcours_id: 'p1', user_number: 16, status: 'yes' }])
    mockAttendanceRows.mockReturnValue([])

    expect(await getWeekTallies('2026-10-07')).toEqual([])
  })

  it('ignore les lignes sans user_number', async () => {
    mockRows.mockReturnValue([{ parcours_id: 'p1', user_number: null, status: 'yes' }])
    mockAttendanceRows.mockReturnValue([{ user_number: 1, status: 'going' }])

    expect(await getWeekTallies('2026-10-07')).toEqual([])
  })

  it('compte tout si les présences sont indisponibles', async () => {
    mockRows.mockReturnValue(VOTE_ROWS)
    mockAttendanceError.mockReturnValue(new Error('réseau'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const tallies = await getWeekTallies('2026-10-07')
    const byId = new Map(tallies.map((t) => [t.parcoursId, t]))

    // Repli assumé : mieux vaut des compteurs non filtrés que zéro
    expect(byId.get('p1')).toEqual({ parcoursId: 'p1', yes: 1, no: 1 })
    expect(byId.get('p2')).toEqual({ parcoursId: 'p2', yes: 1, no: 0 })
    expect(warn).toHaveBeenCalled()

    warn.mockRestore()
  })

  it('propage une erreur de chargement des votes', async () => {
    mockError.mockReturnValue(new Error('votes indisponibles'))

    await expect(getWeekTallies('2026-10-07')).rejects.toThrow('votes indisponibles')
  })
})

describe('getWeekAttendances — les noms viennent du JOIN', () => {
  it('rattache les noms de user_profiles', async () => {
    mockAttendanceRows.mockReturnValue([
      { id: 'a', user_number: 1, status: 'going', created_at: '', updated_at: '' },
      { id: 'b', user_number: 2, status: 'skip', created_at: '', updated_at: '' },
    ])
    mockProfiles.mockReturnValue([
      { user_number: 1, first_name: 'Alice', last_name: 'Dupont' },
      { user_number: 2, first_name: 'Bob', last_name: 'Martin' },
    ])

    const attendees = await getWeekAttendances('2026-10-07')

    expect(attendees).toHaveLength(2)
    expect(attendees[0]).toEqual({
      userNumber: 1,
      firstName: 'Alice',
      lastName: 'Dupont',
      status: 'going',
    })
    expect(attendees[1].status).toBe('skip')
  })

  it('retourne [] si personne n’a répondu', async () => {
    mockAttendanceRows.mockReturnValue([])
    mockProfiles.mockReturnValue([])
    expect(await getWeekAttendances('2026-10-07')).toEqual([])
  })

  it('affiche un nom de repli si le profil manque', async () => {
    mockAttendanceRows.mockReturnValue([
      { id: 'a', user_number: 99, status: 'going', created_at: '', updated_at: '' },
    ])
    mockProfiles.mockReturnValue([])

    const attendees = await getWeekAttendances('2026-10-07')
    expect(attendees[0]).toMatchObject({
      userNumber: 99,
      firstName: 'Membre',
      lastName: '#99',
      status: 'going',
    })
  })

  it('garde les statuts et replie les noms si user_profiles échoue', async () => {
    mockAttendanceRows.mockReturnValue([
      { id: 'a', user_number: 1, status: 'going', created_at: '', updated_at: '' },
    ])
    mockProfilesError.mockReturnValue(new Error('profils indisponibles'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const attendees = await getWeekAttendances('2026-10-07')

    // La panne des noms ne doit pas faire perdre les présences
    expect(attendees).toEqual([
      { userNumber: 1, firstName: 'Membre', lastName: '#1', status: 'going' },
    ])
    expect(warn).toHaveBeenCalled()

    warn.mockRestore()
  })
})
