import { useMemo, useState } from 'react'
import { MapPin, RefreshCw, AlertCircle, Plus, Trophy } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { WeatherCard } from '../components/WeatherCard'
import { AttendanceBanner } from '../components/AttendanceBanner'
import { ParcoursVoteCard } from '../components/ParcoursVoteCard'
import { ParticipantsTable, type PresenceRow } from '../components/ParticipantsTable'
import { Button } from '../components/ui/Button'
import { Card, CardContent } from '../components/ui/Card'
import { LoginForm } from '../components/Auth'
import { UserMenu } from '../components/UserMenu'
import { useAuth } from '../hooks/useAuth'
import { useWeather } from '../hooks/useWeather'
import { useParcours } from '../hooks/useParcours'
import { useParcoursVotes } from '../hooks/useParcoursVotes'
import { useAttendance } from '../hooks/useAttendance'
import { useProfiles } from '../hooks/useProfiles'
import { mergePresenceRows } from '../services/presenceRows'
import { getRunForecast, getRunWindow, daysUntilRun } from '../services/weatherApi'
import { useTargetWednesday } from '../hooks/useTargetWednesday'

export function Home() {
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuth()
  const { parcoursList, loading: parcoursLoading } = useParcours()
  const {
    weather,
    loading: weatherLoading,
    error: weatherError,
    refresh: refreshWeather,
    fetchedAt,
  } = useWeather()

  // Horloge partagée : bascule sur le run suivant à 14h le mercredi
  const { weekKey, date: targetWednesday } = useTargetWednesday()
  // Une seule carte de tracé ouverte à la fois.
  const [openMapId, setOpenMapId] = useState<string | null>(null)
  const parcoursIds = useMemo(() => parcoursList.map((p) => p.id), [parcoursList])
  const parcoursNames = useMemo(() => {
    const names: Record<string, string> = {}
    for (const p of parcoursList) names[p.id] = p.name
    return names
  }, [parcoursList])

  const {
    myStatus,
    attendees,
    loading: attendanceLoading,
    saving: attendanceSaving,
    error: attendanceError,
    setMyStatus,
    showParcours,
  } = useAttendance()

  /**
   * L'annuaire complet : il permet d'afficher aussi les personnes qui n'ont
   * pas répondu. Échec silencieux → on retombe sur les seules réponses.
   */
  const { profiles } = useProfiles(isAuthenticated)

  /**
   * Qui a dit « je viens ». Passe aux votes pour qu'un choix d'un absent
   * soit retiré du décompte immédiatement, sans attendre le polling.
   *
   * `undefined` = présences pas encore disponibles. On laisse alors le hook
   * utiliser sa propre requête (puis compter tout en dernier recours), au
   * lieu de faire autorité avec une liste vide qui effacerait les votes.
   */
  const goingUserNumbers = useMemo<number[] | undefined>(() => {
    if (attendanceLoading) return undefined
    if (attendanceError && attendees.length === 0) return undefined
    return attendees.filter((a) => a.status === 'going').map((a) => a.userNumber)
  }, [attendees, attendanceLoading, attendanceError])

  const {
    tallies,
    myChoice,
    choiceOf,
    savingParcoursId,
    error: votesError,
    toggleChoice,
    rankedParcoursIds,
    winners,
    isTie,
  } = useParcoursVotes(parcoursIds, parcoursNames, goingUserNumbers)

  const parcoursById = useMemo(() => new Map(parcoursList.map((p) => [p.id, p])), [parcoursList])

  const rankedParcours = useMemo(
    () => rankedParcoursIds.map((id) => parcoursById.get(id)).filter((p) => p != null),
    [rankedParcoursIds, parcoursById]
  )

  /** Noms des parcours à égalité, pour le bandeau d'explication */
  const tieNames = useMemo(
    () => winners.map((id) => parcoursNames[id]).filter(Boolean),
    [winners, parcoursNames]
  )

  const tieVotes = isTie ? (tallies[winners[0]]?.yes ?? 0) : 0

  /**
   * Une ligne par personne du groupe : présents, absents, et sans réponse.
   * Les choix de parcours ne sont lus que pour ceux qui viennent — un vote
   * résiduel d'un absent ne doit jamais apparaître ici.
   */
  const presenceRows = useMemo<PresenceRow[]>(
    () =>
      mergePresenceRows(profiles, attendees, (userNumber) => {
        const chosenId = choiceOf(userNumber)
        return chosenId ? (parcoursById.get(chosenId)?.name ?? null) : null
      }),
    [profiles, attendees, choiceOf, parcoursById]
  )

  /** Prévision du jour du run à 12h30 ; null si hors couverture API */
  const runForecast = useMemo(() => {
    if (!weather) return null
    return getRunForecast(weather)
  }, [weather])

  /**
   * Heures 11h → 14h autour du run, pour le bandeau « Autour de 12h30 ».
   * Vide quand il n'y a pas de prévision du run : on n'affiche pas des heures
   * sans le point de référence.
   */
  const runWindow = useMemo(() => {
    if (!weather || !runForecast) return []
    return getRunWindow(weather)
  }, [weather, runForecast])

  const hasForecast = runForecast !== null

  /** Combien de jours avant le run (pour l'affichage "dans N jours") */
  // Recalculé à chaque bascule de semaine : daysUntilRun lit l'horloge.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const daysToRun = useMemo(() => daysUntilRun(), [weekKey])

  /** La date du run est dite une seule fois, ici : « Mercredi 28 octobre · 12h30 · dans 3 jours » */
  const runSubtitle = useMemo(() => {
    const date = targetWednesday.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
    const label = date.charAt(0).toUpperCase() + date.slice(1)
    const when =
      daysToRun === 0 ? "aujourd'hui" : `dans ${daysToRun} ${daysToRun > 1 ? 'jours' : 'jour'}`
    return `${label} · 12h30 · ${when}`
  }, [targetWednesday, daysToRun])

  /** Ancienneté des données : "à l'instant", "il y a 12 min", "il y a 2 h" */
  const weatherFreshness = useMemo(() => {
    if (!fetchedAt) return null
    const minutes = Math.floor((Date.now() - fetchedAt) / 60_000)
    if (minutes < 2) return 'à l’instant'
    if (minutes < 60) return `il y a ${minutes} min`
    const hours = Math.floor(minutes / 60)
    return `il y a ${hours} h`
  }, [fetchedAt])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-primary shrink-0">HappyRunners</h1>
          <div className="flex items-center gap-1 sm:gap-2 min-w-0">
            {isAuthenticated && (
              <Button
                variant="accent"
                size="sm"
                onClick={() => navigate('/parcours')}
                aria-label="Gérer les parcours"
                title="Gérer les parcours"
                className="px-2 sm:px-3 shrink-0"
              >
                <MapPin className="w-4 h-4" />
                <span className="hidden sm:inline ml-1">Parcours</span>
              </Button>
            )}
            <div className="min-w-0 shrink">
              <UserMenu />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {!isAuthenticated && (
          <div className="flex justify-center py-8">
            <LoginForm />
          </div>
        )}

        {isAuthenticated && (
          <>
            {/* 1. Je viens ou pas ? La date n'est dite qu'ici. */}
            <AttendanceBanner
              myStatus={myStatus}
              saving={attendanceSaving}
              subtitle={runSubtitle}
              onChange={(s) => void setMyStatus(s)}
            />

            {attendanceError && (
              <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {attendanceError}
              </div>
            )}

            {/* Météo */}
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Météo pour la course</h2>
                  <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    {hasForecast ? 'Prévision à 12h30' : 'Météo actuelle'}
                    {weatherFreshness && (
                      <span className="text-xs text-gray-400">· {weatherFreshness}</span>
                    )}
                    {!hasForecast && (
                      <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-800 rounded-full flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        prévision pas encore disponible
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={refreshWeather}
                  aria-label="Rafraîchir la météo"
                  title="Rafraîchir la météo"
                  className="shrink-0 px-2 -mt-1"
                >
                  <RefreshCw className={`w-4 h-4 ${weatherLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>

              {/* L'erreur ne concerne que l'absence de données. Si une météo est
                  déjà affichée (cache, tentative précédente), un échec
                  isolé ne doit pas laisser un bandeau au-dessus d'une
                  carte valide. */}
              {weatherError && !weather && (
                <Card className="border-error/20 bg-error/5">
                  <CardContent className="p-4 flex items-center gap-3 text-error">
                    {/* weatherApi préfixe déjà « Erreur météo : » */}
                    <span role="alert">{weatherError}</span>
                    <Button variant="ghost" size="sm" onClick={refreshWeather}>
                      Réessayer
                    </Button>
                  </CardContent>
                </Card>
              )}

              {weatherLoading ? (
                <Card>
                  <CardContent className="p-6 flex items-center justify-center gap-3">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                    <span className="text-gray-500">Chargement météo...</span>
                  </CardContent>
                </Card>
              ) : weather ? (
                <WeatherCard weather={runForecast ?? weather.current} hours={runWindow} />
              ) : null}
            </div>

            {/* 2. Parcours proposés — visibles toujours sauf si absent.
                Le vote reste verrouillé tant que la présence n'est pas
                confirmée : on voit les parcours et les compteurs, mais on
                ne peut pas peser dessus sans avoir dit qu'on vient. */}
            {myStatus !== 'skip' && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-1">
                  <MapPin className="w-5 h-5 text-gray-400" />
                  Parcours proposés
                </h2>
                <p className="text-sm text-gray-500 mb-3">
                  {myStatus === 'going'
                    ? 'Choisis le parcours qui te convient. Le plus plébiscité sera retenu.'
                    : 'Tu verras les choix dès que tu auras répondu ci-dessus.'}
                </p>

                {votesError && (
                  <div role="alert" className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {votesError}
                  </div>
                )}

                {isTie && (
                  <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-sm flex items-start gap-2">
                    <Trophy className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      <strong>Égalité</strong> entre {tieNames.join(' et ')} ({tieVotes}{' '}
                      {tieVotes > 1 ? 'voix' : 'voix'} chacun). Vous décidez au moment de partir.
                    </span>
                  </div>
                )}

                {parcoursLoading ? (
                  <Card>
                    <CardContent className="p-6 flex items-center justify-center gap-3">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                      <span className="text-gray-500">Chargement…</span>
                    </CardContent>
                  </Card>
                ) : rankedParcours.length === 0 ? (
                  <Card>
                    <CardContent className="p-6 space-y-4 text-center">
                      <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <h3 className="text-lg font-medium text-gray-900">Aucun parcours disponible</h3>
                      <p className="text-gray-500 mt-1">Ajoutez un parcours pour lancer les votes</p>
                      <Button variant="primary" onClick={() => navigate('/parcours')}>
                        <Plus className="w-4 h-4 mr-1" />
                        Ajouter un parcours
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {rankedParcours.map((parcours) => (
                      <ParcoursVoteCard
                        key={parcours!.id}
                        parcours={parcours!}
                        isMyChoice={myChoice === parcours!.id}
                        yesCount={tallies[parcours!.id]?.yes ?? 0}
                        isWinner={winners.includes(parcours!.id)}
                        isTied={isTie}
                        saving={savingParcoursId === parcours!.id}
                        voteLocked={!showParcours}
                        onToggle={() => void toggleChoice(parcours!.id)}
                        mapOpen={openMapId === parcours!.id}
                        onToggleMap={() =>
                          setOpenMapId((current) =>
                            current === parcours!.id ? null : parcours!.id
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3. Qui vient ? */}
            {presenceRows.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Qui vient ?</h2>
                <ParticipantsTable
                  rows={presenceRows}
                  currentUserNumber={user?.id}
                />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
