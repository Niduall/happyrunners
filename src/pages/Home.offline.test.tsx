import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Home } from './Home'
import { useAuth } from '../hooks/useAuth'
import { markRead, resetOfflineStatusForTests } from '../services/offlineStore'

vi.mock('../hooks/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('../hooks/useUnreadMessages', () => ({ useUnreadMessages: vi.fn(() => 0) }))
vi.mock('../hooks/useWeather', () => ({
  useWeather: () => ({
    weather: null,
    loading: false,
    error: null,
    refresh: vi.fn(),
    fetchedAt: null,
  }),
}))
vi.mock('../hooks/useParcours', () => ({
  useParcours: () => ({ parcoursList: [], loading: false }),
}))
vi.mock('../hooks/useParcoursVotes', () => ({
  useParcoursVotes: () => ({
    tallies: {},
    myChoice: null,
    choiceOf: () => null,
    savingParcoursId: null,
    error: null,
    toggleChoice: vi.fn(),
    rankedParcoursIds: [],
    winners: [],
    isTie: false,
  }),
}))
vi.mock('../hooks/useAttendance', () => ({
  useAttendance: () => ({
    myStatus: null,
    attendees: [],
    loading: false,
    saving: false,
    error: null,
    setMyStatus: vi.fn(),
    showParcours: false,
  }),
}))
vi.mock('../hooks/useProfiles', () => ({ useProfiles: () => ({ profiles: [] }) }))
vi.mock('../hooks/useLastRun', () => ({
  useLastRun: () => ({
    weekKey: null,
    myRun: null,
    dismissed: false,
    loading: false,
    saving: false,
    error: null,
    declare: vi.fn(),
    dismiss: vi.fn(),
  }),
}))
vi.mock('../hooks/useTargetWednesday', () => ({
  useTargetWednesday: () => ({ weekKey: '2026-11-25', date: new Date('2026-11-25T12:30:00') }),
}))
vi.mock('../services/weatherApi', () => ({
  getRunForecast: () => null,
  getRunWindow: () => [],
  daysUntilRun: () => 0,
  WEATHER_TIMEZONE: 'Europe/Paris',
}))

const mockAuth = vi.mocked(useAuth)

function setNavigatorOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
}

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  resetOfflineStatusForTests()
  setNavigatorOnline(true)
})

describe('Home — bandeau hors ligne', () => {
  it('n’affiche aucun bandeau quand l’appareil est en ligne', () => {
    mockAuth.mockReturnValue({
      isAuthenticated: true,
      user: { id: 3, firstName: 'Paulin', lastName: 'Claudin', name: 'Paulin Claudin' },
    } as ReturnType<typeof useAuth>)

    renderHome()

    expect(screen.queryByText(/Hors ligne\./)).not.toBeInTheDocument()
  })

  it('affiche le bandeau daté quand le réseau manque', () => {
    mockAuth.mockReturnValue({
      isAuthenticated: true,
      user: { id: 3, firstName: 'Paulin', lastName: 'Claudin', name: 'Paulin Claudin' },
    } as ReturnType<typeof useAuth>)

    renderHome()

    setNavigatorOnline(false)
    act(() => {
      markRead('parcours', new Date(2026, 10, 23, 7, 42, 0).getTime())
    })

    const banner = screen.getByText(/Hors ligne\./).closest('[role="status"]')
    expect(banner).not.toBeNull()
    expect(banner).toHaveTextContent(/Dernières données du/)
  })

  it('ne montre pas le bandeau à un visiteur', () => {
    mockAuth.mockReturnValue({
      isAuthenticated: false,
      user: null,
    } as ReturnType<typeof useAuth>)

    renderHome()

    setNavigatorOnline(false)
    act(() => {
      markRead('parcours', Date.now())
    })

    expect(screen.queryByText(/Hors ligne\./)).not.toBeInTheDocument()
  })
})
