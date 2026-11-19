import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Watch } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card, CardContent } from '../components/ui/Card'
import { DeclareRunModal } from '../components/DeclareRunModal'
import { useAuth } from '../hooks/useAuth'
import { HISTORY_WEEKS, useHistory, type RunChoice } from '../hooks/useHistory'
import { cn } from '../lib/utils'
import {
  formatElevation,
  formatKm,
  isEmptyWeek,
  type HistoryPerson,
  type HistoryWeek,
} from '../services/history'
import type { ImportProposal } from '../types/supabase'

/** Prénoms séparés par des virgules, initiale du nom en cas de doublon. */
function peopleLabel(people: HistoryPerson[]): string {
  const counts = new Map<string, number>()
  for (const person of people) {
    counts.set(person.firstName, (counts.get(person.firstName) ?? 0) + 1)
  }

  return people
    .map((person) =>
      (counts.get(person.firstName) ?? 0) > 1
        ? `${person.firstName} ${person.lastName.slice(0, 1).toUpperCase()}.`
        : person.firstName
    )
    .join(', ')
}

/** « mercredi 18 novembre · 8,2 km · 42 min » — ce que la montre a mesuré. */
function proposalSummary(proposal: ImportProposal): string {
  const date = new Date(proposal.started_at).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const parts = [date]
  if (proposal.distance_m != null) {
    parts.push(formatKm(proposal.distance_m / 1000))
  }
  if (proposal.duration_s != null) {
    const minutes = Math.round(proposal.duration_s / 60)
    parts.push(
      minutes >= 60
        ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
        : `${minutes} min`
    )
  }
  return parts.join(' · ')
}

/**
 * Ce que la montre a proposé, en attente de validation.
 *
 * C'est le seul endroit où une sortie issue du téléphone entre dans le
 * classement — et seulement après un clic. Le D+ n'est pas fourni par le
 * carnet de santé : on ne compte que le connu, jamais un chiffre inventé.
 */
function ProposalCard({
  proposal,
  busy,
  onAccept,
  onIgnore,
}: {
  proposal: ImportProposal
  busy: boolean
  onAccept: () => void
  onIgnore: () => void
}) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-2">
          <Watch className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">
              Ta montre propose une sortie
            </h2>
            <p className="mt-0.5 text-sm text-gray-600">
              {proposalSummary(proposal)}
            </p>
          </div>
        </div>

        <p className="text-xs text-gray-500">
          Rien n’est enregistré tant que tu n’as pas validé. Le dénivelé n’est
          pas fourni par le téléphone : la sortie comptera sans D+.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onAccept} disabled={busy}>
            {busy ? 'Validation...' : 'Valider'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onIgnore} disabled={busy}>
            Ignorer
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <Card>
      <CardContent className="px-3 py-4 text-center sm:px-4">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-primary">{value}</p>
        <p className="text-xs text-gray-500">{detail}</p>
      </CardContent>
    </Card>
  )
}

