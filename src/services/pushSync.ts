/**
 * Resynchronisation de l'abonnement push de cet appareil.
 *
 * Un abonnement Web Push peut disparaître sans action de la personne :
 * données de site évincées, application déchargée par iOS, mise à jour du
 * navigateur. La ligne en base reste alors valide côté serveur de push, qui
 * répond encore `201` — mais aucun appareil n'affiche la notification.
 *
 * À chaque ouverture de l'app, on réaligne donc la base sur l'abonnement
 * **réel** du navigateur :
 *
 *   1. abonnement présent → on réécrit ses clés et son propriétaire ;
 *   2. abonnement absent, permission toujours accordée et appareil déjà
 *      abonné pour cette personne → on le recrée sans clic ;
 *   3. sinon → on ne fait rien, l'écran propose l'activation.
 *
 * Le point 2 évite de recréer un abonnement pour un profil qui n'a jamais
 * demandé les notifications sur cet appareil, ou qui vient de les couper.
 */

import {
  getCurrentSubscription,
  isPushConfigured,
  isPushSupported,
  needsInstallForPush,
  permissionState,
  resubscribeToPush,
  toSubscriptionRecord,
  type PushSubscriptionRecord,
} from './push'
import { savePushSubscription } from './supabaseService'
import { currentPushConfig, savePushConfig } from './pushConfigStore'
import {
  getPushDeviceUser,
  isPushOptedOut,
  markPushDeviceUser,
} from './pushDevice'

/**
 * Réaligne la base sur l'abonnement de cet appareil.
 * Retourne l'abonnement synchronisé, ou `null` s'il n'y a rien à faire.
 */
export async function syncDeviceSubscription(
  userNumber: number
): Promise<PushSubscriptionRecord | null> {
  if (!isPushSupported() || !isPushConfigured() || needsInstallForPush()) {
    return null
  }
  if (permissionState() !== 'granted') return null
  if (isPushOptedOut()) return null

  const existing = await getCurrentSubscription()
  let record: PushSubscriptionRecord | null = null

  if (existing) {
    record = toSubscriptionRecord(existing)
  } else if (getPushDeviceUser() === userNumber) {
    // L'abonnement a disparu alors que cet appareil était abonné pour cette
    // personne : la permission est toujours accordée, on le recrée sans clic.
    record = await resubscribeToPush()
  }

  if (!record) return null

  await savePushSubscription(userNumber, record)
  await savePushConfig(currentPushConfig(userNumber))
  markPushDeviceUser(userNumber)
  return record
}
