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
  /** user_number du créateur (null si inconnu) */
  created_by: number | null
  created_at: string
  updated_at: string
}

export interface ParcoursInsert {
  name: string
  description?: string
  distance_km: number
  elevation_gain_m?: number
  points: GPXPoint[]
  created_by: number | null
}

/**
 * Choix du parcours pour la semaine.
 * UNIQUE (user_number, week_key) : une seule ligne par personne et par semaine.
 */
export interface Participation {
  id: string
  parcours_id: string
  user_number: number
  status: 'yes' | 'no'
  week_key: string
  created_at: string
  updated_at: string
}

export interface ParticipationInsert {
  parcours_id: string
  user_number: number
  week_key: string
  status: 'yes' | 'no'
}

/** Réponse globale : est-ce que la personne vient cette semaine ? */
export type AttendanceStatus = 'going' | 'skip'

/** UNIQUE (week_key, user_number) : une réponse par personne et par semaine */
export interface Attendance {
  id: string
  week_key: string
  user_number: number
  status: AttendanceStatus
  created_at: string
  updated_at: string
}

export interface AttendanceInsert {
  week_key: string
  user_number: number
  status: AttendanceStatus
}

/**
 * Profil utilisateur.
 * `user_number` est l'identifiant technique stable (1, 2, 3…), attribué par
 * la base. Il ne change JAMAIS : modifier son nom ne le touche pas, donc
 * les votes et le PIN restent attachés à la bonne personne.
 */
export interface UserProfile {
  id: string
  user_number: number
  first_name: string
  last_name: string
  pin_hash: string | null
  created_at: string
  updated_at: string
}

export interface UserProfileInsert {
  first_name: string
  last_name: string
  pin_hash: string | null
}

export interface UserProfileUpdate {
  first_name?: string
  last_name?: string
  pin_hash?: string | null
}
