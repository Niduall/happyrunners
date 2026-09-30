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
  user_id: string | null
  local_user_id: string | null
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
  user_id: string | null
  local_user_id: string | null
  status: 'yes' | 'no'
}

export interface UserProfile {
  local_user_id: string
  first_name: string
  last_name: string
  pin_hash: string | null
  created_at: string
  updated_at: string
}

export interface UserProfileInsert {
  local_user_id: string
  first_name: string
  last_name: string
  pin_hash: string | null
}

export interface UserProfileUpdate {
  first_name?: string
  last_name?: string
  pin_hash?: string | null
}