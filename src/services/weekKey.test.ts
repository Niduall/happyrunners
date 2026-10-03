import { describe, it, expect } from 'vitest'
import {
  daysUntilTargetWednesday,
  getTargetWednesday,
  getCurrentWeekKey,
  formatWeekLabel,
  isRunDay,
  weeksBetween,
} from './weekKey'

/** Helper : date locale à jour/mois/année + heure */
const at = (year: number, month: number, day: number, hour = 10) =>
  new Date(year, month - 1, day, hour, 0, 0)

// getDay() : 0=dimanche, 1=lundi, 2=mardi, 3=mercredi, 4=jeudi, 5=vendredi, 6=samedi
describe('daysUntilTargetWednesday', () => {
  it('dimanche → 3 jours', () => {
    expect(daysUntilTargetWednesday(at(2026, 10, 4))).toBe(3)
  })
  it('lundi → 2 jours', () => {
    expect(daysUntilTargetWednesday(at(2026, 10, 5))).toBe(2)
  })
  it('mardi → 1 jour', () => {
    expect(daysUntilTargetWednesday(at(2026, 10, 6))).toBe(1)
  })

  describe('le jour du run (mercredi)', () => {
    it('à 10h (matin, run en cours) → 0 jour', () => {
      expect(daysUntilTargetWednesday(at(2026, 10, 7, 10))).toBe(0)
    })
    it('à 12h (pile l’heure du run) → 0 jour', () => {
      expect(daysUntilTargetWednesday(at(2026, 10, 7, 12))).toBe(0)
    })
    it('à 13h59 (avant la bascule) → 0 jour', () => {
      expect(daysUntilTargetWednesday(at(2026, 10, 7, 13))).toBe(0)
    })
    it('à 14h pile (bascule) → 7 jours', () => {
      expect(daysUntilTargetWednesday(at(2026, 10, 7, 14))).toBe(7)
    })
    it('à 15h → 7 jours', () => {
      expect(daysUntilTargetWednesday(at(2026, 10, 7, 15))).toBe(7)
    })
    it('à 23h59 → 7 jours', () => {
      expect(daysUntilTargetWednesday(at(2026, 10, 7, 23))).toBe(7)
    })
  })

  it('jeudi → 6 jours', () => {
    expect(daysUntilTargetWednesday(at(2026, 10, 8))).toBe(6)
  })
  it('vendredi → 5 jours', () => {
    expect(daysUntilTargetWednesday(at(2026, 10, 9))).toBe(5)
  })
  it('samedi → 4 jours', () => {
    expect(daysUntilTargetWednesday(at(2026, 10, 10))).toBe(4)
  })
})

describe('getCurrentWeekKey', () => {
  it('mardi → mercredi en cours', () => {
    expect(getCurrentWeekKey(at(2026, 10, 6))).toBe('2026-10-07')
  })

  it('mercredi matin → aujourd’hui', () => {
    expect(getCurrentWeekKey(at(2026, 10, 7, 10))).toBe('2026-10-07')
  })

  it('mercredi 13h → encore aujourd’hui', () => {
    expect(getCurrentWeekKey(at(2026, 10, 7, 13))).toBe('2026-10-07')
  })

  it('mercredi 14h → mercredi suivant', () => {
    expect(getCurrentWeekKey(at(2026, 10, 7, 14))).toBe('2026-10-14')
  })

  it('jeudi → mercredi suivant', () => {
    expect(getCurrentWeekKey(at(2026, 10, 8))).toBe('2026-10-14')
  })
  it('lundi → mercredi en cours', () => {
    expect(getCurrentWeekKey(at(2026, 10, 5))).toBe('2026-10-07')
  })

  describe('passage de mois', () => {
    it('fin de mois → mercredi suivant (mois suivant)', () => {
      // jeudi 29 oct 2026 + 6 jours = mercredi 4 nov 2026
      expect(getCurrentWeekKey(at(2026, 10, 29))).toBe('2026-11-04')
    })
    it('passage d’année', () => {
      // jeudi 31 déc 2026 + 6 jours = mercredi 6 jan 2027
      expect(getCurrentWeekKey(at(2026, 12, 31))).toBe('2027-01-06')
    })
    it('février bissextile (2028)', () => {
      // jeudi 24 fév 2028 + 6 jours = mercredi 1 mars 2028
      expect(getCurrentWeekKey(at(2028, 2, 24))).toBe('2028-03-01')
    })
  })

  describe('bascule du mercredi dans les cas limites', () => {
    it('mercredi 31 déc 2025 14h → 7 jan 2026 (passage d’année à la bascule)', () => {
      expect(getCurrentWeekKey(at(2025, 12, 31, 14))).toBe('2026-01-07')
    })
    it('mercredi 30 déc 2026 14h → 6 jan 2027', () => {
      expect(getCurrentWeekKey(at(2026, 12, 30, 14))).toBe('2027-01-06')
    })
    it('mercredi 30 déc 2026 10h → reste 30 déc 2026', () => {
      expect(getCurrentWeekKey(at(2026, 12, 30, 10))).toBe('2026-12-30')
    })
  })
})

describe('getCurrentWeekKey — format', () => {
  it('retourne toujours YYYY-MM-DD', () => {
    for (let day = 1; day <= 28; day++) {
      expect(getCurrentWeekKey(at(2026, 11, day))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
  it('pade les mois sur 2 chiffres', () => {
    expect(getCurrentWeekKey(at(2026, 1, 7))).toMatch(/^2026-01-\d{2}$/)
  })
})

describe('getTargetWednesday', () => {
  it('retourne le mercredi à midi', () => {
    const w = getTargetWednesday(at(2026, 10, 5))
    expect(w.getHours()).toBe(12)
    expect(w.getDate()).toBe(7)
  })
})

describe('formatWeekLabel', () => {
  it('contient le jour et le mois', () => {
    const label = formatWeekLabel('2026-10-07')
    expect(label).toContain('7')
    expect(label).toContain('oct')
  })
})

describe('isRunDay', () => {
  it('vrai le mercredi avant 14h', () => {
    expect(isRunDay('2026-10-07', at(2026, 10, 7, 10))).toBe(true)
  })
  it('faux le mercredi après 14h (on bascule)', () => {
    expect(isRunDay('2026-10-07', at(2026, 10, 7, 15))).toBe(false)
  })
  it('faux un autre jour', () => {
    expect(isRunDay('2026-10-07', at(2026, 10, 8))).toBe(false)
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
    expect(getCurrentWeekKey(at(2026, 10, 8, 9))).toBe(getCurrentWeekKey(at(2026, 10, 8, 18)))
  })
  it('la bascule de 13h59 à 14h00 change bien la clé', () => {
    const avant = getCurrentWeekKey(at(2026, 10, 7, 13))
    const apres = getCurrentWeekKey(at(2026, 10, 7, 14))
    expect(avant).not.toBe(apres)
    expect(apres).toBe('2026-10-14')
  })
})
