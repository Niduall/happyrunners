import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Home } from './Home'
import { useAuth } from '../hooks/useAuth'
import { useTargetWednesday } from '../hooks/useTargetWednesday'
import {
  declareWeeklyRun,
  getWeeklyRunSkip,
  getWeeklyRuns,
  skipWeeklyRun,
} from '../services/supabaseService'
import type { WeeklyRun } from '../types/supabase'

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
  useParcours: () => ({
    parcoursList: [
      {
        id: 'p1',
        name: 'Bords de Marne',
        distance_km: 8,
        elevation_gain_m: 100,
        created_by: 1,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
    ],
    loading: false,
  }),
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
vi.mock('../hooks/useTargetWednesday', () => ({ useTargetWednesday: vi.fn() }))
vi.mock('../services/weatherApi', () => ({
  getRunForecast: () => null,
  getRunWindow: () => [],
  daysUntilRun: () => 0,
  WEATHER_TIMEZONE: 'Europe/Paris',
}))
vi.mock('../services/supabaseService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/supabaseService')>()
  return {
    ...actual,
    getWeeklyRuns: vi.fn(),
    declareWeeklyRun: vi.fn(),
    getWeeklyRunSkip: vi.fn(),
    skipWeeklyRun: vi.fn(),
  }
})

const mockAuth = vi.mocked(useAuth)
const mockTarget = vi.mocked(useTargetWednesday)
const mockRuns = vi.mocked(getWeeklyRuns)
const mockDeclare = vi.mocked(declareWeeklyRun)
const mockSkipLookup = vi.mocked(getWeeklyRunSkip)
const mockSkipWrite = vi.mocked(skipWeeklyRun)

function target(over: Partial<ReturnType<typeof useTargetWednesday>> = {}) {
  return {
    weekKey: '2026-11-11',
    weekLabel: 'semaine du 11 nov.',
    date: new Date(2026, 10, 11),
    isRunDay: false,
    runStarted: false,
    ...over,
  }
}

function run(over: Partial<WeeklyRun> = {}): WeeklyRun {
  return {
    week_key: '2026-11-04',
    user_number: 14,
    parcours_id: 'p1',
    parcours_name: 'Bords de Marne',
    source: 'manual',
    distance_km: 8,
    elevation_gain_m: 100,
    declared_at: '2026-11-04T18:30:00Z',
    updated_at: '2026-11-04T18:30:00Z',
    ...over,
  }
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
  localStorage.clear()
  mockAuth.mockReturnValue({
    isAuthenticated: true,
    user: { id: 14, firstName: 'Julie', lastName: 'Moudin', name: 'Julie Moudin' },
  } as ReturnType<typeof useAuth>)
  mockTarget.mockReturnValue(target())
  mockRuns.mockResolvedValue([])
  mockDeclare.mockResolvedValue(undefined)
  mockSkipLookup.mockResolvedValue(false)
  mockSkipWrite.mockResolvedValue(undefined)
})

describe('Accueil — rappel de la sortie à déclarer', () => {
  it('propose la sortie de la semaine passée tant qu’elle manque', async () => {
    renderHome()

    expect(
      await screen.findByText(/Tu as couru le mercredi 4 novembre/)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Indiquer mon parcours' })
    ).toBeInTheDocument()
  })

  it('propose la sortie du jour dès 12h30', async () => {
    mockTarget.mockReturnValue(target({ isRunDay: true, runStarted: true }))

    renderHome()

    expect(
      await screen.findByText(/Tu as couru le mercredi 11 novembre/)
    ).toBeInTheDocument()
  })

  it('disparaît quand la sortie est déjà déclarée', async () => {
    mockRuns.mockResolvedValue([run()])

    renderHome()

    await waitFor(() => expect(mockRuns).toHaveBeenCalled())
    expect(screen.queryByText(/Tu as couru le/)).not.toBeInTheDocument()
  })

  it('déclare le parcours choisi sur la bonne semaine', async () => {
    const user = userEvent.setup()
    renderHome()

    await user.click(
      await screen.findByRole('button', { name: 'Indiquer mon parcours' })
    )

    const dialog = await screen.findByRole('dialog')
    // Aucune présélection : on ne peut pas enregistrer un parcours au hasard.
    expect(
      within(dialog).getByRole('button', { name: 'Enregistrer' })
    ).toBeDisabled()

    await user.click(
      within(dialog).getByRole('radio', { name: /Bords de Marne/ })
    )
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() =>
      expect(mockDeclare).toHaveBeenCalledWith({
        weekKey: '2026-11-04',
        userNumber: 14,
        parcoursId: 'p1',
        parcoursName: 'Bords de Marne',
        distanceKm: 8,
        elevationGainM: 100,
      })
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
  })

  it('disparaît quand on répond « je n’ai pas couru »', async () => {
    const user = userEvent.setup()
    renderHome()

    await user.click(
      await screen.findByRole('button', { name: 'Je n’ai pas couru' })
    )

    expect(screen.queryByText(/Tu as couru le/)).not.toBeInTheDocument()
    // Rien n'est déclaré : on n'écrit pas une fausse sortie pour autant.
    expect(mockDeclare).not.toHaveBeenCalled()
    // La réponse part en base pour suivre la personne d'un téléphone à l'autre.
    expect(mockSkipWrite).toHaveBeenCalledWith({
      weekKey: '2026-11-04',
      userNumber: 14,
    })
  })

  it('disparaît si un autre appareil a déjà répondu', async () => {
    // La réponse a été donnée sur un téléphone : rien en local sur celui-ci.
    mockSkipLookup.mockResolvedValue(true)

    renderHome()

    await waitFor(() => expect(mockSkipLookup).toHaveBeenCalled())
    expect(screen.queryByText(/Tu as couru le/)).not.toBeInTheDocument()
  })

  it('ne revient pas au rechargement de la page', async () => {
    const user = userEvent.setup()
    const first = renderHome()

    await user.click(
      await screen.findByRole('button', { name: 'Je n’ai pas couru' })
    )
    first.unmount()

    // Même appareil, même personne, même semaine : la réponse est retenue.
    renderHome()
    await waitFor(() => expect(mockRuns).toHaveBeenCalled())
    expect(screen.queryByText(/Tu as couru le/)).not.toBeInTheDocument()
  })
})
