/**
 * Edge Function `ingest` — réception des sorties envoyées par le téléphone.
 *
 * Le téléphone pousse, l'application reçoit. Une petite application de santé
 * (Health Connect Webhook sur Android, Health Webhook ou un Raccourci sur
 * iPhone) lit les séances d'entraînement du téléphone et poste son JSON ici,
 * sur une adresse personnelle :
 *
 *   POST https://<ref>.supabase.co/functions/v1/ingest?t=<jeton>
 *
 * La fonction ne fait qu'une chose : vérifier le jeton, puis déposer ce que la
 * montre a proposé dans `import_proposals`. **Elle n'écrit jamais dans
 * `weekly_runs`.** La personne valide dans l'historique : la synchro propose,
 * la personne décide.
 *
 * Sécurité :
 *   - On ne stocke que l'empreinte SHA-256 du jeton ; la fonction recalcule
 *     l'empreinte et compare. Le jeton en clair n'est jamais conservé.
 *   - La clé de service ne quitte pas la fonction (le navigateur ne l'a pas).
 *   - La vérification JWT doit être DÉSACTIVÉE au déploiement : le téléphone
 *     n'a pas de JWT Supabase. L'authentification, c'est le jeton.
 *
 * Payload attendu (Health Connect Webhook / Health Webhook) :
 *
 *   {
 *     "timestamp": "2026-11-17T18:00:00Z",
 *     "exercise_sessions": [
 *       {
 *         "type": "RUNNING",
 *         "start_time": "2026-11-17T17:00:00Z",
 *         "end_time": "2026-11-17T18:00:00Z",
 *         "duration_seconds": 3600,
 *         "distance_meters": 8200
 *       }
 *     ]
 *   }
 *
 * Un tableau nu, ou un objet séance seul, sont aussi acceptés : les
 * applications changent de forme et une synchronisation ne doit pas être
 * perdue pour une enveloppe différente.
 *
 * Déploiement : Supabase Dashboard → Edge Functions → Deploy a new function →
 * éditeur, nom `ingest`, coller ce fichier, **désactiver la vérification JWT**.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

/** Au-delà, c'est une erreur d'application, pas une séance de course. */
const MAX_BODY_BYTES = 64 * 1024

/** Les propositions non traitées disparaissent au bout de trois mois. */
const PROPOSAL_RETENTION_DAYS = 90

/** Un type de séance qui n'est pas de la course est ignoré. */
const RUNNING_TYPES = new Set([
  'RUNNING',
  'RUN',
  'TRAIL_RUNNING',
  'TRAIL_RUN',
  'TREADMILL_RUN',
  'TREADMILL_RUNNING',
  'RUNNING_TREADMILL',
  'JOGGING',
])

interface SessionPayload {
  type?: unknown
  start_time?: unknown
  end_time?: unknown
  duration_seconds?: unknown
  distance_meters?: unknown
}

interface ProposalRow {
  user_number: number
  source: 'health'
  external_id: string
  activity_type: string
  started_at: string
  duration_s: number | null
  distance_m: number
}

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

/** SHA-256 en hexadécimal, identique à `hashWatchToken` côté client. */
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function asIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

/** Accepte l'enveloppe, un tableau nu, ou une séance seule. */
function extractSessions(body: unknown): SessionPayload[] {
  if (Array.isArray(body)) return body as SessionPayload[]
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>
    const list = record.exercise_sessions ?? record.exerciseSessions ?? record.workouts
    if (Array.isArray(list)) return list as SessionPayload[]
    if (list && typeof list === 'object') return [list as SessionPayload]
    // Une séance seule, sans enveloppe.
    if (record.start_time || record.startTime) return [record as SessionPayload]
  }
  return []
}

