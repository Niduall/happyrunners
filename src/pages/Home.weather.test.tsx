import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Home } from './Home'
import { AuthProvider } from '../hooks/useAuth'
import { fetchWeather } from '../services/weatherApi'
import { getUserProfile } from '../services/supabaseService'

vi.mock('../services/weatherApi', () => ({
  fetchWeather: vi.fn(),
  getRunForecast: vi.fn(() => null),
  getRunWindow: vi.fn(() => []),
  daysUntilRun: vi.fn(() => 2),
  formatWindDirection: vi.fn(() => 'O'),
  WEATHER_TIMEZONE: 'Europe/Paris',
}))

vi.mock('../services/supabaseService', () => ({
  getParcours: vi.fn().mockResolvedValue([]),
  getParcoursPoints: vi.fn().mockResolvedValue([]),
  getWeekTallies: vi.fn().mockResolvedValue([]),
  getWeekVotes: vi.fn().mockResolvedValue([]),
  getWeekAttendances: vi.fn().mockResolvedValue([]),
  getUserProfile: vi.fn(),
  findProfileByName: vi.fn(),
  createUserProfile: vi.fn(),
  updateUserProfile: vi.fn(),
  setAttendance: vi.fn(),
  deleteWeekVote: vi.fn(),
  castWeekVote: vi.fn(),
  deleteParcours: vi.fn(),
  addParcours: vi.fn(),
}))

const mockFetch = vi.mocked(fetchWeather)

const meteo = {
  current: {
    temperature: 12,
    apparentTemperature: 12,
    windSpeed: 8,
    windDirection: 'O',
    humidity: 89,
  },
  hourly: {
    times: [],
    temperature: [],
    apparentTemperature: [],
    humidity: [],
    windSpeed: [],
    windDirection: [],
    precipitation: [],
    precipitationProbability: [],
    weatherCode: [],
  },
  daily: { sunrise: [], sunset: [], weatherCode: [] },
  fetchedAt: new Date().toISOString(),
} as never

const renderHome = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <Home />
      </AuthProvider>
    </MemoryRouter>
  )

/** Le bandeau d'erreur météo, repéré par son bouton « Réessayer » */
const errorBanner = () =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Réessayer') ?? null
/** Le texte du message, sans dependre du decoupage du DOM */
const errorText = () => {
  const spans = [...document.querySelectorAll('span')]
  return spans.filter((el) => /Erreur météo/.test(el.textContent ?? '')).map((el) => el.textContent)
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  localStorage.setItem(
    'running_user',
    JSON.stringify({ id: 3, firstName: 'Paul', lastName: 'Martin', name: 'Paul Martin' })
  )
  vi.mocked(getUserProfile).mockResolvedValue({
    id: 'uuid-1',
    user_number: 3,
    first_name: 'Paul',
    last_name: 'Martin',
    pin_hash: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as never)
})

describe('Home — erreur météo', () => {
  it('affiche l’erreur quand aucune météo n’est disponible', async () => {
    mockFetch.mockRejectedValue(new Error('Erreur météo: HTTP 503'))
    renderHome()

    await waitFor(() => expect(mockFetch).toHaveBeenCalled(), { timeout: 4000 })
    await new Promise((r) => setTimeout(r, 200))
    expect(errorBanner()).not.toBeNull()
  })

  it('ne répète pas « Erreur météo » deux fois', async () => {
    // weatherApi préfixe déjà le message ; l'écran ajoutait le préfixe,
    // ce qui donnait « Erreur météo : Erreur météo : HTTP 503 ».
    mockFetch.mockRejectedValue(new Error('Erreur météo: HTTP 503'))
    renderHome()

    await waitFor(() => expect(errorBanner()).not.toBeNull(), { timeout: 4000 })
    const messages = errorText()
    expect(messages.join(' ')).not.toMatch(/Erreur météo\s*:\s*Erreur météo/i)
  })

  it('l’erreur disparaît quand le retry réussit', async () => {
    // Bug vu en prod : le 1er appel a renvoyé 503, le retry a réussi,
    // et le bandeau restait au-dessus d'une carte valide.
    mockFetch.mockRejectedValueOnce(new Error('Erreur météo: HTTP 503'))
    mockFetch.mockResolvedValue(meteo)

    const user = userEvent.setup()
    renderHome()

    await waitFor(() => expect(errorBanner()).not.toBeNull(), { timeout: 4000 })

    await user.click(errorBanner()!)

    await waitFor(() => expect(errorBanner()).toBeNull(), { timeout: 4000 })
  })

  it('n’affiche aucun bandeau quand la météo est disponible', async () => {
    // Un échec isolé (réseau) ne doit pas surcharger l'écran si le cache
    // fournit déjà des données valides.
    mockFetch.mockResolvedValue(meteo)
    renderHome()

    await waitFor(() => expect(mockFetch).toHaveBeenCalled(), { timeout: 4000 })
    await waitFor(() => expect(errorBanner()).toBeNull(), { timeout: 4000 })
    expect(errorText()).toHaveLength(0)
  })

})
