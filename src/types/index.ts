/**
 * Parcours — ré-exporté depuis les types DB pour éviter deux définitions
 * divergentes (l'app entière lit ce qui vient de Supabase). Idem pour
 * `GPXPoint` : une seule définition, dans `types/supabase.ts`.
 */
export type {
  AttendanceStatus,
  GPXPoint,
  Parcours,
  ParcoursSummary,
  ProfileIdentity,
} from './supabase'

import type { AttendanceStatus as Status } from './supabase'

/**
 * Une ligne du tableau « Qui vient ? ».
 *
 * Tout le monde y figure : `status` vaut `null` tant que la personne n'a pas
 * répondu à la question de la semaine.
 */
export interface PresenceRow {
  userNumber: number
  firstName: string
  lastName: string
  status: Status | null
  parcoursName: string | null
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

/**
 * Identité minimale d'une personne, en camelCase (forme application).
 * `PendingUser` en est un alias : une seule forme pour le même concept.
 */
export interface UserIdentity {
  userNumber: number
  firstName: string
  lastName: string
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