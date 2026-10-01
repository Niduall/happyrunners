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
  week_key: string | null
  first_name: string | null
  last_name: string | null
  created_at: string
  updated_at: string
}

export interface Inscription {
  id: string
  parcours_id: string
  local_user_id: string
  first_name: string
  last_name: string
  created_at: string
}

/** Réponse globale : est-ce que la personne vient cette semaine ? */
export type AttendanceStatus = 'going' | 'skip'

export interface Attendance {
  id: string
  week_key: string
  local_user_id: string
  first_name: string
  last_name: string
  status: AttendanceStatus
  created_at: string
  updated_at: string
}

export interface AttendanceInsert {
  week_key: string
  local_user_id: string
  first_name: string
  last_name: string
  status: AttendanceStatus
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
  week_key: string | null
  first_name: string | null
  last_name: string | null
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