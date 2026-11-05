/**
 * Edge Function `send-push` — notifications push de HappyRunners.
 *
 * Deux déclencheurs, une seule fonction :
 *
 *   1. **Nouveau message** — webhook Supabase sur `INSERT` dans `messages`
 *      (voir `AGENTS.md`). La fonction vérifie le secret partagé
 *      `x-push-secret`, lit l'auteur, les abonnements et les préférences avec
 *      la clé de service (jamais exposée au navigateur), envoie une
 *      notification à chaque appareil sauf ceux de l'auteur et ceux qui ont
 *      désactivé les messages, puis supprime les abonnements révoqués
 *      (404/410).
 *
 *   2. **Rappel du mardi** — job Supabase Cron qui appelle la fonction avec
 *      `{ "type": "run_reminder" }`. La fonction calcule le mercredi cible,
 *      ne garde que les appareils des personnes **sans réponse** pour cette
 *      semaine et respecte la préférence `run_reminder`.
 *
 * Déploiement : Supabase Dashboard → Edge Functions → Deploy a new function.
 * Secrets : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
 * PUSH_WEBHOOK_SECRET (voir AGENTS.md).
 */

import webpush from 'npm:web-push@3.6.7'
import { Buffer } from 'node:buffer'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

/**
 * Les secrets sont saisis dans un champ qui accepte les retours à la ligne :
 * un simple copier-coller peut donc ajouter `\n` en fin de valeur. Un `\n`
 * dans le `sub` du JWT VAPID fait répondre `403 BadJwtToken` aux serveurs de
 * push (Apple en particulier). On nettoie donc systématiquement.
 */
function cleanSecret(name: string): string {
  return (Deno.env.get(name) ?? '').replace(/\s+/g, '')
}

const VAPID_PUBLIC_KEY = cleanSecret('VAPID_PUBLIC_KEY')
const VAPID_PRIVATE_KEY = cleanSecret('VAPID_PRIVATE_KEY')
const VAPID_SUBJECT = /^(mailto:|https?:\/\/)/i.test(cleanSecret('VAPID_SUBJECT'))
  ? cleanSecret('VAPID_SUBJECT')
  : 'mailto:admin@happyrunners.fr'
const WEBHOOK_SECRET = (Deno.env.get('PUSH_WEBHOOK_SECRET') ?? '').trim()

const REMINDER_TITLE = 'Run de demain'

interface MessageRecord {
  id: string
  user_number: number
  body: string
}

interface PushWebhookPayload {
  type?: string
  table?: string
  record?: MessageRecord
}

interface SubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
  user_number: number
}

interface PreferenceRow {
  user_number: number
  messages?: boolean
  run_reminder?: boolean
}

interface SendResult {
  endpoint: string
  ok: boolean
  status: number
  message?: string
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Comparaison à temps constant : le secret ne doit pas fuir par la durée. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    throw new Error(`REST ${path}: ${response.status} ${await response.text()}`)
  }
  if (response.status === 204) return null as T

  const text = await response.text()
  return (text ? JSON.parse(text) : null) as T
}

/** Début du message, espaces aplatis pour un écran verrouillé. */
function excerpt(body: string, max = 120): string {
  const clean = body.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

/** Hôte seul : l'endpoint complet est long et n'apporte rien. */
function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host
  } catch {
    return 'endpoint inconnu'
  }
}

/** Date et heure murales à Paris, quel que soit le fuseau du serveur. */
function parisParts(now = new Date()): { iso: string; weekday: number; hour: number } {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now)
  )

  // `iso` est une date calendaire : la construire en UTC évite tout décalage.
  const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return { iso, weekday, hour }
}

/**
 * Même règle que `getCurrentWeekKey()` côté client : le run est le mercredi
 * 12h30 et la semaine bascule le mercredi à 14h. Le rappel part le mardi soir,
 * donc la cible est le mercredi du lendemain.
 */
function targetWeekKey(now = new Date()): string {
  const { iso, weekday, hour } = parisParts(now)

  let offset = (3 - weekday + 7) % 7
  if (offset === 0 && hour >= 14) offset = 7

  const target = new Date(`${iso}T00:00:00Z`)
  target.setUTCDate(target.getUTCDate() + offset)
  return target.toISOString().slice(0, 10)
}

/** « 2026-11-11 » → « mercredi 11 novembre ». */
function frenchDate(weekKey: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${weekKey}T12:00:00Z`))
}

/** Envoie la même notification à tous les appareils visés. */
async function sendAll(targets: SubscriptionRow[], notification: string): Promise<SendResult[]> {
  return Promise.all(
    targets.map(async (row): Promise<SendResult> => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          notification,
          { TTL: 60 * 60 * 24 }
        )
        return { endpoint: row.endpoint, ok: true, status: 0 }
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 0
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[PUSH] Échec ${status} vers ${hostOf(row.endpoint)} : ${message}`)
        return { endpoint: row.endpoint, ok: false, status, message }
      }
    })
  )
}

/**
 * 404/410 : l'abonnement n'existe plus côté navigateur. On nettoie pour ne pas
 * retenter indéfiniment à chaque envoi.
 */
async function removeStale(results: SendResult[]): Promise<string[]> {
  const stale = results
    .filter((result) => !result.ok && (result.status === 404 || result.status === 410))
    .map((result) => result.endpoint)

  await Promise.all(
    stale.map((endpoint) =>
      rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
        method: 'DELETE',
      }).catch((err) => console.error('[PUSH] Nettoyage impossible', err))
    )
  )

  return stale
}

/**
 * Diagnostic des clés VAPID quand un envoi échoue. Ne renvoie que des
 * empreintes et des longueurs : jamais une clé complète.
 *
 * `matches` compare la clé publique déduite de la clé privée avec
 * `VAPID_PUBLIC_KEY`. S'il vaut `false`, les deux secrets ne vont pas
 * ensemble (cause classique d'un 403 chez Apple/Google).
 */
