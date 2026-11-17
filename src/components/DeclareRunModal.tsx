import { useEffect, useState, type ChangeEvent } from 'react'
import { Upload } from 'lucide-react'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { parseGPX } from '../services/gpxParser'
import { formatElevation, formatKm } from '../services/history'
import type { RunChoice } from '../hooks/useHistory'
import type { ParcoursSummary } from '../types/supabase'

const OTHER = 'other'

/**
 * Ce qu'un GPX apporte à une sortie « autre » : la distance et le D+.
 * Le tracé n'est pas conservé — la table n'a pas de colonne pour lui.
 */
interface ImportedRun {
  distanceKm: number
  elevationGainM: number | null
}

/**
 * Ce dont la modale a besoin : la date, la sortie déjà déclarée et l'indice
 * du vote. Volontairement plus étroit que `HistoryWeek`, pour que l'accueil
 * puisse l'ouvrir sans reconstruire une semaine complète.
 */
export interface DeclareRunTarget {
  weekKey: string
  /** « Mercredi 5 novembre » */
  dateLabel: string
  myRun: {
    parcoursId: string | null
    parcoursName: string
    distanceKm?: number | null
    elevationGainM?: number | null
  } | null
  /** Parcours le plus voté, s'il y en a un */
  votedParcoursId: string | null
}

interface DeclareRunModalProps {
  week: DeclareRunTarget
  parcours: ParcoursSummary[]
  saving: boolean
  onDeclare: (choice: RunChoice) => Promise<boolean>
  /** Absent sur l'accueil : on n'y corrige pas une sortie déjà déclarée. */
  onRetract?: () => Promise<boolean>
  onClose: () => void
}

/**
 * Déclaration de la sortie réellement courue par la personne connectée.
 *
 * Chacun ne renseigne que la sienne. La liste propose les parcours enregistrés,
 * plus « Autre » pour une sortie improvisée. La distance et le dénivelé du
 * parcours choisi sont figés au moment de l'enregistrement.
 */
