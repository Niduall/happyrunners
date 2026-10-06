import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SecurityModal } from './SecurityModal'
import { LoginForm } from './Auth'
import { AuthProvider, useAuth } from '../hooks/useAuth'
import { getUserProfile, updateUserProfile, findProfileByName } from '../services/supabaseService'
import { hashPin } from '../services/pin'

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
    id: 'uuid-1',
    user_number: 3,
    first_name: 'Paul',
    last_name: 'Martin',
    pin_hash: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...over,
  }) as never

/**
 * Reproduit le flux réel : tant qu'on n'est pas connecté, c'est l'écran
 * d'auth qui s'affiche ; une fois connecté, la modale de sécurité.
 */
function Harness({ onClose }: { onClose: () => void }) {
  const { isAuthenticated } = useAuth()
  return (
    <>
      {!isAuthenticated && <LoginForm />}
      {isAuthenticated && <SecurityModal onClose={onClose} />}
    </>
  )
}

const seedLocalUser = (pinHash: string | null) => {
  localStorage.setItem(
    'running_user',
    JSON.stringify({ id: 3, firstName: 'Paul', lastName: 'Martin', name: 'Paul Martin' })
  )
  mockGetProfile.mockResolvedValue(
    profile({ pin_hash: pinHash ? hashPin(pinHash) : null })
  )
}

/**
 * Ouvre la modale. Si le profil a un PIN, on passe par l'écran
 * d'authentification — c'est le seul chemin possible dans l'app.
 */
const openModal = async (pin: string | null) => {
  seedLocalUser(pin)
  const onClose = vi.fn()
  const user = userEvent.setup()
  render(
    <AuthProvider>
      <Harness onClose={onClose} />
    </AuthProvider>
  )

  if (pin) {
    // Le mount demande le PIN → on le saisit pour atteindre la modale
    await screen.findByLabelText('PIN à 4 chiffres', undefined, { timeout: 3000 })
    await user.type(screen.getByLabelText('PIN à 4 chiffres'), pin)
    await user.click(screen.getByRole('button', { name: /Se connecter/ }))
  }

  return { user, onClose }
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mockUpdate.mockResolvedValue(profile())
  mockFind.mockResolvedValue(null)
})

