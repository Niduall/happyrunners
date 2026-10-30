import { useEffect, useState } from 'react'
import { getAllProfiles } from '../services/supabaseService'
import type { ProfileIdentity } from '../types'

/**
 * L'annuaire complet, chargé une fois à la connexion.
 *
 * Il ne dépend pas de la semaine : inutile de le relire à chaque polling.
 * Une personne qui s'inscrit pendant que la page est ouverte apparaît de
 * toute façon dès qu'elle répond (sa ligne vient des présences), puis avec
 * tout le monde au rechargement suivant.
 *
 * `enabled` évite d'appeler la base avant que l'utilisateur soit identifié :
 * l'écran de connexion n'a pas besoin de la liste des noms.
 *
 * En cas d'échec, `profiles` reste vide : Home retombe alors sur l'ancien
 * affichage (seulement ceux qui ont répondu) au lieu de casser la page.
 */
export function useProfiles(enabled = true) {
  const [profiles, setProfiles] = useState<ProfileIdentity[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return

    setLoading(true)
    let cancelled = false

    void (async () => {
      try {
        const list = await getAllProfiles()
        if (!cancelled) {
          setProfiles(list)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Impossible de charger le groupe')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled])

  return { profiles, loading, error }
}
