import { describe, it, expect, beforeEach } from 'vitest'
import {
  RUN_REMINDER_KEY,
  clearRunReminderDismissal,
  dismissRunReminder,
  isRunReminderDismissed,
} from './runReminderDismissal'

const WEEK = '2026-11-11'
const NEXT_WEEK = '2026-11-18'

beforeEach(() => {
  localStorage.clear()
})

describe('runReminderDismissal — « je n’ai pas couru »', () => {
  it('rien n’est coupé sans réponse', () => {
    expect(isRunReminderDismissed(14, WEEK)).toBe(false)
  })

  it('coupe le rappel de la semaine visée', () => {
    dismissRunReminder(14, WEEK)

    expect(isRunReminderDismissed(14, WEEK)).toBe(true)
  })

  it('laisse revenir le rappel la semaine suivante', () => {
    dismissRunReminder(14, WEEK)

    expect(isRunReminderDismissed(14, NEXT_WEEK)).toBe(false)
  })

  it('lie la réponse au profil', () => {
    dismissRunReminder(14, WEEK)

    // Un autre compte sur le même appareil doit voir son propre rappel.
    expect(isRunReminderDismissed(9, WEEK)).toBe(false)
  })

  it('ne garde qu’une semaine par personne', () => {
    dismissRunReminder(14, WEEK)
    dismissRunReminder(14, NEXT_WEEK)

    expect(isRunReminderDismissed(14, NEXT_WEEK)).toBe(true)
    // L'ancienne réponse est remplacée : le repère ne grossit pas.
    expect(isRunReminderDismissed(14, WEEK)).toBe(false)
    expect(JSON.parse(localStorage.getItem(RUN_REMINDER_KEY)!)).toEqual({
      14: NEXT_WEEK,
    })
  })

  it('garde les autres profils intacts', () => {
    dismissRunReminder(14, WEEK)
    dismissRunReminder(9, NEXT_WEEK)

    expect(isRunReminderDismissed(14, WEEK)).toBe(true)
    expect(isRunReminderDismissed(9, NEXT_WEEK)).toBe(true)
  })

  it('ignore un repère illisible sans planter', () => {
    localStorage.setItem(RUN_REMINDER_KEY, 'pas du json')
    expect(isRunReminderDismissed(14, WEEK)).toBe(false)

    // Une réponse valide reste possible après un repère corrompu.
    dismissRunReminder(14, WEEK)
    expect(isRunReminderDismissed(14, WEEK)).toBe(true)
  })

  it('oublie la réponse d’une semaine', () => {
    dismissRunReminder(14, WEEK)
    clearRunReminderDismissal(14, WEEK)

    expect(isRunReminderDismissed(14, WEEK)).toBe(false)
    expect(localStorage.getItem(RUN_REMINDER_KEY)).toBe('{}')
  })

  it('ne touche pas la réponse d’une autre semaine', () => {
    dismissRunReminder(14, NEXT_WEEK)
    clearRunReminderDismissal(14, WEEK)

    expect(isRunReminderDismissed(14, NEXT_WEEK)).toBe(true)
  })

  it('ne touche pas la réponse d’une autre personne', () => {
    dismissRunReminder(9, WEEK)
    clearRunReminderDismissal(14, WEEK)

    expect(isRunReminderDismissed(9, WEEK)).toBe(true)
  })

  it('oublie sans planter un repère illisible', () => {
    localStorage.setItem(RUN_REMINDER_KEY, 'pas du json')

    expect(() => clearRunReminderDismissal(14, WEEK)).not.toThrow()
  })

  it('ignore une valeur qui n’est pas une semaine', () => {
    localStorage.setItem(RUN_REMINDER_KEY, JSON.stringify({ 14: 42 }))
    expect(isRunReminderDismissed(14, WEEK)).toBe(false)

    localStorage.setItem(RUN_REMINDER_KEY, JSON.stringify([WEEK]))
    expect(isRunReminderDismissed(14, WEEK)).toBe(false)
  })
})
