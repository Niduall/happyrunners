import { useState, useEffect, useCallback } from 'react'
import { getUser, createUser, verifyPin, generateUserId } from '../services/storage'
import type { User } from '../types'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsPin, setNeedsPin] = useState(false)
  const [pendingUser, setPendingUser] = useState<{ firstName: string; lastName: string } | null>(null)

  // Charger l'utilisateur au montage
  useEffect(() => {
    const storedUser = getUser()
    if (storedUser) {
      if (storedUser.pin) {
        // PIN configuré -> demander vérification
        setNeedsPin(true)
        setPendingUser({ firstName: storedUser.firstName, lastName: storedUser.lastName })
      } else {
        // Pas de PIN -> connecté direct
        setUser(storedUser)
      }
    }
    setLoading(false)
  }, [])

  const createUserProfile = useCallback((firstName: string, lastName: string, pin?: string) => {
    const user = createUser(firstName, lastName, pin)
    setUser(user)
    setNeedsPin(false)
    setPendingUser(null)
    return user
  }, [])

  const verifyUserPin = useCallback((pin: string) => {
    if (!pendingUser) return false
    const storedUser = getUser()
    if (!storedUser) return false
    
    if (verifyPin(storedUser, pin)) {
      setUser(storedUser)
      setNeedsPin(false)
      setPendingUser(null)
      return true
    }
    return false
  }, [pendingUser])

  const logout = useCallback(() => {
    localStorage.removeItem('running_user')
    setUser(null)
    setNeedsPin(false)
    setPendingUser(null)
    window.location.href = '/'
  }, [])

  return {
    user,
    loading,
    isAuthenticated: !!user,
    needsPin,
    pendingUser,
    createUserProfile,
    verifyUserPin,
    logout,
  }
}