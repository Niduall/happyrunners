import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Admin } from './Admin'
import { AuthProvider } from '../hooks/useAuth'
import {
  getProfilesWithPinStatus,
  removeUserPin,
  resetUserPin,
} from '../services/supabaseService'

vi.mock('../services/supabaseService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/supabaseService')>()
  return {
    ...actual,
    getProfilesWithPinStatus: vi.fn(),
    resetUserPin: vi.fn(),
    removeUserPin: vi.fn(),
  }
})

const mockProfiles = vi.mocked(getProfilesWithPinStatus)
const mockReset = vi.mocked(resetUserPin)
const mockRemove = vi.mocked(removeUserPin)

const PROFILES = [
  { user_number: 3, first_name: 'Paulin', last_name: 'Claudin', hasPin: true },
  { user_number: 9, first_name: 'Julie', last_name: 'Dalla Valle', hasPin: true },
  { user_number: 13, first_name: 'Cécile', last_name: 'HOUTMANN', hasPin: false },
  { user_number: 14, first_name: 'Julie', last_name: 'Moudin', hasPin: false },
]

function renderAdmin() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <AuthProvider>
        <Admin />
      </AuthProvider>
    </MemoryRouter>
  )
}

async function unlock(user: ReturnType<typeof userEvent.setup>, code = 'secret') {
  await user.type(screen.getByLabelText('Code'), code)
  await user.click(screen.getByRole('button', { name: 'Déverrouiller' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  // Le code admin est lu au rendu de l'AuthProvider.
  vi.stubEnv('VITE_ADMIN_CODE', 'secret')
  mockProfiles.mockResolvedValue(PROFILES)
  mockReset.mockResolvedValue(undefined)
  mockRemove.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Admin — accès protégé', () => {
  it('demande le code avant de charger les profils', () => {
    renderAdmin()

    expect(screen.getByRole('heading', { name: 'Code administrateur' })).toBeInTheDocument()
    expect(mockProfiles).not.toHaveBeenCalled()
  })

  it('refuse un code incorrect et ne charge rien', async () => {
    const user = userEvent.setup()
    renderAdmin()

    await unlock(user, 'mauvais')

    expect(await screen.findByRole('alert')).toHaveTextContent('Code incorrect')
    expect(mockProfiles).not.toHaveBeenCalled()
  })

  it('affiche la liste après un code correct', async () => {
    const user = userEvent.setup()
    renderAdmin()

    await unlock(user)

    expect(await screen.findByText('Julie Dalla Valle')).toBeInTheDocument()
    expect(screen.getByText('Cécile HOUTMANN')).toBeInTheDocument()
    expect(screen.getAllByText('PIN actif')).toHaveLength(2)
    expect(screen.getAllByText('Sans PIN')).toHaveLength(2)
    expect(mockProfiles).toHaveBeenCalledTimes(1)
  })

  it('se reverrouille quand la page revient du cache après un retour', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await unlock(user)
    await screen.findByText('Julie Moudin')

    // Retour Android ou restauration depuis le cache (bfcache) : la page
    // réapparaît telle quelle, mais le déverrouillage ne doit pas survivre.
    act(() => window.dispatchEvent(new Event('pageshow')))

    expect(screen.getByLabelText('Code')).toBeInTheDocument()
    expect(screen.queryByText('Julie Moudin')).not.toBeInTheDocument()
  })

  it('explique quand aucun code admin n’est configuré', () => {
    vi.stubEnv('VITE_ADMIN_CODE', '')
    renderAdmin()

    expect(screen.getByText('Console indisponible')).toBeInTheDocument()
    expect(screen.queryByLabelText('Code')).not.toBeInTheDocument()
  })
})

describe('Admin — recherche', () => {
  it('filtre par nom, sans tenir compte des accents', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await unlock(user)
    await screen.findByText('Julie Dalla Valle')

    await user.type(screen.getByLabelText('Rechercher une personne'), 'cecile')

    expect(screen.getByText('Cécile HOUTMANN')).toBeInTheDocument()
    expect(screen.queryByText('Julie Moudin')).not.toBeInTheDocument()
  })

  it('annonce quand personne ne correspond', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await unlock(user)
    await screen.findByText('Julie Moudin')

    await user.type(screen.getByLabelText('Rechercher une personne'), 'zzz')

    expect(
      screen.getByText('Aucune personne ne correspond à cette recherche.')
    ).toBeInTheDocument()
  })
})

describe('Admin — réinitialisation', () => {
  it('définit un PIN provisoire et met à jour le badge', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await unlock(user)
    await screen.findByText('Julie Moudin')

    await user.click(
      screen.getByRole('button', { name: 'Gérer le PIN de Julie Moudin' })
    )
    await user.type(screen.getByLabelText('Nouveau PIN'), '4321')
    await user.type(screen.getByLabelText('Confirmer le PIN'), '4321')
    await user.click(screen.getByRole('button', { name: 'Définir le PIN' }))

    expect(mockReset).toHaveBeenCalledWith(14, '4321')

    await user.click(await screen.findByRole('button', { name: 'Terminé' }))

    const row = screen.getByText('Julie Moudin').closest('li') as HTMLElement
    expect(within(row).getByText('PIN actif')).toBeInTheDocument()
  })

  it('retire un PIN existant et met à jour le badge', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await unlock(user)
    await screen.findByText('Julie Dalla Valle')

    await user.click(
      screen.getByRole('button', { name: 'Gérer le PIN de Julie Dalla Valle' })
    )
    await user.click(screen.getByRole('radio', { name: /Retirer le PIN/ }))
    await user.click(screen.getByRole('button', { name: 'Retirer le PIN' }))

    expect(mockRemove).toHaveBeenCalledWith(9)

    await user.click(await screen.findByRole('button', { name: 'Terminé' }))

    const row = screen.getByText('Julie Dalla Valle').closest('li') as HTMLElement
    expect(within(row).getByText('Sans PIN')).toBeInTheDocument()
  })

  it('garde la liste utilisable si le chargement échoue', async () => {
    mockProfiles.mockRejectedValue(new Error('lecture refusée'))
    const user = userEvent.setup()
    renderAdmin()

    await unlock(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Impossible de charger la liste'
    )
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
  })
})
