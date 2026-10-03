import { supabase } from '../lib/supabase'
import type {
  Parcours,
  ParcoursInsert,
  ParticipationInsert,
  AttendanceInsert,
  AttendanceStatus,
  GPXPoint,
  UserProfile,
  UserProfileInsert,
  UserProfileUpdate,
} from '../types/supabase'

// Ré-exporté pour que les composants n'importent pas directement les types
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

// ===== PARTICIPATIONS (VOTES HEBDO) =====
// Un vote = (parcours_id, local_user_id, week_key). Le cycle de vote va du
// jeudi au mercredi suivant ; getCurrentWeekKey() fournit la clé.

export interface RosterMember {
  localUserId: string
  firstName: string
  lastName: string
}

export interface WeekVote {
  parcoursId: string
  localUserId: string
  status: 'yes' | 'no'
}

export interface ParcoursTally {
  parcoursId: string
  yes: number
  no: number
}

export interface UserIdentity {
  firstName: string
  lastName: string
}

/** Une réponse globale "je viens / je ne viens pas" */
export interface Attendee {
  localUserId: string
  firstName: string
  lastName: string
  status: AttendanceStatus
}

// ===== ATTENDANCES (réponse globale : je viens ou pas) =====

/** Qui vient / qui ne vient pas cette semaine */
export async function getWeekAttendances(weekKey: string): Promise<Attendee[]> {
  const { data, error } = await supabase
    .from('attendances')
    .select('local_user_id,first_name,last_name,status')
    .eq('week_key', weekKey)

  if (error) throw error

  return (data || []).map((row) => ({
    localUserId: row.local_user_id as string,
    firstName: (row.first_name as string) || '',
    lastName: (row.last_name as string) || '',
    status: row.status as AttendanceStatus,
  }))
}

/**
 * Enregistre la réponse globale de la personne pour la semaine.
 * Idempotent via UNIQUE(week_key, local_user_id) : changer d'avis
 * écrase la ligne précédente au lieu d'en créer une seconde.
 */
export async function setAttendance(params: {
  weekKey: string
  localUserId: string
  status: AttendanceStatus
  identity: UserIdentity
}): Promise<void> {
  const { weekKey, localUserId, status, identity } = params

  const { error } = await supabase.from('attendances').upsert(
    {
      week_key: weekKey,
      local_user_id: localUserId,
      first_name: identity.firstName,
      last_name: identity.lastName,
      status,
    } as AttendanceInsert,
    { onConflict: 'week_key,local_user_id' }
  )

  if (error) throw error
}

