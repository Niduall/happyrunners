import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchWeather, type WeatherForecast } from '../services/weatherApi'
import { useTargetWednesday } from './useTargetWednesday'

const CACHE_PREFIX = 'weather_cache'
const CACHE_DURATION = 60 * 60 * 1000 // 1 heure

/** Rafraîchissement de fond : 30 min — invisible pour l'utilisateur */
const REFRESH_INTERVAL_MS = 30 * 60 * 1000

interface CacheEntry {
  data: WeatherForecast
  timestamp: number
  /** Semaine pour laquelle la météo a été récupérée */
  weekKey: string
}

export function useWeather(lat?: number, lon?: number) {
  const [weather, setWeather] = useState<WeatherForecast | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Le cache est lié à la semaine cible : quand celle-ci change (bascule de
  // 14h le mercredi), le cache devient invalide automatiquement.
  const { weekKey } = useTargetWednesday()
  const cacheKey = `${CACHE_PREFIX}_${weekKey}`

  /**
   * Lit le cache s'il est encore valide.
   * @returns true si des données ont été restaurées
   *
   * ⚠️ On ne passe PAS par setLoading ici : `useTargetWednesday` déclenche
   * un re-render périodique, ce qui remettait le spinner et faisait
   * clignoter la carte météo.
   */
  const restoreFromCache = useCallback((): boolean => {
    try {
      const cached = localStorage.getItem(cacheKey)
      if (!cached) return false
      const entry: CacheEntry = JSON.parse(cached)
      if (entry.weekKey === weekKey && Date.now() - entry.timestamp < CACHE_DURATION) {
        setWeather(entry.data)
        return true
      }
    } catch {
      // Cache corrompu ou localStorage indisponible
    }
    return false
  }, [cacheKey, weekKey])

  /**
   * Fetch réseau + écriture du cache.
   * @param opts.silent — mise à jour en arrière-plan, sans spinner.
   *                    Évite le clignotement à chaque tick.
   */
  const doFetch = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true)
      setError(null)

      try {
        const data = await fetchWeather(lat, lon)
        setWeather(data)
        const entry: CacheEntry = { data, timestamp: Date.now(), weekKey }
        localStorage.setItem(cacheKey, JSON.stringify(entry))
        purgeOtherCaches(cacheKey)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue')
      } finally {
        if (!opts?.silent) setLoading(false)
      }
    },
    [lat, lon, cacheKey, weekKey]
  )

  // Premier chargement : cache d'abord, réseau seulement si nécessaire
  useEffect(() => {
    if (restoreFromCache()) {
      setLoading(false)
    } else {
      void doFetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey])

  /**
   * Rafraîchissement de fond toutes les 30 min : la météo reste à jour sans
   * que l'utilisateur ait à faire quoi que ce soit, et sans clignotement
   * (silent + cache disponible).
   */
  useEffect(() => {
    refreshRef.current = setInterval(() => {
      void doFetch({ silent: true })
    }, REFRESH_INTERVAL_MS)

    return () => {
      if (refreshRef.current) {
        clearInterval(refreshRef.current)
        refreshRef.current = null
      }
    }
  }, [doFetch])

  /** Rafraîchissement manuel : ignore le cache et force un re-fetch */
  const refresh = useCallback(() => {
    localStorage.removeItem(cacheKey)
    setLoading(true)
    void doFetch()
  }, [doFetch, cacheKey])

  return { weather, loading, error, refresh }
}

/** Supprime les entrées de cache qui ne correspondent pas à la clé courante */
function purgeOtherCaches(keepKey: string): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(CACHE_PREFIX)) keys.push(k)
    }
    for (const k of keys) {
      if (k !== keepKey) localStorage.removeItem(k)
    }
  } catch {
    // localStorage indisponible (mode privé strict) — non bloquant
  }
}
