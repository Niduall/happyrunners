import { useSyncExternalStore } from 'react'
import {
  getOfflineStatus,
  subscribeOfflineStatus,
  type OfflineStatus,
} from '../services/offlineStore'

/**
 * État de connexion et âge des données affichées.
 *
 * `useSyncExternalStore` plutôt qu'un `useState` + effet : le store est un
 * module partagé, et plusieurs composants doivent voir la même valeur au même
 * instant sans se copier l'état.
 */
export function useOfflineStatus(): OfflineStatus {
  return useSyncExternalStore(
    subscribeOfflineStatus,
    getOfflineStatus,
    getOfflineStatus
  )
}
