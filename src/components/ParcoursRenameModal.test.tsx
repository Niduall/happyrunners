import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ParcoursRenameModal } from './ParcoursRenameModal'

const renderModal = (overrides: Partial<Parameters<typeof ParcoursRenameModal>[0]> = {}) => {
  const onSave = vi.fn().mockResolvedValue(undefined)
  const onCancel = vi.fn()
  render(
    <ParcoursRenameModal
      currentName="Bois de Haye"
      onSave={onSave}
      onCancel={onCancel}
      {...overrides}
    />
  )
  return { onSave, onCancel }
}

describe('ParcoursRenameModal', () => {
  it('préremplit le nom actuel', async () => {
    renderModal()

    // Le nom d'origine est rappelé dans l'en-tête et dans le champ
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Modifier le parcours')).toBeInTheDocument()
    expect(screen.getByLabelText('Nom du parcours')).toHaveValue('Bois de Haye')
  })

  it('enregistre le nom saisi, sans espaces superflus', async () => {
    const user = userEvent.setup()
    const { onSave } = renderModal()

    const input = screen.getByLabelText('Nom du parcours')
    await user.clear(input)
    await user.type(input, '  Boucle du lac  ')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(onSave).toHaveBeenCalledWith('Boucle du lac')
  })

  it('refuse un nom vide', async () => {
    const user = userEvent.setup()
    const { onSave } = renderModal()

    await user.clear(screen.getByLabelText('Nom du parcours'))

    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('affiche l’erreur et laisse la modale ouverte si l’enregistrement échoue', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockRejectedValue(new Error('network'))
    renderModal({ onSave })

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('network')
    // On peut réessayer : le bouton n'est plus bloqué sur « Enregistrement… »
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('« Annuler » ferme sans enregistrer', async () => {
    const user = userEvent.setup()
    const { onSave, onCancel } = renderModal()

    await user.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('Échap ferme sans enregistrer', async () => {
    const user = userEvent.setup()
    const { onSave, onCancel } = renderModal()

    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })
})