function WeekCard({
  week,
  userNumber,
  editable,
  saving,
  onDeclare,
  onRetract,
}: {
  week: HistoryWeek
  userNumber: number | null
  editable: boolean
  saving: boolean
  onDeclare: (week: HistoryWeek) => void
  onRetract: (week: HistoryWeek) => Promise<boolean>
}) {
  const nothingDeclared = week.runs.length === 0
  const [confirmRetract, setConfirmRetract] = useState(false)

  const handleRetract = async () => {
    const ok = await onRetract(week)
    if (ok) setConfirmRetract(false)
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">
              {week.dateLabel}
            </h2>
            <p className="mt-0.5 text-sm text-gray-600">
              {week.going.length === 0
                ? 'Aucune présence enregistrée'
                : `${week.going.length} ${
                    week.going.length > 1 ? 'présents' : 'présent'
                  } · ${peopleLabel(week.going)}`}
            </p>
          </div>
          {/* Dit pourquoi le bouton manque, sans répéter la règle à chaque
              carte : une semaine figée ne se corrige plus. */}
          {!editable && (
            <span className="shrink-0 text-xs text-gray-500">
              Semaine clôturée
            </span>
          )}
        </div>

        {nothingDeclared ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm text-gray-600">
              Aucun parcours renseigné.
            </p>
            {week.votedParcoursName && (
              <p className="mt-0.5 text-xs text-gray-500">
                Vote : {week.votedParcoursName} · {week.votedYes}{' '}
                {week.votedYes > 1 ? 'votes' : 'vote'} « oui »
              </p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {week.runs.map((run) => {
              const isMe = run.userNumber === userNumber
              return (
                <li
                  key={run.userNumber}
                  className="flex items-baseline justify-between gap-3 px-3 py-2"
                >
                  <span className="min-w-0 text-sm text-gray-600">
                    {run.firstName}
                    {isMe && ' (vous)'}
                  </span>
                  <span className="min-w-0 text-right text-sm font-medium text-gray-900">
                    {run.parcoursName}
                    {run.distanceKm != null && (
                      <span className="ml-2 font-normal text-xs text-gray-500">
                        {formatKm(run.distanceKm)}
                      </span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        {editable && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDeclare(week)}
            aria-label={`${
              week.myRun ? 'Corriger mon parcours' : 'Indiquer mon parcours'
            } du ${week.dateLabel.toLowerCase()}`}
          >
            {week.myRun ? 'Corriger mon parcours' : 'Indiquer mon parcours'}
          </Button>
        )}

        {/* Une semaine clôturée n'accepte plus de correction, mais un retrait
            reste possible : il ne peut que baisser ses propres totaux, et une
            sortie déclarée par erreur doit pouvoir être réparée. */}
        {!editable &&
          week.myRun &&
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmRetract(true)}
              aria-label={`Retirer ma sortie du ${week.dateLabel.toLowerCase()}`}
            >
              Retirer ma sortie
            </Button>
          ))}
      </CardContent>
    </Card>
  )
}

export function History() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const userNumber = user?.id ?? null
  const {
    weeks,
    stats,
    parcours,
    loading,
    error,
    savingWeek,
    declare,
    retract,
    editableWeekKey,
    openProposal,
    acceptProposal,
    ignoreProposal,
    refresh,
  } = useHistory(userNumber)
  const [declaring, setDeclaring] = useState<HistoryWeek | null>(null)
  const [showEmptyWeeks, setShowEmptyWeeks] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [handlingProposal, setHandlingProposal] = useState(false)

  /**
   * Douze semaines dont la plupart sont vides : les afficher toutes noie les
   * sorties réelles sous du bruit. On masque les semaines sans présence ni
   * sortie, **sauf la semaine encore ouverte** — c'est justement celle où l'on
   * vient déclarer, même si personne n'a encore répondu.
   */
  const hiddenEmptyWeeks = weeks.filter(
    (week) => isEmptyWeek(week) && week.weekKey !== editableWeekKey
  )
  const visibleWeeks = showEmptyWeeks
    ? weeks
    : weeks.filter(
        (week) => !isEmptyWeek(week) || week.weekKey === editableWeekKey
      )

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refresh()
    } finally {
      setRefreshing(false)
    }
  }

  const handleDeclare = async (choice: RunChoice): Promise<boolean> => {
    if (!declaring) return false
    const ok = await declare(declaring.weekKey, choice)
    if (ok) setDeclaring(null)
    return ok
  }

  const handleRetract = async (): Promise<boolean> => {
    if (!declaring) return false
    const ok = await retract(declaring.weekKey)
    if (ok) setDeclaring(null)
    return ok
  }

  /** Retrait direct depuis une carte clôturée : pas de modale pour ça. */
  const handleCardRetract = (week: HistoryWeek): Promise<boolean> =>
    retract(week.weekKey)

  /**
   * La proposition ne s'affiche que si la semaine ouverte n'a pas déjà de
   * sortie déclarée : sinon « Valider » écraserait un choix volontaire.
   */
  const openWeekRun =
    weeks.find((week) => week.weekKey === editableWeekKey)?.myRun ?? null
  const showProposal = openProposal !== null && openWeekRun === null

  const handleAcceptProposal = async () => {
    if (!openProposal) return
    setHandlingProposal(true)
    try {
      await acceptProposal(openProposal)
    } finally {
      setHandlingProposal(false)
    }
  }

  const handleIgnoreProposal = async () => {
    if (!openProposal) return
    setHandlingProposal(true)
    try {
      await ignoreProposal(openProposal)
    } finally {
      setHandlingProposal(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            aria-label="Retour à l'accueil"
            className="shrink-0 px-2 sm:px-3"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="ml-1 hidden sm:inline">Accueil</span>
          </Button>
          <h1 className="text-xl font-bold text-primary">Historique</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleRefresh()}
            disabled={loading || refreshing}
            aria-label="Actualiser l’historique"
            className="ml-auto shrink-0 px-2 sm:px-3"
          >
            <RefreshCw
              className={cn('w-4 h-4', refreshing && 'animate-spin')}
            />
            <span className="ml-1 hidden sm:inline">Actualiser</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Mes sorties"
            value={String(stats.runs)}
            detail={`sur ${HISTORY_WEEKS} semaines`}
          />
          <StatCard
            label="Série"
            value={String(stats.streak)}
            detail={
              stats.streak === 0
                ? 'aucune série'
                : stats.streak > 1
                  ? 'semaines d’affilée'
                  : 'semaine d’affilée'
            }
          />
          <StatCard
            label="Distance"
            value={formatKm(stats.distanceKm)}
            detail="cumul connu"
          />
          <StatCard
            label="Dénivelé"
            value={formatElevation(stats.elevationGainM)}
            detail="cumul connu"
          />
        </div>

        {!loading && weeks.length > 0 && (
          <p className="text-sm text-gray-600">
            Tu peux déclarer ou corriger ta sortie jusqu’au mercredi suivant,
            14h. Ensuite la semaine est clôturée, mais tu peux toujours retirer
            une sortie déclarée par erreur.
          </p>
        )}

        {!loading && showProposal && openProposal && (
          <ProposalCard
            proposal={openProposal}
            busy={handlingProposal}
            onAccept={() => void handleAcceptProposal()}
            onIgnore={() => void handleIgnoreProposal()}
          />
        )}

        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={() => void refresh()}>
              <RefreshCw className="w-4 h-4" />
              Réessayer
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <div
              role="status"
              aria-label="Chargement de l'historique"
              className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"
            />
          </div>
        ) : weeks.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            Aucune sortie passée à afficher.
          </p>
        ) : (
          <div className="space-y-4">
            {visibleWeeks.map((week) => (
              <WeekCard
                key={week.weekKey}
                week={week}
                userNumber={userNumber}
                editable={week.weekKey === editableWeekKey}
                saving={savingWeek === week.weekKey}
                onDeclare={setDeclaring}
                onRetract={handleCardRetract}
              />
            ))}

            {(showEmptyWeeks || hiddenEmptyWeeks.length > 0) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowEmptyWeeks((shown) => !shown)}
                aria-expanded={showEmptyWeeks}
              >
                {showEmptyWeeks
                  ? 'Masquer les semaines vides'
                  : `Afficher les ${hiddenEmptyWeeks.length} ${
                      hiddenEmptyWeeks.length > 1
                        ? 'semaines vides'
                        : 'semaine vide'
                    }`}
              </Button>
            )}
          </div>
        )}
      </main>

      {declaring && (
        <DeclareRunModal
          week={declaring}
          parcours={parcours}
          saving={savingWeek === declaring.weekKey}
          onDeclare={handleDeclare}
          onRetract={handleRetract}
          onClose={() => setDeclaring(null)}
        />
      )}
    </div>
  )
}
