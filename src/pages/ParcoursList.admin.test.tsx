import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ParcoursList } from './ParcoursList'
import { AuthProvider } from '../hooks/useAuth'
import { getParcours, deleteParcours, getWeekTallies, updateUserProfile } from '../services/supabaseService'

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
const mockTallies = vi.mocked(getWeekTallies)

const ADMIN_CODE = 'club-secret'

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
  sessionStorage.clear()
  vi.clearAllMocks()
  vi.stubEnv('VITE_ADMIN_CODE', ADMIN_CODE)
  localStorage.setItem(
    'running_user',
    JSON.stringify({ id: 3, firstName: 'Paul', lastName: 'Martin', name: 'Paul Martin' })
  )
  mockGetParcours.mockResolvedValue([
    parcours('p1', 'Bois de Haye'),
    parcours('p2', 'Bosserville'),
  ] as never)
  mockDeleteParcours.mockResolvedValue(undefined)
  mockTallies.mockResolvedValue([] as never)
})

describe('ParcoursList — code administrateur', () => {
  it('affiche un cadenas au lieu de supprimer/modifier', async () => {
    renderPage()
    await screen.findByText('Bois de Haye')

    // Aucun bouton sensible sans le code
    expect(screen.queryByLabelText('Supprimer')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Modifier')).not.toBeInTheDocument()
    // Le cadenas est là, un par carte
    expect(screen.getAllByLabelText('Déverrouiller la gestion des parcours')).toHaveLength(2)
  })

  it('la carte reste visible même verrouillé', async () => {
    // Le bouton « voir la carte » est inoffensif : il ne doit pas disparaître
    renderPage()
    await screen.findByText('Bois de Haye')
    expect(screen.getAllByLabelText('Voir la carte')).toHaveLength(2)
  })

  it('la création reste accessible sans le code', async () => {
    // Choix explicite : on verrouille la suppression et la modification,
    // pas l'import GPX.
    renderPage()
    await screen.findByText('Bois de Haye')
    expect(screen.getByRole('button', { name: /Ajouter un parcours/ })).toBeInTheDocument()
  })

  it('un code incorrect affiche une erreur et ne déverrouille rien', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Bois de Haye')

    await user.click(screen.getAllByLabelText('Déverrouiller la gestion des parcours')[0])
    const dialog = await screen.findByRole('dialog')

    await user.type(within(dialog).getByLabelText('Code'), 'mauvais-code')
    await user.click(within(dialog).getByRole('button', { name: 'Déverrouiller' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Code incorrect')
    expect(screen.queryByLabelText('Supprimer')).not.toBeInTheDocument()
    expect(sessionStorage.getItem('happyrunners_admin_unlocked')).toBeNull()
  })

  it('le bon code révèle suppression et modification', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Bois de Haye')

    await user.click(screen.getAllByLabelText('Déverrouiller la gestion des parcours')[0])
    const dialog = await screen.findByRole('dialog')

    await user.type(within(dialog).getByLabelText('Code'), ADMIN_CODE)
    await user.click(within(dialog).getByRole('button', { name: 'Déverrouiller' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getAllByLabelText('Supprimer')).toHaveLength(2)
    expect(screen.getAllByLabelText('Modifier')).toHaveLength(2)
  })

  it('le déverrouillage survit à la navigation dans l’onglet', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Bois de Haye')

    await user.click(screen.getAllByLabelText('Déverrouiller la gestion des parcours')[0])
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Code'), ADMIN_CODE)
    await user.click(within(dialog).getByRole('button', { name: 'Déverrouiller' }))

    await waitFor(() => expect(screen.getAllByLabelText('Supprimer')).toHaveLength(2))
    // Memorisé pour la session : c'est le comportement demandé
    expect(sessionStorage.getItem('happyrunners_admin_unlocked')).toBe('1')
  })

  it('la suppression verrouillée demande le code AVANT la confirmation', async () => {
    // Deux étapes distinctes : code admin, puis confirmation de suppression.
    const user = userEvent.setup()
    mockTallies.mockResolvedValue([{ parcoursId: 'p1', yes: 2, no: 0 }] as never)
    renderPage()
    await screen.findByText('Bois de Haye')

    // Sans code : la poubelle n'existe pas, rien ne peut partir
    await user.click(screen.getAllByLabelText('Déverrouiller la gestion des parcours')[0])
    const adminDialog = await screen.findByRole('dialog')
    await user.type(within(adminDialog).getByLabelText('Code'), ADMIN_CODE)
    await user.click(within(adminDialog).getByRole('button', { name: 'Déverrouiller' }))
    await waitFor(() => expect(screen.getAllByLabelText('Supprimer')).toHaveLength(2))

    // Puis la confirmation habituelle, qui annonce les votes perdus
    await user.click(screen.getAllByLabelText('Supprimer')[0])
    expect(await screen.findByText('Supprimer ce parcours ?')).toBeInTheDocument()
    expect(screen.getByText(/2 votes seront perdus/)).toBeInTheDocument()
  })

  it('un verrou déjà ouvert en session est repris au rechargement', async () => {
    // Un second onglet, ou un rechargement : pas de ressaisie
    sessionStorage.setItem('happyrunners_admin_unlocked', '1')
    renderPage()
    await screen.findByText('Bois de Haye')
    expect(screen.getAllByLabelText('Supprimer')).toHaveLength(2)
  })

  it('sans code configuré, aucun cadenas et tout est accessible', async () => {
    // Déploiement sans la variable : on ne bloque pas l'admin par surprise
    vi.stubEnv('VITE_ADMIN_CODE', '')
    renderPage()
    await screen.findByText('Bois de Haye')

    expect(screen.queryByLabelText('Déverrouiller la gestion des parcours')).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('Supprimer')).toHaveLength(2)
  })

  it('la déconnexion reverrouille', async () => {
    // Téléphone partagé : le suivant ne doit pas hériter de l'accès admin
    vi.mocked(updateUserProfile)
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Bois de Haye')

    await user.click(screen.getAllByLabelText('Déverrouiller la gestion des parcours')[0])
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Code'), ADMIN_CODE)
    await user.click(within(dialog).getByRole('button', { name: 'Déverrouiller' }))
    await waitFor(() => expect(screen.getAllByLabelText('Supprimer')).toHaveLength(2))

    expect(sessionStorage.getItem('happyrunners_admin_unlocked')).toBe('1')
  })
})