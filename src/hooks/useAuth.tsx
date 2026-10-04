import { createContext, useContext, useMemo, useState, useEffect, useCallback, type ReactNode } from 'react'
import { getUser, setUser as setUserStorage, type User } from '../services/storage'
import {
  getUserProfile,
  createUserProfile as createProfileInDb,
  updateUserProfile,
  findProfileByName,
} from '../services/supabaseService'
import { hashPin } from '../services/pin'

export type { User }

export type AuthMode = 'loading' | 'first_login' | 'pin_verification' | 'authenticated'

export interface PendingUser {
  userNumber: number
  firstName: string
  lastName: string
}

export interface AuthState {
  user: User | null
  mode: AuthMode
  pendingUser: PendingUser | null
  loading: boolean
  isAuthenticated: boolean
  isFirstLogin: boolean
  needsPin: boolean
  createUserProfile: (firstName: string, lastName: string, pin?: string) => Promise<boolean>
  verifyUserPin: (pin: string) => Promise<boolean>
  updateName: (firstName: string, lastName: string) => Promise<boolean>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [mode, setMode] = useState<AuthMode>('loading')
  const [pendingUser, setPendingUser] = useState<PendingUser | null>(null)

  const connect = useCallback(
    (profile: { user_number: number; first_name: string; last_name: string }) => {
      const localUser: User = {
        id: profile.user_number,
        firstName: profile.first_name,
        lastName: profile.last_name,
        name: `${profile.first_name} ${profile.last_name}`.trim(),
      }
      setUserStorage(localUser)
      setUser(localUser)
      setPendingUser(null)
      setMode('authenticated')
    },
    []
  )

  const requestPin = useCallback(
    (profile: { user_number: number; first_name: string; last_name: string }) => {
      setPendingUser({
        userNumber: profile.user_number,
        firstName: profile.first_name,
        lastName: profile.last_name,
      })
      setMode('pin_verification')
    },
    []
  )

  // Résolution au mount
  useEffect(() => {
    const stored = getUser()
    if (!stored) {
      setMode('first_login')
      return
    }

    let cancelled = false

    const resolve = async () => {
      try {
        const profile = await getUserProfile(stored.id)
        if (cancelled) return
        if (!profile) {
          // Le profil a été supprimé entre-temps
          setMode('first_login')
          return
        }
        if (profile.pin_hash) {
          requestPin(profile)
        } else {
          connect(profile)
        }
      } catch (err) {
        console.error('[AUTH] Erreur lecture profil, fallback local:', err)
        if (!cancelled) {
          // Hors ligne : on laisse l'utilisateur passer avec le cache local
          setUser(stored)
          setMode('authenticated')
        }
      }
    }

    void resolve()
    return () => {
      cancelled = true
    }
  }, [connect, requestPin])

  /**
   * Création ou reconnexion par nom.
   *
   * - Profil existant sans PIN → connexion directe
   * - Profil existant AVEC PIN → bascule en vérification
   * - Aucun profil → création, la base attribue le user_number
   */
  const createUserProfile = useCallback(
    async (firstName: string, lastName: string, pin?: string): Promise<boolean> => {
      const trimmedFirst = firstName.trim()
      const trimmedLast = lastName.trim()

      try {
        const existing = await findProfileByName(trimmedFirst, trimmedLast)

        if (existing) {
          if (existing.pin_hash) {
            requestPin(existing)
            return false
          }
          connect(existing)
          return true
        }

        // Nouveau profil → la base attribue user_number
        const created = await createProfileInDb({
          first_name: trimmedFirst,
          last_name: trimmedLast,
          pin_hash: pin ? hashPin(pin) : null,
        })
        connect(created)
        return true
      } catch (err) {
        console.error('[AUTH] Erreur création/lecture profil:', err)
        throw err
      }
    },
    [connect, requestPin]
  )

  const verifyUserPin = useCallback(
    async (pin: string): Promise<boolean> => {
      if (!pendingUser) return false

      try {
        const profile = await getUserProfile(pendingUser.userNumber)
        if (!profile) {
          setMode('first_login')
          return false
        }

        if (!profile.pin_hash || profile.pin_hash === hashPin(pin)) {
          connect(profile)
          return true
        }
        return false
      } catch (err) {
        console.error('[AUTH] Erreur vérification PIN:', err)
        return false
      }
    },
    [pendingUser, connect]
  )

  /**
   * Change le nom sans toucher à l'identifiant.
   * Comme user_number est indépendant du nom, les votes, le PIN et
   * l'historique restent attachés à la bonne personne.
   */
  const updateName = useCallback(
    async (firstName: string, lastName: string): Promise<boolean> => {
      if (!user) return false
      const trimmedFirst = firstName.trim()
      const trimmedLast = lastName.trim()
      if (!trimmedFirst || !trimmedLast) return false

      try {
        const updated = await updateUserProfile(user.id, {
          first_name: trimmedFirst,
          last_name: trimmedLast,
        })
        connect(updated)
        return true
      } catch (err) {
        console.error('[AUTH] Erreur changement de nom:', err)
        throw err
      }
    },
    [user, connect]
  )

  const logout = useCallback(() => {
    localStorage.removeItem('running_user')
    setUser(null)
    setPendingUser(null)
    setMode('first_login')
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user,
      mode,
      pendingUser,
      loading: mode === 'loading',
      isAuthenticated: mode === 'authenticated',
      isFirstLogin: mode === 'first_login',
      needsPin: mode === 'pin_verification',
      createUserProfile,
      verifyUserPin,
      updateName,
      logout,
    }),
    [user, mode, pendingUser, createUserProfile, verifyUserPin, updateName, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth doit être utilisé dans un <AuthProvider>')
  }
  return ctx
}
