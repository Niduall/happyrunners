import { Wind, Droplets, Sunrise, Sunset, Wind as WindIcon, CloudRain } from 'lucide-react'
import type { WeatherData } from '../types'
import { formatWindDirection } from '../services/weatherApi'
import { getWeatherCodeInfo } from '../services/weatherCode'
import { Card, CardContent } from './ui/Card'

interface WeatherCardProps {
  weather: WeatherData | null
  compact?: boolean
  title?: string
}

/** Cercle coloré + emoji, remplace les images OpenWeather */
function WeatherIcon({ weather, size = 'lg' }: { weather: WeatherData; size?: 'sm' | 'lg' }) {
  const info = getWeatherCodeInfo(weather.weatherCode, weather.isDay !== false)
  const dims = size === 'lg' ? 'w-16 h-16 text-4xl' : 'w-10 h-10 text-2xl'

  return (
    <div
      className={`${dims} ${info.bg} rounded-full flex items-center justify-center flex-shrink-0`}
      role="img"
      aria-label={info.label}
    >
      {info.emoji}
    </div>
  )
}

export function WeatherCard({ weather, compact = false, title = 'Météo' }: WeatherCardProps) {
  if (!weather) return null

  const temp = Math.round(weather.temperature)
  const feelsLike = Math.round(weather.feelsLike)
  const info = getWeatherCodeInfo(weather.weatherCode, weather.isDay !== false)
  const rainPercent = weather.pop != null ? Math.round(weather.pop * 100) : null

  if (compact) {
    return (
      <Card className="p-3">
        <div className="flex items-center gap-3">
          <WeatherIcon weather={weather} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{title}</p>
            <p className="text-sm text-gray-500">{info.label}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">{temp}°C</p>
            <p className="text-xs text-gray-500">Ressenti {feelsLike}°C</p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500">{info.label}</p>
          </div>
          <div className="flex items-center gap-3">
            <WeatherIcon weather={weather} />
            <div className="text-right">
              <p className="text-3xl font-bold text-primary">{temp}°C</p>
              <p className="text-sm text-gray-500">Ressenti {feelsLike}°C</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-lg">
            <Wind className="w-5 h-5 text-accent" />
            <div className="min-w-0">
              <p className="text-xs text-gray-500">Vent</p>
              <p className="font-medium text-gray-900 truncate">
                {weather.windSpeed} km/h {formatWindDirection(weather.windDeg)}
              </p>
            </div>
          </div>

          {weather.windGust != null && weather.windGust > weather.windSpeed && (
            <div className="flex items-center gap-2 p-2 bg-accent/5 rounded-lg">
              <WindIcon className="w-5 h-5 text-accent/70" />
              <div className="min-w-0">
                <p className="text-xs text-gray-500">Rafales</p>
                <p className="font-medium text-gray-900">{weather.windGust} km/h</p>
              </div>
            </div>
          )}

          {rainPercent != null && rainPercent > 0 && (
            <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
              <CloudRain className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-xs text-gray-500">Pluie</p>
                <p className="font-medium text-gray-900">{rainPercent} %</p>
              </div>
            </div>
          )}

          {weather.humidity > 0 && (
            <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-lg">
              <Droplets className="w-5 h-5 text-primary" />
              <div>
                <p className="text-xs text-gray-500">Humidité</p>
                <p className="font-medium text-gray-900">{weather.humidity}%</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 p-2 bg-orange-50 rounded-lg">
            <Sunrise className="w-5 h-5 text-orange-500" />
            <div>
              <p className="text-xs text-gray-500">Lever</p>
              <p className="font-medium text-gray-900">
                {weather.sunrise
                  ? new Date(weather.sunrise * 1000).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '--'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg">
            <Sunset className="w-5 h-5 text-red-500" />
            <div>
              <p className="text-xs text-gray-500">Coucher</p>
              <p className="font-medium text-gray-900">
                {weather.sunset
                  ? new Date(weather.sunset * 1000).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '--'}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
