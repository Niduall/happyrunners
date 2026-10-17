import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ParcoursVoteCard } from './ParcoursVoteCard'
import type { Parcours } from '../types'

const parcours: Parcours = {
  id: 'p1',
  name: 'Bosserville (miroir)',
  distance_km: 8.4,
  elevation_gain_m: 93,
  points: [],
  created_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

const props = {
  parcours,
  isMyChoice: false,
  yesCount: 3,
  isWinner: false,
  saving: false,
  onToggle: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ParcoursVoteCard — vote verrouillé', () => {
  it('affiche les parcours même quand le vote est verrouillé', () => {
    // L'utilisateur voit les parcours et les compteurs, sans pouvoir voter
    render(<ParcoursVoteCard {...props} voteLocked />)

    expect(screen.getByText('Bosserville (miroir)')).toBeInTheDocument()
    expect(screen.getByText('3 personnes')).toBeInTheDocument()
  })

  it('n’affiche aucun bouton tant que la présence n’est pas confirmée', () => {
    // Pas de bouton « Réponds d'abord » : on n'affiche pas une action
    // qui rejette un clic. Le parcours reste lisible.
    render(<ParcoursVoteCard {...props} voteLocked />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText('Réponds d’abord')).not.toBeInTheDocument()
    expect(screen.getByText('Bosserville (miroir)')).toBeInTheDocument()
  })

  it('le bouton est actif quand la présence est confirmée', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<ParcoursVoteCard {...props} voteLocked={false} onToggle={onToggle} />)

    const button = screen.getByRole('button')
    expect(button).not.toBeDisabled()
    expect(button).toHaveTextContent('Je veux celui-ci')

    await user.click(button)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('« Mon choix » reste affiché même verrouillé, sans bouton', () => {
    // L'information est gardée à l'écran ; seule l'action disparaît.
    render(<ParcoursVoteCard {...props} isMyChoice voteLocked />)

    expect(screen.getByText('Mon choix')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('« Mon choix » reste actif si la présence est confirmée', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<ParcoursVoteCard {...props} isMyChoice voteLocked={false} onToggle={onToggle} />)

    const button = screen.getByRole('button')
    expect(button).not.toBeDisabled()
    await user.click(button)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})