describe('SecurityModal — profil SANS PIN', () => {
  it('propose d’activer un PIN', async () => {
    const { user } = await openModal(null)

    expect(await screen.findByLabelText('PIN à 4 chiffres')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirmer le PIN')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Activer le PIN/ })).toBeInTheDocument()
    // Pas d'option « changer » puisqu'il n'y a rien à changer
    expect(screen.queryByRole('button', { name: /^Retirer le PIN$/ })).not.toBeInTheDocument()
    void user
  })

  it('refuse si les deux PIN ne correspondent pas', async () => {
    const { user } = await openModal(null)

    await user.type(await screen.findByLabelText('PIN à 4 chiffres'), '1234')
    await user.type(screen.getByLabelText('Confirmer le PIN'), '4321')
    await user.click(screen.getByRole('button', { name: /Activer le PIN/ }))

    expect(await screen.findByText('Les PIN ne correspondent pas')).toBeInTheDocument()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('refuse un PIN trop court', async () => {
    const { user } = await openModal(null)

    await user.type(await screen.findByLabelText('PIN à 4 chiffres'), '12')
    await user.type(screen.getByLabelText('Confirmer le PIN'), '12')
    await user.click(screen.getByRole('button', { name: /Activer le PIN/ }))

    expect(await screen.findByText('Le PIN doit faire 4 chiffres')).toBeInTheDocument()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('active le PIN et bascule sur l’écran « changer »', async () => {
    const { user } = await openModal(null)

    await user.type(await screen.findByLabelText('PIN à 4 chiffres'), '1234')
    await user.type(screen.getByLabelText('Confirmer le PIN'), '1234')
    await user.click(screen.getByRole('button', { name: /Activer le PIN/ }))

    expect(await screen.findByText('PIN activé')).toBeInTheDocument()
    expect(mockUpdate).toHaveBeenCalledWith(3, { pin_hash: hashPin('1234') })
    // L'écran propose maintenant le changement et le retrait
    expect(screen.getByLabelText('PIN actuel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Retirer le PIN$/ })).toBeInTheDocument()
  })
})

describe('SecurityModal — profil AVEC PIN', () => {
  it('propose de changer le PIN avec l’ancien', async () => {
    await openModal('1111')

    expect(await screen.findByLabelText('PIN actuel')).toBeInTheDocument()
    expect(screen.getByLabelText('Nouveau PIN')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirmer le nouveau PIN')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Changer le PIN/ })).toBeInTheDocument()
  })

  it('change le PIN si l’ancien est correct', async () => {
    const { user } = await openModal('1111')

    await user.type(await screen.findByLabelText('PIN actuel'), '1111')
    await user.type(screen.getByLabelText('Nouveau PIN'), '5678')
    await user.type(screen.getByLabelText('Confirmer le nouveau PIN'), '5678')
    await user.click(screen.getByRole('button', { name: /Changer le PIN/ }))

    expect(await screen.findByText('PIN modifié')).toBeInTheDocument()
    expect(mockUpdate).toHaveBeenCalledWith(3, { pin_hash: hashPin('5678') })
  })

  it('refuse un ancien PIN incorrect', async () => {
    const { user } = await openModal('1111')

    await user.type(await screen.findByLabelText('PIN actuel'), '0000')
    await user.type(screen.getByLabelText('Nouveau PIN'), '5678')
    await user.type(screen.getByLabelText('Confirmer le nouveau PIN'), '5678')
    await user.click(screen.getByRole('button', { name: /Changer le PIN/ }))

    expect(await screen.findByText('PIN actuel incorrect')).toBeInTheDocument()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('permet de retirer le PIN après confirmation', async () => {
    const { user } = await openModal('1111')

    await screen.findByLabelText('PIN actuel')
    await user.click(screen.getByRole('button', { name: /^Retirer le PIN$/ }))

    // Écran de suppression dédié, avec avertissement
    expect(screen.getByLabelText('PIN actuel pour confirmer')).toBeInTheDocument()
    expect(screen.getByText(/Ton profil ne sera plus protégé/)).toBeInTheDocument()

    await user.type(screen.getByLabelText('PIN actuel pour confirmer'), '1111')
    await user.click(screen.getByRole('button', { name: /Retirer le PIN/ }))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(3, { pin_hash: null }))
    expect(await screen.findByText('PIN retiré')).toBeInTheDocument()
    // Retour à l'écran d'ajout
    expect(await screen.findByLabelText('PIN à 4 chiffres')).toBeInTheDocument()
  })

  it('refuse de retirer le PIN avec un mauvais ancien PIN', async () => {
    const { user } = await openModal('1111')

    await screen.findByLabelText('PIN actuel')
    await user.click(screen.getByRole('button', { name: /^Retirer le PIN$/ }))
    await user.type(screen.getByLabelText('PIN actuel pour confirmer'), '9999')
    await user.click(screen.getByRole('button', { name: /Retirer le PIN/ }))

    expect(await screen.findByText('PIN actuel incorrect')).toBeInTheDocument()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('permet d’annuler la suppression', async () => {
    const { user } = await openModal('1111')

    await screen.findByLabelText('PIN actuel')
    await user.click(screen.getByRole('button', { name: /^Retirer le PIN$/ }))
    await user.click(screen.getByRole('button', { name: /Annuler/ }))

    expect(await screen.findByLabelText('PIN actuel')).toBeInTheDocument()
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('SecurityModal — fermeture', () => {
  it('le bouton du bas ferme', async () => {
    const { user, onClose } = await openModal(null)

    await user.type(await screen.findByLabelText('PIN à 4 chiffres'), '1234')
    await user.type(screen.getByLabelText('Confirmer le PIN'), '1234')
    await user.click(screen.getByRole('button', { name: 'Fermer' }))

    expect(onClose).toHaveBeenCalled()
  })

  it('la croix ferme aussi', async () => {
    const { user, onClose } = await openModal(null)

    await screen.findByLabelText('PIN à 4 chiffres')
    await user.click(screen.getByLabelText('Fermer la fenêtre'))

    expect(onClose).toHaveBeenCalled()
  })

  it('affiche le numéro d’identifiant (le nom peut changer, pas le numéro)', async () => {
    await openModal(null)

    await screen.findByLabelText('PIN à 4 chiffres')
    expect(screen.getByText(/Paul Martin · #3/)).toBeInTheDocument()
  })
})