export interface Coordinates {
  lat: number
  lng: number
}

export interface GPXPoint {
  lat: number
  lng: number
  ele?: number
  time?: string
}

export interface Parcours {
  id: string
  name: string
  description?: string
  distance?: number
  distance_km?: number
  elevationGain?: number
  elevation_gain_m?: number
  points: GPXPoint[]
  created_by?: string | null
  createdAt?: string
  created_at?: string
  updatedAt?: string
  updated_at?: string
}

export interface WeatherData {
  temperature: number
  feelsLike: number
  humidity: number
  windSpeed: number
  windDeg: number
  /** Code météo WMO (Open-Meteo) — convertir via weatherCode.ts */
  weatherCode?: number
  /** true si c'est le jour (pour l'icône 🌙 / ☀️) */
  isDay?: boolean
  /** Rafales (km/h) */
  windGust?: number
  /** Probabilité de pluie, normalisée 0..1 */
  pop?: number
  /** @deprecated plus utilisé depuis la migration Open-Meteo */
  description?: string
  /** @deprecated plus utilisé depuis la migration Open-Meteo */
  icon?: string
  dt: number
  sunrise?: number
  sunset?: number
}

export interface WeatherForecast {
  current: WeatherData
  hourly: WeatherData[]
  daily: Array<WeatherData & { temp: { min: number; max: number } }>
}

export type ParticipationStatus = 'yes' | 'no' | null

export interface Participation {
  id: string
  parcoursId: string
  parcours_id: string
  userId: string
  user_id: string
  status: ParticipationStatus
  updatedAt: string
  updated_at: string
}

export interface User {
  id: string // = generateUserId(firstName, lastName), ex: "paul_martin"
  firstName: string
  lastName: string
  name: string // computed: "Prénom Nom"
}