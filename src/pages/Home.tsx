import { useMemo } from 'react'
import { MapPin, Calendar, RefreshCw, ChevronRight, AlertCircle, Plus, Trophy } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { WeatherCard } from '../components/WeatherCard'
import { AttendanceBanner } from '../components/AttendanceBanner'
import { ParcoursVoteCard } from '../components/ParcoursVoteCard'
import { ParticipantsTable, type PresenceRow } from '../components/ParticipantsTable'
import { Button } from '../components/ui/Button'
import { Card, CardContent } from '../components/ui/Card'
import { LoginForm, UserMenu } from '../components/Auth'
import { useAuth } from '../hooks/useAuth'
import { useWeather } from '../hooks/useWeather'
import { useParcours } from '../hooks/useParcours'
import { useParcoursVotes } from '../hooks/useParcoursVotes'
import { useAttendance } from '../hooks/useAttendance'
import { getRunForecast, daysUntilRun } from '../services/weatherApi'
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
  const parcoursIds = useMemo(() => parcoursList.map((p) => p.id), [parcoursList])
  const parcoursNames = useMemo(() => {
    const names: Record<string, string> = {}
    for (const p of parcoursList) names[p.id] = p.name
    return names
  }, [parcoursList])

  const {
    myStatus,
    attendees,
    weekLabel,
    saving: attendanceSaving,
    error: attendanceError,
    setMyStatus,
    showParcours,
  } = useAttendance()

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
  } = useParcoursVotes(parcoursIds, parcoursNames)

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

  /** Une ligne par personne ayant répondu, avec le parcours qu'elle a choisi */
  const presenceRows = useMemo<PresenceRow[]>(() => {
    return attendees.map((a) => {
      const chosenId = choiceOf(a.userNumber)
      return {
        userNumber: a.userNumber,
        firstName: a.firstName,
        lastName: a.lastName,
        attendance: a.status,
        parcoursName: chosenId ? (parcoursById.get(chosenId)?.name ?? null) : null,
      }
    })
  }, [attendees, choiceOf, parcoursById])

  /** Prévision du jour du run à 12h30 ; null si hors couverture API */
  const runForecast = useMemo(() => {
    if (!weather) return null
    return getRunForecast(weather)
  }, [weather])

  const hasForecast = runForecast !== null

  /** Combien de jours avant le run (pour l'affichage "dans N jours") */
  const daysToRun = useMemo(() => daysUntilRun(), [weekKey])

  const weatherTitle = useMemo(() => {
    if (!hasForecast) return 'Météo actuelle (prévision pas encore dispo)'
    if (daysToRun === 0) return 'Météo du jour · 12h30'
    return `Météo dans ${daysToRun} ${daysToRun > 1 ? 'jours' : 'jour'} · 12h30`
  }, [hasForecast, daysToRun])

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
          <div className="text-center py-12">
            <LoginForm />
          </div>
        )}

        {isAuthenticated && (
          <>
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Calendar className="w-6 h-6 text-primary" />
                  <div>
                    <p className="text-sm text-primary">Prochaine sortie</p>
                    <p className="font-semibold text-gray-900">
                      Mercredi{' '}
                      {targetWednesday.toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                      })}{' '}
                      à 12h30
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 1. Je viens ou pas ? */}
            <AttendanceBanner
              myStatus={myStatus}
              saving={attendanceSaving}
              weekLabel={weekLabel}
              onChange={(s) => void setMyStatus(s)}
            />

            {attendanceError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {attendanceError}
              </div>
            )}

            {/* Météo */}
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Météo pour la course</h2>
                  <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    {weatherTitle}
                    {weatherFreshness && (
                      <span className="text-xs text-gray-400">· {weatherFreshness}</span>
                    )}
                    {!hasForecast && (
                      <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-800 rounded-full flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        pas encore disponible
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

              {weatherError && (
                <Card className="border-error/20 bg-error/5">
                  <CardContent className="p-4 flex items-center gap-3 text-error">
                    <span>Erreur météo : {weatherError}</span>
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
                <WeatherCard
                  weather={runForecast ?? weather.current}
                  title={weatherTitle}
                />
              ) : null}
            </div>

            {/* 2. Choix du parcours — masqué si "pas aujourd'hui" */}
            {showParcours && (
              <div>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-gray-400" />
                    Parcours proposés
                  </h2>
                  <span className="text-xs text-gray-500">{weekLabel}</span>
                </div>
                <p className="text-sm text-gray-500 mb-3">
                  {myStatus === 'going'
                    ? 'Choisis le parcours qui te convient. Le plus plébiscité sera retenu.'
                    : 'Réponds « Je viens » pour choisir ton parcours.'}
                </p>

                {votesError && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
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
                        onToggle={() => void toggleChoice(parcours!.id)}
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
                  weekLabel={weekLabel}
                />
              </div>
            )}

            <Button
              variant="outline"
              className="w-full justify-center"
              onClick={() => navigate('/parcours')}
            >
              Gérer les parcours
              <ChevronRight className="w-4 h-4" />
            </Button>
          </>
        )}
      </main>
    </div>
  )
}
