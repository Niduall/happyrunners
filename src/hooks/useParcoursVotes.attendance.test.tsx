import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AuthProvider } from './useAuth'
import { useParcoursVotes } from './useParcoursVotes'
import {
  getWeekTallies,
  getWeekVotes,
  getWeekAttendances,
  castWeekVote,
  deleteWeekVote,
  getUserProfile,
} from '../services/supabaseService'

vi.mock('../services/supabaseService', () => ({
  getWeekTallies: vi.fn(),
  getWeekVotes: vi.fn(),
  getWeekAttendances: vi.fn(),
  castWeekVote: vi.fn(),
  deleteWeekVote: vi.fn(),
  getUserProfile: vi.fn(),
  createUserProfile: vi.fn(),
  updateUserProfile: vi.fn(),
  findProfileByName: vi.fn(),
  setAttendance: vi.fn(),
}))

const mockTallies = vi.mocked(getWeekTallies)
const mockVotes = vi.mocked(getWeekVotes)
const mockAttendances = vi.mocked(getWeekAttendances)
const mockGetProfile = vi.mocked(getUserProfile)
const mockCast = vi.mocked(castWeekVote)
const mockDelete = vi.mocked(deleteWeekVote)

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>

const ALICE = 1
const PARCOURS = ['p1', 'p2']

interface Vote {
  parcoursId: string
  userNumber: number
  status: 'yes' | 'no'
}
interface Att {
  userNumber: number
  status: 'going' | 'skip'
}

let votes: Vote[] = []
let attendance: Att[] = []

/** Calcule les compteurs comme le fait la base (tous les votes, sans filtre) */
const tallyOf = () => {
  const acc: { parcoursId: string; yes: number; no: number }[] = []
  for (const v of votes) {
    let t = acc.find((x) => x.parcoursId === v.parcoursId)
    if (!t) {
      t = { parcoursId: v.parcoursId, yes: 0, no: 0 }
      acc.push(t)
    }
    t[v.status] += 1
  }
  return acc
}

const attendee = (userNumber: number, status: 'going' | 'skip') => ({
  userNumber,
  firstName: 'Test',
  lastName: 'User',
  status,
})


const renderVotes = () => renderHook(() => useParcoursVotes(PARCOURS), { wrapper })

