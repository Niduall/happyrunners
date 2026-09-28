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
  description: string
  icon: string
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
  id: string
  firstName: string
  lastName: string
  name: string // computed: "Prénom Nom"
}