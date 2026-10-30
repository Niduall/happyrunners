import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useProfiles } from './useProfiles'
import { getAllProfiles } from '../services/supabaseService'

vi.mock('../services/supabaseService', () => ({
  getAllProfiles: vi.fn(),
}))

const mockGetAllProfiles = vi.mocked(getAllProfiles)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useProfiles — l’annuaire du groupe', () => {
  it('expose les profils une fois chargés', async () => {
    mockGetAllProfiles.mockResolvedValue([
      { user_number: 1, first_name: 'Ada', last_name: 'Lovelace' },
    ])

    const { result } = renderHook(() => useProfiles())

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.profiles).toEqual([
      { user_number: 1, first_name: 'Ada', last_name: 'Lovelace' },
    ])
    expect(result.current.error).toBeNull()
  })

  it('reste utilisable quand la lecture échoue', async () => {
    // Home doit pouvoir retomber sur les seules réponses plutôt que casser.
    mockGetAllProfiles.mockRejectedValue(new Error('lecture refusée'))

    const { result } = renderHook(() => useProfiles())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.profiles).toEqual([])
    expect(result.current.error).toBe('lecture refusée')
  })

  it('ne lit l’annuaire qu’une fois', async () => {
    mockGetAllProfiles.mockResolvedValue([])

    const { rerender } = renderHook(() => useProfiles())
    await waitFor(() => expect(mockGetAllProfiles).toHaveBeenCalledTimes(1))

    rerender()
    expect(mockGetAllProfiles).toHaveBeenCalledTimes(1)
  })

  it('n’appelle pas la base avant la connexion', async () => {
    mockGetAllProfiles.mockResolvedValue([])

    const { result, rerender } = renderHook(({ enabled }) => useProfiles(enabled), {
      initialProps: { enabled: false },
    })

    expect(mockGetAllProfiles).not.toHaveBeenCalled()
    expect(result.current.profiles).toEqual([])

    rerender({ enabled: true })
    await waitFor(() => expect(mockGetAllProfiles).toHaveBeenCalledTimes(1))
  })
})
