import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatMessageBubble } from './ChatMessageBubble'
import type { ChatMessage } from '../hooks/useMessages'

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    user_number: 2,
    body: 'Salut tout le monde',
    created_at: '2026-11-02T10:00:00',
    ...overrides,
  }
}

const noop = () => {}

function setup(props: Partial<Parameters<typeof ChatMessageBubble>[0]> = {}) {
  return render(
    <ChatMessageBubble
      message={message()}
      isMine={false}
      authorName="Ada"
      grouped={false}
      onDelete={noop}
      onRetry={noop}
      {...props}
    />
  )
}

describe('ChatMessageBubble — affichage', () => {
  it('affiche l’auteur, le texte et l’heure pour un autre message', () => {
    setup()

    expect(screen.getByText('Ada')).toBeInTheDocument()
    expect(screen.getByText('Salut tout le monde')).toBeInTheDocument()
    expect(screen.getByText('10:00')).toBeInTheDocument()
  })

  it('masque le nom sur ses propres messages', () => {
    setup({ isMine: true })

    expect(screen.queryByText('Ada')).not.toBeInTheDocument()
  })

  it('masque le nom quand le message suit celui du même auteur', () => {
    setup({ grouped: true })

    expect(screen.queryByText('Ada')).not.toBeInTheDocument()
  })

  it('conserve les retours à la ligne', () => {
    setup({ message: message({ body: 'ligne 1\nligne 2' }) })

    expect(screen.getByText(/ligne 1\s*ligne 2/)).toBeInTheDocument()
  })
})

describe('ChatMessageBubble — états d’envoi', () => {
  it('indique un envoi en cours', () => {
    setup({ message: message({ status: 'sending' }), isMine: true })

    expect(screen.getByText('Envoi…')).toBeInTheDocument()
  })

  it('propose de réessayer un message en échec', () => {
    const onRetry = vi.fn()
    setup({ message: message({ status: 'failed' }), isMine: true, onRetry })

    fireEvent.click(screen.getByText('Non envoyé · Réessayer'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('ne montre pas de bouton de suppression sur le message d’un autre', () => {
    setup()

    expect(
      screen.queryByRole('button', { name: 'Supprimer ce message' })
    ).not.toBeInTheDocument()
  })

  it('supprime son propre message', () => {
    const onDelete = vi.fn()
    setup({ isMine: true, onDelete })

    fireEvent.click(
      screen.getByRole('button', { name: 'Supprimer ce message' })
    )
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
