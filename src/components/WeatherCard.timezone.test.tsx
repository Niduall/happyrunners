import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WeatherCard } from './WeatherCard'
import type { WeatherData } from '../types'

// Le tsconfig de l'app ne charge pas les types Node ; `process` existe pourtant
// dans Vitest, qui tourne sous Node.
declare const process: { env: Record<string, string | undefined> }

const ORIGINAL_TZ = process.env.TZ

beforeAll(() => {
  // Se placer hors de France : sans `timeZone: 'Europe/Paris'`, l'affichage
  // serait décalé de six heures et le test échouerait.
  process.env.TZ = 'America/New_York'
})

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

const weather: WeatherData = {
  temperature: 18,
  feelsLike: 17,
  humidity: 60,
  windSpeed: 10,
  windDeg: 180,
  weatherCode: 0,
  isDay: true,
  dt: 0,
  // 6 octobre 2026 : 07:30 et 19:45 heure de Paris (UTC+2)
  sunrise: Date.UTC(2026, 9, 6, 5, 30) / 1000,
  sunset: Date.UTC(2026, 9, 6, 17, 45) / 1000,
}

describe('WeatherCard — heure de Paris', () => {
  it('affiche lever et coucher dans le fuseau de la course', () => {
    // Vérifie que le test tourne bien dans un autre fuseau : sans le
    // `timeZone` du composant, l'heure affichée serait 01:30.
    expect(
      new Date(weather.sunrise! * 1000).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    ).toBe('01:30')

    render(<WeatherCard weather={weather} />)

    expect(screen.getByText('07:30')).toBeInTheDocument()
    expect(screen.getByText('19:45')).toBeInTheDocument()
  })
})
