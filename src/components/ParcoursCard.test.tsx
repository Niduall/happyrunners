import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ParcoursCard } from './ParcoursCard'
import { getParcoursPoints } from '../services/supabaseService'
import type { GPXPoint, ParcoursSummary } from '../types'

vi.mock('../services/supabaseService', () => ({
  getParcoursPoints: vi.fn(),
}))

vi.mock('../services/gpxParser', () => ({ parseGPX: vi.fn() }))

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
  name: 'Bois de Haye',
  distance_km: 4.2,
  elevation_gain_m: 93,
  created_by: null,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
}

const POINTS: GPXPoint[] = [
  { lat: 48.6, lng: 6.1 },
  { lat: 48.7, lng: 6.2 },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ParcoursCard — tracé à la demande', () => {
  it('ne charge aucun point avant le dépliage de la carte', () => {
    render(<ParcoursCard parcours={parcours} />)

    expect(mockGetParcoursPoints).not.toHaveBeenCalled()
    expect(screen.queryByTestId('map-view')).not.toBeInTheDocument()
  })

  it('charge le tracé puis affiche la carte au clic', async () => {
    const user = userEvent.setup()
    mockGetParcoursPoints.mockResolvedValue(POINTS)

    render(<ParcoursCard parcours={parcours} />)
    await user.click(screen.getByRole('button', { name: 'Voir la carte' }))

    expect(await screen.findByTestId('map-view')).toHaveTextContent('Points : 2')
    expect(mockGetParcoursPoints).toHaveBeenCalledWith('p1')
  })

  it('affiche un état de chargement pendant la requête', async () => {
    const user = userEvent.setup()
    let resolvePoints: (points: GPXPoint[]) => void = () => {}
    mockGetParcoursPoints.mockReturnValue(
      new Promise<GPXPoint[]>((resolve) => {
        resolvePoints = resolve
      })
    )

    render(<ParcoursCard parcours={parcours} />)
    await user.click(screen.getByRole('button', { name: 'Voir la carte' }))

    expect(screen.getByText('Chargement du tracé…')).toBeInTheDocument()

    resolvePoints(POINTS)
    expect(await screen.findByTestId('map-view')).toBeInTheDocument()
  })

  it('affiche l’erreur et permet de réessayer', async () => {
    const user = userEvent.setup()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetParcoursPoints
      .mockRejectedValueOnce(new Error('Réseau indisponible'))
      .mockResolvedValueOnce(POINTS)

    render(<ParcoursCard parcours={parcours} />)
    await user.click(screen.getByRole('button', { name: 'Voir la carte' }))

    expect(
      await screen.findByText('Impossible de charger le tracé')
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Réessayer' }))

    expect(await screen.findByTestId('map-view')).toBeInTheDocument()
    expect(mockGetParcoursPoints).toHaveBeenCalledTimes(2)

    consoleError.mockRestore()
  })

  it('ne recharge pas le tracé quand on rouvre la carte', async () => {
    const user = userEvent.setup()
    mockGetParcoursPoints.mockResolvedValue(POINTS)

    render(<ParcoursCard parcours={parcours} />)

    await user.click(screen.getByRole('button', { name: 'Voir la carte' }))
    await screen.findByTestId('map-view')

    await user.click(screen.getByRole('button', { name: 'Masquer la carte' }))
    await waitFor(() =>
      expect(screen.queryByTestId('map-view')).not.toBeInTheDocument()
    )

    await user.click(screen.getByRole('button', { name: 'Voir la carte' }))
    expect(await screen.findByTestId('map-view')).toBeInTheDocument()
    expect(mockGetParcoursPoints).toHaveBeenCalledTimes(1)
  })

  it('signale un parcours sans tracé', async () => {
    const user = userEvent.setup()
    mockGetParcoursPoints.mockResolvedValue([])

    render(<ParcoursCard parcours={parcours} />)
    await user.click(screen.getByRole('button', { name: 'Voir la carte' }))

    expect(await screen.findByText('Aucun tracé disponible')).toBeInTheDocument()
  })
})
