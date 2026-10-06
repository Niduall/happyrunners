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

    // created_by référence user_profiles.user_number (entier)
    const created_by = user?.id ?? null

    const parcoursData: ParcoursInsert = {
      name,
      distance_km: parsed.distance_km,
      elevation_gain_m: parsed.elevation_gain_m,
      points: parsed.points,
      created_by,
    }

    return addParcours(parcoursData)
  }

  const removeParcours = async (id: string) => {
    await deleteParcours(id)
    // ⚠️ Sans ce rechargement, la ligne supprimée reste affichée jusqu'au
    // prochain polling (30 s) : l'app semblait ne rien faire.
    await loadParcours({ silent: true })
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