export function DeclareRunModal({
  week,
  parcours,
  saving,
  onDeclare,
  onRetract,
  onClose,
}: DeclareRunModalProps) {
  const mine = week.myRun
  const myParcoursExists =
    mine?.parcoursId != null &&
    parcours.some((item) => item.id === mine.parcoursId)

  const votedParcoursExists =
    week.votedParcoursId != null &&
    parcours.some((item) => item.id === week.votedParcoursId)

  const [selected, setSelected] = useState<string>(() => {
    if (myParcoursExists) return mine!.parcoursId as string
    if (mine) return OTHER
    // Le vote est le meilleur indice : sans lui, on ne présélectionne rien.
    // Partir du premier parcours de la liste ferait enregistrer un choix
    // arbitraire d'un seul clic — inacceptable pour une ligue.
    if (votedParcoursExists) return week.votedParcoursId as string
    return ''
  })
  const [otherLabel, setOtherLabel] = useState(() =>
    mine && !myParcoursExists ? mine.parcoursName : ''
  )
  const [formError, setFormError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [confirmRetract, setConfirmRetract] = useState(false)
  /**
   * Distance et D+ lus dans un fichier GPX, pour une sortie « autre ».
   * `null` = aucun fichier : la sortie reste sans distance.
   *
   * Une correction repart de l'import déjà enregistré : sans ça, rouvrir la
   * modale pour renommer la sortie effacerait ses kilomètres.
   */
  const [imported, setImported] = useState<ImportedRun | null>(() => {
    if (!mine || myParcoursExists || mine.distanceKm == null) return null
    return {
      distanceKm: mine.distanceKm,
      elevationGainM: mine.elevationGainM ?? null,
    }
  })
  const [importName, setImportName] = useState('')
  const [gpxError, setGpxError] = useState('')

  // Échap ferme la modale, sauf pendant l'écriture.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saving, onClose])

  const choose = (value: string) => {
    setSelected(value)
    setFormError('')
    setSubmitError('')
  }

  /**
   * Lit le fichier et garde ses chiffres.
   *
   * Un fichier refusé ne touche pas à l'import en place : si on remplaçait un
   * GPX valide par un fichier illisible, les kilomètres déjà lus ne doivent pas
   * disparaître. Le message dit la conséquence : sans chiffres, la distance
   * n'est pas comptée.
   */
  const handleGpx = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const file = input.files?.[0]
    if (!file) return

    setGpxError('')
    setFormError('')
    setSubmitError('')
    try {
      const parsed = parseGPX(await file.text())
      if (!parsed || !(parsed.distance_km > 0)) {
        setGpxError(
          imported
            ? 'Ce fichier ne contient pas de tracé lisible : l’import précédent est conservé.'
            : 'Ce fichier ne contient pas de tracé lisible : la distance ne sera pas comptée.'
        )
        return
      }
      setImported({
        distanceKm: parsed.distance_km,
        elevationGainM: parsed.elevation_gain_m ?? null,
      })
      setImportName(file.name)
    } catch {
      setGpxError('Lecture du fichier impossible : la distance ne sera pas comptée.')
    } finally {
      input.value = ''
    }
  }

  const clearImport = () => {
    setImported(null)
    setImportName('')
    setGpxError('')
  }

  const handleRetract = async () => {
    if (!onRetract) return
    setSubmitError('')
    const ok = await onRetract()
    if (!ok) setSubmitError('Retrait impossible. Réessaie.')
  }

  const handleSubmit = async () => {
    setSubmitError('')

    if (selected === '') {
      setFormError('Choisis ton parcours')
      return
    }

    if (selected === OTHER) {
      const label = otherLabel.trim()
      if (!label) {
        setFormError('Indique le nom du parcours')
        return
      }
      const ok = await onDeclare({
        parcoursId: null,
        parcoursName: label,
        distanceKm: imported?.distanceKm ?? null,
        elevationGainM: imported?.elevationGainM ?? null,
        source: imported ? 'gpx' : 'manual',
      })
      if (!ok) setSubmitError('Enregistrement impossible. Réessaie.')
      return
    }

    const chosen = parcours.find((item) => item.id === selected)
    if (!chosen) {
      setFormError('Choisis un parcours')
      return
    }
    const ok = await onDeclare({
      parcoursId: chosen.id,
      parcoursName: chosen.name,
      distanceKm: chosen.distance_km ?? null,
      elevationGainM: chosen.elevation_gain_m ?? null,
    })
    if (!ok) setSubmitError('Enregistrement impossible. Réessaie.')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="declare-run-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 space-y-4">
        <div>
          <h3
            id="declare-run-title"
            className="text-lg font-semibold text-gray-900"
          >
            Mon parcours
          </h3>
          <p className="mt-1 text-sm text-gray-500">{week.dateLabel}</p>
        </div>

        <p className="text-sm text-gray-600">
          Indique le parcours que tu as réellement couru. Tu pourras le
          corriger jusqu’au mercredi suivant, 14h.
        </p>

        {(formError || submitError) && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {formError || submitError}
          </div>
        )}

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium text-gray-700">
            Choisis ton parcours
          </legend>

          {parcours.map((item) => (
            <label
              key={item.id}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50"
            >
              <input
                type="radio"
                name="parcours-couru"
                value={item.id}
                checked={selected === item.id}
                onChange={() => choose(item.id)}
                className="h-4 w-4 shrink-0 accent-primary"
              />
              <span className="min-w-0 flex-1 text-sm text-gray-900">
                {item.name}
              </span>
              {item.distance_km > 0 && (
                <span className="shrink-0 text-xs text-gray-500">
                  {String(item.distance_km).replace('.', ',')} km
                </span>
              )}
            </label>
          ))}

          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50">
            <input
              type="radio"
              name="parcours-couru"
              value={OTHER}
              checked={selected === OTHER}
              onChange={() => choose(OTHER)}
              className="h-4 w-4 shrink-0 accent-primary"
            />
            <span className="text-sm text-gray-900">
              Autre parcours (non enregistré)
            </span>
          </label>
        </fieldset>

        {selected === OTHER && (
          <div>
            <label
              htmlFor="history-other-label"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Nom du parcours
            </label>
            <Input
              id="history-other-label"
              type="text"
              value={otherLabel}
              onChange={(event) => {
                setOtherLabel(event.target.value)
                setFormError('')
                setSubmitError('')
              }}
              placeholder="Ex. : boucle du parc"
              maxLength={80}
              autoFocus
            />
            <div className="mt-3">
              <input
                type="file"
                accept=".gpx,.json"
                onChange={handleGpx}
                className="sr-only"
                id="history-other-gpx"
                aria-label="Joindre un fichier GPX"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() =>
                    document.getElementById('history-other-gpx')?.click()
                  }
                >
                  <Upload className="h-4 w-4" />
                  {imported ? 'Changer le GPX' : 'Joindre un GPX'}
                </Button>
                {imported && (
                  <Button variant="ghost" size="sm" onClick={clearImport}>
                    Retirer le GPX
                  </Button>
                )}
              </div>

              {imported ? (
                <p className="mt-2 text-sm text-gray-700">
                  {formatKm(imported.distanceKm)}
                  {imported.elevationGainM != null &&
                  imported.elevationGainM > 0
                    ? ` · ${formatElevation(imported.elevationGainM)} D+`
                    : ''}
                  {importName && (
                    <span className="text-gray-500"> — {importName}</span>
                  )}
                </p>
              ) : (
                <p className="mt-2 text-xs text-gray-500">
                  Facultatif. Sans GPX, la distance ne sera pas comptée.
                </p>
              )}

              {gpxError && (
                <p role="alert" className="mt-2 text-sm text-red-700">
                  {gpxError}
                </p>
              )}
            </div>
          </div>
        )}

        {week.myRun &&
          onRetract &&
          (confirmRetract ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700">
                Retirer ta sortie du {week.dateLabel.toLowerCase()} ? Elle ne
                comptera plus dans tes statistiques.
              </p>
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmRetract(false)}
                  disabled={saving}
                >
                  Annuler
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => void handleRetract()}
                  disabled={saving}
                >
                  {saving ? 'Retrait...' : 'Retirer'}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Button
                variant="ghost"
                size="sm"
                className="text-error hover:bg-red-50"
                onClick={() => setConfirmRetract(true)}
                disabled={saving}
              >
                Retirer ma sortie
              </Button>
            </div>
          ))}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={saving || selected === ''}
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </div>
  )
}
