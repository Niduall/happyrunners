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

describe('DeclareRunModal — chiffres d’une sortie « autre »', () => {
  async function chooseOther(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('radio', { name: /Autre parcours/ }))
    await user.type(screen.getByLabelText('Nom du parcours'), 'Boucle du parc')
  }

  it('pré-remplit la distance et le D+ depuis le fichier, source « gpx »', async () => {
    const user = userEvent.setup()
    const { container, onDeclare } = renderModal()

    await chooseOther(user)
    await user.upload(
      gpxInput(container),
      new File([GPX], 'boucle.gpx', { type: 'application/gpx+xml' })
    )

    // Les champs sont remplis, mais restent modifiables.
    expect(await screen.findByLabelText('Distance (km)')).toHaveValue('1,11')
    expect(screen.getByLabelText('Dénivelé (m)')).toHaveValue('0')
    expect(screen.getByText(/Chiffres lus dans/)).toBeInTheDocument()

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

  it('refuse un fichier sans tracé et laisse saisir la distance à la main', async () => {
    const user = userEvent.setup()
    const { container, onDeclare } = renderModal()

    await chooseOther(user)
    await user.upload(
      gpxInput(container),
      new File(['ceci n’est pas un GPX'], 'vide.gpx', { type: 'text/plain' })
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ce fichier ne contient pas de tracé lisible : indique la distance à la main.'
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

  it('garde les chiffres en place quand un second fichier est illisible', async () => {
    const user = userEvent.setup()
    const { container, onDeclare } = renderModal()

    await chooseOther(user)
    await user.upload(
      gpxInput(container),
      new File([GPX], 'boucle.gpx', { type: 'application/gpx+xml' })
    )
    expect(await screen.findByLabelText('Distance (km)')).toHaveValue('1,11')

    await user.upload(
      gpxInput(container),
      new File(['pas un GPX'], 'casse.gpx', { type: 'text/plain' })
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'les chiffres saisis sont conservés'
    )
    expect(screen.getByLabelText('Distance (km)')).toHaveValue('1,11')

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
          source: 'gpx',
          distanceKm: 8.4,
          elevationGainM: 120,
        },
      })
    )

    // Rouvrir la modale pour corriger ne doit pas effacer les kilomètres.
    expect(screen.getByLabelText('Distance (km)')).toHaveValue('8,4')
    expect(screen.getByLabelText('Dénivelé (m)')).toHaveValue('120')

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

  it('accepte une distance et un D+ saisis à la main, sans GPX', async () => {
    const user = userEvent.setup()
    const { onDeclare } = renderModal()

    await chooseOther(user)
    await user.type(screen.getByLabelText('Distance (km)'), '7,5')
    await user.type(screen.getByLabelText('Dénivelé (m)'), '80')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(onDeclare).toHaveBeenCalled())
    expect(onDeclare).toHaveBeenCalledWith({
      parcoursId: null,
      parcoursName: 'Boucle du parc',
      distanceKm: 7.5,
      elevationGainM: 80,
      source: 'manual',
    })
  })

  it('repasse en saisie manuelle quand on corrige les chiffres d’un GPX', async () => {
    const user = userEvent.setup()
    const { container, onDeclare } = renderModal()

    await chooseOther(user)
    await user.upload(
      gpxInput(container),
      new File([GPX], 'boucle.gpx', { type: 'application/gpx+xml' })
    )
    expect(await screen.findByLabelText('Distance (km)')).toHaveValue('1,11')

    const distanceField = screen.getByLabelText('Distance (km)')
    await user.clear(distanceField)
    await user.type(distanceField, '2,5')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(onDeclare).toHaveBeenCalled())
    expect(onDeclare).toHaveBeenCalledWith({
      parcoursId: null,
      parcoursName: 'Boucle du parc',
      distanceKm: 2.5,
      elevationGainM: 0,
      source: 'manual',
    })
  })

  it('refuse une distance illisible sans enregistrer', async () => {
    const user = userEvent.setup()
    const { onDeclare } = renderModal()

    await chooseOther(user)
    await user.type(screen.getByLabelText('Distance (km)'), 'huit')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Indique une distance en kilomètres (ex. : 8,4)'
    )
    expect(onDeclare).not.toHaveBeenCalled()
  })

  it('accepte une sortie sans aucun chiffre', async () => {
    const user = userEvent.setup()
    const { onDeclare } = renderModal()

    await chooseOther(user)
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
