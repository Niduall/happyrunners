import { useState, useEffect, useCallback } from 'react'
import { fetchWeather, type WeatherForecast } from '../services/weatherApi'

const CACHE_KEY = 'weather_cache'
const CACHE_DURATION = 60 * 60 * 1000 // 1 heure

interface CacheEntry {
  data: WeatherForecast
  timestamp: number
}

export function useWeather(lat?: number, lon?: number) {
  const [weather, setWeather] = useState<WeatherForecast | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadWeather = useCallback(async () => {
    setLoading(true)
    setError(null)

    // Vérifier le cache
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const entry: CacheEntry = JSON.parse(cached)
        if (Date.now() - entry.timestamp < CACHE_DURATION) {
          setWeather(entry.data)
          setLoading(false)
          return
        }
      }
    } catch {
      // Ignore cache errors
    }

    try {
      const data = await fetchWeather(lat, lon)
      setWeather(data)
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }, [lat, lon])

  useEffect(() => {
    loadWeather()
  }, [loadWeather])

  const refresh = useCallback(() => {
    localStorage.removeItem(CACHE_KEY)
    loadWeather()
  }, [loadWeather])

  return { weather, loading, error, refresh }
}