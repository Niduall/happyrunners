import { useState, useEffect, useCallback, useRef } from 'react'
import { getParcours, addParcours, updateParcours, deleteParcours } from '../services/supabaseService'
import type { Parcours, ParcoursSummary, ParcoursInsert } from '../types/supabase'
import { parseGPX } from '../services/gpxParser'
import { useAuth } from './useAuth'

const POLL_INTERVAL_MS = 30000

/** Même parcours (mêmes valeurs) — évite de remplacer la liste au polling. */
function sameParcours(a: ParcoursSummary | null, b: ParcoursSummary | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.description === b.description &&
    a.distance_km === b.distance_km &&
    a.elevation_gain_m === b.elevation_gain_m &&
    a.created_by === b.created_by &&
    a.created_at === b.created_at &&
    a.updated_at === b.updated_at
  )
}

function sameParcoursList(a: ParcoursSummary[], b: ParcoursSummary[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return a.every((parcours, index) => sameParcours(parcours, b[index]))
}

export function useParcours() {
  const { user } = useAuth()
  const [parcoursList, setParcoursList] = useState<ParcoursSummary[]>([])
  const [nextParcours, setNextParcours] = useState<ParcoursSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const requestIdRef = useRef(0)

  const loadParcours = useCallback(async (opts?: { silent?: boolean }) => {
    // Deux chargements peuvent se chevaucher (polling + rechargement après
    // suppression) : seule la réponse la plus récente doit écrire l'état.
    const requestId = ++requestIdRef.current
    const isStale = () => requestId !== requestIdRef.current

    // ⚠️ Les rafraîchissements de fond (polling) doivent être SILENCIEUX :
    // setLoading(true) afficherait le spinner toutes les 30 s.
    if (!opts?.silent) setLoading(true)
    try {
      const data = await getParcours()
      if (isStale()) return
      setParcoursList((prev) => (sameParcoursList(prev, data) ? prev : data))
      setNextParcours((prev) => {
        const next = data[0] || null
        return sameParcours(prev, next) ? prev : next
      })
      setError(null)
    } catch (err) {
      if (isStale()) return
      setError(err instanceof Error ? err.message : 'Erreur chargement parcours')
    } finally {
      if (!isStale()) setLoading(false)
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

  /**
   * Modifie un parcours : nom, tracé, ou les deux.
   * Le GPX est parsé ici, une seule fois, pour que le nom et le tracé soient
   * mis à jour ensemble et que l'erreur de format remonte à l'appelant.
   */
  const editParcours = async (
    id: string,
    changes: { name?: string; gpxContent?: string }
  ): Promise<void> => {
    const updates: Partial<ParcoursInsert> = {}

    if (changes.name !== undefined) updates.name = changes.name

    if (changes.gpxContent !== undefined) {
      const parsed = parseGPX(changes.gpxContent)
      if (!parsed) throw new Error('Fichier GPX invalide')
      updates.distance_km = parsed.distance_km
      updates.elevation_gain_m = parsed.elevation_gain_m
      updates.points = parsed.points
    }

    if (Object.keys(updates).length === 0) return

    await updateParcours(id, updates)
    // ⚠️ Sans ce rechargement, la liste garde l'ancien nom / l'ancienne
    // distance jusqu'au polling (30 s).
    await loadParcours({ silent: true })
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
    editParcours,
    removeParcours,
    refresh: loadParcours,
  }
}