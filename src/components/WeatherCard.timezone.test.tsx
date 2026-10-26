import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WeatherCard } from './WeatherCard'
import { isoToEpoch } from '../services/weatherApi'
import type { WeatherData } from '../types'

// Le tsconfig de l'app ne charge pas les types Node ; `process` existe pourtant
// dans Vitest, qui tourne sous Node.
declare const process: { env: Record<string, string | undefined> }

const ORIGINAL_TZ = process.env.TZ

beforeAll(() => {
  // Se placer hors de France : sans `timeZone: 'Europe/Paris'`, les heures
  // affichées seraient décalées de six heures et le test échouerait.
  process.env.TZ = 'America/New_York'
})

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

const at = (iso: string): WeatherData => ({
  temperature: 12,
  feelsLike: 11,
  humidity: 60,
  windSpeed: 10,
  windDeg: 180,
  weatherCode: 0,
  isDay: true,
  dt: isoToEpoch(iso),
})

/** Mercredi 28 octobre 2026, de 11h à 14h heure de Paris. */
const runWindow = [
  at('2026-10-28T11:00'),
  at('2026-10-28T12:00'),
  at('2026-10-28T13:00'),
  at('2026-10-28T14:00'),
]

describe('WeatherCard — heure de Paris', () => {
  it('affiche les heures du bandeau dans le fuseau de la course', () => {
    // Vérifie que le test tourne bien dans un autre fuseau : 12h à Paris
    // n'est pas 12h à New York.
    expect(new Date(runWindow[1].dt * 1000).getHours()).not.toBe(12)

    render(<WeatherCard weather={runWindow[1]} hours={runWindow} />)

    expect(screen.getByText('11h')).toBeInTheDocument()
    expect(screen.getByText('12h')).toBeInTheDocument()
    expect(screen.getByText('13h')).toBeInTheDocument()
    expect(screen.getByText('14h')).toBeInTheDocument()
  })
})
