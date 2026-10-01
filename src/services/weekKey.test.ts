import { describe, it, expect } from 'vitest'
import {
  daysUntilWednesday,
  getTargetWednesday,
  getCurrentWeekKey,
  formatWeekLabel,
  weeksBetween,
} from './weekKey'

/** Helper : crée une date locale à jour/mois/année donnés */
const d = (year: number, month: number, day: number): Date => new Date(year, month - 1, day, 10, 0, 0)

// getDay() : 0=dimanche, 1=lundi, 2=mardi, 3=mercredi, 4=jeudi, 5=vendredi, 6=samedi
describe('daysUntilWednesday', () => {
  it('dimanche → 3 jours', () => {
    expect(daysUntilWednesday(d(2026, 10, 4))).toBe(3) // dim 4 oct
  })
  it('lundi → 2 jours', () => {
    expect(daysUntilWednesday(d(2026, 10, 5))).toBe(2)
  })
  it('mardi → 1 jour', () => {
    expect(daysUntilWednesday(d(2026, 10, 6))).toBe(1)
  })
  it('mercredi → 0 jour', () => {
    expect(daysUntilWednesday(d(2026, 10, 7))).toBe(0)
  })
  it('jeudi → 6 jours (mercredi suivant)', () => {
    expect(daysUntilWednesday(d(2026, 10, 8))).toBe(6)
  })
  it('vendredi → 5 jours', () => {
    expect(daysUntilWednesday(d(2026, 10, 9))).toBe(5)
  })
  it('samedi → 4 jours', () => {
    expect(daysUntilWednesday(d(2026, 10, 10))).toBe(4)
  })
})

describe('getTargetWednesday', () => {
  it('dimanche 4 oct → mercredi 7 oct', () => {
    expect(getCurrentWeekKey(d(2026, 10, 4))).toBe('2026-10-07')
  })
  it('mercredi 7 oct → mercredi 7 oct (aujourd’hui)', () => {
    expect(getCurrentWeekKey(d(2026, 10, 7))).toBe('2026-10-07')
  })
  it('jeudi 8 oct → mercredi 14 oct (nouveau cycle)', () => {
    expect(getCurrentWeekKey(d(2026, 10, 8))).toBe('2026-10-14')
  })
  it('samedi 10 oct → mercredi 14 oct', () => {
    expect(getCurrentWeekKey(d(2026, 10, 10))).toBe('2026-10-14')
  })
  it('lundi 5 oct → mercredi 7 oct', () => {
    expect(getCurrentWeekKey(d(2026, 10, 5))).toBe('2026-10-07')
  })
})

describe('getCurrentWeekKey — passage de mois', () => {
  it('fin de mois → mercredi suivant (mois suivant)', () => {
    // jeudi 29 oct 2026 + 6 jours = mercredi 4 nov 2026
    expect(getCurrentWeekKey(d(2026, 10, 29))).toBe('2026-11-04')
  })
  it('passage d’année', () => {
    // jeudi 31 déc 2026 + 6 jours = mercredi 6 jan 2027
    expect(getCurrentWeekKey(d(2026, 12, 31))).toBe('2027-01-06')
  })
  it('février (année bissextile 2028)', () => {
    // jeudi 24 fév 2028 + 6 jours = mercredi 1 mars 2028
    expect(getCurrentWeekKey(d(2028, 2, 24))).toBe('2028-03-01')
  })
})

describe('getCurrentWeekKey — format', () => {
  it('retourne toujours YYYY-MM-DD', () => {
    for (let day = 1; day <= 28; day++) {
      expect(getCurrentWeekKey(d(2026, 11, day))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
  it('pade les mois et jours sur 2 chiffres', () => {
    expect(getCurrentWeekKey(d(2026, 1, 7))).toMatch(/^2026-01-\d{2}$/)
  })
})

describe('formatWeekLabel', () => {
  it('formate en français', () => {
    expect(formatWeekLabel('2026-10-07')).toContain('7')
    expect(formatWeekLabel('2026-10-07')).toContain('oct')
  })
})

describe('weeksBetween', () => {
  it('0 pour la même semaine', () => {
    expect(weeksBetween('2026-10-07', '2026-10-07')).toBe(0)
  })
  it('1 pour deux mercredis consécutifs', () => {
    expect(weeksBetween('2026-10-07', '2026-10-14')).toBe(1)
  })
  it('4 pour un mois', () => {
    expect(weeksBetween('2026-10-07', '2026-11-04')).toBe(4)
  })
  it('fonctionne à cheval sur l’année', () => {
    expect(weeksBetween('2026-12-30', '2027-01-06')).toBe(1)
  })
})

describe('stabilité', () => {
  it('deux appels le même jour donnent la même clé', () => {
    const a = getCurrentWeekKey(d(2026, 10, 8))
    const b = getCurrentWeekKey(d(2026, 10, 8))
    expect(a).toBe(b)
  })
  it('le jour du run (mercredi) la clé pointe sur ce mercredi', () => {
    expect(getCurrentWeekKey(d(2026, 10, 7))).toBe('2026-10-07')
  })
})
