import { useState, useEffect, useCallback } from 'react'
import { getUser, createUser, generateUserId } from '../services/storage'
import type { User } from '../types'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Charger l'utilisateur au montage
  useEffect(() => {
    const storedUser = getUser()
    if (storedUser) {
      setUser(storedUser)
    }
    setLoading(false)
  }, [])

  const createUserProfile = useCallback((firstName: string, lastName: string) => {
    const user = createUser(firstName, lastName)
    setUser(user)
    return user
  }, [])

  const updateName = useCallback((firstName: string, lastName: string) => {
    if (!user) return
    const updatedUser: User = {
      ...user,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      name: `${firstName.trim()} ${lastName.trim()}`,
    }
    localStorage.setItem('running_user', JSON.stringify(updatedUser))
    setUser(updatedUser)
  }, [user])

  const logout = useCallback(() => {
    localStorage.removeItem('running_user')
    setUser(null)
    window.location.href = '/'
  }, [])

  return {
    user,
    loading,
    isAuthenticated: !!user,
    createUserProfile,
    updateName,
    logout,
  }
}