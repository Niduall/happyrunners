import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminPinResetModal } from './AdminPinResetModal'
import type { ProfileWithPinStatus } from '../services/supabaseService'

const PROFILE: ProfileWithPinStatus = {
  user_number: 9,
  first_name: 'Julie',
  last_name: 'Dalla Valle',
  hasPin: true,
}

function setup(overrides: Partial<Parameters<typeof AdminPinResetModal>[0]> = {}) {
  const onClose = vi.fn()
  const onResetPin = vi.fn().mockResolvedValue(undefined)
  const onRemovePin = vi.fn().mockResolvedValue(undefined)
  const user = userEvent.setup()

  render(
    <AdminPinResetModal
      profile={PROFILE}
      onClose={onClose}
      onResetPin={onResetPin}
      onRemovePin={onRemovePin}
      {...overrides}
    />
  )

  return { onClose, onResetPin, onRemovePin, user }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AdminPinResetModal — PIN provisoire', () => {
  it('refuse un code qui ne fait pas 4 chiffres', async () => {
    const { onResetPin, user } = setup()

    await user.type(screen.getByLabelText('Nouveau PIN'), '12')
    await user.click(screen.getByRole('button', { name: 'Définir le PIN' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'exactement 4 chiffres'
    )
    expect(onResetPin).not.toHaveBeenCalled()
  })

  it('refuse deux codes différents', async () => {
    const { onResetPin, user } = setup()

    await user.type(screen.getByLabelText('Nouveau PIN'), '1234')
    await user.type(screen.getByLabelText('Confirmer le PIN'), '1235')
    await user.click(screen.getByRole('button', { name: 'Définir le PIN' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ne correspondent pas'
    )
    expect(onResetPin).not.toHaveBeenCalled()
  })

  it('enregistre le code et l’affiche pour transmission', async () => {
    const { onResetPin, user } = setup()

    await user.type(screen.getByLabelText('Nouveau PIN'), '1234')
    await user.type(screen.getByLabelText('Confirmer le PIN'), '1234')
    await user.click(screen.getByRole('button', { name: 'Définir le PIN' }))

    expect(onResetPin).toHaveBeenCalledWith('1234')
    expect(await screen.findByText('PIN réinitialisé')).toBeInTheDocument()
    expect(screen.getByText('1234')).toBeInTheDocument()
    expect(screen.getByText(/pourra le changer/)).toBeInTheDocument()
  })

  it('signale une panne sans faire croire à un succès', async () => {
    const { onResetPin, user } = setup()
    onResetPin.mockRejectedValue(new Error('réseau'))

    await user.type(screen.getByLabelText('Nouveau PIN'), '1234')
    await user.type(screen.getByLabelText('Confirmer le PIN'), '1234')
    await user.click(screen.getByRole('button', { name: 'Définir le PIN' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Impossible de contacter le serveur'
    )
    expect(screen.queryByText('PIN réinitialisé')).not.toBeInTheDocument()
  })
})

describe('AdminPinResetModal — retrait', () => {
  it('demande confirmation avant de retirer la protection', async () => {
    const { onRemovePin, user } = setup()

    await user.click(screen.getByRole('radio', { name: /Retirer le PIN/ }))

    expect(screen.getByText(/pourra se connecter sans code/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retirer le PIN' }))

    expect(onRemovePin).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('PIN retiré')).toBeInTheDocument()
  })

  it('ne propose pas le retrait quand aucun PIN n’existe', () => {
    setup({ profile: { ...PROFILE, hasPin: false } })

    expect(screen.queryByRole('radio', { name: /Retirer le PIN/ })).not.toBeInTheDocument()
  })
})
