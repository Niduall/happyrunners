import { describe, expect, it } from 'vitest'
import {
  buildRunIcs,
  calendarFileName,
  escapeIcsText,
  foldIcsLine,
} from './calendar'

const APP_URL = 'https://happyrunners.vercel.app'
const NOW = new Date('2026-11-08T10:00:00.000Z')

describe('fichier d’agenda du run', () => {
  it('place le run à 12h30 heure de Paris, converti en UTC (hiver)', () => {
    const ics = buildRunIcs({
      weekKey: '2026-11-11',
      appUrl: APP_URL,
      now: NOW,
    })

    // 11 novembre : UTC+1 → 12h30 Paris = 11h30 UTC, fin 14h = 13h UTC.
    expect(ics).toContain('DTSTART:20261111T113000Z')
    expect(ics).toContain('DTEND:20261111T130000Z')
  })

  it('gère le passage à l’heure d’été', () => {
    const ics = buildRunIcs({
      weekKey: '2026-07-08',
      appUrl: APP_URL,
      now: NOW,
    })

    // 8 juillet : UTC+2 → 12h30 Paris = 10h30 UTC, fin 14h = 12h UTC.
    expect(ics).toContain('DTSTART:20260708T103000Z')
    expect(ics).toContain('DTEND:20260708T120000Z')
  })

  it('porte un identifiant stable, le résumé et le lien', () => {
    const ics = buildRunIcs({
      weekKey: '2026-11-11',
      appUrl: APP_URL,
      now: NOW,
    })

    expect(ics).toContain('UID:happyrunners-2026-11-11@happyrunners')
    expect(ics).toContain('SUMMARY:HappyRunners — Course du mercredi')
    expect(ics).toContain(`URL:${APP_URL}`)
    expect(ics).toContain('DTSTAMP:20261108T100000Z')
    expect(ics.endsWith('\r\n')).toBe(true)
  })

  it('échappe les caractères réservés du format ICS', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')
  })

  it('plie les lignes longues sans dépasser 75 octets', () => {
    const long = `URL:${'x'.repeat(200)}`
    const folded = foldIcsLine(long)
    const lines = folded.split('\r\n')

    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
    // Retirer les espaces de continuation redonne la valeur d'origine.
    expect(folded.replace(/\r\n /g, '')).toBe(long)
  })

  it('nomme le fichier d’après la semaine', () => {
    expect(calendarFileName('2026-11-11')).toBe('happyrunners-2026-11-11.ics')
  })
})
