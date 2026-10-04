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

/**
 * Parcours — ré-exporté depuis les types DB pour éviter deux définitions
 * divergentes (l'app entière lit ce qui vient de Supabase).
 */
export type { Parcours, ParcoursInsert, Attendance, AttendanceStatus } from './supabase'
import type { Parcours } from './supabase'

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
  userNumber: number
  status: ParticipationStatus
  updatedAt: string
  updated_at: string
}

export interface User {
  /**
   * Identifiant technique stable, attribué par la base (1, 2, 3…).
   * Ne change JAMAIS, même si la personne modifie son nom.
   */
  id: number
  firstName: string
  lastName: string
  name: string // computed: "Prénom Nom"
}