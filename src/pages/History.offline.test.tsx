import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { History } from './History'
import { markRead, resetOfflineStatusForTests } from '../services/offlineStore'

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 1, firstName: 'Alice', lastName: 'Martin', name: 'Alice Martin' },
    loading: false,
    isAuthenticated: true,
  }),
}))

vi.mock('../hooks/useHistory', () => ({
  HISTORY_WEEKS: 12,
  useHistory: () => ({
    weeks: [],
    stats: { runs: 0, streak: 0, distanceKm: 0, elevationGainM: 0 },
    parcours: [],
    loading: false,
    error: null,
    savingWeek: null,
    declare: vi.fn(),
    retract: vi.fn(),
    editableWeekKey: null,
    refresh: vi.fn(),
  }),
}))

function setNavigatorOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
}

function renderHistory() {
  return render(
    <MemoryRouter>
      <History />
    </MemoryRouter>
  )
}

beforeEach(() => {
  resetOfflineStatusForTests()
  setNavigatorOnline(true)
})

describe('History — bandeau hors ligne', () => {
  it('n’affiche aucun bandeau quand l’appareil est en ligne', () => {
    renderHistory()

    expect(screen.queryByText(/Hors ligne\./)).not.toBeInTheDocument()
  })

  it('dit l’âge des données quand le réseau manque', () => {
    renderHistory()

    setNavigatorOnline(false)
    act(() => {
      markRead('history:attendances:2026-11-18', new Date(2026, 10, 23, 7, 42, 0).getTime())
    })

    const banner = screen.getByText(/Hors ligne\./).closest('[role="status"]')
    expect(banner).not.toBeNull()
    expect(banner).toHaveTextContent(/Dernières données du .* à 7h42\./)
  })
})
