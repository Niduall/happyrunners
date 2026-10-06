import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ParcoursList } from './ParcoursList'
import { AuthProvider } from '../hooks/useAuth'
import { getParcours, deleteParcours, getWeekTallies } from '../services/supabaseService'

vi.mock('../services/supabaseService', () => ({
  getParcours: vi.fn(),
  getNextParcours: vi.fn(),
  addParcours: vi.fn(),
  deleteParcours: vi.fn(),
  getUserProfile: vi.fn().mockResolvedValue(null),
  upsertUserProfile: vi.fn(),
  findProfileByName: vi.fn(),
  updateUserProfile: vi.fn(),
  createUserProfile: vi.fn(),
  getWeekTallies: vi.fn(),
  getWeekVotes: vi.fn(),
  castWeekVote: vi.fn(),
  deleteWeekVote: vi.fn(),
  getWeekAttendances: vi.fn(),
  setAttendance: vi.fn(),
  getRoster: vi.fn(),
}))

vi.mock('../services/gpxParser', () => ({ parseGPX: vi.fn() }))

const mockGetParcours = vi.mocked(getParcours)
const mockDeleteParcours = vi.mocked(deleteParcours)
const mockGetTallies = vi.mocked(getWeekTallies)

const seed = () => {
  localStorage.setItem(
    'running_user',
    JSON.stringify({ id: 3, firstName: 'Paul', lastName: 'Martin', name: 'Paul Martin' })
  )
}

const parcours = (id: string, name: string) => ({
  id,
  name,
  distance_km: 5,
  elevation_gain_m: 50,
  points: [],
  created_by: 3,
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <ParcoursList />
      </AuthProvider>
    </MemoryRouter>
  )

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  seed()
  mockDeleteParcours.mockResolvedValue(undefined)
  mockGetTallies.mockResolvedValue([] as never)
  mockGetParcours.mockResolvedValue([
    parcours('p1', 'Bois de Haye'),
    parcours('p2', 'Bosserville'),
  ] as never)
})

describe('ParcoursList — suppression', () => {
  it('un clic ouvre une confirmation et ne supprime rien', async () => {
    // ⚠️ Régression observée en prod : la suppression partait sans confirmation
    // lisible et la liste ne se rechargeait pas (30 s d'attente).
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Bois de Haye')
    await user.click(screen.getAllByLabelText('Supprimer')[0])

    // Une modale explicite apparaît, et rien n'est encore supprimé
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Supprimer ce parcours ?')).toBeInTheDocument()
    // Le nom est rappelé dans la modale, pour ne pas supprimer le mauvais
    expect(
      within(screen.getByRole('dialog')).getByText('Bois de Haye')
    ).toBeInTheDocument()
    expect(mockDeleteParcours).not.toHaveBeenCalled()
  })

  it('« Annuler » ne supprime rien', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Bois de Haye')
    await user.click(screen.getAllByLabelText('Supprimer')[0])
    await screen.findByRole('dialog')

    await user.click(screen.getByRole('button', { name: 'Annuler' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockDeleteParcours).not.toHaveBeenCalled()
    expect(screen.getByText('Bois de Haye')).toBeInTheDocument()
  })

  it('« Supprimer » ne supprime qu’un seul parcours', async () => {
    // ⚠️ Régression : un clic unique partait sur DEUX requêtes DELETE.
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Bois de Haye')
    await user.click(screen.getAllByLabelText('Supprimer')[0])
    await screen.findByRole('dialog')

    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer' })
    )

    await waitFor(() => expect(mockDeleteParcours).toHaveBeenCalled())
    expect(mockDeleteParcours).toHaveBeenCalledTimes(1)
    expect(mockDeleteParcours).toHaveBeenCalledWith('p1')
  })

  it('retire le parcours de la liste sans rechargement manuel', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Bois de Haye')

    // Après suppression, la base ne renvoie plus que p2
    mockGetParcours.mockResolvedValue([parcours('p2', 'Bosserville')] as never)

    await user.click(screen.getAllByLabelText('Supprimer')[0])
    await screen.findByRole('dialog')
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer' })
    )

    await waitFor(() => expect(screen.queryByText('Bois de Haye')).not.toBeInTheDocument())
    // Le parcours suivant est toujours là
    expect(screen.getByText('Bosserville')).toBeInTheDocument()
  })

  it('annonce le nombre de votes qui seront perdus', async () => {
    const user = userEvent.setup()
    mockGetTallies.mockResolvedValue([
      { parcoursId: 'p1', yes: 3, no: 1 },
      { parcoursId: 'p2', yes: 0, no: 0 },
    ] as never)

    renderPage()
    await screen.findByText('Bois de Haye')

    await user.click(screen.getAllByLabelText('Supprimer')[0])

    expect(await screen.findByText(/3 votes seront perdus/)).toBeInTheDocument()
  })

  it('n’annonce pas de votes quand le parcours n’en a aucun', async () => {
    const user = userEvent.setup()
    mockGetTallies.mockResolvedValue([{ parcoursId: 'p2', yes: 1, no: 0 }] as never)

    renderPage()
    await screen.findByText('Bois de Haye')

    await user.click(screen.getAllByLabelText('Supprimer')[0])
    await screen.findByRole('dialog')

    expect(screen.queryByText(/vote/)).not.toBeInTheDocument()
  })

  it('affiche une erreur si la suppression échoue et garde le parcours', async () => {
    const user = userEvent.setup()
    mockDeleteParcours.mockRejectedValue(new Error('network'))
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

    renderPage()
    await screen.findByText('Bois de Haye')
    await user.click(screen.getAllByLabelText('Supprimer')[0])
    await screen.findByRole('dialog')
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer' })
    )

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Impossible de supprimer « Bois de Haye »')
    )
    // Le parcours est toujours dans la liste : rien n'a été supprimé
    expect(screen.getAllByText('Bois de Haye').length).toBeGreaterThan(0)
    expect(screen.getByText('Bosserville')).toBeInTheDocument()
  })
})