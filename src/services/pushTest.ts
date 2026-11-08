/**
 * Envoi d'une notification de test vers l'appareil courant.
 *
 * Le navigateur ne peut pas signer un envoi Web Push (la clé privée VAPID
 * reste côté serveur). On appelle donc l'Edge Function `send-push` en mode
 * `test`, qui ne renvoie qu'à l'abonnement désigné.
 *
 * L'authentification est une **capacité** : il faut connaître l'endpoint et
 * les clés de l'abonnement, qui ne sont pas devinables. La RLS du projet est
 * ouverte par conception (voir AGENTS.md) ; le pire usage possible est
 * d'envoyer une notification de test à un appareil dont on connaît déjà
 * l'abonnement. Aucun secret serveur ne transite ici.
 */

import type { PushSubscriptionRecord } from './push'

export interface TestPushResult {
  sent: number
  failed: number
  removed: number
}

export async function sendTestPush(
  record: PushSubscriptionRecord
): Promise<TestPushResult> {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Notifications non configurées sur cette installation')
  }

  const base = url.replace(/\/+$/, '')
  const response = await fetch(`${base}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({
      type: 'test',
      endpoint: record.endpoint,
      p256dh: record.p256dh,
      auth: record.auth,
    }),
  })

  const data = (await response.json().catch(() => null)) as
    | (TestPushResult & { error?: string })
    | null

  if (!response.ok) {
    throw new Error(data?.error ?? `Envoi impossible (${response.status})`)
  }
  if (!data || data.sent !== 1) {
    throw new Error('Le service de push n’a pas accepté l’envoi.')
  }

  return data
}
