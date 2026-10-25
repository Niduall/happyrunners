import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WeatherCard } from './WeatherCard'
import { isoToEpoch } from '../services/weatherApi'
import type { WeatherData } from '../types'

const weather = (over: Partial<WeatherData> = {}): WeatherData => ({
  temperature: 11,
  feelsLike: 10,
  humidity: 60,
  windSpeed: 10,
  windDeg: 180,
  weatherCode: 2,
  isDay: true,
  dt: 0,
  ...over,
})

const at = (iso: string, over: Partial<WeatherData> = {}): WeatherData =>
  weather({ dt: isoToEpoch(iso), ...over })

/** Mercredi 28 octobre 2026, de 11h à 14h (heure de Paris). */
const runWindow = [
  at('2026-10-28T11:00', { temperature: 11.3, weatherCode: 3, pop: 0 }),
  at('2026-10-28T12:00', { temperature: 11.4, weatherCode: 2, pop: 0 }),
  at('2026-10-28T13:00', { temperature: 11.9, weatherCode: 61, pop: 0.4 }),
  at('2026-10-28T14:00', { temperature: 12.5, weatherCode: 61, pop: 0.55 }),
]

/** La prévision retenue pour le run : 12h, comme `getRunForecast`. */
const runForecast = runWindow[1]

describe('WeatherCard — probabilité de pluie', () => {
  it('affiche « Pluie 0 % » quand la prévision est sèche', () => {
    // Masquer le bloc à 0 % faisait croire à une donnée manquante : on affiche
    // explicitement l'absence de pluie attendue.
    render(<WeatherCard weather={weather({ pop: 0 })} />)

    expect(screen.getByText('Pluie')).toBeInTheDocument()
    expect(screen.getByText('0 %')).toBeInTheDocument()
  })

  it('affiche le pourcentage arrondi', () => {
    render(<WeatherCard weather={weather({ pop: 0.42 })} />)

    expect(screen.getByText('42 %')).toBeInTheDocument()
  })

  it("masque le bloc quand la probabilité n'est pas connue", () => {
    // Météo « actuelle » d'Open-Meteo : pas de `pop`.
    render(<WeatherCard weather={weather()} />)

    expect(screen.queryByText('Pluie')).not.toBeInTheDocument()
  })
})

describe('WeatherCard — bandeau autour du run', () => {
  it('affiche les quatre heures de 11h à 14h', () => {
    const { container } = render(<WeatherCard weather={runForecast} hours={runWindow} />)

    expect(screen.getByText('Autour de 12h30')).toBeInTheDocument()
    const strip = container.querySelector('[data-run]')?.parentElement
    expect(strip?.children).toHaveLength(4)
    expect(strip?.textContent).toContain('11h')
    expect(strip?.textContent).toContain('12h')
    expect(strip?.textContent).toContain('13h')
    expect(strip?.textContent).toContain('14h')
  })

  it('encadre l’heure utilisée pour la prévision du run', () => {
    const { container } = render(<WeatherCard weather={runForecast} hours={runWindow} />)

    const marked = container.querySelectorAll('[data-run]')
    expect(marked).toHaveLength(1)
    expect(marked[0].textContent).toContain('12h')
  })

  it('affiche la pluie de chaque heure, même à 0 %', () => {
    const { container } = render(<WeatherCard weather={runForecast} hours={runWindow} />)

    const strip = container.querySelector('[data-run]')?.parentElement
    // L'espace avant « % » est une espace fine insécable (typographie française).
    const text = (strip?.textContent ?? '').replace(/\u202f/g, ' ')
    expect(text).toContain('0 %')
    expect(text).toContain('40 %')
    expect(text).toContain('55 %')
  })

  it('n’affiche pas de bandeau sans prévision', () => {
    render(<WeatherCard weather={weather({ pop: 0 })} />)

    expect(screen.queryByText('Autour de 12h30')).not.toBeInTheDocument()
  })
})
