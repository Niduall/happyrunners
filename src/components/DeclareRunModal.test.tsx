import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeclareRunModal, type DeclareRunTarget } from './DeclareRunModal'
import type { ParcoursSummary } from '../types/supabase'

/**
 * Un GPX minimal mais valide : deux points séparés de 0,01° de latitude,
 * soit environ 1,11 km. Le D+ reste à zéro (altitude constante).
 */
const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Boucle importée</name>
    <trkseg>
      <trkpt lat="48.8566" lon="2.3522"><ele>35</ele></trkpt>
      <trkpt lat="48.8666" lon="2.3522"><ele>35</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`

const PARCOURS: ParcoursSummary[] = [
  {
    id: 'p1',
    name: 'Bords de Marne',
    distance_km: 8,
    elevation_gain_m: 100,
    created_by: 1,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
  },
]

function target(over: Partial<DeclareRunTarget> = {}): DeclareRunTarget {
  return {
    weekKey: '2026-11-04',
    dateLabel: 'Mercredi 4 novembre',
    myRun: null,
    votedParcoursId: null,
    ...over,
  }
}

function renderModal(
  week: DeclareRunTarget = target(),
  onDeclare = vi.fn().mockResolvedValue(true)
) {
  const view = render(
    <DeclareRunModal
      week={week}
      parcours={PARCOURS}
      saving={false}
      onDeclare={onDeclare}
      onClose={vi.fn()}
    />
  )
  return { ...view, onDeclare }
}

function gpxInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="file"]') as HTMLInputElement
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('DeclareRunModal — GPX d’une sortie « autre »', () => {
  it('remplit la distance depuis le fichier et enregistre la source', async () => {
    const user = userEvent.setup()
    const { container, onDeclare } = renderModal()

    await user.click(screen.getByRole('radio', { name: /Autre parcours/ }))
    await user.type(screen.getByLabelText('Nom du parcours'), 'Boucle du parc')
    await user.upload(
      gpxInput(container),
      new File([GPX], 'boucle.gpx', { type: 'application/gpx+xml' })
    )

    // Les chiffres lus remplacent l'aide « sans GPX ».
    expect(await screen.findByText(/1,1 km/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(onDeclare).toHaveBeenCalled())
    expect(onDeclare).toHaveBeenCalledWith({
      parcoursId: null,
      parcoursName: 'Boucle du parc',
      distanceKm: expect.closeTo(1.11, 2),
      elevationGainM: 0,
      source: 'gpx',
    })
  })

  it('refuse un fichier sans tracé et dit que la distance ne sera pas comptée', async () => {
    const user = userEvent.setup()
    const { container, onDeclare } = renderModal()

    await user.click(screen.getByRole('radio', { name: /Autre parcours/ }))
    await user.type(screen.getByLabelText('Nom du parcours'), 'Boucle du parc')
    await user.upload(
      gpxInput(container),
      new File(['ceci n’est pas un GPX'], 'vide.gpx', { type: 'text/plain' })
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ce fichier ne contient pas de tracé lisible : la distance ne sera pas comptée.'
    )
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    // Le fichier est refusé, pas la sortie : elle part sans distance.
    await waitFor(() => expect(onDeclare).toHaveBeenCalled())
    expect(onDeclare).toHaveBeenCalledWith({
      parcoursId: null,
      parcoursName: 'Boucle du parc',
      distanceKm: null,
      elevationGainM: null,
      source: 'manual',
    })
  })

  it('garde l’import en place quand un second fichier est illisible', async () => {
    const user = userEvent.setup()
    const { container, onDeclare } = renderModal()

    await user.click(screen.getByRole('radio', { name: /Autre parcours/ }))
    await user.type(screen.getByLabelText('Nom du parcours'), 'Boucle du parc')
    await user.upload(
      gpxInput(container),
      new File([GPX], 'boucle.gpx', { type: 'application/gpx+xml' })
    )
    expect(await screen.findByText(/1,1 km/)).toBeInTheDocument()

    await user.upload(
      gpxInput(container),
      new File(['pas un GPX'], 'casse.gpx', { type: 'text/plain' })
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'l’import précédent est conservé'
    )
    expect(screen.getByText(/1,1 km/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(onDeclare).toHaveBeenCalled())
    expect(onDeclare).toHaveBeenCalledWith(
      expect.objectContaining({
        distanceKm: expect.closeTo(1.11, 2),
        source: 'gpx',
      })
    )
  })

  it('garde les chiffres d’une sortie « autre » déjà importée', async () => {
    const user = userEvent.setup()
    const { onDeclare } = renderModal(
      target({
        myRun: {
          parcoursId: null,
          parcoursName: 'Boucle du parc',
          distanceKm: 8.4,
          elevationGainM: 120,
        },
      })
    )

    // Rouvrir la modale pour corriger ne doit pas effacer les kilomètres.
    expect(screen.getByText(/8,4 km · 120 m D\+/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(onDeclare).toHaveBeenCalled())
    expect(onDeclare).toHaveBeenCalledWith({
      parcoursId: null,
      parcoursName: 'Boucle du parc',
      distanceKm: 8.4,
      elevationGainM: 120,
      source: 'gpx',
    })
  })

  it('oublie l’import quand on le retire', async () => {
    const user = userEvent.setup()
    const { onDeclare } = renderModal(
      target({
        myRun: {
          parcoursId: null,
          parcoursName: 'Boucle du parc',
          distanceKm: 8.4,
          elevationGainM: 120,
        },
      })
    )

    await user.click(screen.getByRole('button', { name: 'Retirer le GPX' }))
    expect(screen.getByText(/Sans GPX, la distance ne sera pas comptée/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(onDeclare).toHaveBeenCalled())
    expect(onDeclare).toHaveBeenCalledWith({
      parcoursId: null,
      parcoursName: 'Boucle du parc',
      distanceKm: null,
      elevationGainM: null,
      source: 'manual',
    })
  })
})
