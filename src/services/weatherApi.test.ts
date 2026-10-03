import { describe, it, expect } from 'vitest'
import {
  getRunForecast,
  getRunTimestamp,
  daysUntilRun,
  transformOpenMeteoResponse,
  FORECAST_HORIZON_DAYS,
} from './weatherApi'
import type { WeatherForecast, WeatherData } from '../types'

const at = (year: number, month: number, day: number, hour = 10) =>
  new Date(year, month - 1, day, hour, 0, 0)

const hour = (dt: number, over: Partial<WeatherData> = {}): WeatherData => ({
  temperature: 15,
  feelsLike: 14,
  humidity: 60,
  windSpeed: 10,
  windDeg: 180,
  weatherCode: 0,
  isDay: true,
  description: '',
  icon: '',
  dt,
  ...over,
})

const forecast = (hourly: WeatherData[], daily: WeatherForecast['daily'] = []): WeatherForecast => ({
  current: hour(hourly[0]?.dt ?? 0),
  hourly,
  daily,
})

/** Payload Open-Meteo minimal mais réaliste */
const payload = (over: Record<string, unknown> = {}) => ({
  current: {
    time: '2026-10-06T10:00',
    temperature_2m: 14.2,
    apparent_temperature: 13.8,
    relative_humidity_2m: 78,
    wind_speed_10m: 11.4,
    wind_direction_10m: 220,
    wind_gusts_10m: 24.3,
    weather_code: 3,
    is_day: 1,
  },
  hourly: {
    time: Array.from({ length: 384 }, (_, i) => {
      const d = new Date(2026, 9, 2, i)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:00`
    }),
    temperature_2m: Array(384).fill(16),
    apparent_temperature: Array(384).fill(15),
    relative_humidity_2m: Array(384).fill(70),
    wind_speed_10m: Array(384).fill(12),
    wind_direction_10m: Array(384).fill(200),
    wind_gusts_10m: Array(384).fill(25),
    precipitation_probability: Array(384).fill(30),
    weather_code: Array(384).fill(0),
  },
  daily: {
    time: Array.from({ length: 16 }, (_, i) => {
      const d = new Date(2026, 9, 2 + i)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }),
    weather_code: Array(16).fill(2),
    temperature_2m_max: Array(16).fill(21),
    temperature_2m_min: Array(16).fill(12),
    precipitation_probability_max: Array(16).fill(20),
    sunrise: Array(16).fill('2026-10-02T07:30'),
    sunset: Array(16).fill('2026-10-02T19:45'),
  },
  ...over,
})

describe('transformOpenMeteoResponse', () => {
  const result = transformOpenMeteoResponse(payload() as never)

  it('convertit les 384 heures en hourly', () => {
    expect(result.hourly).toHaveLength(384)
    expect(result.hourly[0].dt).toBeGreaterThan(0)
  })

  it('convertit les 16 jours en daily', () => {
    expect(result.daily).toHaveLength(16)
    expect(result.daily[0].temp).toEqual({ min: 12, max: 21 })
  })

  it('normalise la probabilité de pluie en 0..1', () => {
    // Open-Meteo renvoie 30 (pourcent) → on veut 0.3
    expect(result.hourly[0].pop).toBeCloseTo(0.3)
    expect(result.daily[0].pop).toBeCloseTo(0.2)
  })

  it('conserve les rafales déjà en km/h', () => {
    // 24.3 km/h → arrondi 24 (PAS de conversion *3.6)
    expect(result.current.windGust).toBe(24)
    expect(result.hourly[0].windGust).toBe(25)
  })

  it('ne multiplie PAS le vent par 3.6 (déjà en km/h)', () => {
    // 12 km/h reste 12
    expect(result.hourly[0].windSpeed).toBe(12)
    expect(result.current.windSpeed).toBe(11)
  })

  it('expose le weather_code et is_day', () => {
    expect(result.current.weatherCode).toBe(3)
    expect(result.current.isDay).toBe(true)
    expect(result.hourly[0].weatherCode).toBe(0)
  })

  it('parse les heures ISO en timestamp Unix', () => {
    // 2026-10-06T10:00 en heure locale
    const expected = Math.floor(new Date(2026, 9, 6, 10, 0, 0).getTime() / 1000)
    expect(result.current.dt).toBe(expected)
  })

  it('récupère lever/coucher pour la météo courante', () => {
    expect(result.current.sunrise).toBeGreaterThan(0)
    expect(result.current.sunset).toBeGreaterThan(0)
  })
})

describe('getRunTimestamp', () => {
  it('vise 12h30 le mercredi du cycle', () => {
    const ts = getRunTimestamp(at(2026, 10, 6))
    const d = new Date(ts * 1000)
    expect(d.getDate()).toBe(7)
    expect(d.getHours()).toBe(12)
    expect(d.getMinutes()).toBe(30)
  })

  it('mercredi avant 14h → aujourd’hui', () => {
    expect(new Date(getRunTimestamp(at(2026, 10, 7, 9)) * 1000).getDate()).toBe(7)
  })

  it('mercredi après 14h → mercredi suivant', () => {
    expect(new Date(getRunTimestamp(at(2026, 10, 7, 15)) * 1000).getDate()).toBe(14)
  })
})

describe('getRunForecast — avec 16 jours de couverture', () => {
  it('trouve la prévision même à J-5 (vendredi pour mercredi)', () => {
    const from = at(2026, 10, 9, 9) // vendredi 9 oct
    const target = getRunTimestamp(from) // mercredi 14 oct 12h30
    const start = Math.floor(new Date(2026, 9, 9, 0, 0, 0).getTime() / 1000)

    // Open-Meteo renvoie 384 heures (16 jours), on en prend 240 (10 jours)
    const hourly: WeatherData[] = Array.from({ length: 240 }, (_, i) =>
      hour(start + i * 3600, { temperature: 10 + (i % 20), weatherCode: i % 5 })
    )

    const result = getRunForecast(
      forecast(hourly),
      from,
      Math.floor(from.getTime() / 1000)
    )

    expect(result).not.toBeNull()
    expect(result?.temperature).toBeGreaterThanOrEqual(10)
  })

  it('trouve la prévision à J-7 (dimanche pour le mercredi suivant)', () => {
    const from = at(2026, 10, 11, 9) // dimanche 11 oct
    const target = getRunTimestamp(from) // mercredi 14 oct
    const start = Math.floor(new Date(2026, 9, 11, 0, 0, 0).getTime() / 1000)

    // 384 heures comme la vraie réponse Open-Meteo
    const hourly: WeatherData[] = Array.from({ length: 384 }, (_, i) =>
      hour(start + i * 3600, { temperature: 10 + (i % 20), weatherCode: i % 5 })
    )

    const result = getRunForecast(
      forecast(hourly),
      from,
      Math.floor(from.getTime() / 1000)
    )

    expect(result).not.toBeNull()
  })

  it('la couverture de 16 jours englobe toujours le prochain run', () => {
    // Le pire cas : jeudi juste après la bascule → run à ~7 jours
    const from = at(2026, 10, 8, 15)
    const target = getRunTimestamp(from)
    const daysOut = (target * 1000 - from.getTime()) / 86_400_000
    expect(daysOut).toBeLessThanOrEqual(FORECAST_HORIZON_DAYS)
  })

  it('choisit la période la plus proche de 12h30', () => {
    const from = at(2026, 10, 6)
    const target = getRunTimestamp(from)
    const data = forecast([
      hour(target - 6 * 3600, { temperature: 10 }),
      hour(target - 1 * 3600, { temperature: 17 }),
      hour(target + 2 * 3600, { temperature: 22 }),
    ])

    expect(getRunForecast(data, from, Math.floor(from.getTime() / 1000))?.temperature).toBe(17)
  })

  it('retourne null si rien n’est proche de 12h30', () => {
    const from = at(2026, 10, 6)
    const target = getRunTimestamp(from)
    const data = forecast([hour(target - 5 * 3600), hour(target + 5 * 3600)])

    expect(getRunForecast(data, from, Math.floor(from.getTime() / 1000))).toBeNull()
  })

  it('accepte une période à 90 min de la cible', () => {
    const from = at(2026, 10, 6)
    const target = getRunTimestamp(from)
    const data = forecast([hour(target - 90 * 60, { temperature: 16 })])

    expect(getRunForecast(data, from, Math.floor(from.getTime() / 1000))?.temperature).toBe(16)
  })

  it('force isDay=true (le run est toujours à 12h30)', () => {
    const from = at(2026, 10, 6)
    const target = getRunTimestamp(from)
    const data = forecast([hour(target, { isDay: false })])

    expect(getRunForecast(data, from, Math.floor(from.getTime() / 1000))?.isDay).toBe(true)
  })

  it('reprend lever/coucher du jour du run', () => {
    const from = at(2026, 10, 6)
    const target = getRunTimestamp(from)
    const dayStart = Math.floor(new Date(2026, 9, 7, 0, 0, 0).getTime() / 1000)

    const daily = [
      {
        ...hour(dayStart),
        sunrise: 999,
        sunset: 888,
        temp: { min: 10, max: 20 },
      },
    ]

    const result = getRunForecast(forecast([hour(target)], daily), from, Math.floor(from.getTime() / 1000))
    expect(result?.sunrise).toBe(999)
    expect(result?.sunset).toBe(888)
  })

  it('retourne null si aucune donnée horaire', () => {
    expect(getRunForecast(forecast([]), at(2026, 10, 6), Math.floor(at(2026, 10, 6).getTime() / 1000))).toBeNull()
  })
})

describe('daysUntilRun', () => {
  it('0 le jour du run avant 14h', () => {
    expect(daysUntilRun(at(2026, 10, 7, 9))).toBe(0)
  })
  it('7 le jour du run après 14h', () => {
    expect(daysUntilRun(at(2026, 10, 7, 15))).toBe(7)
  })
  it('1 la veille', () => {
    expect(daysUntilRun(at(2026, 10, 6))).toBe(1)
  })
  it('4 le samedi', () => {
    expect(daysUntilRun(at(2026, 10, 10))).toBe(4)
  })
})
