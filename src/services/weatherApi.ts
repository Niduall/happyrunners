import { type WeatherForecast, type WeatherData } from '../types'

const OPENWEATHER_API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY
const CURRENT_WEATHER_URL = 'https://api.openweathermap.org/data/2.5/weather'
const FORECAST_URL = 'https://api.openweathermap.org/data/2.5/forecast'

export const DEFAULT_LAT = 48.6833
export const DEFAULT_LON = 6.2167

export type { WeatherForecast, WeatherData }

export async function fetchWeather(lat: number = DEFAULT_LAT, lon: number = DEFAULT_LON): Promise<WeatherForecast> {
  if (!OPENWEATHER_API_KEY) {
    return getMockWeather()
  }

  try {
    const [currentRes, forecastRes] = await Promise.all([
      fetch(`${CURRENT_WEATHER_URL}?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=fr`),
      fetch(`${FORECAST_URL}?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=fr`),
    ])

    if (!currentRes.ok || !forecastRes.ok) {
      throw new Error(`Erreur météo: ${currentRes.status} / ${forecastRes.status}`)
    }

    const current = await currentRes.json()
    const forecast = await forecastRes.json()

    return transformStandardApiResponse(current, forecast)
  } catch (error) {
    console.error('Weather API error:', error)
    throw new Error(`Erreur météo: ${error instanceof Error ? error.message : 'Clé API invalide'}`)
  }
}

function transformStandardApiResponse(current: any, forecast: any): WeatherForecast {
  const now = Math.floor(Date.now() / 1000)
  
  const currentWeather: WeatherData = {
    temperature: current.main.temp,
    feelsLike: current.main.feels_like,
    humidity: current.main.humidity,
    windSpeed: Math.round(current.wind.speed * 3.6),
    windDeg: current.wind.deg || 0,
    description: current.weather[0]?.description || '',
    icon: current.weather[0]?.icon || '01d',
    dt: current.dt,
    sunrise: current.sys.sunrise,
    sunset: current.sys.sunset,
  }

  const hourly = forecast.list.slice(0, 8).map((item: any) => ({
    temperature: item.main.temp,
    feelsLike: item.main.feels_like,
    humidity: item.main.humidity,
    windSpeed: Math.round(item.wind.speed * 3.6),
    windDeg: item.wind.deg || 0,
    description: item.weather[0]?.description || '',
    icon: item.weather[0]?.icon || '01d',
    dt: item.dt,
  }))

  const dailyMap = new Map<string, any[]>()
  forecast.list.forEach((item: any) => {
    const date = new Date(item.dt * 1000).toDateString()
    if (!dailyMap.has(date)) dailyMap.set(date, [])
    dailyMap.get(date)!.push(item)
  })

  const daily = Array.from(dailyMap.entries()).slice(0, 7).map(([date, items]) => {
    const temps = items.map(i => i.main.temp)
    const midday = items.find(i => new Date(i.dt * 1000).getHours() === 12) || items[Math.floor(items.length / 2)]
    
    return {
      temperature: midday.main.temp,
      feelsLike: midday.main.feels_like,
      humidity: midday.main.humidity,
      windSpeed: Math.round(midday.wind.speed * 3.6),
      windDeg: midday.wind.deg || 0,
      description: midday.weather[0]?.description || '',
      icon: midday.weather[0]?.icon || '01d',
      dt: midday.dt,
      temp: { min: Math.min(...temps), max: Math.max(...temps) },
      sunrise: current.sys.sunrise,
      sunset: current.sys.sunset,
    }
  })

  return { current: currentWeather, hourly, daily }
}

export function getNextWednesdayNoon(): number {
  const today = new Date()
  const day = today.getDay()
  const diff = day <= 3 ? 3 - day : 10 - day
  
  const wednesday = new Date(today)
  wednesday.setDate(today.getDate() + diff)
  wednesday.setHours(12, 30, 0, 0)
  
  return Math.floor(wednesday.getTime() / 1000)
}

export function getWednesdayForecast(weather: WeatherForecast): WeatherData | null {
  const targetTime = getNextWednesdayNoon()
  const now = Math.floor(Date.now() / 1000)
  
  // Si le mercredi est dans plus de 5 jours (432000 sec), pas de prévision dispo
  if (targetTime - now > 5 * 24 * 3600) {
    return null
  }
  
  if (!weather.hourly || weather.hourly.length === 0) {
    return null
  }
  
  let closest = weather.hourly[0]
  let minDiff = Math.abs(closest.dt - targetTime)
  
  for (const hour of weather.hourly) {
    const diff = Math.abs(hour.dt - targetTime)
    if (diff < minDiff) {
      minDiff = diff
      closest = hour
    }
  }
  
  // Si la prévision la plus proche est à plus de 6h, fallback
  if (minDiff > 6 * 3600) {
    return null
  }
  
  return {
    ...closest,
    sunrise: weather.current.sunrise,
    sunset: weather.current.sunset,
  }
}

function getMockWeather(): WeatherForecast {
  const now = Math.floor(Date.now() / 1000)
  const baseWeather: WeatherData = {
    temperature: 18,
    feelsLike: 17,
    humidity: 65,
    windSpeed: 12,
    windDeg: 220,
    description: 'ciel dégagé',
    icon: '01d',
    dt: now,
    sunrise: now - 18000,
    sunset: now + 36000,
  }
  
  return {
    current: baseWeather,
    hourly: Array.from({ length: 24 }, (_, i) => ({
      ...baseWeather,
      temperature: 18 + Math.sin(i / 4) * 3,
      feelsLike: 17 + Math.sin(i / 4) * 3,
      windSpeed: 10 + i % 5,
      dt: now + i * 3600,
    })),
    daily: Array.from({ length: 7 }, (_, i) => ({
      ...baseWeather,
      temperature: 18 + Math.sin(i / 2) * 4,
      feelsLike: 17 + Math.sin(i / 2) * 4,
      dt: now + i * 86400,
      temp: { min: 12 + i, max: 22 + i },
      sunrise: now - 18000 + i * 86400,
      sunset: now + 36000 + i * 86400,
    })),
  }
}

export function getWeatherIconUrl(icon: string): string {
  return `https://openweathermap.org/img/wn/${icon}@2x.png`
}

export function formatWindDirection(deg: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO']
  const index = Math.round(deg / 22.5) % 16
  return directions[index]
}