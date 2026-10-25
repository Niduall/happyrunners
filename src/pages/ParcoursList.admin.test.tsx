import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ParcoursList } from './ParcoursList'
import { AuthProvider, useAuth } from '../hooks/useAuth'
import { getParcours, deleteParcours, getWeekTallies, getUserProfile } from '../services/supabaseService'

vi.mock('../services/supabaseService', () => ({
  getParcours: vi.fn(),
  getParcoursPoints: vi.fn(),
  addParcours: vi.fn(),
  deleteParcours: vi.fn(),
  updateParcours: vi.fn(),
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

/** Même page, plus un bouton pour changer d'identité sans quitter l'écran. */
function Harness() {
  const { logout } = useAuth()
  return (
    <>
      <button onClick={logout}>se déconnecter</button>
      <ParcoursList />
    </>
  )
}

const renderHarness = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <Harness />
      </AuthProvider>
    </MemoryRouter>
  )

/** Déverrouille l'admin depuis l'interface, comme le ferait un membre */
const unlockViaUi = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getAllByLabelText('Déverrouiller la gestion des parcours')[0])
  const dialog = await screen.findByRole('dialog')
  await user.type(within(dialog).getByLabelText('Code'), ADMIN_CODE)
  await user.click(within(dialog).getByRole('button', { name: 'Déverrouiller' }))
  await waitFor(() => expect(screen.getAllByLabelText('Supprimer')).toHaveLength(2))
}

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
    // Le remplacement du tracé est une modification : lui aussi attend le code
    expect(screen.queryByRole('button', { name: /Remplacer le GPX/ })).not.toBeInTheDocument()
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

  it('Échap ferme la demande de code sans déverrouiller', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Bois de Haye')

    await user.click(screen.getAllByLabelText('Déverrouiller la gestion des parcours')[0])
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByLabelText('Supprimer')).not.toBeInTheDocument()
  })

  it('un code incorrect affiche une erreur et ne déverrouille rien', async () => {    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Bois de Haye')

    await user.click(screen.getAllByLabelText('Déverrouiller la gestion des parcours')[0])
    const dialog = await screen.findByRole('dialog')

    await user.type(within(dialog).getByLabelText('Code'), 'mauvais-code')
    await user.click(within(dialog).getByRole('button', { name: 'Déverrouiller' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Code incorrect')
    expect(screen.queryByLabelText('Supprimer')).not.toBeInTheDocument()
    // Rien n'est mémorisé nulle part : le verrou est un état de page
    expect(sessionStorage.length).toBe(0)
  })

  it('le bon code révèle suppression et modification', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Bois de Haye')

    await unlockViaUi(user)

    expect(screen.getAllByLabelText('Modifier')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /Remplacer le GPX/ })).toHaveLength(2)
  })

  it('ne mémorise rien dans le navigateur', async () => {
    // Le verrou ne vaut que pour la page et la personne : s'il était rangé
    // dans le navigateur, il survivrait à la sortie de l'écran et au
    // changement d'utilisateur sur un poste partagé.
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Bois de Haye')
    await unlockViaUi(user)

    expect(sessionStorage.length).toBe(0)
    expect(localStorage.getItem('happyrunners_admin_unlocked')).toBeNull()
  })

  it('se reverrouille en quittant la page de gestion', async () => {
    // Demandé explicitement : l'accès ne dure pas toute la session de
    // l'onglet, il s'arrête quand on quitte l'écran.
    const user = userEvent.setup()
    const { unmount } = renderPage()
    await screen.findByText('Bois de Haye')
    await unlockViaUi(user)

    // On quitte la page…
    unmount()

    // …et on y revient : le code est redemandé
    renderPage()
    await screen.findByText('Bois de Haye')
    expect(screen.getAllByLabelText('Déverrouiller la gestion des parcours')).toHaveLength(2)
    expect(screen.queryByLabelText('Supprimer')).not.toBeInTheDocument()
  })

  it('ne reprend PAS un déverrouillage laissé par un autre onglet', async () => {
    // Ancienne implémentation : un drapeau en sessionStorage était repris au
    // chargement, donc n'importe quel onglet du même navigateur héritait de
    // l'accès admin.
    sessionStorage.setItem('happyrunners_admin_unlocked', '1')
    renderPage()
    await screen.findByText('Bois de Haye')

    expect(screen.queryByLabelText('Supprimer')).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('Déverrouiller la gestion des parcours')).toHaveLength(2)
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

  it('sans code configuré, aucun cadenas et tout est accessible', async () => {
    // Déploiement sans la variable : on ne bloque pas l'admin par surprise
    vi.stubEnv('VITE_ADMIN_CODE', '')
    renderPage()
    await screen.findByText('Bois de Haye')

    expect(screen.queryByLabelText('Déverrouiller la gestion des parcours')).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('Supprimer')).toHaveLength(2)
  })

  it('se reverrouille si l’identité change sans quitter la page', async () => {
    // Poste partagé : la personne suivante ne doit pas hériter de l'accès.
    vi.mocked(getUserProfile).mockResolvedValue({
      id: 'uuid-3',
      user_number: 3,
      first_name: 'Paul',
      last_name: 'Martin',
      pin_hash: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)

    const user = userEvent.setup()
    renderHarness()
    await screen.findByText('Bois de Haye')
    await unlockViaUi(user)

    // Quelqu'un d'autre prend la main, sans quitter l'écran
    await user.click(screen.getByRole('button', { name: 'se déconnecter' }))

    await waitFor(() =>
      expect(screen.queryByLabelText('Supprimer')).not.toBeInTheDocument()
    )
    expect(screen.getAllByLabelText('Déverrouiller la gestion des parcours')).toHaveLength(2)
  })
})