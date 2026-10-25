import { Wind, Droplets, Sunrise, CloudRain } from 'lucide-react'
import type { WeatherData } from '../types'
import { formatWindDirection, WEATHER_TIMEZONE } from '../services/weatherApi'
import { getWeatherCodeInfo } from '../services/weatherCode'
import { Card, CardContent } from './ui/Card'

interface WeatherCardProps {
  weather: WeatherData | null
  /** Absent → pas de titre dans la carte (le titre de section suffit). */
  title?: string
  /** Heures autour du run (11h → 14h), affichées en bandeau compact */
  hours?: WeatherData[]
}

/** Cercle coloré + emoji, remplace les images OpenWeather */
function WeatherIcon({ weather }: { weather: WeatherData }) {
  const info = getWeatherCodeInfo(weather.weatherCode, weather.isDay !== false)

  return (
    <div
      className={`w-14 h-14 text-3xl sm:w-16 sm:h-16 sm:text-4xl ${info.bg} rounded-full flex items-center justify-center flex-shrink-0`}
      role="img"
      aria-label={info.label}
    >
      {info.emoji}
    </div>
  )
}

/** Heure murale de Paris, sans minutes : `11h`, `12h`… */
const PARIS_HOUR = new Intl.DateTimeFormat('fr-FR', {
  timeZone: WEATHER_TIMEZONE,
  hour: '2-digit',
  hourCycle: 'h23',
})

const PARIS_TIME = new Intl.DateTimeFormat('fr-FR', {
  timeZone: WEATHER_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function parisHour(dt: number): string {
  const part = PARIS_HOUR.formatToParts(new Date(dt * 1000)).find((p) => p.type === 'hour')
  return `${part?.value ?? '--'}h`
}

function parisTime(epochSeconds?: number): string {
  if (epochSeconds == null) return '--'
  return PARIS_TIME.format(new Date(epochSeconds * 1000))
}

/**
 * Une heure du bandeau : heure, emoji, température et pluie sur deux lignes.
 * `data-run` marque l'heure réellement utilisée pour la prévision du run.
 */
function HourCell({ hour, isRun }: { hour: WeatherData; isRun: boolean }) {
  const info = getWeatherCodeInfo(hour.weatherCode, hour.isDay !== false)
  const rainPercent = hour.pop != null ? Math.round(hour.pop * 100) : null

  return (
    <div
      data-run={isRun || undefined}
      aria-current={isRun ? 'time' : undefined}
      title={isRun ? 'Heure utilisée pour la prévision du run' : undefined}
      className={`flex flex-col items-center rounded-lg py-1 ${
        isRun ? 'bg-primary/10 ring-2 ring-primary' : 'bg-gray-50'
      }`}
    >
      <span className="flex items-center gap-1">
        <span className={`text-xs ${isRun ? 'font-semibold text-primary' : 'text-gray-500'}`}>
          {parisHour(hour.dt)}
        </span>
        <span role="img" aria-label={info.label} className="text-base leading-none">
          {info.emoji}
        </span>
      </span>
      <span className="flex items-baseline gap-0.5 text-xs text-gray-900 whitespace-nowrap">
        <span className="font-medium">{Math.round(hour.temperature)}°</span>
        <span className="text-blue-600">
          {rainPercent != null ? `${rainPercent}\u202F%` : '--'}
        </span>
      </span>
    </div>
  )
}

export function WeatherCard({ weather, title, hours = [] }: WeatherCardProps) {
  if (!weather) return null

  const temp = Math.round(weather.temperature)
  const feelsLike = Math.round(weather.feelsLike)
  const info = getWeatherCodeInfo(weather.weatherCode, weather.isDay !== false)
  const rainPercent = weather.pop != null ? Math.round(weather.pop * 100) : null

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h3 className="font-semibold text-gray-900">{title}</h3>}
            <p className={`${title ? 'text-sm' : 'text-sm sm:text-base'} text-gray-500`}>{info.label}</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <WeatherIcon weather={weather} />
            <div className="text-right">
              <p className="text-2xl sm:text-3xl font-bold text-primary">{temp}°C</p>
              <p className="text-xs sm:text-sm text-gray-500 whitespace-nowrap">
                Ressenti {feelsLike}°C
              </p>
            </div>
          </div>
        </div>

        {hours.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-gray-500 mb-1.5">Autour de 12h30</p>
            <div
              className="grid grid-cols-4 gap-1.5"
              role="group"
              aria-label="Prévisions autour de 12h30"
            >
              {hours.map((hour) => (
                <HourCell key={hour.dt} hour={hour} isRun={hour.dt === weather.dt} />
              ))}
            </div>
          </div>
        )}

        {/* Fond neutre partout, sauf la pluie en bleu : une seule couleur
            porte du sens. Les icônes colorées multipliaient les teintes. */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
            <Wind className="w-5 h-5 text-gray-500" />
            <div className="min-w-0">
              <p className="text-xs text-gray-500">Vent</p>
              <p className="font-medium text-gray-900 truncate">
                {weather.windSpeed} km/h {formatWindDirection(weather.windDeg)}
              </p>
            </div>
          </div>

          {weather.windGust != null && weather.windGust > weather.windSpeed && (
            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
              <Wind className="w-5 h-5 text-gray-400" />
              <div className="min-w-0">
                <p className="text-xs text-gray-500">Rafales</p>
                <p className="font-medium text-gray-900">{weather.windGust} km/h</p>
              </div>
            </div>
          )}

          {rainPercent != null && (
            <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
              <CloudRain className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-xs text-gray-500">Pluie</p>
                <p className="font-medium text-gray-900">{rainPercent} %</p>
              </div>
            </div>
          )}

          {weather.humidity > 0 && (
            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
              <Droplets className="w-5 h-5 text-gray-500" />
              <div>
                <p className="text-xs text-gray-500">Humidité</p>
                <p className="font-medium text-gray-900">{weather.humidity}%</p>
              </div>
            </div>
          )}

          <div className="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 p-2 bg-gray-50 rounded-lg sm:justify-start">
            <Sunrise className="w-5 h-5 text-amber-600" />
            <div className="min-w-0">
              <p className="text-xs text-gray-500">Journée</p>
              <p className="font-medium text-gray-900 truncate">
                {parisTime(weather.sunrise)} → {parisTime(weather.sunset)}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
