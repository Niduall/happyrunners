export interface GPXPoint {
  lat: number
  lng: number
  ele?: number
  time?: string
}

export interface Profile {
  id: string
  name: string
  avatar_url?: string
  created_at: string
  updated_at: string
}

export interface Parcours {
  id: string
  name: string
  description?: string
  distance_km: number
  elevation_gain_m?: number
  points: GPXPoint[]
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Participation {
  id: string
  parcours_id: string
  user_id: string
  status: 'yes' | 'no'
  created_at: string
  updated_at: string
}

export interface ParcoursInsert {
  name: string
  description?: string
  distance_km: number
  elevation_gain_m?: number
  points: GPXPoint[]
  created_by: string | null
}

export interface ParticipationInsert {
  parcours_id: string
  user_id: string
  status: 'yes' | 'no'
}