describe('useParcoursVotes — un vote ne compte que si la personne vient', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
    votes = []
    attendance = []

    localStorage.setItem(
      'running_user',
      JSON.stringify({ id: ALICE, firstName: 'Alice', lastName: 'Dupont', name: 'Alice Dupont' })
    )
    vi.mocked(getUserProfile).mockResolvedValue({
      id: 'uuid-1',
      user_number: ALICE,
      first_name: 'Alice',
      last_name: 'Dupont',
      pin_hash: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    vi.mocked(castWeekVote).mockResolvedValue(undefined)
    vi.mocked(deleteWeekVote).mockResolvedValue(undefined)

    // Le vote écrit doit apparaître dans le store, comme le ferait la base
    mockCast.mockImplementation(({ parcoursId, userNumber }) => {
      votes = votes.filter((v) => v.userNumber !== userNumber)
      votes.push({ parcoursId, userNumber, status: 'yes' })
      return Promise.resolve()
    })
    mockDelete.mockImplementation((userNumber: number) => {
      votes = votes.filter((v) => v.userNumber !== userNumber)
      return Promise.resolve()
    })

    mockVotes.mockImplementation(() => Promise.resolve([...votes]))
    mockTallies.mockImplementation(() => Promise.resolve(tallyOf()))
    mockAttendances.mockImplementation(() =>
    Promise.resolve(attendance.map((a) => attendee(a.userNumber, a.status)))
  )
  })
  it('compte le vote d’une personne présente', async () => {
    attendance = [attendee(2, 'going')]
    votes = [{ parcoursId: 'p1', userNumber: 2, status: 'yes' }]

    const { result } = renderVotes()
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.tallies.p1?.yes).toBe(1)
  })

  it('ignore le vote d’une personne ayant dit « pas aujourd’hui »', async () => {
    // Le cas remonté : la suppression du vote peut avoir échoué, ou le
    // client n'a pas encore rechargé. Le vote ne doit pas peser pour autant.
    attendance = [attendee(2, 'skip')]
    votes = [{ parcoursId: 'p1', userNumber: 2, status: 'yes' }]

    const { result } = renderVotes()
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Aucune voix pour p1 : le parcours n'existe même pas dans les compteurs
    expect(result.current.tallies.p1).toBeUndefined()
    expect(result.current.winners).toEqual([])
    expect(result.current.choiceOf(2)).toBeNull()
  })

  it('ignore le vote d’une personne qui n’a jamais répondu', async () => {
    // Le vote orphelin observé en prod : inscription + vote, sans jamais
    // cliquer sur « je viens » ni « pas aujourd'hui ».
    attendance = []
    votes = [{ parcoursId: 'p1', userNumber: 16, status: 'yes' }]

    const { result } = renderVotes()
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.tallies.p1).toBeUndefined()
    // Aucun gagnant : personne n'est là pour choisir
    expect(result.current.winners).toEqual([])
    expect(result.current.isTie).toBe(false)
  })

  it('ne révèle pas le parcours d’un absent dans choiceOf', async () => {
    attendance = [attendee(2, 'skip')]
    votes = [{ parcoursId: 'p1', userNumber: 2, status: 'yes' }]

    const { result } = renderVotes()
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.choiceOf(2)).toBeNull()
  })

  it('ne compte que les présents quand tout le monde a répondu', async () => {
    // Le scénario exact du bug : 3 présents dont aucun n'a voté,
    // 2 absents, et un parcours qui « possédait » un vote.
    attendance = [attendee(1, 'going'), attendee(2, 'going'), attendee(3, 'going'), attendee(4, 'skip'), attendee(5, 'skip')]
    votes = [{ parcoursId: 'p1', userNumber: 5, status: 'yes' }]

    const { result } = renderVotes()
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.tallies.p1).toBeUndefined()
    expect(result.current.winners).toEqual([])
  })

  it('compte normalement quand tout le monde est présent', async () => {
    attendance = [attendee(1, 'going'), attendee(2, 'going')]
    votes = [{ parcoursId: 'p1', userNumber: 2, status: 'yes' }]

    const { result } = renderVotes()
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.tallies.p1?.yes).toBe(1)
    expect(result.current.winners).toEqual(['p1'])
  })

  it('mon propre vote disparaît si je dis « pas aujourd’hui »', async () => {
    attendance = [attendee(ALICE, 'going')]
    votes = [{ parcoursId: 'p1', userNumber: ALICE, status: 'yes' }]

    const { result } = renderVotes()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.myChoice).toBe('p1')

    // Passage à skip : plus de choix, plus de compteur
    attendance = [attendee(ALICE, 'skip')]
    await act(async () => {
      await result.current.toggleChoice('p1')
    })

    expect(result.current.tallies.p1).toBeUndefined()
    expect(result.current.winners).toEqual([])
  })

  it('conserve le tri alphabétique quand aucun vote ne compte', async () => {
    attendance = [attendee(1, 'going')]
    votes = []

    const { result } = renderVotes()
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Rien à départager → ordre déterministe, et pas de faux gagnant
    expect(result.current.rankedParcoursIds).toEqual(['p1', 'p2'])
    expect(result.current.isTie).toBe(false)
  })

  // Le cas décrit : je viens, je vote, puis je dis « pas aujourd'hui ».
  // useAttendance supprime le vote en base, mais le client ne doit pas
  // attendre le polling pour arrêter de l'afficher et de le compter.
  it('retire le vote d’une personne qui vient de dire « pas aujourd’hui »', async () => {
    attendance = [attendee(ALICE, 'going')]
    votes = [{ parcoursId: 'p1', userNumber: ALICE, status: 'yes' }]

    // Présent : le vote compte
    const { result: coming } = renderHook(
      () => useParcoursVotes(PARCOURS, {}, [ALICE]),
      { wrapper }
    )
    await waitFor(() => expect(coming.current.loading).toBe(false))
    expect(coming.current.myChoice).toBe('p1')
    expect(coming.current.tallies.p1?.yes).toBe(1)

    // Je passe « pas aujourd'hui » : plus personne dans la liste
    attendance = [attendee(ALICE, 'skip')]
    const { result: absent } = renderHook(() => useParcoursVotes(PARCOURS, {}, []), { wrapper })
    await waitFor(() => expect(absent.current.loading).toBe(false))

    // Le vote n'est plus compté, même s'il est encore en base
    expect(absent.current.tallies.p1).toBeUndefined()
    expect(absent.current.myChoice).toBeNull()
    expect(absent.current.winners).toEqual([])
    void coming
  })

  it('ne remet pas les votes à zéro si les présences échouent', async () => {
    votes = [{ parcoursId: 'p1', userNumber: 2, status: 'yes' }]
    mockAttendances.mockRejectedValue(new Error('réseau'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { result } = renderVotes()
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Repli assumé : compter tout vaut mieux qu'afficher zéro alors que
    // la requête de votes, elle, a bien réussi.
    expect(result.current.tallies.p1?.yes).toBe(1)
    expect(result.current.error).toBeNull()
    expect(warn).toHaveBeenCalled()

    warn.mockRestore()
  })
})