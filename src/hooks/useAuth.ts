import { useState, useEffect, useCallback } from 'react'
import { getUser, createUser, verifyPin, generateUserId, setUser as setUserStorage } from '../services/storage'
import type { User } from '../types'

type AuthMode = 'loading' | 'first_login' | 'pin_verification' | 'authenticated'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [mode, setMode] = useState<AuthMode>('loading')
  const [pendingUser, setPendingUser] = useState<{ firstName: string; lastName: string } | null>(null)

  // Charger l'utilisateur au montage
  useEffect(() => {
    const storedUser = getUser()
    if (storedUser) {
      if (storedUser.pin) {
        // PIN configuré -> mode vérification PIN
        setMode('pin_verification')
        setPendingUser({ firstName: storedUser.firstName, lastName: storedUser.lastName })
      } else {
        // Pas de PIN -> connecté direct
        setUser(storedUser)
        setMode('authenticated')
      }
    } else {
      // Aucun utilisateur -> 1ère connexion
      setMode('first_login')
    }
    // loading géré par le mode
  }, [])

  const createUserProfile = useCallback((firstName: string, lastName: string, pin?: string) => {
    const newUser = createUser(firstName, lastName, pin)
    setUser(newUser)
    setMode('authenticated')
    setPendingUser(null)
    return newUser
  }, [])

  const updateName = useCallback((firstName: string, lastName: string) => {
    if (!user) return
    const updatedUser: User = {
      ...user,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      name: `${firstName.trim()} ${lastName.trim()}`,
    }
    setUserStorage(updatedUser)
    setUser(updatedUser)
  }, [user])

  const verifyUserPin = useCallback((pin: string) => {
    if (!pendingUser) return false
    const storedUser = getUser()
    if (!storedUser) return false
    
    if (verifyPin(storedUser, pin)) {
      setUser(storedUser)
      setMode('authenticated')
      setPendingUser(null)
      return true
    }
    return false
  }, [pendingUser])

  const logout = useCallback(() => {
    localStorage.removeItem('running_user')
    setUser(null)
    setMode('first_login')
    setPendingUser(null)
    window.location.href = '/'
  }, [])

  return {
    user,
    loading: mode === 'loading',
    isAuthenticated: mode === 'authenticated',
    isFirstLogin: mode === 'first_login',
    needsPin: mode === 'pin_verification',
    pendingUser,
    createUserProfile,
    updateName,
    verifyUserPin,
    logout,
  }
}