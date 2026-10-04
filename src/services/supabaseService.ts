import { supabase } from '../lib/supabase'
import type {
  Parcours,
  ParcoursInsert,
  ParticipationInsert,
  AttendanceInsert,
  AttendanceStatus,
  UserProfile,
  UserProfileInsert,
  UserProfileUpdate,
  GPXPoint,
} from '../types/supabase'

export type { AttendanceStatus }

// ===== PARCOURS =====

export async function getParcours(): Promise<Parcours[]> {
  const { data, error } = await supabase
    .from('parcours')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getNextParcours(): Promise<Parcours | null> {
  // maybeSingle() : null si aucun parcours, pas d'erreur 406
  const { data, error } = await supabase
    .from('parcours')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data || null
}

export async function addParcours(parcours: ParcoursInsert): Promise<Parcours> {
  const { data, error } = await supabase
    .from('parcours')
    .insert(parcours)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateParcours(id: string, updates: Partial<ParcoursInsert>): Promise<Parcours> {
  const { data, error } = await supabase
    .from('parcours')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteParcours(id: string): Promise<void> {
  const { error } = await supabase.from('parcours').delete().eq('id', id)
  if (error) throw error
}

// ===== USER PROFILES =====

/**
 * Récupère le profil par identifiant technique (user_number).
 * Retourne null si le profil n'existe pas encore (première connexion).
 */
export async function getUserProfile(userNumber: number): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_number', userNumber)
    .maybeSingle()

  if (error) throw error
  return data || null
}

/** Crée un profil et retourne son user_number attribué par la base */
export async function createUserProfile(profile: UserProfileInsert): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('user_profiles')
    .insert(profile)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Met à jour un profil par user_number.
 * Comme l'identifiant ne dépend pas du nom, changer de nom ne casse rien :
 * votes, PIN et historique restent attachés à la bonne personne.
 */
export async function updateUserProfile(
  userNumber: number,
  updates: UserProfileUpdate
): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('user_profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('user_number', userNumber)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Récupère le profil d'une personne par son nom.
 * Sert à retrouver son user_number sur un nouvel appareil, puisque
 * l'identifiant technique n'est plus dérivé du nom.
 */
export async function findProfileByName(
  firstName: string,
  lastName: string
): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .ilike('first_name', firstName.trim())
    .ilike('last_name', lastName.trim())
    .maybeSingle()

  if (error) throw error
  return data || null
}

// ===== ATTENDANCES (réponse globale) =====

/** Une réponse "je viens / je ne viens pas", avec le nom affiché */
export interface Attendee {
  userNumber: number
  firstName: string
  lastName: string
  status: AttendanceStatus
}

/** Atttendances + noms, pour le tableau de présence */
interface AttendanceWithNames extends AttendanceInsert {
  id: string
  created_at: string
  updated_at: string
}

export async function getWeekAttendances(weekKey: string): Promise<Attendee[]> {
  const { data, error } = await supabase
    .from('attendances')
    .select('id,user_number,status,created_at,updated_at')
    .eq('week_key', weekKey)

  if (error) throw error

  const rows = (data || []) as AttendanceWithNames[]
  if (rows.length === 0) return []

  // Les noms vivent dans user_profiles : un JOIN évite de les dupliquer
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('user_number,first_name,last_name')
    .in('user_number', rows.map((r) => r.user_number))

  const names = new Map(
    ((profiles || []) as { user_number: number; first_name: string; last_name: string }[]).map((p) => [
      p.user_number,
      { firstName: p.first_name, lastName: p.last_name },
    ])
  )

  return rows.map((row) => ({
    userNumber: row.user_number,
    firstName: names.get(row.user_number)?.firstName ?? '',
    lastName: names.get(row.user_number)?.lastName ?? '',
    status: row.status as AttendanceStatus,
  }))
}

/**
 * Enregistre la réponse globale pour la semaine.
 * Idempotent via UNIQUE(week_key, user_number).
 */
export async function setAttendance(params: {
  weekKey: string
  userNumber: number
  status: AttendanceStatus
}): Promise<void> {
  const { weekKey, userNumber, status } = params

  const { error } = await supabase.from('attendances').upsert(
    {
      week_key: weekKey,
      user_number: userNumber,
      status,
    } as AttendanceInsert,
    { onConflict: 'week_key,user_number' }
  )

  if (error) throw error
}

// ===== PARTICIPATIONS (choix du parcours) =====

export interface WeekVote {
  parcoursId: string
  userNumber: number
  status: 'yes' | 'no'
}

export interface ParcoursTally {
  parcoursId: string
  yes: number
  no: number
}

/** Tous les votes d'une semaine, tous parcours confondus */
export async function getWeekVotes(weekKey: string): Promise<WeekVote[]> {
  const { data, error } = await supabase
    .from('participations')
    .select('parcours_id,user_number,status')
    .eq('week_key', weekKey)

  if (error) throw error

  // ⚠️ PostgREST renvoie du snake_case ; on mappe explicitement en camelCase.
  return (data || []).map((row) => ({
    parcoursId: row.parcours_id as string,
    userNumber: row.user_number as number,
    status: row.status as 'yes' | 'no',
  }))
}

/** Compteurs yes/no par parcours pour une semaine */
export async function getWeekTallies(weekKey: string): Promise<ParcoursTally[]> {
  const votes = await getWeekVotes(weekKey)
  const byParcours = new Map<string, ParcoursTally>()

  for (const v of votes) {
    if (!v.parcoursId || v.userNumber == null) continue
    const tally = byParcours.get(v.parcoursId) ?? { parcoursId: v.parcoursId, yes: 0, no: 0 }
    if (v.status === 'yes') tally.yes += 1
    else tally.no += 1
    byParcours.set(v.parcoursId, tally)
  }

  return [...byParcours.values()]
}

/** Le choix d'une personne pour un parcours donné cette semaine */
export async function getMyWeekVote(
  parcoursId: string,
  userNumber: number,
  weekKey: string
): Promise<'yes' | 'no' | null> {
  const { data, error } = await supabase
    .from('participations')
    .select('status')
    .eq('parcours_id', parcoursId)
    .eq('user_number', userNumber)
    .eq('week_key', weekKey)
    .maybeSingle()

  if (error) throw error
  return (data?.status as 'yes' | 'no' | undefined) ?? null
}

/**
 * Enregistre le choix de parcours pour la semaine.
 * UNIQUE(user_number, week_key) : un seul choix par personne et par semaine.
 * Changer de parcours REMPLACE le précédent automatiquement.
 */
export async function castWeekVote(params: {
  parcoursId: string
  userNumber: number
  weekKey: string
}): Promise<void> {
  const { parcoursId, userNumber, weekKey } = params

  const { error } = await supabase.from('participations').upsert(
    {
      parcours_id: parcoursId,
      user_number: userNumber,
      week_key: weekKey,
      status: 'yes',
    } as ParticipationInsert,
    { onConflict: 'user_number,week_key' }
  )

  if (error) throw error
}

/**
 * Retire le choix de parcours d'une personne pour la semaine.
 *
 * ⚠️ Utilisé aussi quand la personne répond « pas aujourd'hui » : son choix
 * ne doit plus peser sur le vote d'un parcours.
 */
export async function deleteWeekVote(
  userNumber: number,
  weekKey: string
): Promise<void> {
  const { error } = await supabase
    .from('participations')
    .delete()
    .eq('user_number', userNumber)
    .eq('week_key', weekKey)

  if (error) throw error
}
