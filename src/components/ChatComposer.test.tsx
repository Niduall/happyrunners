import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ChatComposer } from './ChatComposer'

function setup(overrides: Partial<Parameters<typeof ChatComposer>[0]> = {}) {
  const onSend = vi.fn().mockResolvedValue(true)
  const onIdentify = vi.fn()

  render(
    <ChatComposer
      canWrite
      onSend={onSend}
      onIdentify={onIdentify}
      {...overrides}
    />
  )

  return { onSend, onIdentify, textarea: screen.getByLabelText('Ton message') }
}

describe('ChatComposer — envoi', () => {
  it('envoie avec Entrée et vide la zone', async () => {
    const { onSend, textarea } = setup()

    fireEvent.change(textarea, { target: { value: '  salut  ' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => expect(onSend).toHaveBeenCalledWith('salut'))
    await waitFor(() => expect(textarea).toHaveValue(''))
  })

  it('Maj+Entrée n’envoie pas', () => {
    const { onSend, textarea } = setup()

    fireEvent.change(textarea, { target: { value: 'ligne 1' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })

    expect(onSend).not.toHaveBeenCalled()
  })

  it('n’envoie pas pendant la composition d’un accent', () => {
    const { onSend, textarea } = setup()

    fireEvent.change(textarea, { target: { value: 'accent' } })
    fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true })

    expect(onSend).not.toHaveBeenCalled()
  })

  it('désactive l’envoi tant que la zone est vide', () => {
    setup()

    expect(
      screen.getByRole('button', { name: 'Envoyer le message' })
    ).toBeDisabled()
  })
})

describe('ChatComposer — longueur', () => {
  it('affiche le compteur au-delà de 400 caractères', () => {
    const { textarea } = setup()

    fireEvent.change(textarea, { target: { value: 'a'.repeat(401) } })

    expect(screen.getByText('401/500')).toBeInTheDocument()
  })

  it('refuse un message de plus de 500 caractères', () => {
    const { textarea } = setup()

    fireEvent.change(textarea, { target: { value: 'a'.repeat(501) } })

    expect(screen.getByRole('alert')).toHaveTextContent('501/500')
    expect(
      screen.getByRole('button', { name: 'Envoyer le message' })
    ).toBeDisabled()
  })
})

describe('ChatComposer — lecture sans identité', () => {
  it('propose de se connecter au lieu d’écrire', () => {
    const onIdentify = vi.fn()
    render(
      <ChatComposer canWrite={false} onSend={vi.fn()} onIdentify={onIdentify} />
    )

    expect(screen.getByText('Choisis ton nom pour écrire.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Ton message')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }))
    expect(onIdentify).toHaveBeenCalledTimes(1)
  })
})

describe('ChatComposer — réponse citée', () => {
  const replyTo = { id: 'm1', body: 'Question importante', userNumber: 2 }

  it('affiche l’auteur et l’aperçu du message cité', () => {
    setup({ replyTo, replyToName: 'Ada' })

    expect(screen.getByText('Réponse à Ada')).toBeInTheDocument()
    expect(screen.getByText('Question importante')).toBeInTheDocument()
  })

  it('donne le focus à la saisie quand on choisit de répondre', () => {
    const { textarea } = setup({ replyTo, replyToName: 'Ada' })

    expect(textarea).toHaveFocus()
  })

  it('annule la réponse et rend le focus à la saisie', () => {
    const onCancelReply = vi.fn()
    const { textarea } = setup({ replyTo, replyToName: 'Ada', onCancelReply })

    fireEvent.click(screen.getByRole('button', { name: 'Annuler la réponse' }))

    expect(onCancelReply).toHaveBeenCalledTimes(1)
    expect(textarea).toHaveFocus()
  })

  it('n’affiche aucun bandeau sans message cité', () => {
    setup()

    expect(screen.queryByText(/Réponse à/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Annuler la réponse' })
    ).not.toBeInTheDocument()
  })
})
