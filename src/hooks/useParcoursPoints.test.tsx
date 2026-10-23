import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useParcoursPoints } from './useParcoursPoints'
import { getParcoursPoints } from '../services/supabaseService'
import type { GPXPoint } from '../types'

vi.mock('../services/supabaseService', () => ({
  getParcoursPoints: vi.fn(),
}))

const mockGetParcoursPoints = vi.mocked(getParcoursPoints)

const POINTS: GPXPoint[] = [
  { lat: 48.6, lng: 6.1 },
  { lat: 48.7, lng: 6.2 },
]

const OTHER_POINTS: GPXPoint[] = [{ lat: 49.1, lng: 6.5 }]

beforeEach(() => {
  vi.clearAllMocks()
  mockGetParcoursPoints.mockResolvedValue([])
})

describe('useParcoursPoints — chargement à la demande', () => {
  it('ne charge rien automatiquement', () => {
    const { result } = renderHook(() => useParcoursPoints('p1'))

    expect(mockGetParcoursPoints).not.toHaveBeenCalled()
    expect(result.current.points).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('charge les points à la demande', async () => {
    mockGetParcoursPoints.mockResolvedValue(POINTS)
    const { result } = renderHook(() => useParcoursPoints('p1'))

    await act(async () => {
      await result.current.load()
    })

    expect(mockGetParcoursPoints).toHaveBeenCalledWith('p1')
    expect(result.current.points).toEqual(POINTS)
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('ne relance pas la requête si les points sont déjà chargés', async () => {
    mockGetParcoursPoints.mockResolvedValue(POINTS)
    const { result } = renderHook(() => useParcoursPoints('p1'))

    await act(async () => {
      await result.current.load()
    })
    await act(async () => {
      await result.current.load()
    })

    expect(mockGetParcoursPoints).toHaveBeenCalledTimes(1)
  })

  it('évite deux requêtes concurrentes', async () => {
    mockGetParcoursPoints.mockResolvedValue(POINTS)
    const { result } = renderHook(() => useParcoursPoints('p1'))

    await act(async () => {
      await Promise.all([result.current.load(), result.current.load()])
    })

    expect(mockGetParcoursPoints).toHaveBeenCalledTimes(1)
    expect(result.current.points).toEqual(POINTS)
  })

  it('expose une erreur puis permet de réessayer', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetParcoursPoints
      .mockRejectedValueOnce(new Error('Réseau indisponible'))
      .mockResolvedValueOnce(POINTS)

    const { result } = renderHook(() => useParcoursPoints('p1'))

    await act(async () => {
      await result.current.load()
    })

    expect(result.current.points).toBeNull()
    expect(result.current.error).toBe('Impossible de charger le tracé')
    expect(result.current.loading).toBe(false)

    await act(async () => {
      await result.current.load()
    })

    expect(result.current.points).toEqual(POINTS)
    expect(result.current.error).toBeNull()
    expect(mockGetParcoursPoints).toHaveBeenCalledTimes(2)

    consoleError.mockRestore()
  })

  it('réinitialise le tracé quand l’identifiant change', async () => {
    mockGetParcoursPoints.mockResolvedValueOnce(POINTS)
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useParcoursPoints(id),
      { initialProps: { id: 'p1' } }
    )

    await act(async () => {
      await result.current.load()
    })
    expect(result.current.points).toEqual(POINTS)

    rerender({ id: 'p2' })
    await waitFor(() => expect(result.current.points).toBeNull())

    mockGetParcoursPoints.mockResolvedValueOnce(OTHER_POINTS)
    await act(async () => {
      await result.current.load()
    })

    expect(result.current.points).toEqual(OTHER_POINTS)
    expect(mockGetParcoursPoints).toHaveBeenLastCalledWith('p2')
  })

  it('ignore la réponse d’un ancien parcours', async () => {
    let resolveOld: (points: GPXPoint[]) => void = () => {}
    mockGetParcoursPoints.mockReturnValueOnce(
      new Promise<GPXPoint[]>((resolve) => {
        resolveOld = resolve
      })
    )

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useParcoursPoints(id),
      { initialProps: { id: 'p1' } }
    )

    act(() => {
      void result.current.load()
    })

    rerender({ id: 'p2' })
    mockGetParcoursPoints.mockResolvedValueOnce(OTHER_POINTS)

    await act(async () => {
      await result.current.load()
    })
    expect(result.current.points).toEqual(OTHER_POINTS)

    // La requête de p1 arrive après la bascule : elle doit être ignorée.
    await act(async () => {
      resolveOld(POINTS)
    })

    expect(result.current.points).toEqual(OTHER_POINTS)
  })
})
