import { useState, useEffect, useCallback, useRef } from 'react'
import { getParcours, addParcours, deleteParcours } from '../services/supabaseService'
import type { Parcours, ParcoursInsert } from '../types/supabase'
import { parseGPX } from '../services/gpxParser'
import { useAuth } from './useAuth'

const POLL_INTERVAL_MS = 30000

export function useParcours() {
  const { user } = useAuth()
  const [parcoursList, setParcoursList] = useState<Parcours[]>([])
  const [nextParcours, setNextParcours] = useState<Parcours | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadParcours = useCallback(async (opts?: { silent?: boolean }) => {
    // ⚠️ Les rafraîchissements de fond (polling) doivent être SILENCIEUX :
    // setLoading(true) afficherait le spinner toutes les 30 s.
    if (!opts?.silent) setLoading(true)
    try {
      const data = await getParcours()
      setParcoursList(data)
      setNextParcours(data[0] || null)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur chargement parcours')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Premier chargement : spinner normal
    loadParcours()

    // Polling 30s — silencieux, pas de clignotement
    pollingRef.current = setInterval(() => {
      loadParcours({ silent: true })
    }, POLL_INTERVAL_MS)

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [loadParcours])

  const createParcours = async (gpxContent: string, name: string): Promise<Parcours | null> => {
    const parsed = parseGPX(gpxContent)
    if (!parsed) throw new Error('Fichier GPX invalide')

    // Vérifier si l'ID utilisateur est un UUID valide (Supabase Auth)
    // Les IDs localStorage sont au format "user_xxx" (pas UUID)
    const isValidUUID = (id: string | null | undefined) => {
      if (!id) return false
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      return uuidRegex.test(id)
    }

    const userId = user?.id
    const created_by = userId && isValidUUID(userId) ? userId : null

    const parcoursData: ParcoursInsert = {
      name,
      distance_km: parsed.distance ?? 0,
      elevation_gain_m: parsed.elevationGain ?? 0,
      points: parsed.points,
      created_by,
    }

    return addParcours(parcoursData)
  }

  const removeParcours = async (id: string) => {
    await deleteParcours(id)
  }

  return {
    parcoursList,
    nextParcours,
    loading,
    error,
    createParcours,
    removeParcours,
    refresh: loadParcours,
  }
}