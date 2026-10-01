import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth, hashPin } from './useAuth'
import { getUserProfile, upsertUserProfile } from '../services/supabaseService'
import { getUser } from '../services/storage'

vi.mock('../services/supabaseService', () => ({
  getUserProfile: vi.fn(),
  upsertUserProfile: vi.fn(),
}))

const mockGetUserProfile = vi.mocked(getUserProfile)
const mockUpsertUserProfile = vi.mocked(upsertUserProfile)

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>

const profile = (overrides: Partial<Record<string, unknown>> = {}) => ({
  local_user_id: 'paul_martin',
  first_name: 'Paul',
  last_name: 'Martin',
  pin_hash: hashPin('1234'),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
})

const seedLocalUser = (id: string, firstName: string, lastName: string) => {
  localStorage.setItem(
    'running_user',
    JSON.stringify({ id, firstName, lastName, name: `${firstName} ${lastName}` })
  )
}

describe('useAuth — state partagé via Context', () => {
  beforeEach(() => {
    localStorage.clear()
    mockGetUserProfile.mockReset()
    mockUpsertUserProfile.mockReset()
    mockUpsertUserProfile.mockResolvedValue(profile({ pin_hash: null }) as never)
  })

  describe('first_login', () => {
    it('démarre en first_login quand localStorage est vide', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.isFirstLogin).toBe(true)
      expect(result.current.isAuthenticated).toBe(false)
    })
  })

  describe('création de compte', () => {
    it('connecte immédiatement quand aucun profil n’existe', async () => {
      mockGetUserProfile.mockResolvedValue(null)
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.createUserProfile('Paul', 'Martin')
      })

      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.user?.name).toBe('Paul Martin')
    })

    it('sauvegarde le PIN hashé en base', async () => {
      mockGetUserProfile.mockResolvedValue(null)
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.createUserProfile('Paul', 'Martin', '1234')
      })

      expect(mockUpsertUserProfile).toHaveBeenCalledWith({
        local_user_id: 'paul_martin',
        first_name: 'Paul',
        last_name: 'Martin',
        pin_hash: hashPin('1234'),
      })
    })

    it('sauvegarde pin_hash null si PIN omis', async () => {
      mockGetUserProfile.mockResolvedValue(null)
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.createUserProfile('Alice', 'Dupont')
      })

      expect(mockUpsertUserProfile).toHaveBeenCalledWith(expect.objectContaining({ pin_hash: null }))
    })
  })

  describe('compte existant avec PIN — nouvel appareil', () => {
    it('bascule en pin_verification au lieu d’écraser le PIN', async () => {
      mockGetUserProfile.mockResolvedValue(profile() as never)
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.createUserProfile('Paul', 'Martin')
      })

      expect(result.current.needsPin).toBe(true)
      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.pendingUser?.firstName).toBe('Paul')
      expect(result.current.pendingUser?.lastName).toBe('Martin')
      expect(result.current.pendingUser?.localUserId).toBe('paul_martin')
      expect(mockUpsertUserProfile).not.toHaveBeenCalled()
    })

    it('refuse un PIN incorrect et reste en pin_verification', async () => {
      mockGetUserProfile.mockResolvedValue(profile() as never)
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

    it('accepte le bon PIN et hydrate le user local (nouvel appareil)', async () => {
      mockGetUserProfile.mockResolvedValue(profile() as never)
      expect(getUser()).toBeNull()

      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.createUserProfile('Paul', 'Martin')
      })

      let verified: boolean | undefined
      await act(async () => {
        verified = await result.current.verifyUserPin('1234')
      })

      expect(verified).toBe(true)
      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.user?.name).toBe('Paul Martin')
      expect(result.current.pendingUser).toBeNull()
      expect(getUser()?.id).toBe('paul_martin')
    })
  })

  describe('reconnexion sur le même appareil', () => {
    it('demande le PIN au mount quand le profil en base en a un', async () => {
      seedLocalUser('paul_martin', 'Paul', 'Martin')
      mockGetUserProfile.mockResolvedValue(profile() as never)

      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(result.current.needsPin).toBe(true)
      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.pendingUser?.firstName).toBe('Paul')
    })

    it('connecte directement quand aucun PIN en base', async () => {
      seedLocalUser('alice_dupont', 'Alice', 'Dupont')
      mockGetUserProfile.mockResolvedValue(
        profile({ local_user_id: 'alice_dupont', first_name: 'Alice', last_name: 'Dupont', pin_hash: null }) as never
      )

      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.needsPin).toBe(false)
      expect(result.current.user?.name).toBe('Alice Dupont')
    })

    it('reconstitue le user local si l’ID ne correspond plus (nom modifié)', async () => {
      // localStorage contient un user avec un ID obsolète
      seedLocalUser('ancien_id', 'Paul', 'Martin')
      mockGetUserProfile.mockResolvedValue(profile({ pin_hash: null }) as never)

      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      // Le profil en base a paul_martin, le local a ancien_id
      // → le user local doit être recréé avec le bon ID
      expect(result.current.isAuthenticated).toBe(true)
    })
  })

  describe('partage d’état entre composants', () => {
    it('deux appels useAuth partagent le même état', async () => {
      mockGetUserProfile.mockResolvedValue(null)
      const { result } = renderHook(
        () => {
          const a = useAuth()
          const b = useAuth()
          return { a, b }
        },
        { wrapper }
      )
      await waitFor(() => expect(result.current.a.loading).toBe(false))

      // Même référence de user → truly partagé
      expect(result.current.a.mode).toBe(result.current.b.mode)
      expect(result.current.b.isFirstLogin).toBe(true)
    })

    it('un changement dans un "composant" est visible dans l’autre', async () => {
      mockGetUserProfile.mockResolvedValue(null)
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
        await result.current.a.createUserProfile('Paul', 'Martin', '1234')
      })

      // b voit le changement immédiatement
      expect(result.current.b.isAuthenticated).toBe(true)
      expect(result.current.b.isFirstLogin).toBe(false)
      expect(result.current.b.needsPin).toBe(false)
    })
  })

  describe('robustesse', () => {
    it('connecte si le profil existe sans PIN', async () => {
      mockGetUserProfile.mockResolvedValue(null)
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.createUserProfile('Bob', 'Smith', '9999')
      })

      expect(result.current.isAuthenticated).toBe(true)
    })

    it('verifyUserPin retourne false sans pendingUser', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      let verified: boolean | undefined
      await act(async () => {
        verified = await result.current.verifyUserPin('1234')
      })

      expect(verified).toBe(false)
    })

    it('fallback sur localStorage si la lecture du profil échoue', async () => {
      seedLocalUser('alice_dupont', 'Alice', 'Dupont')
      mockGetUserProfile.mockRejectedValue(new Error('network down'))

      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.user?.name).toBe('Alice Dupont')
    })

    it('logout remet en first_login', async () => {
      mockGetUserProfile.mockResolvedValue(null)
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.createUserProfile('Paul', 'Martin', '1234')
      })
      expect(result.current.isAuthenticated).toBe(true)

      act(() => result.current.logout())

      expect(result.current.isFirstLogin).toBe(true)
      expect(result.current.user).toBeNull()
      expect(localStorage.getItem('running_user')).toBeNull()
    })
  })
})
