import { createContext, useContext, useMemo, useState, useEffect, useCallback, type ReactNode } from 'react'
import { getUser, createUser, generateUserId, setUser as setUserStorage } from '../services/storage'
import { getUserProfile, upsertUserProfile } from '../services/supabaseService'
import type { User } from '../types'

export type AuthMode = 'loading' | 'first_login' | 'pin_verification' | 'authenticated'

export interface PendingUser {
  firstName: string
  lastName: string
  localUserId: string
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
  updateName: (firstName: string, lastName: string) => void
  logout: () => void
}

/**
 * Hash simple du PIN (côté client, avant envoi à Supabase).
 * ⚠️ Ce n'est PAS du hachage sécurisé — c'est de l'obfuscation.
 * Suffisant pour un club de collègues, pas pour un usage réel.
 */
export function hashPin(pin: string): string {
  let hash = 0
  for (let i = 0; i < pin.length; i++) {
    hash = ((hash << 5) - hash) + pin.charCodeAt(i)
    hash |= 0
  }
  return 'pin_' + Math.abs(hash).toString(36)
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [mode, setMode] = useState<AuthMode>('loading')
  const [pendingUser, setPendingUser] = useState<PendingUser | null>(null)

  // Hydrater un user local ; le réutiliser seulement si son ID correspond
  const ensureLocalUser = useCallback((localUserId: string, firstName: string, lastName: string): User => {
    const existing = getUser()
    if (existing && existing.id === localUserId) {
      return existing
    }
    return createUser(firstName, lastName)
  }, [])

  const connect = useCallback(
    (localUserId: string, firstName: string, lastName: string) => {
      const localUser = ensureLocalUser(localUserId, firstName, lastName)
      setUser(localUser)
      setPendingUser(null)
      setMode('authenticated')
    },
    [ensureLocalUser]
  )

  const requestPin = useCallback((localUserId: string, firstName: string, lastName: string) => {
    setPendingUser({ firstName, lastName, localUserId })
    setMode('pin_verification')
  }, [])

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
        if (profile && profile.pin_hash) {
          requestPin(stored.id, stored.firstName, stored.lastName)
        } else {
          connect(stored.id, stored.firstName, stored.lastName)
        }
      } catch (err) {
        console.error('[AUTH] Erreur lecture profil, fallback local:', err)
        if (!cancelled) connect(stored.id, stored.firstName, stored.lastName)
      }
    }

    void resolve()
    return () => {
      cancelled = true
    }
  }, [connect, requestPin])

  const createUserProfile = useCallback(
    async (firstName: string, lastName: string, pin?: string): Promise<boolean> => {
      const localUserId = generateUserId(firstName, lastName)
      const trimmedFirst = firstName.trim()
      const trimmedLast = lastName.trim()

      // Si un compte existe déjà en base, ne jamais écraser son PIN
      try {
        const existing = await getUserProfile(localUserId)
        if (existing && existing.pin_hash) {
          requestPin(localUserId, trimmedFirst, trimmedLast)
          return false
        }
      } catch (err) {
        console.error('[AUTH] Erreur lecture profil existant:', err)
      }

      // Nouveau compte (ou compte sans PIN)
      const newUser = createUser(firstName, lastName)
      setUser(newUser)
      setPendingUser(null)
      setMode('authenticated')

      try {
        await upsertUserProfile({
          local_user_id: localUserId,
          first_name: trimmedFirst,
          last_name: trimmedLast,
          pin_hash: pin ? hashPin(pin) : null,
        })
      } catch (err) {
        console.error('[AUTH] Erreur sauvegarde profil:', err)
      }

      return true
    },
    [requestPin]
  )

  const verifyUserPin = useCallback(
    async (pin: string): Promise<boolean> => {
      if (!pendingUser) return false
      const { localUserId, firstName, lastName } = pendingUser

      try {
        const profile = await getUserProfile(localUserId)

        // Plus de PIN en base → connexion directe
        if (!profile || !profile.pin_hash) {
          connect(localUserId, firstName, lastName)
          return true
        }

        if (profile.pin_hash === hashPin(pin)) {
          connect(localUserId, firstName, lastName)
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

  const updateName = useCallback(
    (firstName: string, lastName: string) => {
      if (!user) return
      const updated: User = {
        ...user,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        name: `${firstName.trim()} ${lastName.trim()}`,
      }
      setUserStorage(updated)
      setUser(updated)
    },
    [user]
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
