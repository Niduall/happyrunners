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

  describe('gestion du PIN depuis le menu profil', () => {
    /** Helper : ouvre une session authentifiée sans PIN */
    const connectedWithoutPin = async () => {
      seedLocalUser(1)
      mockGetProfile.mockResolvedValue(profile({ user_number: 1, pin_hash: null }) as never)
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.isAuthenticated).toBe(true)
      return result
    }

    it('ajoute un PIN à un profil qui n’en a pas', async () => {
      const result = await connectedWithoutPin()

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.setPin('1234')
      })

      expect(ok).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith(1, { pin_hash: hashPin('1234') })
    })

    it('refuse d’ajouter un PIN si un PIN existe déjà sans ancien PIN', async () => {
      seedLocalUser(1)
      mockGetProfile.mockResolvedValue(
        profile({ user_number: 1, pin_hash: hashPin('1111') }) as never
      )
      // Le mount demande le PIN → il faut le passer pour être connecté
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.needsPin).toBe(true)

      await act(async () => {
        await result.current.verifyUserPin('1111')
      })
      expect(result.current.isAuthenticated).toBe(true)

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.setPin('2222')
      })

      // Sans ancien PIN → refusé, et surtout rien n'est écrit
      expect(ok).toBe(false)
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('change le PIN si l’ancien est correct', async () => {
      seedLocalUser(1)
      mockGetProfile.mockResolvedValue(
        profile({ user_number: 1, pin_hash: hashPin('1111') }) as never
      )
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.verifyUserPin('1111')
      })

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.setPin('2222', '1111')
      })

      expect(ok).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith(1, { pin_hash: hashPin('2222') })
    })

    it('refuse de changer le PIN si l’ancien est faux', async () => {
      seedLocalUser(1)
      mockGetProfile.mockResolvedValue(
        profile({ user_number: 1, pin_hash: hashPin('1111') }) as never
      )
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.verifyUserPin('1111')
      })
      mockUpdate.mockClear()

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.setPin('2222', '9999')
      })

      expect(ok).toBe(false)
      expect(mockUpdate).not.toHaveBeenCalled()
      // Le PIN en base est inchangé
      expect(mockGetProfile).toHaveBeenCalled()
    })

    it('retire le PIN (pin_hash → null) après vérification de l’ancien', async () => {
      seedLocalUser(1)
      mockGetProfile.mockResolvedValue(
        profile({ user_number: 1, pin_hash: hashPin('1111') }) as never
      )
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.verifyUserPin('1111')
      })

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.clearPin('1111')
      })

      expect(ok).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith(1, { pin_hash: null })
    })

    it('refuse de retirer le PIN si l’ancien est faux', async () => {
      seedLocalUser(1)
      mockGetProfile.mockResolvedValue(
        profile({ user_number: 1, pin_hash: hashPin('1111') }) as never
      )
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.verifyUserPin('1111')
      })
      mockUpdate.mockClear()

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.clearPin('0000')
      })

      expect(ok).toBe(false)
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('refuse toute opération PIN si le profil n’existe plus', async () => {
      seedLocalUser(1)
      mockGetProfile.mockResolvedValue(profile({ user_number: 1 }) as never)
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      mockGetProfile.mockResolvedValue(null)
      mockUpdate.mockClear()

      let add: boolean | undefined
      let remove: boolean | undefined
      await act(async () => {
        add = await result.current.setPin('1234')
        remove = await result.current.clearPin('1111')
      })

      expect(add).toBe(false)
      expect(remove).toBe(false)
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('après ajout d’un PIN, la reconnexion par nom le réclame', async () => {
      // 1ère session : création du profil
      mockFind.mockResolvedValue(null)
      const first = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(first.result.current.loading).toBe(false))
      await act(async () => {
        await first.result.current.createUserProfile('Paul', 'Martin')
      })
      expect(first.result.current.isAuthenticated).toBe(true)

      // 2. Ajout d’un PIN depuis le menu
      const number = first.result.current.user!.id
      mockGetProfile.mockResolvedValue(
        profile({ user_number: number, pin_hash: hashPin('1234') }) as never
      )
      await act(async () => {
        await first.result.current.setPin('1234')
      })

      // Nouvelle session, profil désormais protégé
      first.unmount()
      localStorage.removeItem('running_user')
      mockFind.mockResolvedValue(
        profile({ user_number: number, pin_hash: hashPin('1234') }) as never
      )

      const second = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(second.result.current.loading).toBe(false))

      await act(async () => {
        await second.result.current.createUserProfile('Paul', 'Martin')
      })

      expect(second.result.current.needsPin).toBe(true)
      expect(second.result.current.isAuthenticated).toBe(false)
    })

    it('après retrait du PIN, la reconnexion par nom est directe', async () => {
      mockFind.mockResolvedValue(null)
      const first = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(first.result.current.loading).toBe(false))
      await act(async () => {
        await first.result.current.createUserProfile('Paul', 'Martin')
      })
      const number = first.result.current.user!.id

      mockGetProfile.mockResolvedValue(
        profile({ user_number: number, pin_hash: hashPin('1234') }) as never
      )
      await act(async () => {
        await first.result.current.clearPin('1234')
      })

      first.unmount()
      localStorage.removeItem('running_user')
      mockFind.mockResolvedValue(
        profile({ user_number: number, pin_hash: null }) as never
      )

      const second = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(second.result.current.loading).toBe(false))

      await act(async () => {
        await second.result.current.createUserProfile('Paul', 'Martin')
      })

      expect(second.result.current.isAuthenticated).toBe(true)
      expect(second.result.current.needsPin).toBe(false)
    })
  })

  describe('retour à l’écran d’identité', () => {
    it('resetToIdentity revient à first_login et efface le pendingUser', async () => {
      mockFind.mockResolvedValue(profile({ user_number: 3, pin_hash: hashPin('1234') }) as never)

      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.createUserProfile('Paul', 'Martin')
      })
      expect(result.current.needsPin).toBe(true)
      expect(result.current.pendingUser).not.toBeNull()

      act(() => result.current.resetToIdentity())

      expect(result.current.isFirstLogin).toBe(true)
      expect(result.current.needsPin).toBe(false)
      expect(result.current.pendingUser).toBeNull()
    })

    it('resetToIdentity ne déconnecte pas un utilisateur déjà connecté', async () => {
      seedLocalUser(1)
      mockGetProfile.mockResolvedValue(profile({ user_number: 1 }) as never)

      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      act(() => result.current.resetToIdentity())

      // Le user reste en mémoire : aucun appel réseau nécessaire
      expect(result.current.user?.id).toBe(1)
    })
  })
})
