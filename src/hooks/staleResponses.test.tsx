import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AuthProvider } from './useAuth'
import { useAttendance } from './useAttendance'
import { useParcoursVotes } from './useParcoursVotes'
import { useWeather } from './useWeather'
import { useParcours } from './useParcours'
import {
  getWeekAttendances,
  setAttendance,
  getWeekVotes,
  getParcours,
  deleteParcours,
  getUserProfile,
  type Attendee,
  type WeekVote,
} from '../services/supabaseService'
import { fetchWeather, type WeatherForecast } from '../services/weatherApi'
import type { Parcours } from '../types/supabase'

/**
 * Horloge contrôlable : les hooks consomment `useTargetWednesday`, mais les
 * tests doivent décider *quand* a lieu la bascule de 14h.
 */
const clock = vi.hoisted(() => ({ weekKey: '2026-10-07' }))

vi.mock('./useTargetWednesday', () => ({
  useTargetWednesday: () => ({
    weekKey: clock.weekKey,
    weekLabel: `semaine du ${clock.weekKey}`,
    date: new Date(2026, 9, 7, 12, 0, 0),
    isRunDay: false,
  }),
}))

vi.mock('../services/supabaseService', () => ({
  getUserProfile: vi.fn(),
  createUserProfile: vi.fn(),
  updateUserProfile: vi.fn(),
  findProfileByName: vi.fn(),
  getWeekAttendances: vi.fn(),
  setAttendance: vi.fn(),
  deleteWeekVote: vi.fn(),
  getWeekVotes: vi.fn(),
  castWeekVote: vi.fn(),
  getParcours: vi.fn(),
  addParcours: vi.fn(),
  deleteParcours: vi.fn(),
}))

vi.mock('../services/weatherApi', () => ({
  fetchWeather: vi.fn(),
  getRunTimestamp: vi.fn(() => 0),
  daysUntilRun: vi.fn(() => 1),
  formatWindDirection: vi.fn(() => 'N'),
}))

const mockAttendances = vi.mocked(getWeekAttendances)
const mockSetAttendance = vi.mocked(setAttendance)
const mockVotes = vi.mocked(getWeekVotes)
const mockGetParcours = vi.mocked(getParcours)
const mockDeleteParcours = vi.mocked(deleteParcours)
const mockGetProfile = vi.mocked(getUserProfile)
const mockFetchWeather = vi.mocked(fetchWeather)

const ALICE = 1

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const login = () => {
  localStorage.setItem(
    'running_user',
    JSON.stringify({ id: ALICE, firstName: 'Alice', lastName: 'Dupont', name: 'Alice Dupont' })
  )
  mockGetProfile.mockResolvedValue({
    id: 'uuid-1',
    user_number: ALICE,
    first_name: 'Alice',
    last_name: 'Dupont',
    pin_hash: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as never)
}

const attendee = (userNumber: number, status: 'going' | 'skip' = 'going'): Attendee => ({
  userNumber,
  firstName: `Membre${userNumber}`,
  lastName: String(userNumber),
  status,
})

const parcours = (id: string, name: string): Parcours => ({
  id,
  name,
  distance_km: 4,
  elevation_gain_m: 50,
  points: [],
  created_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
})

const weatherAt = (temperature: number): WeatherForecast => ({
  current: {
    temperature,
    feelsLike: temperature,
    humidity: 60,
    windSpeed: 10,
    windDeg: 180,
    weatherCode: 0,
    isDay: true,
    description: '',
    icon: '',
    dt: 1_700_000_000 + temperature,
  },
  hourly: [],
  daily: [],
})

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  clock.weekKey = '2026-10-07'
  login()
  mockSetAttendance.mockResolvedValue(undefined)
  mockDeleteParcours.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useAttendance — réponses obsolètes autour de la bascule', () => {
  it('ignore une réponse de l’ancienne semaine arrivée après la nouvelle', async () => {
    const reads: Deferred<Attendee[]>[] = []
    mockAttendances.mockImplementation(() => {
      const d = deferred<Attendee[]>()
      reads.push(d)
      return d.promise as never
    })

    const { result, rerender } = renderHook(() => useAttendance(), { wrapper })
    await waitFor(() => expect(reads).toHaveLength(1))

    // 14h : la semaine cible change, un nouveau chargement démarre
    clock.weekKey = '2026-10-14'
    rerender()
    await waitFor(() => expect(reads).toHaveLength(2))

    // La nouvelle semaine répond en premier
    await act(async () => {
      reads[1].resolve([attendee(2)])
      await reads[1].promise
    })
    await waitFor(() =>
      expect(result.current.attendees.map((a) => a.userNumber)).toEqual([2])
    )

    // L'ancienne semaine répond ensuite : elle ne doit rien écraser
    await act(async () => {
      reads[0].resolve([attendee(ALICE)])
      await reads[0].promise
    })

    expect(result.current.attendees.map((a) => a.userNumber)).toEqual([2])
  })

  it('ignore l’échec tardif d’une action lancée avant la bascule', async () => {
    const reads: Deferred<Attendee[]>[] = []
    mockAttendances.mockImplementation(() => {
      const d = deferred<Attendee[]>()
      reads.push(d)
      return d.promise as never
    })

    const write = deferred<void>()
    mockSetAttendance.mockReturnValue(write.promise)
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result, rerender } = renderHook(() => useAttendance(), { wrapper })
    await waitFor(() => expect(reads).toHaveLength(1))

    await act(async () => {
      reads[0].resolve([attendee(ALICE, 'going')])
      await reads[0].promise
    })
    await waitFor(() => expect(result.current.myStatus).toBe('going'))

    // L'utilisateur répond « pas aujourd'hui » juste avant 14h
    let save!: Promise<void>
    await act(async () => {
      save = result.current.setMyStatus('skip')
      await Promise.resolve()
    })
    expect(result.current.myStatus).toBe('skip')

    // 14h : la semaine change, le chargement de la nouvelle semaine répond
    clock.weekKey = '2026-10-14'
    rerender()
    await waitFor(() => expect(reads).toHaveLength(2))

    await act(async () => {
      reads[1].resolve([attendee(ALICE, 'skip'), attendee(2)])
      await reads[1].promise
    })
    await waitFor(() => expect(result.current.myStatus).toBe('skip'))

    // L'écriture de l'ancienne semaine échoue APRÈS la bascule
    await act(async () => {
      write.reject(new Error('network down'))
      await save
    })

    // Elle ne doit ni afficher d'erreur, ni revenir en arrière, ni recharger A
    expect(result.current.error).toBeNull()
    expect(result.current.myStatus).toBe('skip')
    expect(result.current.attendees).toHaveLength(2)
    expect(reads).toHaveLength(2)
    expect(errorLog).toHaveBeenCalled()
  })
})

