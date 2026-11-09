import { describe, it, expect, vi } from 'vitest'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
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

const NAMES = new Map<number, string>([
  [1, 'Moi'],
  [2, 'Ada'],
  [3, 'Bruno'],
])

function setup(props: Partial<Parameters<typeof ChatMessageBubble>[0]> = {}) {
  return render(
    <ChatMessageBubble
      message={message()}
      isMine={false}
      authorName="Ada"
      grouped={false}
      me={1}
      names={NAMES}
      onDelete={noop}
      onRetry={noop}
      onReact={noop}
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

  it('garde l’heure dans la bulle, à droite du texte', () => {
    setup()

    const bubble = screen
      .getByText('Salut tout le monde')
      .closest('.chat-message-text')

    expect(bubble).toContainElement(screen.getByText('10:00'))
    expect(bubble).not.toContainElement(
      screen.getByRole('button', { name: 'Réagir au message de Ada' })
    )
  })

  it('affiche l’avatar au premier message d’une série', () => {
    setup()

    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('masque l’avatar sur les messages groupés', () => {
    setup({ grouped: true })

    expect(screen.queryByText('A')).not.toBeInTheDocument()
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

describe('ChatMessageBubble — réactions', () => {
  it('affiche les pastilles avec leur nombre et met en avant la sienne', () => {
    setup({
      me: 1,
      message: message({
        reactions: [
          { user_number: 2, reaction: 'like' },
          { user_number: 1, reaction: 'like' },
          { user_number: 3, reaction: 'fire' },
        ],
      }),
    })

    const like = screen.getByRole('button', {
      name: 'J’aime, 2 personnes, votre réaction',
    })
    expect(like).toHaveAttribute('aria-haspopup', 'dialog')
    expect(like).toHaveAttribute('aria-expanded', 'false')

    const fire = screen.getByRole('button', { name: 'Bravo, 1 personne' })
    expect(fire).toHaveAttribute('aria-haspopup', 'dialog')
  })

  it('ne montre la liste des personnes qu’à la demande', () => {
    setup({
      message: message({ reactions: [{ user_number: 2, reaction: 'like' }] }),
    })

    expect(
      screen.queryByRole('dialog', { name: 'Personnes ayant réagi' })
    ).not.toBeInTheDocument()
  })

  it('ouvre la liste des personnes en appuyant sur une pastille', () => {
    const onReact = vi.fn()
    setup({
      me: 1,
      onReact,
      message: message({
        reactions: [
          { user_number: 2, reaction: 'like' },
          { user_number: 3, reaction: 'like' },
        ],
      }),
    })

    fireEvent.click(screen.getByRole('button', { name: 'J’aime, 2 personnes' }))

    const dialog = screen.getByRole('dialog', {
      name: 'Personnes ayant réagi',
    })
    expect(within(dialog).getByText('Ada')).toBeInTheDocument()
    expect(within(dialog).getByText('Bruno')).toBeInTheDocument()
    // Le tap n’ajoute plus la réaction : c’est le rôle de la palette.
    expect(onReact).not.toHaveBeenCalled()
  })

  it('signale la personne connectée dans la liste', () => {
    setup({
      me: 1,
      message: message({ reactions: [{ user_number: 1, reaction: 'fire' }] }),
    })

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Bravo, 1 personne, votre réaction',
      })
    )

    const dialog = screen.getByRole('dialog', {
      name: 'Personnes ayant réagi',
    })
    expect(dialog).toHaveTextContent('Moi (vous)')
  })

  it('ferme la liste avec Échap et rend le focus à la pastille', () => {
    setup({
      message: message({ reactions: [{ user_number: 2, reaction: 'like' }] }),
    })

    const pill = screen.getByRole('button', { name: 'J’aime, 1 personne' })
    fireEvent.click(pill)
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(
      screen.queryByRole('dialog', { name: 'Personnes ayant réagi' })
    ).not.toBeInTheDocument()
    expect(pill).toHaveFocus()
  })

  it('ferme la liste au clic extérieur', () => {
    setup({
      message: message({ reactions: [{ user_number: 2, reaction: 'like' }] }),
    })

    fireEvent.click(screen.getByRole('button', { name: 'J’aime, 1 personne' }))
    fireEvent.pointerDown(document.body)

    expect(
      screen.queryByRole('dialog', { name: 'Personnes ayant réagi' })
    ).not.toBeInTheDocument()
  })

  it('ouvre la palette depuis le bouton et envoie l’emoji choisi', () => {
    const onReact = vi.fn()
    setup({ onReact })

    fireEvent.click(
      screen.getByRole('button', { name: 'Réagir au message de Ada' })
    )

    const palette = screen.getByRole('group', {
      name: 'Choisir une réaction',
    })
    // Les cinq emoji sont proposés, avec un libellé compréhensible.
    expect(within(palette).getAllByRole('button')).toHaveLength(6) // + Copier
    fireEvent.click(within(palette).getByRole('button', { name: 'J’adore' }))

    expect(onReact).toHaveBeenCalledWith('love')
    expect(
      screen.queryByRole('group', { name: 'Choisir une réaction' })
    ).not.toBeInTheDocument()
  })

  it('marque l’emoji déjà choisi dans la palette', () => {
    setup({
      me: 1,
      message: message({
        reactions: [{ user_number: 1, reaction: 'laugh' }],
      }),
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Réagir au message de Ada' })
    )

    expect(
      screen.getByRole('button', { name: 'Ça me fait rire' })
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('retire sa réaction en choisissant le même emoji dans la palette', () => {
    const onReact = vi.fn()
    setup({
      me: 1,
      onReact,
      message: message({
        reactions: [{ user_number: 1, reaction: 'laugh' }],
      }),
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Réagir au message de Ada' })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ça me fait rire' }))

    expect(onReact).toHaveBeenCalledWith('laugh')
  })

  it('ouvre la palette par appui long sur la bulle', () => {
    vi.useFakeTimers()
    try {
      setup()

      fireEvent.pointerDown(screen.getByText('Salut tout le monde'), {
        pointerType: 'touch',
        button: 0,
        clientX: 100,
        clientY: 100,
      })
      act(() => vi.advanceTimersByTime(450))

      expect(
        screen.getByRole('group', { name: 'Choisir une réaction' })
      ).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('annule l’appui long si le doigt bouge (défilement)', () => {
    vi.useFakeTimers()
    try {
      setup()
      const bubble = screen.getByText('Salut tout le monde')

      fireEvent.pointerDown(bubble, {
        pointerType: 'touch',
        button: 0,
        clientX: 100,
        clientY: 100,
      })
      fireEvent.pointerMove(bubble, {
        pointerType: 'touch',
        clientX: 140,
        clientY: 100,
      })
      act(() => vi.advanceTimersByTime(450))

      expect(
        screen.queryByRole('group', { name: 'Choisir une réaction' })
      ).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ferme la palette avec Échap', () => {
    setup()

    fireEvent.click(
      screen.getByRole('button', { name: 'Réagir au message de Ada' })
    )
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(
      screen.queryByRole('group', { name: 'Choisir une réaction' })
    ).not.toBeInTheDocument()
  })

  it('copie le texte du message depuis la palette', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    setup()
    fireEvent.click(
      screen.getByRole('button', { name: 'Réagir au message de Ada' })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Copier le message' }))

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('Salut tout le monde')
    )
    expect(
      await screen.findByRole('button', { name: 'Message copié' })
    ).toBeInTheDocument()
  })

  it('ne propose pas de bouton de réaction sur ses propres messages', () => {
    setup({ isMine: true })

    expect(
      screen.queryByRole('button', { name: /Réagir au message/ })
    ).not.toBeInTheDocument()
  })

  it('ouvre quand même la palette par appui long sur son propre message', () => {
    vi.useFakeTimers()
    try {
      setup({ isMine: true })

      fireEvent.pointerDown(screen.getByText('Salut tout le monde'), {
        pointerType: 'touch',
        button: 0,
        clientX: 100,
        clientY: 100,
      })
      act(() => vi.advanceTimersByTime(450))

      expect(
        screen.getByRole('group', { name: 'Choisir une réaction' })
      ).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
