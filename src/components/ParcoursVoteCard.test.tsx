import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ParcoursVoteCard } from './ParcoursVoteCard'
import { getParcoursPoints } from '../services/supabaseService'
import type { GPXPoint, ParcoursSummary } from '../types'

vi.mock('../services/supabaseService', () => ({
  getParcoursPoints: vi.fn(),
}))

// Leaflet a besoin de dimensions réelles : on isole la carte pour tester
// uniquement le chargement à la demande.
vi.mock('./MapView', () => ({
  MapView: ({ points }: { points: GPXPoint[] }) => (
    <div data-testid="map-view">Points : {points.length}</div>
  ),
}))

const mockGetParcoursPoints = vi.mocked(getParcoursPoints)

const parcours: ParcoursSummary = {
  id: 'p1',
  name: 'Bosserville (miroir)',
  distance_km: 8.4,
  elevation_gain_m: 93,
  created_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

const parcours2: ParcoursSummary = {
  ...parcours,
  id: 'p2',
  name: 'Bois de Haye',
}

const POINTS: GPXPoint[] = [
  { lat: 48.6, lng: 6.1 },
  { lat: 48.7, lng: 6.2 },
]

const baseProps = {
  isMyChoice: false,
  yesCount: 3,
  isWinner: false,
  saving: false,
  onToggle: vi.fn(),
}

const props = {
  ...baseProps,
  parcours,
  mapOpen: false,
  onToggleMap: vi.fn(),
}

/** Carte contrôlée : reproduit le parent qui ne laisse qu'une carte ouverte. */
function CardHarness({
  parcours: current = parcours,
  voteLocked = false,
}: {
  parcours?: ParcoursSummary
  voteLocked?: boolean
}) {
  const [mapOpen, setMapOpen] = useState(false)

  return (
    <ParcoursVoteCard
      {...baseProps}
      parcours={current}
      voteLocked={voteLocked}
      mapOpen={mapOpen}
      onToggleMap={() => setMapOpen((open) => !open)}
    />
  )
}

function TwoCardsHarness() {
  const [openMapId, setOpenMapId] = useState<string | null>(null)

  return (
    <>
      {[parcours, parcours2].map((p) => (
        <ParcoursVoteCard
          key={p.id}
          {...baseProps}
          parcours={p}
          mapOpen={openMapId === p.id}
          onToggleMap={() =>
            setOpenMapId((current) => (current === p.id ? null : p.id))
          }
        />
      ))}
    </>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetParcoursPoints.mockResolvedValue([])
})

describe('ParcoursVoteCard — vote verrouillé', () => {
  it('affiche les parcours même quand le vote est verrouillé', () => {
    // L'utilisateur voit les parcours et les compteurs, sans pouvoir voter
    render(<ParcoursVoteCard {...props} voteLocked />)

    expect(screen.getByText('Bosserville (miroir)')).toBeInTheDocument()
    expect(screen.getByText('3 personnes')).toBeInTheDocument()
  })

  it('n’affiche aucun bouton de vote tant que la présence n’est pas confirmée', () => {
    // Pas de bouton « Réponds d'abord » : on n'affiche pas une action
    // qui rejette un clic. Le parcours reste lisible, et le tracé consultable.
    render(<ParcoursVoteCard {...props} voteLocked />)

    expect(
      screen.queryByRole('button', { name: /Je veux celui-ci|Mon choix/ })
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Réponds d’abord')).not.toBeInTheDocument()
    expect(screen.getByText('Bosserville (miroir)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voir le tracé' })).toBeInTheDocument()
  })

  it('le bouton est actif quand la présence est confirmée', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<ParcoursVoteCard {...props} voteLocked={false} onToggle={onToggle} />)

    const button = screen.getByRole('button', { name: 'Je veux celui-ci' })
    expect(button).not.toBeDisabled()
    expect(button).toHaveTextContent('Je veux celui-ci')

    await user.click(button)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('« Mon choix » reste affiché même verrouillé, sans bouton de vote', () => {
    // L'information est gardée à l'écran ; seule l'action de vote disparaît.
    render(<ParcoursVoteCard {...props} isMyChoice voteLocked />)

    expect(screen.getByText('Mon choix')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Je veux celui-ci|Mon choix/ })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voir le tracé' })).toBeInTheDocument()
  })

  it('« Mon choix » reste actif si la présence est confirmée', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<ParcoursVoteCard {...props} isMyChoice voteLocked={false} onToggle={onToggle} />)

    const button = screen.getByRole('button', { name: 'Mon choix' })
    expect(button).not.toBeDisabled()
    await user.click(button)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})

describe('ParcoursVoteCard — tracé à la demande', () => {
  it('ne charge le tracé qu’à l’ouverture de la carte', async () => {
    const user = userEvent.setup()
    mockGetParcoursPoints.mockResolvedValue(POINTS)

    render(<CardHarness />)

    expect(mockGetParcoursPoints).not.toHaveBeenCalled()
    expect(screen.queryByTestId('map-view')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Voir le tracé' }))

    expect(await screen.findByTestId('map-view')).toHaveTextContent('Points : 2')
    expect(mockGetParcoursPoints).toHaveBeenCalledWith('p1')
  })

  it('reste consultable quand le vote est verrouillé', async () => {
    const user = userEvent.setup()
    mockGetParcoursPoints.mockResolvedValue(POINTS)

    render(<CardHarness voteLocked />)

    expect(
      screen.queryByRole('button', { name: /Je veux celui-ci|Mon choix/ })
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Voir le tracé' }))

    expect(await screen.findByTestId('map-view')).toBeInTheDocument()
  })

  it('affiche l’erreur et permet de réessayer', async () => {
    const user = userEvent.setup()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetParcoursPoints
      .mockRejectedValueOnce(new Error('Réseau indisponible'))
      .mockResolvedValueOnce(POINTS)

    render(<CardHarness />)
    await user.click(screen.getByRole('button', { name: 'Voir le tracé' }))

    expect(
      await screen.findByText('Impossible de charger le tracé')
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Réessayer' }))

    expect(await screen.findByTestId('map-view')).toBeInTheDocument()
    expect(mockGetParcoursPoints).toHaveBeenCalledTimes(2)

    consoleError.mockRestore()
  })

  it('signale un parcours sans tracé', async () => {
    const user = userEvent.setup()
    mockGetParcoursPoints.mockResolvedValue([])

    render(<CardHarness />)
    await user.click(screen.getByRole('button', { name: 'Voir le tracé' }))

    expect(await screen.findByText('Aucun tracé disponible')).toBeInTheDocument()
  })

  it('n’ouvre qu’une seule carte à la fois', async () => {
    const user = userEvent.setup()
    mockGetParcoursPoints.mockImplementation((id: string) =>
      Promise.resolve(id === 'p2' ? POINTS : [POINTS[0]])
    )

    render(<TwoCardsHarness />)

    await user.click(screen.getAllByRole('button', { name: 'Voir le tracé' })[0])

    await waitFor(() => {
      const maps = screen.getAllByTestId('map-view')
      expect(maps).toHaveLength(1)
      expect(maps[0]).toHaveTextContent('Points : 1')
    })

    // La première carte est ouverte : la seconde est le seul bouton « Voir ».
    await user.click(screen.getByRole('button', { name: 'Voir le tracé' }))

    await waitFor(() => {
      const maps = screen.getAllByTestId('map-view')
      expect(maps).toHaveLength(1)
      expect(maps[0]).toHaveTextContent('Points : 2')
    })
  })
})
