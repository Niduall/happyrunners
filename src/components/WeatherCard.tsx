import { Sun, Cloud, CloudRain, CloudSnow, CloudDrizzle, Zap, Wind, Droplets, Sunrise, Sunset } from 'lucide-react'
import type { WeatherData } from '../types'
import { formatWindDirection } from '../services/weatherApi'
import { Card, CardContent } from './ui/Card'

interface WeatherCardProps {
  weather: WeatherData | null
  compact?: boolean
  title?: string
}

function getWeatherIcon(icon: string) {
  const code = icon.slice(0, 2)
  
  if (code === '01') return <Sun className="w-8 h-8 text-yellow-500" />
  if (code === '02' || code === '03') return <Cloud className="w-8 h-8 text-gray-400" />
  if (code === '04') return <Cloud className="w-8 h-8 text-gray-500" />
  if (code === '09' || code === '10') return <CloudRain className="w-8 h-8 text-blue-500" />
  if (code === '11') return <Zap className="w-8 h-8 text-yellow-600" />
  if (code === '13') return <CloudSnow className="w-8 h-8 text-blue-200" />
  if (code === '50') return <CloudDrizzle className="w-8 h-8 text-gray-400" />
  return <Cloud className="w-8 h-8 text-gray-400" />
}

export function WeatherCard({ weather, compact = false, title = 'Météo' }: WeatherCardProps) {
  if (!weather) return null

  const temp = Math.round(weather.temperature)
  const feelsLike = Math.round(weather.feelsLike)

  if (compact) {
    return (
      <Card className="p-3">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">{getWeatherIcon(weather.icon)}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{title}</p>
            <p className="text-sm text-gray-500 capitalize">{weather.description}</p>
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
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500 capitalize">{weather.description}</p>
          </div>
          <div className="flex items-center gap-2">
            {getWeatherIcon(weather.icon)}
            <div className="text-right">
              <p className="text-3xl font-bold text-primary">{temp}°C</p>
              <p className="text-sm text-gray-500">Ressenti {feelsLike}°C</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-lg">
            <Droplets className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xs text-gray-500">Humidité</p>
              <p className="font-medium text-gray-900">{weather.humidity}%</p>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-lg">
            <Wind className="w-5 h-5 text-accent" />
            <div>
              <p className="text-xs text-gray-500">Vent</p>
              <p className="font-medium text-gray-900">{weather.windSpeed} km/h {formatWindDirection(weather.windDeg)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-lg">
            <Sunrise className="w-5 h-5 text-orange-500" />
            <div>
              <p className="text-xs text-gray-500">Lever</p>
              <p className="font-medium text-gray-900">{weather.sunrise ? new Date(weather.sunrise * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-lg">
            <Sunset className="w-5 h-5 text-red-500" />
            <div>
              <p className="text-xs text-gray-500">Coucher</p>
              <p className="font-medium text-gray-900">{weather.sunset ? new Date(weather.sunset * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--'}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}