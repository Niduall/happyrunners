import { useCallback, useEffect, useRef, useState } from 'react'
import { getParcoursPoints } from '../services/supabaseService'
import type { GPXPoint } from '../types/supabase'

/**
 * Charge le tracé d'un parcours à la demande.
 *
 * La liste des parcours ne contient pas `points` (voir `getParcours`) : ce
 * hook est le seul point d'entrée pour récupérer les coordonnées d'une carte.
 * Il met le résultat en cache tant que l'identifiant ne change pas.
 */
export function useParcoursPoints(parcoursId: string) {
  const [points, setPoints] = useState<GPXPoint[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const loadingRef = useRef(false)

  // Nouveau parcours : on repart de zéro et on invalide une requête en cours.
  useEffect(() => {
    requestIdRef.current++
    loadingRef.current = false
    setPoints(null)
    setLoading(false)
    setError(null)

    return () => {
      requestIdRef.current++
    }
  }, [parcoursId])

  const load = useCallback(async () => {
    // Déjà chargé ou requête en cours : rien à faire.
    if (points !== null || loadingRef.current) return

    const requestId = ++requestIdRef.current
    loadingRef.current = true
    setLoading(true)
    setError(null)

    try {
      const loaded = await getParcoursPoints(parcoursId)
      if (requestId !== requestIdRef.current) return
      setPoints(loaded)
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      console.error('Erreur chargement du tracé:', err)
      setError('Impossible de charger le tracé')
    } finally {
      if (requestId === requestIdRef.current) {
        loadingRef.current = false
        setLoading(false)
      }
    }
  }, [parcoursId, points])

  return { points, loading, error, load }
}
