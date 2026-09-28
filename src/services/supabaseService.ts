import { supabase } from '../lib/supabase'
import type {
  Parcours,
  ParcoursInsert,
  Participation,
  ParticipationInsert,
  Profile,
  GPXPoint,
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
  const { data, error } = await supabase
    .from('parcours')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') throw error
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

// Temps réel : écoute les changements sur la table parcours
export function subscribeToParcours(
  callback: (parcours: Parcours[]) => void
): () => void {
  const channel = supabase
    .channel('parcours-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'parcours' },
      async () => {
        const { data } = await supabase
          .from('parcours')
          .select('*')
          .order('created_at', { ascending: false })
        callback(data || [])
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
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
  const { data, error } = await supabase
    .from('participations')
    .select('status')
    .eq('parcours_id', parcoursId)
    .eq('local_user_id', localUserId)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data?.status || null
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

// Temps réel : écoute les changements sur les participations d'un parcours
export function subscribeToParticipations(
  parcoursId: string,
  callback: (participations: Participation[]) => void
): () => void {
  const channel = supabase
    .channel(`participations-${parcoursId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'participations', filter: `parcours_id=eq.${parcoursId}` },
      async () => {
        const { data } = await supabase
          .from('participations')
          .select('*')
          .eq('parcours_id', parcoursId)
        callback(data || [])
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

// ===== PROFIL UTILISATEUR =====

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data || null
}

export async function updateProfile(userId: string, name: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function ensureProfile(userId: string, name: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId, name, updated_at: new Date().toISOString() })
    .select()
    .single()

  if (error) throw error
  return data
}

// ===== AUTH =====

export async function signInWithEmail(email: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.auth.signInWithOtp({ email })
  return { error }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

export function onAuthStateChange(callback: (session: any) => void) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })
  return () => subscription.unsubscribe()
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function getUser() {
  const { data } = await supabase.auth.getUser()
  return data.user
}