import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LazyMapView } from './LazyMapView'
import type { GPXPoint } from '../types'

// Leaflet a besoin de dimensions réelles : on isole la carte pour ne tester
// que le chargement différé et le fallback.
vi.mock('./MapView', () => ({
  MapView: ({ points, height }: { points: GPXPoint[]; height?: number }) => (
    <div data-testid="map-view" data-height={height}>
      Points : {points.length}
    </div>
  ),
}))

const POINTS: GPXPoint[] = [
  { lat: 48.6, lng: 6.1 },
  { lat: 48.61, lng: 6.12 },
]

describe('LazyMapView', () => {
  it('affiche un chargement à la hauteur de la carte, puis la carte', async () => {
    render(<LazyMapView points={POINTS} height={240} />)

    // Le fallback occupe la même place que la carte : pas de saut de mise en page.
    const fallback = screen.getByRole('status')
    expect(fallback).toHaveTextContent('Chargement de la carte…')
    expect(fallback).toHaveStyle({ height: '240px' })

    const map = await screen.findByTestId('map-view')
    expect(map).toHaveTextContent('Points : 2')
    expect(map).toHaveAttribute('data-height', '240')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('retombe sur 300 px quand aucune hauteur n’est demandée', async () => {
    render(<LazyMapView points={POINTS} />)

    // Le module est déjà chargé : la carte s'affiche sans fallback, mais la
    // hauteur par défaut doit rester celle de `MapView`.
    expect(await screen.findByTestId('map-view')).toHaveAttribute('data-height', '300')
  })
})
