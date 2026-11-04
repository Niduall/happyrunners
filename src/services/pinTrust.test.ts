import { describe, it, expect, beforeEach } from 'vitest'
import {
  PIN_TRUST_DAYS,
  PIN_TRUST_KEY,
  forgetDevice,
  isDeviceTrusted,
  trustDevice,
} from './pinTrust'

const NOW = new Date('2026-11-04T12:00:00.000Z')
const DAY = 86_400_000

beforeEach(() => {
  localStorage.clear()
})

describe('pinTrust — appareil de confiance', () => {
  it('ne fait confiance à rien sans repère', () => {
    expect(isDeviceTrusted(14, NOW)).toBe(false)
  })

  it('fait confiance juste après une saisie réussie', () => {
    trustDevice(14, NOW)

    expect(isDeviceTrusted(14, NOW)).toBe(true)
  })

  it('lie la confiance au numéro de profil', () => {
    trustDevice(14, NOW)

    expect(isDeviceTrusted(9, NOW)).toBe(false)
  })

  it('expire au bout de 30 jours', () => {
    trustDevice(14, NOW)

    expect(
      isDeviceTrusted(14, new Date(NOW.getTime() + (PIN_TRUST_DAYS - 1) * DAY))
    ).toBe(true)
    expect(
      isDeviceTrusted(14, new Date(NOW.getTime() + PIN_TRUST_DAYS * DAY))
    ).toBe(false)
  })

  it('refuse un repère illisible ou incomplet', () => {
    localStorage.setItem(PIN_TRUST_KEY, 'pas du json')
    expect(isDeviceTrusted(14, NOW)).toBe(false)

    localStorage.setItem(PIN_TRUST_KEY, JSON.stringify({ userNumber: 14 }))
    expect(isDeviceTrusted(14, NOW)).toBe(false)

    localStorage.setItem(
      PIN_TRUST_KEY,
      JSON.stringify({ userNumber: 14, verifiedAt: 'date inconnue' })
    )
    expect(isDeviceTrusted(14, NOW)).toBe(false)
  })

  it('oublie l’appareil sur demande', () => {
    trustDevice(14, NOW)
    forgetDevice()

    expect(isDeviceTrusted(14, NOW)).toBe(false)
  })

  it('réécrit le repère à chaque nouvelle preuve', () => {
    trustDevice(14, NOW)
    const later = new Date(NOW.getTime() + 20 * DAY)
    trustDevice(14, later)

    // La confiance repart de la nouvelle date, pas de l'ancienne.
    expect(isDeviceTrusted(14, new Date(later.getTime() + 20 * DAY))).toBe(true)
  })
})
