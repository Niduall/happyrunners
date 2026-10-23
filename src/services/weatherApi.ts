import { type WeatherForecast, type WeatherData } from '../types'
import { getCurrentWeekKey } from './weekKey'

/**
 * Open-Meteo — API gratuite, sans clé, 16 jours de prévision.
 *
 * Avantages sur OpenWeather (plan gratuit) :
 *   - 16 jours au lieu de 5
 *   - aucune clé API à gérer
 *   - vent déjà en km/h (pas de conversion)
 *   - probabilité de pluie et rafales incluses
 *
 * Doc : https://open-meteo.com/en/docs
 */
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'

/** Fuseau de la requête et des heures renvoyées par Open-Meteo. */
export const WEATHER_TIMEZONE = 'Europe/Paris'

export const DEFAULT_LAT = 48.6833
export const DEFAULT_LON = 6.2167

/** Couverture réelle de l'API : 16 jours */
export const FORECAST_HORIZON_DAYS = 16

/** Heure du run : 12h30 */
export const RUN_HOUR = 12
export const RUN_MINUTES = 30

/** Tolérance pour considérer qu'une prévision correspond au run */
const RUN_WINDOW_MINUTES = 90

const HOURLY_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'precipitation_probability',
  'weather_code',
] as const

const DAILY_FIELDS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_probability_max',
  'sunrise',
  'sunset',
] as const

const CURRENT_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'weather_code',
  'is_day',
] as const

export type { WeatherForecast, WeatherData }

export async function fetchWeather(
  lat: number = DEFAULT_LAT,
  lon: number = DEFAULT_LON
): Promise<WeatherForecast> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: HOURLY_FIELDS.join(','),
    daily: DAILY_FIELDS.join(','),
    current: CURRENT_FIELDS.join(','),
    timezone: WEATHER_TIMEZONE,
    forecast_days: String(FORECAST_HORIZON_DAYS),
  })

  try {
    const res = await fetch(`${OPEN_METEO_URL}?${params}`)

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }

    const json = await res.json()
    return transformOpenMeteoResponse(json)
  } catch (error) {
    console.error('Weather API error:', error)
    throw new Error(
      `Erreur météo: ${error instanceof Error ? error.message : 'service indisponible'}`
    )
  }
}

const PARIS_CLOCK = new Intl.DateTimeFormat('en-US', {
  timeZone: WEATHER_TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/** Heure murale à Paris pour un instant donné. */
function parisWallClock(date: Date): WallClock {
  const parts = PARIS_CLOCK.formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type)
    if (!part) throw new Error(`Fuseau ${WEATHER_TIMEZONE} : ${type} manquant`)
    return Number(part.value)
  }
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  }
}

/** Décalage entre l'heure murale de Paris et UTC, en millisecondes. */
function parisOffsetMs(date: Date): number {
  const p = parisWallClock(date)
  const timeMs = Math.floor(date.getTime() / 1000) * 1000
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - timeMs
}

/**
 * Convertit une date/heure murale de Paris en timestamp Unix.
 * Deux passes : le décalage peut changer au passage à l'heure d'été/hiver.
 */
function parisWallTimeToEpoch(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): number {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second)
  const firstOffset = parisOffsetMs(new Date(utcGuess))
  let epochMs = utcGuess - firstOffset
  const secondOffset = parisOffsetMs(new Date(epochMs))
  if (secondOffset !== firstOffset) epochMs = utcGuess - secondOffset
  return Math.floor(epochMs / 1000)
}

const ISO_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/

/**
 * Convertit une date ISO locale Open-Meteo ("2026-10-07T12:00" ou
 * "2026-10-07") en timestamp Unix, dans le fuseau de la requête.
 * ⚠️ Ne pas utiliser `new Date(iso)` : il interpréterait l'heure dans le
 * fuseau du navigateur.
 */
export function isoToEpoch(iso: string): number {
  const match = ISO_LOCAL_RE.exec(iso)
  if (!match) throw new Error(`Date météo invalide : ${iso}`)
  const [, year, month, day, hour = '0', minute = '0', second = '0'] = match
  return parisWallTimeToEpoch(+year, +month, +day, +hour, +minute, +second)
}

/** Timestamp Unix de 12h30 heure de Paris, le jour du run cible */
export function getRunTimestamp(from: Date = new Date()): number {
  const [y, m, d] = getCurrentWeekKey(from).split('-').map(Number)
  return parisWallTimeToEpoch(y, m, d, RUN_HOUR, RUN_MINUTES)
}

