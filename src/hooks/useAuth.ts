import { useState, useEffect, useCallback } from 'react'
import { getUser, createUser, generateUserId, setUser as setUserStorage } from '../services/storage'
import { getUserProfile, upsertUserProfile } from '../services/supabaseService'
import type { User } from '../types'

type AuthMode = 'loading' | 'first_login' | 'pin_verification' | 'authenticated'

// Simple hash pour le PIN (même algo côté client pour envoyer à Supabase)
function hashPin(pin: string): string {
  let hash = 0
  for (let i = 0; i < pin.length; i++) {
    hash = ((hash << 5) - hash) + pin.charCodeAt(i)
    hash |= 0
  }
  return 'pin_' + Math.abs(hash).toString(36)
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [mode, setMode] = useState<AuthMode>('loading')
  const [pendingUser, setPendingUser] = useState<{ firstName: string; lastName: string; localUserId: string } | null>(null)

  // Charger l'utilisateur au montage
  useEffect(() => {
    const storedUser = getUser()
    if (storedUser) {
      // Vérifier s'il a un PIN en base (cross-device)
      checkPinInDatabase(storedUser.id, storedUser.firstName, storedUser.lastName)
    } else {
      setMode('first_login')
    }
  }, [])

  const checkPinInDatabase = async (localUserId: string, firstName: string, lastName: string) => {
    try {
      const profile = await getUserProfile(localUserId)
      if (profile && profile.pin_hash) {
        // PIN existe en base -> mode vérification PIN
        setMode('pin_verification')
        setPendingUser({ firstName, lastName, localUserId })
      } else {
        // Pas de PIN en base -> connecté direct
        const user = getUser() // recharge au cas où
        if (user) {
          setUser(user)
          setMode('authenticated')
        } else {
          setMode('first_login')
        }
      }
    } catch (err) {
      console.error('Erreur vérification PIN base:', err)
      // En cas d'erreur réseau, fallback sur localStorage
      const user = getUser()
      if (user) {
        setUser(user)
        setMode('authenticated')
      } else {
        setMode('first_login')
      }
    }
  }

  const createUserProfile = useCallback(async (firstName: string, lastName: string, pin?: string) => {
    const localUserId = generateUserId(firstName, lastName)
    
    // D'abord vérifier si un profil existe déjà en base pour ce nom
    try {
      const existingProfile = await getUserProfile(localUserId)
      if (existingProfile && existingProfile.pin_hash) {
        // Profil existe AVEC PIN -> basculer en mode vérification PIN
        setMode('pin_verification')
        setPendingUser({ firstName, lastName, localUserId })
        return null // Ne pas créer, attendre vérification PIN
      }
      // Profil existe SANS PIN ou pas de profil -> continuer création
    } catch (err) {
      console.error('Erreur vérification profil existant:', err)
    }
    
    const newUser = createUser(firstName, lastName)
    setUser(newUser)
    
    // Sauvegarder le profil en base (avec PIN hashé si fourni)
    try {
      await upsertUserProfile({
        local_user_id: localUserId,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        pin_hash: pin ? hashPin(pin) : null,
      })
    } catch (err) {
      console.error('Erreur sauvegarde profil:', err)
    }
    
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

  const verifyUserPin = useCallback(async (pin: string) => {
    if (!pendingUser) return false
    
    try {
      const profile = await getUserProfile(pendingUser.localUserId)
      if (!profile || !profile.pin_hash) {
        // Pas de PIN en base -> connecté direct (créer user local si nécessaire)
        let user = getUser()
        if (!user) {
          user = createUser(pendingUser.firstName, pendingUser.lastName)
        }
        setUser(user)
        setMode('authenticated')
        setPendingUser(null)
        return true
      }
      
      // Vérifier le PIN
      if (profile.pin_hash === hashPin(pin)) {
        // PIN correct : créer/récupérer user local
        let user = getUser()
        if (!user) {
          // Nouvel appareil : créer le user local depuis les infos du profil
          user = createUser(profile.first_name, profile.last_name)
        }
        setUser(user)
        setMode('authenticated')
        setPendingUser(null)
        return true
      }
      return false
    } catch (err) {
      console.error('Erreur vérification PIN:', err)
      return false
    }
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