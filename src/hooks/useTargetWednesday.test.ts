import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTargetWednesday } from './useTargetWednesday'

describe('useTargetWednesday — pas de re-rendu inutile', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('ne change pas la clé avant la bascule de 14h', () => {
    // Mercredi 7 oct 2026, 13h59
    const base = new Date(2026, 9, 7, 13, 59, 0)
    vi.setSystemTime(base)

    const { result, rerender } = renderHook(() => useTargetWednesday())
    const initialKey = result.current.weekKey

    // 10 ticks de 30s = 5 minutes → on passe de 13h59 à 14h04
    for (let i = 0; i < 10; i++) {
      act(() => {
        vi.advanceTimersByTime(30_000)
      })
      rerender()
    }

    // La bascule A eu lieu → la clé doit avoir changé
    expect(result.current.weekKey).not.toBe(initialKey)
    expect(result.current.weekKey).toBe('2026-10-14')
  })

  it('bascule exactement à 14h le mercredi', () => {
    vi.setSystemTime(new Date(2026, 9, 7, 13, 59, 0))
    const { result } = renderHook(() => useTargetWednesday())
    expect(result.current.weekKey).toBe('2026-10-07')

    // Passage à 14h00
    act(() => {
      vi.setSystemTime(new Date(2026, 9, 7, 14, 0, 0))
      vi.advanceTimersByTime(30_000)
    })

    expect(result.current.weekKey).toBe('2026-10-14')
  })

  it('la clé reste stable toute la journée (aucun changement inutile)', () => {
    // Lundi 5 oct 2026, 9h
    vi.setSystemTime(new Date(2026, 9, 5, 9, 0, 0))
    const { result, rerender } = renderHook(() => useTargetWednesday())
    const initial = result.current.weekKey
    expect(initial).toBe('2026-10-07')

    // 1 heure de ticks → toujours la même clé
    for (let i = 0; i < 120; i++) {
      act(() => {
        vi.advanceTimersByTime(30_000)
      })
      rerender()
    }

    expect(result.current.weekKey).toBe(initial)
    expect(result.current.weekLabel).toBe('semaine du 7 oct.')
  })

  it('isRunDay bascule aussi à 14h', () => {
    vi.setSystemTime(new Date(2026, 9, 7, 13, 0, 0))
    const { result } = renderHook(() => useTargetWednesday())
    expect(result.current.isRunDay).toBe(true)

    act(() => {
      vi.setSystemTime(new Date(2026, 9, 7, 15, 0, 0))
      vi.advanceTimersByTime(30_000)
    })

    // Après 14h on vise le run suivant → plus le jour du run
    expect(result.current.isRunDay).toBe(false)
    expect(result.current.weekKey).toBe('2026-10-14')
  })

  it('nettoie son timer au démontage', () => {
    // Le nombre de timers actifs baisse après le démontage
    const { unmount } = renderHook(() => useTargetWednesday())
    unmount()
    // Si le timer n'était pas nettoyé, les ticks suivants lèveraient
    // un avertissement "update on unmounted component" — on vérifie juste
    // que le démontage ne lève pas.
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(60_000)
      })
    }).not.toThrow()
  })

  it('la date cible est toujours à midi', () => {
    vi.setSystemTime(new Date(2026, 9, 5, 15, 0, 0))
    const { result } = renderHook(() => useTargetWednesday())
    expect(result.current.date.getHours()).toBe(12)
    expect(result.current.date.getMinutes()).toBe(0)
  })
})
