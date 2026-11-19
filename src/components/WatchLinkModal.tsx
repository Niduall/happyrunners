import { useEffect, useState } from 'react'
import { Check, Copy, Link2, Smartphone, Trash2 } from 'lucide-react'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { copyText } from '../lib/clipboard'
import {
  buildWatchIngestUrl,
  clearStoredWatchToken,
  generateWatchToken,
  hashWatchToken,
  readStoredWatchToken,
  storeWatchToken,
} from '../services/watchLink'
import {
  deleteDeviceLinks,
  getDeviceLink,
  saveDeviceLink,
} from '../services/supabaseService'
import type { DeviceLink } from '../types/supabase'

/**
 * « Montre et applications » — le lien qui permet au téléphone de proposer
 * une sortie.
 *
 * Le lien ne peut **que proposer** : la sortie n'entre dans l'historique
 * qu'après un clic sur « Valider ». C'est la règle du projet, et l'écran le
 * dit pour que personne ne croie à une synchronisation silencieuse.
 */
export function WatchLinkModal({
  userNumber,
  onClose,
}: {
  userNumber: number
  onClose: () => void
}) {
  const [link, setLink] = useState<DeviceLink | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getDeviceLink(userNumber)
      .then((found) => {
        if (cancelled) return
        setLink(found)
        setToken(found ? readStoredWatchToken(userNumber) : null)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[MONTRE] Lecture du lien impossible:', err)
        setError('Impossible de lire le lien pour le moment.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userNumber])

  // Échap ferme la modale, sauf pendant une écriture.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const ingestUrl = token ? buildWatchIngestUrl(token) : null

  const createLink = async () => {
    setBusy(true)
    setError('')
    setCopied(false)
    try {
      const fresh = generateWatchToken()
      const saved = await saveDeviceLink(
        userNumber,
        await hashWatchToken(fresh)
      )
      storeWatchToken(userNumber, fresh)
      setToken(fresh)
      setLink(saved)
    } catch (err) {
      console.error('[MONTRE] Création du lien impossible:', err)
      setError('Création impossible. Réessaie dans un instant.')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    setError('')
    try {
      await deleteDeviceLinks(userNumber)
      clearStoredWatchToken(userNumber)
      setToken(null)
      setLink(null)
      setConfirmDisconnect(false)
    } catch (err) {
      console.error('[MONTRE] Déconnexion impossible:', err)
      setError('Déconnexion impossible. Réessaie dans un instant.')
    } finally {
      setBusy(false)
    }
  }

  const copyAddress = async () => {
    if (!ingestUrl) return
    try {
      await copyText(ingestUrl)
      setCopied(true)
    } catch {
      setError('Copie impossible : sélectionne l’adresse à la main.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="watch-link-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-lg bg-white p-6">
        <div>
          <h3
            id="watch-link-title"
            className="text-lg font-semibold text-gray-900"
          >
            Montre et applications
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Ta montre propose ta sortie, tu la valides. Rien n’entre dans
            l’historique sans ton accord.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-6">
            <div
              role="status"
              aria-label="Chargement du lien"
              className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"
            />
          </div>
        ) : ingestUrl ? (
          <>
            <div>
              <label
                htmlFor="watch-ingest-url"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Adresse à coller dans l’application de santé
              </label>
              <div className="flex gap-2">
                <Input
                  id="watch-ingest-url"
                  readOnly
                  value={ingestUrl}
                  onFocus={(event) => event.currentTarget.select()}
                  className="font-mono text-xs"
                />
                <Button
                  size="sm"
                  onClick={() => void copyAddress()}
                  className="shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  )}
                  {copied ? 'Copié' : 'Copier'}
                </Button>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Cette adresse est personnelle. Ne la partage pas : elle permet
                d’écrire des sorties sur ton profil.
              </p>
            </div>

            <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                <Smartphone className="h-4 w-4" aria-hidden="true" />
                La marche à suivre
              </p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-600">
                <li>
                  Vérifie que ta montre écrit dans le carnet de santé du
                  téléphone : <strong>Apple Santé</strong> sur iPhone,{' '}
                  <strong>Health Connect</strong> sur Android (Garmin Connect →
                  Réglages).
                </li>
                <li>
                  Installe <strong>Health Webhook</strong> (iPhone) ou{' '}
                  <strong>Health Connect Webhook</strong> (Android), puis
                  autorise l’accès aux séances d’entraînement.
                </li>
                <li>Colle l’adresse ci-dessus comme destination.</li>
              </ol>
              <p className="text-xs text-gray-500">
                Ensuite, la montre propose et l’application te demande de
                valider, une fois par semaine. Seules les sorties du mercredi
                sont proposées : c’est le jour du groupe.
              </p>
            </div>

            <p className="text-xs text-gray-500">
              {link?.last_seen_at
                ? `Dernière réception : ${new Date(
                    link.last_seen_at
                  ).toLocaleString('fr-FR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}`
                : 'Aucune réception pour le moment.'}
            </p>
          </>
        ) : link ? (
          <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="flex items-center gap-1.5 text-sm text-gray-700">
              <Link2 className="h-4 w-4" aria-hidden="true" />
              Un lien existe, mais cet appareil n’a pas gardé son adresse.
            </p>
            <Button size="sm" onClick={() => void createLink()} disabled={busy}>
              {busy ? 'Création...' : 'Créer une nouvelle adresse'}
            </Button>
            <p className="text-xs text-gray-500">
              L’ancienne adresse cessera de fonctionner.
            </p>
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm text-gray-700">
              Aucune montre liée. Tu peux continuer à déclarer ta sortie à la
              main : c’est simplement plus rapide avec un lien.
            </p>
            <Button size="sm" onClick={() => void createLink()} disabled={busy}>
              {busy ? 'Création...' : 'Créer mon adresse'}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
          {link ? (
            confirmDisconnect ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-700">
                  Déconnecter la montre ?
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDisconnect(false)}
                  disabled={busy}
                >
                  Annuler
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => void disconnect()}
                  disabled={busy}
                >
                  {busy ? 'Déconnexion...' : 'Déconnecter'}
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDisconnect(true)}
                disabled={busy}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Déconnecter
              </Button>
            )
          ) : (
            <span />
          )}
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Fermer
          </Button>
        </div>
      </div>
    </div>
  )
}