describe('useParcoursVotes — réponses obsolètes autour de la bascule', () => {
  it('ignore les votes de l’ancienne semaine arrivés après la nouvelle', async () => {
    const voteReads: Deferred<WeekVote[]>[] = []
    const attendanceReads: Deferred<Attendee[]>[] = []
    mockVotes.mockImplementation(() => {
      const d = deferred<WeekVote[]>()
      voteReads.push(d)
      return d.promise as never
    })
    mockAttendances.mockImplementation(() => {
      const d = deferred<Attendee[]>()
      attendanceReads.push(d)
      return d.promise as never
    })

    const { result, rerender } = renderHook(() => useParcoursVotes(['p1', 'p2']), { wrapper })
    await waitFor(() => {
      expect(voteReads).toHaveLength(1)
      expect(attendanceReads).toHaveLength(1)
    })

    clock.weekKey = '2026-10-14'
    rerender()
    await waitFor(() => {
      expect(voteReads).toHaveLength(2)
      expect(attendanceReads).toHaveLength(2)
    })

    // La nouvelle semaine répond en premier
    await act(async () => {
      attendanceReads[1].resolve([attendee(ALICE, 'going')])
      voteReads[1].resolve([{ parcoursId: 'p2', userNumber: ALICE, status: 'yes' }])
      await Promise.all([voteReads[1].promise, attendanceReads[1].promise])
    })
    await waitFor(() => expect(result.current.tallies.p2?.yes).toBe(1))

    // L'ancienne semaine répond ensuite : elle ne doit pas peser
    await act(async () => {
      attendanceReads[0].resolve([attendee(ALICE, 'going')])
      voteReads[0].resolve([{ parcoursId: 'p1', userNumber: ALICE, status: 'yes' }])
      await Promise.all([voteReads[0].promise, attendanceReads[0].promise])
    })

    expect(result.current.tallies.p1).toBeUndefined()
    expect(result.current.tallies.p2?.yes).toBe(1)
    expect(result.current.myChoice).toBe('p2')
  })

  it('garde le décompte le plus récent quand la liste des présents change', async () => {
    const voteReads: Deferred<WeekVote[]>[] = []
    mockVotes.mockImplementation(() => {
      const d = deferred<WeekVote[]>()
      voteReads.push(d)
      return d.promise as never
    })
    mockAttendances.mockResolvedValue([])

    const { result, rerender } = renderHook(
      ({ going }: { going: number[] }) => useParcoursVotes(['p1'], {}, going),
      { wrapper, initialProps: { going: [ALICE] } }
    )
    await waitFor(() => expect(voteReads).toHaveLength(1))
    // La liste des présents est fournie : aucune requête de présences.
    expect(mockAttendances).not.toHaveBeenCalled()

    // La présence change pendant que la requête est en vol : plus besoin de
    // relancer un chargement, c'est un recalcul local.
    rerender({ going: [] })
    expect(voteReads).toHaveLength(1)
    expect(mockAttendances).not.toHaveBeenCalled()

    // La réponse arrive avec un vote qui ne vaut plus : la liste la plus
    // récente fait autorité, le vote est écarté.
    await act(async () => {
      voteReads[0].resolve([{ parcoursId: 'p1', userNumber: ALICE, status: 'yes' }])
      await voteReads[0].promise
    })

    expect(result.current.tallies.p1).toBeUndefined()
    expect(result.current.loading).toBe(false)
  })
})

