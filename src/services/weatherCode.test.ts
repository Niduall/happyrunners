import { describe, it, expect } from 'vitest'
import { getWeatherCodeInfo, weatherCodeToEmoji } from './weatherCode'

describe('getWeatherCodeInfo', () => {
  it('mapping des codes WMO principaux (jour)', () => {
    const cases: [number, string][] = [
      [0, 'Ensoleillé'],
      [1, 'Peu nuageux'],
      [2, 'Partiellement nuageux'],
      [3, 'Nuageux'],
      [45, 'Brouillard'],
      [51, 'Bruine légère'],
      [61, 'Pluie faible'],
      [65, 'Pluie forte'],
      [71, 'Neige légère'],
      [75, 'Neige forte'],
      [80, 'Averses légères'],
      [95, 'Orage'],
      [99, 'Orage avec grêle forte'],
    ]

    for (const [code, label] of cases) {
      expect(getWeatherCodeInfo(code).label).toBe(label)
    }
  })

  it('retourne un emoji non vide pour chaque code connu', () => {
    const codes = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]
    for (const code of codes) {
      const info = getWeatherCodeInfo(code)
      expect(info.emoji.length).toBeGreaterThan(0)
      expect(info.label.length).toBeGreaterThan(0)
    }
  })

  it('retourne le repli pour un code inconnu', () => {
    const info = getWeatherCodeInfo(1234)
    expect(info.emoji).toBe('🌡️')
    expect(info.label).toBe('Inconnu')
  })

  it('retourne le repli pour undefined / null', () => {
    expect(getWeatherCodeInfo(undefined).label).toBe('Inconnu')
    expect(getWeatherCodeInfo(null).label).toBe('Inconnu')
  })

  describe('variante nuit', () => {
    it('code 0 devient une lune', () => {
      expect(getWeatherCodeInfo(0, false).emoji).toBe('🌙')
      expect(getWeatherCodeInfo(0, false).label).toBe('Nuit claire')
    })

    it('code 1 devient une lune', () => {
      expect(getWeatherCodeInfo(1, false).emoji).toBe('🌙')
    })

    it('les codes de pluie restent inchangés la nuit', () => {
      expect(getWeatherCodeInfo(61, false).emoji).toBe(getWeatherCodeInfo(61, true).emoji)
      expect(getWeatherCodeInfo(95, false).emoji).toBe('⛈️')
    })

    it('le brouillard reste du brouillard la nuit', () => {
      expect(getWeatherCodeInfo(45, false).emoji).toBe('🌫️')
    })

    it('isDay par défaut = true', () => {
      expect(getWeatherCodeInfo(0).emoji).toBe('☀️')
    })
  })

  it('toutes les variantes de pluie utilisent le même emoji', () => {
    // 61, 63, 65 (pluie) et 66, 67 (pluie verglaçante)
    for (const code of [61, 63, 65, 66, 67]) {
      expect(getWeatherCodeInfo(code).emoji).toBe('🌧️')
    }
  })

  it('la bruine (51-57) est distinguée de la pluie (61-67)', () => {
    expect(getWeatherCodeInfo(53).emoji).toBe('🌦️')
    expect(getWeatherCodeInfo(63).emoji).toBe('🌧️')
  })

  it('les orages utilisent tous ⛈️', () => {
    for (const code of [95, 96, 99]) {
      expect(getWeatherCodeInfo(code).emoji).toBe('⛈️')
    }
  })

  it('toutes les couleurs sont des classes Tailwind valides', () => {
    const codes = [0, 3, 45, 61, 71, 95]
    for (const code of codes) {
      const info = getWeatherCodeInfo(code)
      expect(info.bg).toMatch(/^bg-[a-z]+-\d{2,3}$/)
      expect(info.text).toMatch(/^text-[a-z]+-\d{2,3}$/)
    }
  })
})

describe('weatherCodeToEmoji', () => {
  it('retourne juste l’emoji', () => {
    expect(weatherCodeToEmoji(0)).toBe('☀️')
    expect(weatherCodeToEmoji(0, false)).toBe('🌙')
    expect(weatherCodeToEmoji(95)).toBe('⛈️')
  })

  it('gère les codes inconnus', () => {
    expect(weatherCodeToEmoji(999)).toBe('🌡️')
  })
})
