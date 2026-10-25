import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AuthProvider } from './useAuth'
import { useParcours } from './useParcours'
import { getParcours, deleteParcours, updateParcours } from '../services/supabaseService'
import { parseGPX } from '../services/gpxParser'

vi.mock('../services/supabaseService', () => ({
  getParcours: vi.fn(),
  addParcours: vi.fn(),
  deleteParcours: vi.fn(),
  updateParcours: vi.fn(),
  getUserProfile: vi.fn().mockResolvedValue(null),
  upsertUserProfile: vi.fn(),
  getWeekTallies: vi.fn(),
  getWeekVotes: vi.fn(),
  castWeekVote: vi.fn(),
  deleteWeekVote: vi.fn(),
  getWeekAttendances: vi.fn(),
  setAttendance: vi.fn(),
  getRoster: vi.fn(),
}))

vi.mock('../services/gpxParser', () => ({ parseGPX: vi.fn() }))

const mockGetParcours = vi.mocked(getParcours)
const mockDeleteParcours = vi.mocked(deleteParcours)
const mockUpdateParcours = vi.mocked(updateParcours)
const mockParseGPX = vi.mocked(parseGPX)

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>

const SAMPLE = [
  { id: 'p1', name: 'Bois de Haye', distance_km: 4.2, elevation_gain_m: 93, points: [], created_by: null },
  { id: 'p2', name: 'Canal latéral', distance_km: 3.1, elevation_gain_m: 12, points: [], created_by: null },
]