describe('useWeather — réponses obsolètes autour de la bascule', () => {
  it('ignore la météo de l’ancienne semaine et ne touche pas au cache de la nouvelle', async () => {
    const reads: Deferred<WeatherForecast>[] = []
    mockFetchWeather.mockImplementation(() => {
      const d = deferred<WeatherForecast>()
      reads.push(d)
      return d.promise as never
    })

    const { result, rerender } = renderHook(() => useWeather(), { wrapper })
    await waitFor(() => expect(reads).toHaveLength(1))

    clock.weekKey = '2026-10-14'
    rerender()
    await waitFor(() => expect(reads).toHaveLength(2))

    const newWeather = weatherAt(20)
    await act(async () => {
      reads[1].resolve(newWeather)
      await reads[1].promise
    })
    await waitFor(() => expect(result.current.weather).toBe(newWeather))
    expect(localStorage.getItem('weather_cache_2026-10-14')).not.toBeNull()

    const oldWeather = weatherAt(10)
    await act(async () => {
      reads[0].resolve(oldWeather)
      await reads[0].promise
    })

    expect(result.current.weather).toBe(newWeather)
    // La réponse tardive ne doit ni écrire son cache ni purger celui de B
    expect(localStorage.getItem('weather_cache_2026-10-07')).toBeNull()
    expect(localStorage.getItem('weather_cache_2026-10-14')).not.toBeNull()
  })

  it('ignore une erreur de l’ancienne semaine', async () => {
    const reads: Deferred<WeatherForecast>[] = []
    mockFetchWeather.mockImplementation(() => {
      const d = deferred<WeatherForecast>()
      reads.push(d)
      return d.promise as never
    })

    const { result, rerender } = renderHook(() => useWeather(), { wrapper })
    await waitFor(() => expect(reads).toHaveLength(1))

    clock.weekKey = '2026-10-14'
    rerender()
    await waitFor(() => expect(reads).toHaveLength(2))

    const newWeather = weatherAt(20)
    await act(async () => {
      reads[1].resolve(newWeather)
      await reads[1].promise
    })
    await waitFor(() => expect(result.current.weather).toBe(newWeather))

    await act(async () => {
      reads[0].reject(new Error('HTTP 500'))
      await Promise.resolve()
    })

    expect(result.current.error).toBeNull()
    expect(result.current.weather).toBe(newWeather)
  })

  it('ne garde pas la météo de l’ancienne semaine si la nouvelle échoue', async () => {
    const reads: Deferred<WeatherForecast>[] = []
    mockFetchWeather.mockImplementation(() => {
      const d = deferred<WeatherForecast>()
      reads.push(d)
      return d.promise as never
    })

    const { result, rerender } = renderHook(() => useWeather(), { wrapper })
    await waitFor(() => expect(reads).toHaveLength(1))

    const oldWeather = weatherAt(10)
    await act(async () => {
      reads[0].resolve(oldWeather)
      await reads[0].promise
    })
    await waitFor(() => expect(result.current.weather).toBe(oldWeather))

    clock.weekKey = '2026-10-14'
    rerender()
    await waitFor(() => expect(reads).toHaveLength(2))

    await act(async () => {
      reads[1].reject(new Error('HTTP 500'))
      await Promise.resolve()
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    // La météo de A a été vidée : l'erreur est visible au lieu d'afficher A
    expect(result.current.weather).toBeNull()
    expect(result.current.fetchedAt).toBeNull()
    expect(result.current.error).toBeTruthy()
  })
})

describe('useParcours — réponses concurrentes', () => {
  it('ne ressuscite pas un parcours supprimé si un ancien polling répond après', async () => {
    const reads: Deferred<Parcours[]>[] = []
    mockGetParcours.mockImplementation(() => {
      const d = deferred<Parcours[]>()
      reads.push(d)
      return d.promise as never
    })

    const { result } = renderHook(() => useParcours(), { wrapper })
    await waitFor(() => expect(reads).toHaveLength(1))

    const initial = [parcours('p1', 'Bois de Haye'), parcours('p2', 'Canal')]
    await act(async () => {
      reads[0].resolve(initial)
      await reads[0].promise
    })
    await waitFor(() => expect(result.current.parcoursList).toHaveLength(2))

    // Un polling part et reste en attente
    let poll!: Promise<void>
    await act(async () => {
      poll = result.current.refresh({ silent: true })
      await Promise.resolve()
    })
    await waitFor(() => expect(reads).toHaveLength(2))

    // Une suppression déclenche un rechargement plus récent
    let removal!: Promise<void>
    await act(async () => {
      removal = result.current.removeParcours('p1')
      await Promise.resolve()
    })
    await waitFor(() => expect(reads).toHaveLength(3))

    await act(async () => {
      reads[2].resolve([initial[1]])
      await removal
    })
    expect(result.current.parcoursList.map((p) => p.id)).toEqual(['p2'])

    // L'ancien polling répond avec la liste d'avant la suppression
    await act(async () => {
      reads[1].resolve(initial)
      await poll
    })

    expect(result.current.parcoursList.map((p) => p.id)).toEqual(['p2'])
  })
})
