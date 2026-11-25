import { CloudOff } from 'lucide-react'
import { useOfflineStatus } from '../hooks/useOfflineStatus'

/** « 2026-11-23T07:42 » → « lundi 23 novembre à 7h42 » */
function formatSnapshotDate(at: number): string {
  const date = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(at))

  const time = new Intl.DateTimeFormat('fr-FR', {
    hour: 'numeric',
    minute: '2-digit',
  })
    .format(new Date(at))
    .replace(':', 'h')

  return `${date} à ${time}`
}

/**
 * Bandeau du mode hors ligne.
 *
 * Il n'apparaît **que** quand le navigateur se sait déconnecté. Une erreur
 * serveur reste une erreur : on ne l'habille pas en « hors ligne ».
 *
 * La date affichée est celle du plus ancien instantané servi, pas celle du
 * dernier essai réseau : c'est l'âge des données qu'on regarde.
 */
export function OfflineBanner() {
  const { online, oldestAt } = useOfflineStatus()

  if (online) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        <strong className="font-semibold">Hors ligne.</strong>{' '}
        {oldestAt === null
          ? 'Aucune donnée enregistrée sur cet appareil.'
          : `Dernières données du ${formatSnapshotDate(oldestAt)}.`}
      </span>
    </div>
  )
}
