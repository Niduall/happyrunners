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
  /** Timestamp du dernier fetch réussi — pour afficher la fraîcheur */
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const requestIdRef = useRef(0)

  // Le cache est lié à la semaine cible : quand celle-ci change (bascule de
  // 14h le mercredi), le cache devient invalide automatiquement.
  const { weekKey } = useTargetWednesday()
  const cacheKey = `${CACHE_PREFIX}_${weekKey}`
  // Même garde que les autres hooks : une réponse de l'ancienne semaine ne
  // doit ni s'afficher ni toucher au cache de la nouvelle.
  const weekKeyRef = useRef(weekKey)
  weekKeyRef.current = weekKey

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
        setFetchedAt(entry.timestamp)
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
      const requestId = ++requestIdRef.current
      const requestedWeekKey = weekKey
      const isStale = () =>
        requestId !== requestIdRef.current || requestedWeekKey !== weekKeyRef.current

      if (!opts?.silent) setLoading(true)
      setError(null)

      try {
        const data = await fetchWeather(lat, lon)
        if (isStale()) return
        setWeather(data)
        const now = Date.now()
        setFetchedAt(now)
        const entry: CacheEntry = { data, timestamp: now, weekKey: requestedWeekKey }
        localStorage.setItem(cacheKey, JSON.stringify(entry))
        // Ne purger qu'avec la clé encore courante : une réponse tardive de
        // l'ancienne semaine supprimerait le cache de la nouvelle.
        purgeOtherCaches(cacheKey)
      } catch (err) {
        if (isStale()) return
        console.error('[METEO] fetch echoue', err)
        setError(err instanceof Error ? err.message : 'Erreur inconnue')
      } finally {
        // Même une requête silencieuse doit retirer le spinner : si elle a
        // remplacé une requête non silencieuse, c'est elle la plus récente.
        if (!isStale()) setLoading(false)
      }
    },
    [lat, lon, cacheKey, weekKey]
  )

  // Premier chargement : cache d'abord, réseau seulement si nécessaire
  useEffect(() => {
    // Nouvelle semaine : la météo précédente ne doit pas rester affichée si
    // le nouveau chargement échoue (le bandeau d'erreur est masqué tant que
    // `weather` est non nul).
    setWeather(null)
    setFetchedAt(null)

    const restored = restoreFromCache()

    if (restored) {
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

  return { weather, loading, error, refresh, fetchedAt }
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
