import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { UserMenu } from './UserMenu'
import { AuthProvider } from '../hooks/useAuth'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { getUserProfile, updateUserProfile, findProfileByName } from '../services/supabaseService'

vi.mock('../services/supabaseService', () => ({
  getUserProfile: vi.fn(),
  createUserProfile: vi.fn(),
  updateUserProfile: vi.fn(),
  findProfileByName: vi.fn(),
}))

vi.mock('../hooks/usePushNotifications', () => ({
  usePushNotifications: vi.fn(),
}))

const mockGetProfile = vi.mocked(getUserProfile)
const mockUpdate = vi.mocked(updateUserProfile)
const mockFind = vi.mocked(findProfileByName)
const mockPush = vi.mocked(usePushNotifications)

const pushState = () => ({
  status: 'available' as const,
  preferences: { messages: true, runReminder: true },
  saving: false,
  error: '',
  testing: false,
  testStatus: 'idle' as const,
  testError: '',
  enable: vi.fn().mockResolvedValue(undefined),
  disable: vi.fn().mockResolvedValue(undefined),
  setPreference: vi.fn().mockResolvedValue(undefined),
  test: vi.fn().mockResolvedValue(undefined),
})

function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname}</p>
}

const profile = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    id: 'uuid-3',
    user_number: 3,
    first_name: 'Paul',
    last_name: 'Martin',
    pin_hash: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...over,
  }) as never

const renderMenu = async () => {
  localStorage.setItem(
    'running_user',
    JSON.stringify({ id: 3, firstName: 'Paul', lastName: 'Martin', name: 'Paul Martin' })
  )
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <AuthProvider>
        <UserMenu />
        <LocationProbe />
      </AuthProvider>
    </MemoryRouter>
  )
  await screen.findByRole('button', { name: 'Menu utilisateur' })
  return user
}

const openRename = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Menu utilisateur' }))
  await user.click(screen.getByRole('button', { name: /Modifier le nom/ }))
  return screen.findByRole('dialog')
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  vi.stubEnv('VITE_ADMIN_CODE', '')
  mockGetProfile.mockResolvedValue(profile())
  mockUpdate.mockResolvedValue(profile())
  mockFind.mockResolvedValue(null)
  mockPush.mockReturnValue(pushState())
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('UserMenu — renommage accessible', () => {
  it('ouvre une modale nommée et associe chaque champ à son label', async () => {
    const user = await renderMenu()
    const dialog = await openRename(user)

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('Modifier le nom')
    expect(within(dialog).getByLabelText('Prénom')).toHaveValue('Paul')
    expect(within(dialog).getByLabelText('Nom')).toHaveValue('Martin')
  })

  it('se ferme avec Échap', async () => {
    const user = await renderMenu()
    await openRename(user)

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('annonce l’erreur de validation sans enregistrer', async () => {
    const user = await renderMenu()
    const dialog = await openRename(user)

    await user.clear(within(dialog).getByLabelText('Prénom'))
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Renseigne les deux champs'
    )
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('explique qu’un nom est déjà pris au lieu d’une erreur générique', async () => {
    // L'index unique `user_profiles_name_key` renvoie 23505 : l'utilisateur
    // doit comprendre que le nom est pris, pas que l'app est cassée.
    mockUpdate.mockRejectedValue({
      code: '23505',
      message: 'duplicate key value violates unique constraint "user_profiles_name_key"',
    })
    const user = await renderMenu()
    const dialog = await openRename(user)

    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Ce nom est déjà utilisé'
    )
  })
})

describe('UserMenu — notifications', () => {
  it('ouvre les réglages de notifications depuis le menu', async () => {
    const user = await renderMenu()
    await user.click(screen.getByRole('button', { name: 'Menu utilisateur' }))
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(
      screen.getByRole('dialog', { name: 'Notifications' })
    ).toBeInTheDocument()
  })

  it('retire l’abonnement de l’appareil à la déconnexion', async () => {
    const disable = vi.fn().mockResolvedValue(undefined)
    mockPush.mockReturnValue({
      ...pushState(),
      status: 'subscribed',
      disable,
    })

    const user = await renderMenu()
    await user.click(screen.getByRole('button', { name: 'Menu utilisateur' }))
    await user.click(screen.getByRole('button', { name: 'Déconnexion' }))

    await waitFor(() => expect(disable).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(localStorage.getItem('running_user')).toBeNull()
    )
  })

  it('se déconnecte même sans abonnement push', async () => {
    const disable = vi.fn().mockResolvedValue(undefined)
    mockPush.mockReturnValue({ ...pushState(), disable })

    const user = await renderMenu()
    await user.click(screen.getByRole('button', { name: 'Menu utilisateur' }))
    await user.click(screen.getByRole('button', { name: 'Déconnexion' }))

    expect(disable).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(localStorage.getItem('running_user')).toBeNull()
    )
  })
})

describe('UserMenu — accès administration', () => {
  it('reste absent quand aucun code admin n’est configuré', async () => {
    const user = await renderMenu()
    await user.click(screen.getByRole('button', { name: 'Menu utilisateur' }))

    expect(
      screen.queryByRole('button', { name: 'Administration' })
    ).not.toBeInTheDocument()
  })

  it('ouvre la console quand le code admin est configuré', async () => {
    vi.stubEnv('VITE_ADMIN_CODE', 'secret')
    const user = await renderMenu()
    await user.click(screen.getByRole('button', { name: 'Menu utilisateur' }))
    await user.click(screen.getByRole('button', { name: 'Administration' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/admin')
  })
})
