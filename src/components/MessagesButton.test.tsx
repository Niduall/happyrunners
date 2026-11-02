import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MessagesButton } from './MessagesButton'

function setup(unreadCount: number) {
  render(
    <MemoryRouter>
      <MessagesButton unreadCount={unreadCount} />
    </MemoryRouter>
  )
}

describe('MessagesButton — pastille de non-lus', () => {
  it('reste discrète sans message non lu', () => {
    setup(0)

    expect(screen.getByRole('button', { name: 'Messages' })).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('affiche le nombre de messages non lus', () => {
    setup(3)

    expect(screen.getByText('3')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Messages, 3 non lus' })
    ).toBeInTheDocument()
  })

  it('accorde le libellé au singulier', () => {
    setup(1)

    expect(
      screen.getByRole('button', { name: 'Messages, 1 non lu' })
    ).toBeInTheDocument()
  })

  it('plafonne l’affichage à 99+', () => {
    setup(120)

    expect(screen.getByText('99+')).toBeInTheDocument()
  })
})
