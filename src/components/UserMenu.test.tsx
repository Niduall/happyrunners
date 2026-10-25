import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserMenu } from './UserMenu'
import { AuthProvider } from '../hooks/useAuth'
import { getUserProfile, updateUserProfile, findProfileByName } from '../services/supabaseService'

vi.mock('../services/supabaseService', () => ({
  getUserProfile: vi.fn(),
  createUserProfile: vi.fn(),
  updateUserProfile: vi.fn(),
  findProfileByName: vi.fn(),
}))

const mockGetProfile = vi.mocked(getUserProfile)
const mockUpdate = vi.mocked(updateUserProfile)
const mockFind = vi.mocked(findProfileByName)

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
    <AuthProvider>
      <UserMenu />
    </AuthProvider>
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
  mockGetProfile.mockResolvedValue(profile())
  mockUpdate.mockResolvedValue(profile())
  mockFind.mockResolvedValue(null)
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
})
