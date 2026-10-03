import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AuthProvider } from './useAuth'
import { useWeather } from './useWeather'
import { fetchWeather } from '../services/weatherApi'

vi.mock('../services/supabaseService', () => ({
  getUserProfile: vi.fn().mockResolvedValue(null),
  upsertUserProfile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../services/weatherApi', () => ({
  fetchWeather: vi.fn(),
  getRunTimestamp: vi.fn(() => Math.floor(Date.now() / 1000)),
  daysUntilRun: vi.fn(() => 1),
  formatWindDirection: vi.fn(() => 'N'),
}))

const mockFetchWeather = vi.mocked(fetchWeather)

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>

const fakeWeather = {
  current: {
    temperature: 15,
    feelsLike: 14,
    humidity: 60,
    windSpeed: 10,
    windDeg: 180,
    weatherCode: 0,
    isDay: true,
    description: '',
    icon: '',
    dt: 1_700_000_000,
  },
  hourly: [],
  daily: [],
}

describe('useWeather — pas de clignotement', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockFetchWeather.mockResolvedValue(fakeWeather as never)
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('ne déclenche pas setLoading(true) quand le cache est valide', async () => {
    const { result, rerender } = renderHook(() => useWeather(), { wrapper })

    // Premier chargement → réseau
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockFetchWeather).toHaveBeenCalledTimes(1)

    // Espionne le setter via l'état observé à chaque render :
    // on compte les bascules true→false qui provoqueraient un clignotement.
    const transitions: string[] = []
    let prev = result.current.loading

    for (let i = 0; i < 10; i++) {
      rerender()
      const now = result.current.loading
      if (now !== prev) transitions.push(`${prev} → ${now}`)
      prev = now
    }

    // Aucune transition = aucun clignotement
    expect(transitions).toEqual([])
    // Et surtout : aucun re-fetch réseau
    expect(mockFetchWeather).toHaveBeenCalledTimes(1)
  })

  it('ne rappelle PAS fetchWeather lors des re-renders périodiques', async () => {
    const { result, rerender } = renderHook(() => useWeather(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    const callsAfterInit = mockFetchWeather.mock.calls.length

    // 10 re-renders (comme les ticks d'1 min de useTargetWednesday)
    for (let i = 0; i < 10; i++) {
      rerender()
    }

    expect(mockFetchWeather).toHaveBeenCalledTimes(callsAfterInit)
    void result
  })

  it('affiche le spinner seulement au tout premier chargement', async () => {
    const { result } = renderHook(() => useWeather(), { wrapper })

    // Tant que le réseau n'a pas répondu → spinner
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.weather).not.toBeNull()
  })

  it('refetch si le cache a expiré (> 1h)', async () => {
    const { result } = renderHook(() => useWeather(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockFetchWeather).toHaveBeenCalledTimes(1)

    // Vieillit le cache de 2h directement dans localStorage
    const cacheKey = Object.keys(localStorage).find((k) => k.startsWith('weather_cache'))!
    const entry = JSON.parse(localStorage.getItem(cacheKey)!)
    entry.timestamp = Date.now() - 2 * 60 * 60 * 1000
    localStorage.setItem(cacheKey, JSON.stringify(entry))

    // refresh() force un re-fetch qui doit constater l'expiration
    await act(async () => {
      result.current.refresh()
    })

    await waitFor(() => expect(mockFetchWeather).toHaveBeenCalledTimes(2))
  })

  it('refetch si la semaine change (bascule de 14h)', async () => {
    const { result, rerender } = renderHook(() => useWeather(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockFetchWeather).toHaveBeenCalledTimes(1)

    // Simule la bascule : l'entrée de cache porte une autre semaine
    const cacheKey = Object.keys(localStorage).find((k) => k.startsWith('weather_cache'))!
    const entry = JSON.parse(localStorage.getItem(cacheKey)!)
    entry.weekKey = '2000-01-01'
    localStorage.setItem(cacheKey, JSON.stringify(entry))

    // Force un changement de dépendance : on remonte le hook avec une
    // nouvelle identité de `useTargetWednesday` simulé via un state
    const { result: resultB } = renderHook(() => useWeather(), { wrapper })
    await waitFor(() => expect(resultB.current.weather).not.toBeNull())

    rerender()
    void result

    // Le cache invalide force un re-fetch
    await waitFor(() => expect(mockFetchWeather.mock.calls.length).toBeGreaterThan(1))
  })

  it('rafraîchit automatiquement en tâche de fond (toutes les 30 min)', async () => {
    const { result, rerender } = renderHook(() => useWeather(), { wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockFetchWeather).toHaveBeenCalledTimes(1)

    // Le cache est valide (1h) → pas de fetch immédiat
    rerender()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(mockFetchWeather).toHaveBeenCalledTimes(1)

    // Après 30 min → refresh de fond
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000)
    })
    expect(mockFetchWeather).toHaveBeenCalledTimes(2)

    // Après 60 min → encore un refresh
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000)
    })
    expect(mockFetchWeather).toHaveBeenCalledTimes(3)

    // Le refresh de fond ne montre jamais le spinner
    expect(result.current.loading).toBe(false)
  })

  it('le refresh de fond ne déclenche pas de spinner', async () => {
    // Fetch lent → loading=true pendant le réseau si non silencieux
    let resolvers: (() => void)[] = []
    mockFetchWeather.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(fakeWeather as never))
        }) as never
    )

    const { result } = renderHook(() => useWeather(), { wrapper })

    // Premier chargement : spinner normal
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.loading).toBe(true)
    await act(async () => {
      resolvers.shift()?.()
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Refresh de fond : le fetch est en cours mais loading reste false
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000)
    })
    expect(result.current.loading).toBe(false)

    await act(async () => {
      resolvers.shift()?.()
    })
  })

  it('refresh() manuel force un re-fetch immédiat', async () => {
    const { result } = renderHook(() => useWeather(), { wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockFetchWeather).toHaveBeenCalledTimes(1)

    await act(async () => {
      result.current.refresh()
    })

    expect(mockFetchWeather).toHaveBeenCalledTimes(2)
  })
})

describe('useWeather — erreurs', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('expose le message d’erreur', async () => {
    mockFetchWeather.mockRejectedValue(new Error('HTTP 500'))
    const { result } = renderHook(() => useWeather(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeTruthy()
    expect(result.current.weather).toBeNull()
  })

  it('reste en erreur sans boucle de retry', async () => {
    mockFetchWeather.mockRejectedValue(new Error('nope'))
    const { result, rerender } = renderHook(() => useWeather(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    const before = mockFetchWeather.mock.calls.length
    for (let i = 0; i < 5; i++) rerender()
    // Pas de retry automatique (l'erreur n'est pas cachée)
    expect(mockFetchWeather).toHaveBeenCalledTimes(before)
  })
})