describe('useParcours — polling silencieux', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockGetParcours.mockResolvedValue(SAMPLE as never)
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('affiche le spinner au premier chargement', async () => {
    const { result } = renderHook(() => useParcours(), { wrapper })

    expect(result.current.loading).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('NE ré-affiche PAS le spinner pendant le polling de 30s', async () => {
    // On rend chaque fetch lent pour exposer un éventuel état loading=true
    // intermédiaire. En production, le réseau prend ~200 ms → le spinner
    // serait visible 200 ms toutes les 30 s.
    const resolvers: (() => void)[] = []
    mockGetParcours.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(SAMPLE as never))
        }) as never
    )

    const { result } = renderHook(() => useParcours(), { wrapper })

    // Premier chargement : on déclenche puis on résout
    await act(async () => {
      vi.advanceTimersByTime(0)
    })
    expect(result.current.loading).toBe(true) // spinner au 1er chargement : OK

    await act(async () => {
      resolvers.shift()?.()
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    const spinnerDuringPolls: boolean[] = []

    for (let i = 0; i < 3; i++) {
      // Déclenche le poll
      await act(async () => {
        vi.advanceTimersByTime(30_000)
      })

      // À cet instant le fetch est EN COURS. Avec le bug, loading === true
      // et le spinner est affiché.
      spinnerDuringPolls.push(result.current.loading)

      // Laisse le fetch se terminer
      await act(async () => {
        resolvers.shift()?.()
      })
    }

    expect(spinnerDuringPolls).toEqual([false, false, false])
  })

  it('rafraîchit bien les données à chaque poll', async () => {
    const { result } = renderHook(() => useParcours(), { wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await waitFor(() => expect(result.current.parcoursList).toHaveLength(2))

    // Le parcours le plus récent arrive en tête
    mockGetParcours.mockResolvedValue([
      { id: 'p3', name: 'Nouveau', distance_km: 5, points: [], created_by: null },
      ...(SAMPLE as never[]),
    ] as never)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    await waitFor(() => expect(result.current.nextParcours?.name).toBe('Nouveau'))
    expect(result.current.loading).toBe(false)
  })

  it('garde les mêmes références quand le polling renvoie les mêmes données', async () => {
    // Chaque requête crée de nouveaux objets, comme le ferait Supabase.
    mockGetParcours.mockImplementation(() =>
      Promise.resolve(SAMPLE.map((p) => ({ ...p })) as never)
    )

    const { result } = renderHook(() => useParcours(), { wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await waitFor(() => expect(result.current.parcoursList).toHaveLength(2))

    const list = result.current.parcoursList
    const next = result.current.nextParcours

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(result.current.parcoursList).toBe(list)
    expect(result.current.nextParcours).toBe(next)
  })

  it('n’affiche pas le spinner non plus en cas d’erreur de poll', async () => {
    const { result } = renderHook(() => useParcours(), { wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    mockGetParcours.mockRejectedValue(new Error('network'))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(result.current.error).toBeTruthy()
    // Toujours pas de spinner
    expect(result.current.loading).toBe(false)
  })

  it('nettoie son timer au démontage', async () => {
    const { unmount } = renderHook(() => useParcours(), { wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    const callsBefore = mockGetParcours.mock.calls.length
    unmount()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })

    // Aucun poll après le démontage
    expect(mockGetParcours).toHaveBeenCalledTimes(callsBefore)
  })

  describe('suppression', () => {
    beforeEach(() => {
      localStorage.clear()
      vi.clearAllMocks()
      vi.useRealTimers()
      mockGetParcours.mockResolvedValue(SAMPLE as never)
      mockDeleteParcours.mockResolvedValue(undefined)
    })

    it('retire le parcours de la liste immédiatement', async () => {
      // ⚠️ Régression : removeParcours supprimait en base sans recharger la
      // liste. La ligne restait affichée jusqu'au polling suivant (30 s),
      // ce qui donnait l'impression que la suppression n'avait rien fait.
      const { result } = renderHook(() => useParcours(), { wrapper })
      await waitFor(() => expect(result.current.parcoursList).toHaveLength(2))

      // La base ne renvoie plus que le parcours restant
      mockGetParcours.mockResolvedValue([SAMPLE[1]] as never)

      await act(async () => {
        await result.current.removeParcours('p1')
      })

      expect(mockDeleteParcours).toHaveBeenCalledWith('p1')
      expect(result.current.parcoursList).toHaveLength(1)
      expect(result.current.parcoursList[0].id).toBe('p2')
      // Et le « prochain parcours » suit
      expect(result.current.nextParcours?.id).toBe('p2')
    })

    it('recharge sans afficher le spinner', async () => {
      const { result } = renderHook(() => useParcours(), { wrapper })
      await waitFor(() => expect(result.current.parcoursList).toHaveLength(2))
      mockGetParcours.mockResolvedValue([SAMPLE[1]] as never)

      const loadingDuringDelete: boolean[] = []
      await act(async () => {
        const p = result.current.removeParcours('p1')
        loadingDuringDelete.push(result.current.loading)
        await p
      })

      expect(loadingDuringDelete).toEqual([false])
      expect(result.current.loading).toBe(false)
    })

    it('ne masque pas la liste si la suppression échoue', async () => {
      const { result } = renderHook(() => useParcours(), { wrapper })
      await waitFor(() => expect(result.current.parcoursList).toHaveLength(2))

      mockDeleteParcours.mockRejectedValue(new Error('network'))

      await act(async () => {
        await expect(result.current.removeParcours('p1')).rejects.toThrow('network')
      })

      // La liste reste telle quelle : rien n'a été supprimé
      expect(result.current.parcoursList).toHaveLength(2)
    })
  })

  describe('modification', () => {
    beforeEach(() => {
      localStorage.clear()
      vi.clearAllMocks()
      vi.useRealTimers()
      mockGetParcours.mockResolvedValue(SAMPLE as never)
      mockUpdateParcours.mockResolvedValue({} as never)
    })

    it('renomme sans toucher au tracé', async () => {
      const { result } = renderHook(() => useParcours(), { wrapper })
      await waitFor(() => expect(result.current.parcoursList).toHaveLength(2))

      await act(async () => {
        await result.current.editParcours('p1', { name: 'Nouveau nom' })
      })

      expect(mockUpdateParcours).toHaveBeenCalledWith('p1', { name: 'Nouveau nom' })
      expect(mockParseGPX).not.toHaveBeenCalled()
      expect(mockGetParcours).toHaveBeenCalledTimes(2)
    })

    it('remplace le tracé sans changer le nom', async () => {
      // Le nom, la description et le créateur restent en base : seuls les
      // champs issus du GPX sont envoyés.
      mockParseGPX.mockReturnValue({
        id: 'p1',
        name: 'GPX sans nom',
        distance_km: 7.8,
        elevation_gain_m: 210,
        points: [{ lat: 48.6, lng: 6.1 }],
        created_by: null,
        created_at: '',
        updated_at: '',
      })

      const { result } = renderHook(() => useParcours(), { wrapper })
      await waitFor(() => expect(result.current.parcoursList).toHaveLength(2))

      await act(async () => {
        await result.current.editParcours('p1', { gpxContent: '<gpx />' })
      })

      expect(mockParseGPX).toHaveBeenCalledWith('<gpx />')
      expect(mockUpdateParcours).toHaveBeenCalledWith('p1', {
        distance_km: 7.8,
        elevation_gain_m: 210,
        points: [{ lat: 48.6, lng: 6.1 }],
      })
    })

    it('refuse un GPX invalide et n’écrit rien', async () => {
      mockParseGPX.mockReturnValue(null)

      const { result } = renderHook(() => useParcours(), { wrapper })
      await waitFor(() => expect(result.current.parcoursList).toHaveLength(2))

      await act(async () => {
        await expect(
          result.current.editParcours('p1', { gpxContent: 'pas un gpx' })
        ).rejects.toThrow('Fichier GPX invalide')
      })

      expect(mockUpdateParcours).not.toHaveBeenCalled()
      expect(result.current.parcoursList).toHaveLength(2)
    })

    it('recharge la liste sans spinner après modification', async () => {
      const { result } = renderHook(() => useParcours(), { wrapper })
      await waitFor(() => expect(result.current.parcoursList).toHaveLength(2))

      // La base renvoie le nouveau nom ; sans rechargement la liste garderait
      // l'ancien jusqu'au polling de 30 s.
      mockGetParcours.mockResolvedValue([
        { ...SAMPLE[0], name: 'Nouveau nom' },
        SAMPLE[1],
      ] as never)

      const loadingDuringEdit: boolean[] = []
      await act(async () => {
        const p = result.current.editParcours('p1', { name: 'Nouveau nom' })
        loadingDuringEdit.push(result.current.loading)
        await p
      })

      expect(loadingDuringEdit).toEqual([false])
      expect(result.current.loading).toBe(false)
      expect(result.current.parcoursList[0].name).toBe('Nouveau nom')
    })

    it('ne lance aucune requête sans changement', async () => {
      const { result } = renderHook(() => useParcours(), { wrapper })
      await waitFor(() => expect(result.current.parcoursList).toHaveLength(2))

      await act(async () => {
        await result.current.editParcours('p1', {})
      })

      expect(mockUpdateParcours).not.toHaveBeenCalled()
    })
  })
})
