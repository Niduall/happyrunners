import { useEffect, useState, type ChangeEvent } from 'react'
import { Upload } from 'lucide-react'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { parseGPX } from '../services/gpxParser'
import type { RunChoice } from '../hooks/useHistory'
import type { ParcoursSummary, WeeklyRunSource } from '../types/supabase'

const OTHER = 'other'

/** Bornes de saisie : au-delà, c'est une faute de frappe, pas une sortie. */
const MAX_DISTANCE_KM = 500
const MAX_ELEVATION_M = 20_000

/**
 * Ce qu'un GPX apporte à une sortie « autre » : la distance et le D+.
 * Le tracé n'est pas conservé — la table n'a pas de colonne pour lui.
 *
 * Les chiffres restent modifiables après l'import : le fichier pré-remplit
 * les champs, il ne les verrouille pas.
 */
interface ImportedRun {
  distanceKm: number
  elevationGainM: number | null
  name: string
}

/**
 * « 8,4 » ou « 8.4 » → 8,4. Une chaîne vide vaut `null` (non renseigné) ;
 * tout le reste est refusé plutôt que deviné.
 */
function parseNumber(text: string, max: number): number | null | 'invalid' {
  const clean = text.trim().replace(',', '.')
  if (clean === '') return null
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return 'invalid'
  const value = Number(clean)
  return value > max ? 'invalid' : value
}

/** Valeur d'un champ : virgule française, deux décimales au plus. */
function inputValue(value: number | null | undefined): string {
  if (value == null) return ''
  return String(Math.round(value * 100) / 100).replace('.', ',')
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
    source?: WeeklyRunSource
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
   * Distance et D+ d'une sortie « autre », saisis à la main ou pré-remplis
   * par un GPX. `null` (champ vide) = valeur inconnue : on ne compte que le
   * connu, jamais un chiffre inventé.
   *
   * Une correction repart des chiffres déjà enregistrés : sans ça, rouvrir la
   * modale pour renommer la sortie effacerait ses kilomètres.
   */
  const [distance, setDistance] = useState(() =>
    mine && !myParcoursExists ? inputValue(mine.distanceKm) : ''
  )
  const [elevation, setElevation] = useState(() =>
    mine && !myParcoursExists ? inputValue(mine.elevationGainM) : ''
  )
  /** Le fichier lu dans cette ouverture, s'il y en a un. */
  const [imported, setImported] = useState<ImportedRun | null>(null)
  const [gpxError, setGpxError] = useState('')
  const hasNumbers = distance.trim() !== '' || elevation.trim() !== ''

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
   * Lit le fichier et **pré-remplit** les champs, sans les verrouiller.
   *
   * Un fichier refusé ne touche pas aux chiffres déjà saisis : si on
   * remplaçait un GPX valide par un fichier illisible, les kilomètres déjà
   * lus ne doivent pas disparaître. Le message dit quoi faire ensuite.
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
          hasNumbers
            ? 'Ce fichier ne contient pas de tracé lisible : les chiffres saisis sont conservés.'
            : 'Ce fichier ne contient pas de tracé lisible : indique la distance à la main.'
        )
        return
      }
      const distanceKm = Math.round(parsed.distance_km * 100) / 100
      const elevationGainM =
        parsed.elevation_gain_m == null
          ? null
          : Math.round(parsed.elevation_gain_m)
      setDistance(inputValue(distanceKm))
      setElevation(inputValue(elevationGainM))
      setImported({ distanceKm, elevationGainM, name: file.name })
    } catch {
      setGpxError(
        hasNumbers
          ? 'Lecture du fichier impossible : les chiffres saisis sont conservés.'
          : 'Lecture du fichier impossible : indique la distance à la main.'
      )
    } finally {
      input.value = ''
    }
  }

  /**
   * `gpx` seulement si les chiffres viennent encore du fichier. Corriger une
   * valeur à la main en fait une saisie manuelle ; corriger le **nom** d'une
   * sortie déjà importée garde sa provenance.
   */
  const sourceFor = (
    distanceKm: number | null,
    elevationGainM: number | null
  ): WeeklyRunSource => {
    if (
      imported &&
      imported.distanceKm === distanceKm &&
      imported.elevationGainM === elevationGainM
    ) {
      return 'gpx'
    }
    if (
      mine?.source === 'gpx' &&
      (mine.distanceKm ?? null) === distanceKm &&
      (mine.elevationGainM ?? null) === elevationGainM
    ) {
      return 'gpx'
    }
    return 'manual'
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

      const distanceKm = parseNumber(distance, MAX_DISTANCE_KM)
      if (distanceKm === 'invalid') {
        setFormError('Indique une distance en kilomètres (ex. : 8,4)')
        return
      }
      const parsedElevation = parseNumber(elevation, MAX_ELEVATION_M)
      if (parsedElevation === 'invalid') {
        setFormError('Indique un dénivelé en mètres (ex. : 120)')
        return
      }
      const elevationGainM =
        parsedElevation == null ? null : Math.round(parsedElevation)

      const ok = await onDeclare({
        parcoursId: null,
        parcoursName: label,
        distanceKm,
        elevationGainM,
        source: sourceFor(distanceKm, elevationGainM),
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
          <div className="space-y-3">
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
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="history-other-distance"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Distance (km)
                </label>
                <Input
                  id="history-other-distance"
                  type="text"
                  inputMode="decimal"
                  value={distance}
                  onChange={(event) => {
                    setDistance(event.target.value)
                    setFormError('')
                    setSubmitError('')
                  }}
                  placeholder="8,4"
                />
              </div>
              <div>
                <label
                  htmlFor="history-other-elevation"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Dénivelé (m)
                </label>
                <Input
                  id="history-other-elevation"
                  type="text"
                  inputMode="numeric"
                  value={elevation}
                  onChange={(event) => {
                    setElevation(event.target.value)
                    setFormError('')
                    setSubmitError('')
                  }}
                  placeholder="120"
                />
              </div>
            </div>

            <p className="text-xs text-gray-500">
              Facultatif. Sans distance, la sortie compte comme sortie mais
              n’ajoute pas de kilomètres.
            </p>

            <div>
              <input
                type="file"
                accept=".gpx,.json"
                onChange={handleGpx}
                className="sr-only"
                id="history-other-gpx"
                aria-label="Joindre un fichier GPX"
              />
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

              {imported ? (
                <p className="mt-2 text-sm text-gray-700">
                  Chiffres lus dans{' '}
                  <span className="text-gray-500">{imported.name}</span> —
                  corrige-les si besoin.
                </p>
              ) : (
                <p className="mt-2 text-xs text-gray-500">
                  Un fichier GPX remplit la distance et le dénivelé à ta
                  place.
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