function toProposal(
  userNumber: number,
  session: SessionPayload
): ProposalRow | null {
  const startedAt = asIsoDate(session.start_time ?? (session as Record<string, unknown>).startTime)
  if (startedAt === null) return null

  const rawType = String(
    session.type ?? (session as Record<string, unknown>).activity_type ?? 'RUNNING'
  ).toUpperCase()
  if (!RUNNING_TYPES.has(rawType)) return null

  const distance = asNumber(session.distance_meters ?? (session as Record<string, unknown>).distance)
  // Sans distance, la proposition n'apporte rien : la personne connaît déjà
  // sa sortie, et on n'invente jamais un chiffre. Zéro n'est pas une distance
  // non plus.
  if (distance === null || distance <= 0) return null

  const explicitDuration = asNumber(session.duration_seconds)
  const endedAt = asIsoDate(session.end_time)
  const computedDuration =
    explicitDuration ??
    (endedAt ? Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000) : null)

  return {
    user_number: userNumber,
    source: 'health',
    external_id: startedAt,
    activity_type: rawType,
    started_at: startedAt,
    duration_s:
      computedDuration !== null && computedDuration >= 0
        ? Math.round(computedDuration)
        : null,
    distance_m: Math.round(distance),
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: JSON_HEADERS })
  }
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405)
  }

  const url = new URL(request.url)
  const token = (url.searchParams.get('t') ?? request.headers.get('x-watch-token') ?? '').trim()
  if (token === '') {
    return json({ ok: false, error: 'missing_token' }, 401)
  }

  const rawBody = await request.text()
  if (rawBody.length > MAX_BODY_BYTES) {
    return json({ ok: false, error: 'payload_too_large' }, 413)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  const sessions = extractSessions(parsed)
  if (sessions.length === 0) {
    // Une synchronisation sans séance n'est pas une erreur : le téléphone
    // poste aussi des jours sans course.
    return json({ ok: true, inserted: 0, skipped: 0 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data: link, error: linkError } = await supabase
    .from('device_links')
    .select('id, user_number')
    .eq('token_hash', await sha256Hex(token))
    .maybeSingle()

  if (linkError) {
    console.error('[INGEST] Lecture du lien impossible:', linkError.message)
    return json({ ok: false, error: 'lookup_failed' }, 500)
  }
  if (!link) {
    // 404 plutôt que 401 : un jeton inconnu ne doit pas confirmer qu'il a
    // existé un jour.
    return json({ ok: false, error: 'unknown_token' }, 404)
  }

  const rows: ProposalRow[] = []
  for (const session of sessions) {
    const proposal = toProposal(link.user_number as number, session)
    if (proposal) rows.push(proposal)
  }

  if (rows.length === 0) {
    return json({ ok: true, inserted: 0, skipped: sessions.length })
  }

  const { data: inserted, error: insertError } = await supabase
    .from('import_proposals')
    .upsert(rows, {
      onConflict: 'user_number,external_id',
      ignoreDuplicates: true,
    })
    .select('id')

  if (insertError) {
    console.error('[INGEST] Insertion impossible:', insertError.message)
    return json({ ok: false, error: 'insert_failed' }, 500)
  }

  const insertedCount = inserted?.length ?? 0

  // Marque le lien comme vivant : l'écran « Montre » peut dire « dernière
  // synchronisation il y a 2 minutes » au lieu de laisser deviner.
  const { error: touchError } = await supabase
    .from('device_links')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', link.id)
  if (touchError) {
    console.warn('[INGEST] last_seen_at non mis à jour:', touchError.message)
  }

  // Ménage opportuniste : les propositions anciennes n'intéressent plus
  // personne, et une synchronisation par jour suffit à les faire disparaître.
  const cutoff = new Date(
    Date.now() - PROPOSAL_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()
  const { error: pruneError } = await supabase
    .from('import_proposals')
    .delete()
    .eq('user_number', link.user_number)
    .lt('created_at', cutoff)
  if (pruneError) {
    console.warn('[INGEST] Purge des propositions:', pruneError.message)
  }

  return json({
    ok: true,
    inserted: insertedCount,
    skipped: sessions.length - insertedCount,
  })
})