export function transformOpenMeteoResponse(json: any): WeatherForecast {
  const current: WeatherData = {
    temperature: json.current.temperature_2m,
    feelsLike: json.current.apparent_temperature,
    humidity: json.current.relative_humidity_2m,
    windSpeed: Math.round(json.current.wind_speed_10m),
    windDeg: json.current.wind_direction_10m ?? 0,
    windGust: json.current.wind_gusts_10m
      ? Math.round(json.current.wind_gusts_10m)
      : undefined,
    pop: undefined,
    weatherCode: json.current.weather_code,
    isDay: json.current.is_day === 1,
    description: '',
    icon: '',
    dt: isoToEpoch(json.current.time),
    sunrise: json.daily?.sunrise?.[0] ? isoToEpoch(json.daily.sunrise[0]) : undefined,
    sunset: json.daily?.sunset?.[0] ? isoToEpoch(json.daily.sunset[0]) : undefined,
  }

  const hourly: WeatherData[] = (json.hourly?.time ?? []).map((time: string, i: number) => ({
    temperature: json.hourly.temperature_2m[i],
    feelsLike: json.hourly.apparent_temperature[i],
    humidity: json.hourly.relative_humidity_2m[i],
    windSpeed: Math.round(json.hourly.wind_speed_10m[i]),
    windDeg: json.hourly.wind_direction_10m[i] ?? 0,
    windGust: json.hourly.wind_gusts_10m?.[i]
      ? Math.round(json.hourly.wind_gusts_10m[i])
      : undefined,
    // Open-Meteo renvoie un pourcentage (0-100), on normalise en 0-1
    pop: (json.hourly.precipitation_probability?.[i] ?? 0) / 100,
    weatherCode: json.hourly.weather_code[i],
    isDay: true, // inconnu à ce niveau, l'affichage décide via la date
    description: '',
    icon: '',
    dt: isoToEpoch(time),
  }))

  const daily: (WeatherData & { temp: { min: number; max: number } })[] = (
    (json.daily?.time ?? []) as string[]
  ).map((time, i) => ({
    temperature: json.daily.temperature_2m_max[i],
    feelsLike: json.daily.temperature_2m_max[i],
    humidity: 0,
    windSpeed: 0,
    windDeg: 0,
    pop: (json.daily.precipitation_probability_max?.[i] ?? 0) / 100,
    weatherCode: json.daily.weather_code[i],
    isDay: true,
    description: '',
    icon: '',
    dt: isoToEpoch(time),
    temp: {
      min: json.daily.temperature_2m_min[i],
      max: json.daily.temperature_2m_max[i],
    },
    sunrise: json.daily.sunrise?.[i] ? isoToEpoch(json.daily.sunrise[i]) : undefined,
    sunset: json.daily.sunset?.[i] ? isoToEpoch(json.daily.sunset[i]) : undefined,
  }))

  return { current, hourly, daily }
}

/**
 * Prévision du jour du run (12h30).
 * Retourne null si le run est hors couverture de l'API.
 */
export function getRunForecast(
  weather: WeatherForecast,
  from: Date = new Date(),
  /** "maintenant" injectable pour les tests */
  nowSeconds: number = Math.floor(Date.now() / 1000)
): WeatherData | null {
  const target = getRunTimestamp(from)

  if (target - nowSeconds > FORECAST_HORIZON_DAYS * 24 * 3600) {
    return null
  }

  let candidate: WeatherData | null = null
  let bestDiff = Infinity

  for (const h of weather.hourly ?? []) {
    const diff = Math.abs(h.dt - target)
    if (diff < bestDiff) {
      bestDiff = diff
      candidate = h
    }
  }

  if (!candidate) return null
  if (bestDiff > RUN_WINDOW_MINUTES * 60) return null

  // Reprend lever/coucher du jour du run s'ils sont connus
  const runDay = (weather.daily ?? []).find((d) => d.dt === startOfDay(target))
  return {
    ...candidate,
    isDay: true, // 12h30, toujours le jour
    sunrise: runDay?.sunrise ?? weather.current.sunrise,
    sunset: runDay?.sunset ?? weather.current.sunset,
  }
}

function startOfDay(epochSeconds: number): number {
  // Jour civil à Paris : `setHours(0, 0, 0, 0)` dépendrait du navigateur.
  const { year, month, day } = parisWallClock(new Date(epochSeconds * 1000))
  return parisWallTimeToEpoch(year, month, day)
}

/** Nombre de jours entre aujourd'hui et le jour du run */
export function daysUntilRun(from: Date = new Date()): number {
  const [y, m, d] = getCurrentWeekKey(from).split('-').map(Number)
  const run = new Date(y, m - 1, d)
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  return Math.round((run.getTime() - today.getTime()) / 86_400_000)
}

export function formatWindDirection(deg: number): string {
  const directions = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO',
  ]
  const index = Math.round(deg / 22.5) % 16
  return directions[index]
}