async function keyDiagnostics(): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {
    subject: VAPID_SUBJECT,
    pubLen: VAPID_PUBLIC_KEY.length,
    pubPrefix: VAPID_PUBLIC_KEY.slice(0, 10),
    privLen: VAPID_PRIVATE_KEY.length,
  }

  try {
    const { createECDH } = await import('node:crypto')
    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(Buffer.from(VAPID_PRIVATE_KEY, 'base64url'))
    const derived = ecdh.getPublicKey('base64url')
    result.derivedPrefix = derived.slice(0, 10)
    result.matches = derived === VAPID_PUBLIC_KEY
  } catch (err) {
    result.deriveError = err instanceof Error ? err.message : String(err)
  }

  return result
}

function failureShape(results: SendResult[], stale: string[]) {
  const failures = results
    .filter((result) => !result.ok)
    .map((result) => ({
      host: hostOf(result.endpoint),
      status: result.status,
      message: (result.message ?? '').slice(0, 200),
    }))

  return {
    sent: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok && !stale.includes(result.endpoint)).length,
    removed: stale.length,
    failures,
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return json({ error: 'Méthode non autorisée' }, 405)
  }

  if (!WEBHOOK_SECRET || !safeEqual(request.headers.get('x-push-secret') ?? '', WEBHOOK_SECRET)) {
    return json({ error: 'Secret invalide' }, 401)
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return json({ error: 'Clés VAPID manquantes' }, 500)
  }

  let payload: PushWebhookPayload
  try {
    payload = (await request.json()) as PushWebhookPayload
  } catch {
    return json({ error: 'Corps JSON invalide' }, 400)
  }

  let stage = 'vapid'

  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    // ---------------------------------------------------------------------
    // Rappel du mardi : seulement les personnes sans réponse pour la semaine.
    // ---------------------------------------------------------------------
    if (payload.type === 'run_reminder') {
      stage = 'lecture-base'
      const week = targetWeekKey()
      const [attendances, subscriptions, preferences] = await Promise.all([
        rest<Array<{ user_number: number }>>(
          `attendances?week_key=eq.${week}&select=user_number`
        ),
        rest<SubscriptionRow[]>('push_subscriptions?select=endpoint,p256dh,auth,user_number'),
        rest<PreferenceRow[]>('notification_preferences?select=user_number,run_reminder'),
      ])

      const answered = new Set(attendances.map((row) => row.user_number))
      const disabled = new Set(
        preferences.filter((row) => row.run_reminder === false).map((row) => row.user_number)
      )

      const targets = subscriptions.filter(
        (row) => !answered.has(row.user_number) && !disabled.has(row.user_number)
      )

      if (targets.length === 0) {
        return json({ type: 'run_reminder', week, sent: 0, failed: 0, removed: 0, failures: [] })
      }

      const notification = JSON.stringify({
        title: REMINDER_TITLE,
        body: `Tu n’as pas encore répondu pour ${frenchDate(week)} · 12h30. Dis-nous si tu viens !`,
        url: '/',
        tag: `run-reminder-${week}`,
      })

      stage = 'envoi'
      const results = await sendAll(targets, notification)
      stage = 'nettoyage'
      const stale = await removeStale(results)
      const summary = failureShape(results, stale)

      return json({
        type: 'run_reminder',
        week,
        ...summary,
        diagnostics: summary.failures.length > 0 ? await keyDiagnostics() : undefined,
      })
    }

    // ---------------------------------------------------------------------
    // Nouveau message.
    // ---------------------------------------------------------------------
    if (payload.table && payload.table !== 'messages') {
      return json({ skipped: `table ${payload.table} ignorée` })
    }

    const record = payload.record
    if (!record || typeof record.user_number !== 'number' || typeof record.body !== 'string') {
      return json({ error: 'Message incomplet' }, 400)
    }

    stage = 'lecture-base'
    const [authorRows, subscriptions, preferences] = await Promise.all([
      rest<Array<{ first_name: string }>>(
        `user_profiles?user_number=eq.${record.user_number}&select=first_name`
      ),
      rest<SubscriptionRow[]>(
        `push_subscriptions?user_number=neq.${record.user_number}&select=endpoint,p256dh,auth,user_number`
      ),
      rest<PreferenceRow[]>('notification_preferences?select=user_number,messages'),
    ])

    const authorName = authorRows[0]?.first_name?.trim() || 'Quelqu’un'
    const disabled = new Set(
      preferences.filter((row) => row.messages === false).map((row) => row.user_number)
    )

    const targets = subscriptions.filter((row) => !disabled.has(row.user_number))
    if (targets.length === 0) {
      return json({ sent: 0, failed: 0, removed: 0, failures: [] })
    }

    const notification = JSON.stringify({
      title: authorName,
      body: excerpt(record.body),
      url: '/messages',
      tag: `message-${record.id}`,
    })

    stage = 'envoi'
    const results = await sendAll(targets, notification)
    stage = 'nettoyage'
    const stale = await removeStale(results)
    const summary = failureShape(results, stale)

    return json({
      ...summary,
      diagnostics: summary.failures.length > 0 ? await keyDiagnostics() : undefined,
    })
  } catch (err) {
    console.error('[PUSH] Erreur globale:', err)
    // `stage` et `detail` n'exposent aucun secret : ils disent seulement où
    // l'envoi a échoué. Utile quand on n'a pas les logs sous les yeux.
    return json(
      {
        error: 'Envoi impossible',
        stage,
        detail: err instanceof Error ? err.message : String(err),
      },
      500
    )
  }
})
