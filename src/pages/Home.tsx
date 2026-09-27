import { useEffect, useMemo } from 'react'
import { MapPin, Calendar, Users, RefreshCw, ChevronRight, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { WeatherCard } from '../components/WeatherCard'
import { ParticipationBtn } from '../components/ParticipationBtn'
import { ParcoursCard } from '../components/ParcoursCard'
import { Button } from '../components/ui/Button'
import { Card, CardContent } from '../components/ui/Card'
import { LoginForm, UserMenu } from '../components/Auth'
import { useAuth } from '../hooks/useAuth'
import { useWeather } from '../hooks/useWeather'
import { useParcours } from '../hooks/useParcours'
import { useParticipation } from '../hooks/useParticipation'
import { getNextWednesdayNoon, getWednesdayForecast } from '../services/weatherApi'
import type { Parcours } from '../types'

export function Home() {
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuth()
  const { nextParcours, loading: parcoursLoading } = useParcours()
  const { weather, loading: weatherLoading, error: weatherError, refresh: refreshWeather } = useWeather()

  const wednesdayTimestamp = getNextWednesdayNoon()

  // Météo pour le mercredi 12h30 (avec fallback sur météo actuelle)
  const wednesdayWeather = useMemo(() => {
    if (!weather) return null
    const wedForecast = getWednesdayForecast(weather)
    return wedForecast || weather.current
  }, [weather])

  const isForecast = useMemo(() => {
    if (!weather) return false
    return getWednesdayForecast(weather) !== null
  }, [weather])

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-primary">HappyRunners</h1>
          <div className="flex items-center gap-2">
            <UserMenu />
            <Button variant="accent" size="sm" onClick={() => navigate('/parcours')}>
              <MapPin className="w-4 h-4 mr-1" />
              Parcours
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Auth required */}
        {!isAuthenticated && (
          <div className="text-center py-12">
            <LoginForm />
          </div>
        )}

        {isAuthenticated && (
          <>
            {/* Date du prochain run */}
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Calendar className="w-6 h-6 text-primary" />
                  <div>
                    <p className="text-sm text-primary">Prochaine sortie</p>
                    <p className="font-semibold text-gray-900">
                      Mercredi {formatDate(wednesdayTimestamp)} à 12h30
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Météo pour le mercredi 12h30 */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-gray-400" />
                Météo pour la course (mercredi 12h30)
                {!isForecast && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-amber-100 text-amber-800 rounded-full flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Pr&eacute;vision non dispo ({'>'}5j), m&eacute;t&eacute;o actuelle affich&eacute;e
                  </span>
                )}
              </h2>

              {weatherError && (
                <Card className="border-error/20 bg-error/5">
                  <CardContent className="p-4 flex items-center gap-3 text-error">
                    <span>Erreur météo : {weatherError}</span>
                    <Button variant="ghost" size="sm" onClick={refreshWeather}>Réessayer</Button>
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
              ) : (
                <WeatherCard weather={wednesdayWeather} title={isForecast ? "Météo prévisionnelle" : "Météo actuelle"} />
              )}
            </div>

            {/* Parcours + Participation */}
            {nextParcours ? (
              <>
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-gray-400" />
                    Parcours proposé
                  </h2>

                  <ParcoursCard parcours={nextParcours} isNext showActions={false} />

                  {/* Participation */}
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <Users className="w-5 h-5 text-gray-400" />
                      Participation
                    </h2>
                    <ParticipationBtn
                      parcoursId={nextParcours.id}
                      userName={user?.name}
                    />
                  </div>
                </div>
              </>
            ) : (
              // Aucun parcours
              <Card>
                <CardContent className="p-6 space-y-4 text-center">
                  <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <h3 className="text-lg font-medium text-gray-900">Aucun parcours programmé</h3>
                  <p className="text-gray-500 mt-1">Ajoutez le premier parcours pour le mercredi</p>
                  <Button variant="primary" onClick={() => navigate('/parcours')}>
                    Ajouter un parcours
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Lien vers tous les parcours */}
            <Button variant="outline" className="w-full justify-center" onClick={() => navigate('/parcours')}>
              Voir tous les parcours
              <ChevronRight className="w-4 h-4" />
            </Button>
          </>
        )}
      </main>
    </div>
  )
}