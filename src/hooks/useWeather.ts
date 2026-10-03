import { useState, useEffect, useCallback } from 'react'
import { fetchWeather, type WeatherForecast } from '../services/weatherApi'
import { useTargetWednesday } from './useTargetWednesday'

const CACHE_PREFIX = 'weather_cache'
const CACHE_DURATION = 60 * 60 * 1000 // 1 heure

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

  // Le cache est lié à la semaine cible : quand celle-ci change (bascule de
  // 14h le mercredi), le cache devient invalide automatiquement.
  const { weekKey } = useTargetWednesday()
  const cacheKey = `${CACHE_PREFIX}_${weekKey}`

  /**
   * Lit le cache s'il est encore valide.
   * @returns true si des données ont été restaurées
   *
   * ⚠️ On ne passe PAS par setLoading ici : `useTargetWednesday` déclenche
   * un re-render chaque minute, ce qui remettait le spinner et faisait
   * clignoter la carte météo toutes les minutes.
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

  const loadWeather = useCallback(async () => {
    // 1. Cache d'abord — pas de spinner, pas de clignotement
    if (restoreFromCache()) {
      setError(null)
      return
    }

    // 2. Rien en cache → vrai chargement
    setLoading(true)
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
      setLoading(false)
    }
  }, [lat, lon, cacheKey, weekKey, restoreFromCache])

  useEffect(() => {
    loadWeather()
  }, [loadWeather])

  /** Rafraîchissement manuel : force un vrai re-fetch */
  const refresh = useCallback(() => {
    localStorage.removeItem(cacheKey)
    setLoading(true)
    void loadWeather()
  }, [loadWeather, cacheKey])

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
