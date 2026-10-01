import { supabase } from '../lib/supabase'
import type {
  Parcours,
  ParcoursInsert,
  Participation,
  ParticipationInsert,
  GPXPoint,
  UserProfile,
  UserProfileInsert,
  UserProfileUpdate,
} from '../types/supabase'

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

// ===== PARTICIPATIONS (VOTES) =====

export async function getParticipations(parcoursId?: string): Promise<Participation[]> {
  let query = supabase.from('participations').select('*')
  if (parcoursId) {
    query = query.eq('parcours_id', parcoursId)
  }
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function getMyVote(parcoursId: string, localUserId: string): Promise<'yes' | 'no' | null> {
  // maybeSingle() retourne null au lieu de lever PGRST116 quand aucun vote existe.
  // .single() provoquerait un 406 "Not Acceptable" inutile dans la console.
  const { data, error } = await supabase
    .from('participations')
    .select('status')
    .eq('parcours_id', parcoursId)
    .eq('local_user_id', localUserId)
    .maybeSingle()

  if (error) throw error
  return (data?.status as 'yes' | 'no' | undefined) ?? null
}

export async function vote(parcoursId: string, localUserId: string, status: 'yes' | 'no'): Promise<Participation> {
  const { data, error } = await supabase
    .from('participations')
    .upsert({
      parcours_id: parcoursId,
      user_id: null,
      local_user_id: localUserId,
      status,
    } as ParticipationInsert, {
      onConflict: 'parcours_id,local_user_id',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getParticipationCounts(parcoursId: string): Promise<{ yes: number; no: number }> {
  const { data, error } = await supabase
    .from('participations')
    .select('status')
    .eq('parcours_id', parcoursId)

  if (error) throw error

  const yes = data?.filter(p => p.status === 'yes').length || 0
  const no = data?.filter(p => p.status === 'no').length || 0
  return { yes, no }
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