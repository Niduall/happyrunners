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

describe('ParcoursCard — modification réservée à l’admin', () => {
  it('appelle onEdit avec le parcours au clic sur le crayon', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()

    render(<ParcoursCard parcours={parcours} adminUnlocked onEdit={onEdit} />)
    await user.click(screen.getByLabelText('Modifier'))

    expect(onEdit).toHaveBeenCalledWith(parcours)
  })

  it('n’affiche ni crayon ni remplacement du GPX quand c’est verrouillé', () => {
    render(<ParcoursCard parcours={parcours} onEdit={vi.fn()} />)

    expect(screen.queryByLabelText('Modifier')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remplacer le GPX/ })).not.toBeInTheDocument()
  })

  it('transmet le contenu du fichier à onReplaceGpx puis confirme', async () => {
    const user = userEvent.setup()
    const onReplaceGpx = vi.fn().mockResolvedValue(undefined)

    const { container } = render(
      <ParcoursCard parcours={parcours} adminUnlocked onReplaceGpx={onReplaceGpx} />
    )

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(['<gpx>trace</gpx>'], 'trace.gpx'))

    await waitFor(() =>
      expect(onReplaceGpx).toHaveBeenCalledWith('p1', '<gpx>trace</gpx>')
    )
    expect(await screen.findByText('Tracé remplacé.')).toBeInTheDocument()
  })

  it('affiche l’erreur renvoyée par le remplacement', async () => {
    const user = userEvent.setup()
    const onReplaceGpx = vi.fn().mockRejectedValue(new Error('Fichier GPX invalide'))

    const { container } = render(
      <ParcoursCard parcours={parcours} adminUnlocked onReplaceGpx={onReplaceGpx} />
    )

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(['pas un gpx'], 'trace.gpx'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Fichier GPX invalide')
    expect(screen.queryByText('Tracé remplacé.')).not.toBeInTheDocument()
  })
})
