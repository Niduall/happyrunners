import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WeatherCard } from './WeatherCard'
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
