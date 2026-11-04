import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Home } from './Home'
import { useAuth } from '../hooks/useAuth'
import { useUnreadMessages } from '../hooks/useUnreadMessages'

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
vi.mock('../hooks/useTargetWednesday', () => ({
  useTargetWednesday: () => ({ weekKey: '2026-11-04', date: new Date('2026-11-04T12:30:00') }),
}))
vi.mock('../services/weatherApi', () => ({
  getRunForecast: () => null,
  getRunWindow: () => [],
  daysUntilRun: () => 0,
  WEATHER_TIMEZONE: 'Europe/Paris',
}))

const mockAuth = vi.mocked(useAuth)
const mockUnread = vi.mocked(useUnreadMessages)

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Home — chat réservé aux personnes connectées', () => {
  it('ne montre ni Messages ni la pastille à un visiteur', () => {
    mockAuth.mockReturnValue({
      isAuthenticated: false,
      user: null,
    } as ReturnType<typeof useAuth>)

    renderHome()

    expect(screen.queryByRole('button', { name: /Messages/ })).not.toBeInTheDocument()
    // Aucune requête de comptage ne doit partir sans identité.
    expect(mockUnread).toHaveBeenCalledWith(false, null)
  })

  it('montre Messages une fois connecté', () => {
    mockAuth.mockReturnValue({
      isAuthenticated: true,
      user: { id: 14, firstName: 'Julie', lastName: 'Moudin', name: 'Julie Moudin' },
    } as ReturnType<typeof useAuth>)

    renderHome()

    expect(screen.getByRole('button', { name: 'Messages' })).toBeInTheDocument()
    expect(mockUnread).toHaveBeenCalledWith(true, 14)
  })
})