/** Toutes les personnes ayant répondu une fois (historique) → roster */
export async function getRoster(): Promise<RosterMember[]> {
  // Le roster vient de `attendances` quand elle est renseignée, sinon on
  // retombe sur `participations` (historique antérieur).
  const [att, parts] = await Promise.all([
    supabase.from('attendances').select('local_user_id,first_name,last_name').not('local_user_id', 'is', null),
    supabase.from('participations').select('local_user_id,first_name,last_name').not('local_user_id', 'is', null),
  ])

  if (att.error && parts.error) throw att.error

  const members = new Map<string, RosterMember>()
  for (const row of [...(att.data || []), ...(parts.data || [])]) {
    const id = row.local_user_id as string
    if (!id || members.has(id)) continue
    members.set(id, {
      localUserId: id,
      firstName: (row.first_name as string) || id.split('_')[0] || '?',
      lastName: (row.last_name as string) || id.split('_').slice(1).join(' ') || '',
    })
  }

  return [...members.values()].sort((a, b) =>
    `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'fr')
  )
}

/** Tous les votes d'une semaine, tous parcours confondus */
export async function getWeekVotes(weekKey: string): Promise<WeekVote[]> {
  const { data, error } = await supabase
    .from('participations')
    .select('parcours_id,local_user_id,status')
    .eq('week_key', weekKey)

  if (error) throw error

  // ⚠️ Supabase renvoie du snake_case ; on mappe explicitement en camelCase.
  // Un simple cast TypeScript ne transforme rien à l'exécution.
  return (data || []).map((row) => ({
    parcoursId: row.parcours_id as string,
    localUserId: row.local_user_id as string,
    status: row.status as 'yes' | 'no',
  }))
}

/** Compteurs yes/no par parcours pour une semaine */
export async function getWeekTallies(weekKey: string): Promise<ParcoursTally[]> {
  const votes = await getWeekVotes(weekKey)
  const byParcours = new Map<string, ParcoursTally>()

  for (const v of votes) {
    if (!v.parcoursId || !v.localUserId) continue
    const tally = byParcours.get(v.parcoursId) ?? { parcoursId: v.parcoursId, yes: 0, no: 0 }
    if (v.status === 'yes') tally.yes += 1
    else tally.no += 1
    byParcours.set(v.parcoursId, tally)
  }

  return [...byParcours.values()]
}

/** Le vote d'une personne pour un parcours donné cette semaine */
export async function getMyWeekVote(
  parcoursId: string,
  localUserId: string,
  weekKey: string
): Promise<'yes' | 'no' | null> {
  const { data, error } = await supabase
    .from('participations')
    .select('status')
    .eq('parcours_id', parcoursId)
    .eq('local_user_id', localUserId)
    .eq('week_key', weekKey)
    .maybeSingle()

  if (error) throw error
  return (data?.status as 'yes' | 'no' | undefined) ?? null
}

/**
 * Retire le choix de parcours d'une personne pour la semaine.
 *
 * ⚠️ Le parcours est ignoré : la contrainte UNIQUE(local_user_id, week_key)
 * garantit qu'une personne n'a qu'un choix par semaine, donc supprimer par
 * (personne, semaine) suffit et évite de connaître le parcours choisi.
 *
 * Utilisé aussi quand la personne répond « pas aujourd'hui » : son choix
 * de parcours ne doit plus peser sur le vote d'un parcours.
 */
export async function deleteWeekVote(
  _parcoursId: string | null,
  localUserId: string,
  weekKey: string
): Promise<void> {
  const { error } = await supabase
    .from('participations')
    .delete()
    .eq('local_user_id', localUserId)
    .eq('week_key', weekKey)

  if (error) throw error
}

/**
 * Enregistre le choix de parcours pour la semaine courante.
 *
 * ⚠️ La contrainte UNIQUE(local_user_id, week_key) impose UN SEUL choix par
 * personne et par semaine : passer à un autre parcours **remplace** le
 * précédent automatiquement. Ne pas tenter de supprimer l'ancien vote côté
 * client — l'upsert s'en charge.
 *
 * ⚠️ Le roster est reconstruit depuis `participations` (voir getRoster) —
 * pas besoin d'une table `inscriptions` séparée.
 */
export async function castWeekVote(params: {
  parcoursId: string
  localUserId: string
  status: 'yes' | 'no'
  weekKey: string
  identity: UserIdentity
}): Promise<void> {
  const { parcoursId, localUserId, status, weekKey, identity } = params

  const { error } = await supabase.from('participations').upsert(
    {
      parcours_id: parcoursId,
      user_id: null,
      local_user_id: localUserId,
      status,
      week_key: weekKey,
      first_name: identity.firstName,
      last_name: identity.lastName,
    } as ParticipationInsert,
    // Conflit sur (local_user_id, week_key) → changer de parcours
    // remplace le choix précédent au lieu d'ajouter une 2e ligne.
    { onConflict: 'local_user_id,week_key' }
  )

  if (error) throw error
}

// ===== USER PROFILES (PIN cross-device) =====

export async function getUserProfile(localUserId: string): Promise<UserProfile | null> {
  // maybeSingle() : null si le profil n'existe pas encore (première connexion),
  // pas d'erreur 406
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('local_user_id', localUserId)
    .maybeSingle()

  if (error) throw error
  return data || null
}

export async function createUserProfile(profile: UserProfileInsert): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('user_profiles')
    .insert(profile)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateUserProfile(localUserId: string, updates: UserProfileUpdate): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('user_profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('local_user_id', localUserId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function upsertUserProfile(profile: UserProfileInsert): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(profile)
    .select()
    .single()

  if (error) throw error
  return data
}