import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from './useAuth'
import {
  getUserProfile,
  createUserProfile as createProfileInDb,
  updateUserProfile,
  findProfileByName,
} from '../services/supabaseService'
import { hashPin } from '../services/pin'
import { getUser } from '../services/storage'

vi.mock('../services/supabaseService', () => ({
  getUserProfile: vi.fn(),
  createUserProfile: vi.fn(),
  updateUserProfile: vi.fn(),
  findProfileByName: vi.fn(),
}))

const mockGetProfile = vi.mocked(getUserProfile)
const mockCreate = vi.mocked(createProfileInDb)
const mockUpdate = vi.mocked(updateUserProfile)
const mockFind = vi.mocked(findProfileByName)

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>

const profile = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'uuid-1',
  user_number: 1,
  first_name: 'Paul',
  last_name: 'Martin',
  pin_hash: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...over,
})

const seedLocalUser = (userNumber: number, firstName = 'Paul', lastName = 'Martin') => {
  localStorage.setItem(
    'running_user',
    JSON.stringify({ id: userNumber, firstName, lastName, name: `${firstName} ${lastName}` })
  )
}

describe('useAuth — user_number stable', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockGetProfile.mockResolvedValue(null)
    mockCreate.mockResolvedValue(profile() as never)
    mockUpdate.mockResolvedValue(profile() as never)
    mockFind.mockResolvedValue(null)
  })

  describe('first_login', () => {
    it('démarre en first_login quand localStorage est vide', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.isFirstLogin).toBe(true)
      expect(result.current.isAuthenticated).toBe(false)
    })
  })

  describe('création de profil', () => {
    it('la base attribue le user_number', async () => {
      mockFind.mockResolvedValue(null)
      mockCreate.mockResolvedValue(profile({ user_number: 7 }) as never)

      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.createUserProfile('Paul', 'Martin')
      })

      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.user?.id).toBe(7)
      expect(result.current.user?.name).toBe('Paul Martin')
    })

    it('le PIN est hashé avant stockage', async () => {
      mockFind.mockResolvedValue(null)

      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.createUserProfile('Paul', 'Martin', '1234')
      })

      expect(mockCreate).toHaveBeenCalledWith({
        first_name: 'Paul',
        last_name: 'Martin',
        pin_hash: hashPin('1234'),
      })
    })

    it('reconnexion d’un profil existant SANS PIN → direct', async () => {
      mockFind.mockResolvedValue(profile({ user_number: 3 }) as never)

      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.createUserProfile('Paul', 'Martin')
      })

      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.user?.id).toBe(3)
      // Pas de création
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('reconnexion d’un profil AVEC PIN → bascule en pin_verification', async () => {
      mockFind.mockResolvedValue(profile({ user_number: 3, pin_hash: hashPin('1234') }) as never)

      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.createUserProfile('Paul', 'Martin')
      })

      expect(result.current.needsPin).toBe(true)
      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.pendingUser?.userNumber).toBe(3)
      // Ne doit surtout pas écraser le PIN existant
      expect(mockCreate).not.toHaveBeenCalled()
    })
  })

  describe('vérification du PIN', () => {
    it('accepte le bon PIN et connecte', async () => {
      mockFind.mockResolvedValue(profile({ user_number: 3, pin_hash: hashPin('1234') }) as never)
      mockGetProfile.mockResolvedValue(profile({ user_number: 3, pin_hash: hashPin('1234') }) as never)

      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.createUserProfile('Paul', 'Martin')
      })
      expect(result.current.needsPin).toBe(true)

      let verified: boolean | undefined
      await act(async () => {
        verified = await result.current.verifyUserPin('1234')
      })

      expect(verified).toBe(true)
      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.user?.id).toBe(3)
    })

    it('refuse un PIN incorrect', async () => {
      mockFind.mockResolvedValue(profile({ user_number: 3, pin_hash: hashPin('1234') }) as never)
      mockGetProfile.mockResolvedValue(profile({ user_number: 3, pin_hash: hashPin('1234') }) as never)

      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.createUserProfile('Paul', 'Martin')
      })

      let verified: boolean | undefined
      await act(async () => {
        verified = await result.current.verifyUserPin('0000')
      })

      expect(verified).toBe(false)
      expect(result.current.needsPin).toBe(true)
      expect(result.current.isAuthenticated).toBe(false)
    })

    it('retourne false si pas de pendingUser', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      let verified: boolean | undefined
      await act(async () => {
        verified = await result.current.verifyUserPin('1234')
      })
      expect(verified).toBe(false)
    })
  })

  describe('reconnexion sur le même appareil', () => {
    it('demande le PIN au mount si le profil en a un', async () => {
      seedLocalUser(1)
      mockGetProfile.mockResolvedValue(profile({ user_number: 1, pin_hash: hashPin('1234') }) as never)

      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(result.current.needsPin).toBe(true)
      expect(result.current.pendingUser?.userNumber).toBe(1)
    })

    it('connecte directement si pas de PIN', async () => {
      seedLocalUser(1)
      mockGetProfile.mockResolvedValue(profile({ user_number: 1 }) as never)

      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.user?.id).toBe(1)
    })

    it('retombe en first_login si le profil a disparu', async () => {
      seedLocalUser(99)
      mockGetProfile.mockResolvedValue(null)

      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(result.current.isFirstLogin).toBe(true)
    })
  })

  describe('changement de nom — le bug principal', () => {
    it('change le nom SANS toucher au user_number', async () => {
      seedLocalUser(1)
      mockGetProfile.mockResolvedValue(profile({ user_number: 1 }) as never)
      mockUpdate.mockResolvedValue(
        profile({ user_number: 1, first_name: 'Paulin', last_name: 'Claudin' }) as never
      )

      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.user?.id).toBe(1)

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.updateName('Paulin', 'Claudin')
      })

      expect(ok).toBe(true)
      // Le user_number est INCHANGÉ → votes et PIN restent attachés
      expect(result.current.user?.id).toBe(1)
      expect(result.current.user?.name).toBe('Paulin Claudin')
      expect(getUser()?.id).toBe(1)
    })

    it('met à jour par user_number, pas par nom', async () => {
      seedLocalUser(5, 'Jean', 'Martin')
      mockGetProfile.mockResolvedValue(
        profile({ user_number: 5, first_name: 'Jean', last_name: 'Martin' }) as never
      )
      mockUpdate.mockResolvedValue(
        profile({ user_number: 5, first_name: 'Jeanne', last_name: 'Martin' }) as never
      )

      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.updateName('Jeanne', 'Martin')
      })

      // La clé de la requête est le numéro, pas le nom
      expect(mockUpdate).toHaveBeenCalledWith(5, {
        first_name: 'Jeanne',
        last_name: 'Martin',
      })
    })

    it('refuse un nom vide', async () => {
      seedLocalUser(1)
      mockGetProfile.mockResolvedValue(profile({ user_number: 1 }) as never)

      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.updateName('  ', '  ')
      })

      expect(ok).toBe(false)
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('ne fait rien si non connecté', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.updateName('X', 'Y')
      })

      expect(ok).toBe(false)
      expect(mockUpdate).not.toHaveBeenCalled()
    })
  })

  describe('partage d’état', () => {
    it('deux appels useAuth partagent le même état', async () => {
      mockFind.mockResolvedValue(null)
      const { result } = renderHook(
        () => {
          const a = useAuth()
          const b = useAuth()
          return { a, b }
        },
        { wrapper }
      )
      await waitFor(() => expect(result.current.a.loading).toBe(false))

      await act(async () => {
        await result.current.a.createUserProfile('Paul', 'Martin')
      })

      expect(result.current.b.isAuthenticated).toBe(true)
      expect(result.current.b.user?.id).toBe(result.current.a.user?.id)
    })

    it('logout remet en first_login', async () => {
      seedLocalUser(1)
      mockGetProfile.mockResolvedValue(profile({ user_number: 1 }) as never)

      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.isAuthenticated).toBe(true)

      act(() => result.current.logout())

      expect(result.current.isFirstLogin).toBe(true)
      expect(result.current.user).toBeNull()
      expect(localStorage.getItem('running_user')).toBeNull()
    })

    it('throw si utilisé hors AuthProvider', () => {
      expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/)
    })
  })
})
