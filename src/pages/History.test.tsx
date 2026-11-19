import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { History } from './History'
import {
  declareWeeklyRun,
  deleteWeeklyRun,
  getAllProfiles,
  getHistoryAttendances,
  getHistoryVotes,
  getParcours,
  getPendingProposals,
  getWeeklyRuns,
  setProposalStatus,
} from '../services/supabaseService'
import type { ImportProposal, WeeklyRun } from '../types/supabase'

// Le compte connecté et la semaine sont figés : les dates affichées ne
// dépendent pas du jour où la suite tourne.
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 1, firstName: 'Alice', lastName: 'Martin', name: 'Alice Martin' },
    loading: false,
    isAuthenticated: true,
  }),
}))

vi.mock('../hooks/useTargetWednesday', () => ({
  useTargetWednesday: () => ({
    weekKey: '2026-11-11',
    weekLabel: 'semaine du 11 nov.',
    date: new Date(2026, 10, 11),
    isRunDay: false,
  }),
}))

vi.mock('../services/supabaseService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/supabaseService')>()
  return {
    ...actual,
    getHistoryAttendances: vi.fn(),
    getHistoryVotes: vi.fn(),
    getWeeklyRuns: vi.fn(),
    getParcours: vi.fn(),
    getAllProfiles: vi.fn(),
    getPendingProposals: vi.fn(),
    setProposalStatus: vi.fn(),
    declareWeeklyRun: vi.fn(),
    deleteWeeklyRun: vi.fn(),
  }
})

const mockAttendances = vi.mocked(getHistoryAttendances)
const mockVotes = vi.mocked(getHistoryVotes)
const mockRuns = vi.mocked(getWeeklyRuns)
const mockParcours = vi.mocked(getParcours)
const mockProfiles = vi.mocked(getAllProfiles)
const mockDeclare = vi.mocked(declareWeeklyRun)
const mockDelete = vi.mocked(deleteWeeklyRun)
const mockPending = vi.mocked(getPendingProposals)
const mockProposalStatus = vi.mocked(setProposalStatus)

const PROFILES = [
  { user_number: 1, first_name: 'Alice', last_name: 'Martin' },
  { user_number: 2, first_name: 'Bob', last_name: 'Durand' },
]

const PARCOURS = [
  {
    id: 'p1',
    name: 'Bords de Marne',
    distance_km: 8,
    elevation_gain_m: 100,
    created_by: 1,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
  },
  {
    id: 'p2',
    name: 'Forêt',
    distance_km: 12,
    elevation_gain_m: 150,
    created_by: 1,
    created_at: '2026-09-02T00:00:00Z',
    updated_at: '2026-09-02T00:00:00Z',
  },
]

function declaredRun(over: Partial<WeeklyRun> = {}): WeeklyRun {
  return {
    week_key: '2026-10-28',
    user_number: 1,
    parcours_id: 'p1',
    parcours_name: 'Bords de Marne',
    source: 'manual',
    distance_km: 8.4,
    elevation_gain_m: 120,
    declared_at: '2026-10-28T18:30:00Z',
    updated_at: '2026-10-28T18:30:00Z',
    ...over,
  }
}

function renderHistory() {
  return render(
    <MemoryRouter initialEntries={['/historique']}>
      <History />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()

  mockAttendances.mockResolvedValue([
    {
      weekKey: '2026-11-04',
      userNumber: 1,
      firstName: 'Alice',
      lastName: 'Martin',
      status: 'going',
    },
    {
      weekKey: '2026-11-04',
      userNumber: 2,
      firstName: 'Bob',
      lastName: 'Durand',
      status: 'going',
    },
    {
      weekKey: '2026-10-28',
      userNumber: 1,
      firstName: 'Alice',
      lastName: 'Martin',
      status: 'going',
    },
  ])
  mockVotes.mockResolvedValue([
    { weekKey: '2026-11-04', parcoursId: 'p2', userNumber: 1, status: 'yes' },
    { weekKey: '2026-11-04', parcoursId: 'p2', userNumber: 2, status: 'yes' },
  ])
  mockRuns.mockResolvedValue([declaredRun()])
  mockParcours.mockResolvedValue(PARCOURS)
  mockProfiles.mockResolvedValue(PROFILES)
  mockDeclare.mockResolvedValue(undefined)
  mockDelete.mockResolvedValue(undefined)
  mockPending.mockResolvedValue([])
  mockProposalStatus.mockResolvedValue(undefined)
})

describe('Historique — semaines passées', () => {
  it('affiche les sorties déclarées et le vote à titre d’indice', async () => {
    renderHistory()

    expect(await screen.findByText('Mercredi 4 novembre')).toBeInTheDocument()
    expect(screen.getByText('Mercredi 28 octobre')).toBeInTheDocument()

    // 4 novembre : personne n'a déclaré, le vote reste un indice.
    expect(
      screen.getAllByText('Aucun parcours renseigné.').length
    ).toBeGreaterThan(0)
    expect(screen.getByText(/Vote : Forêt/)).toBeInTheDocument()

    // 28 octobre : la sortie d'Alice, nominative.
    expect(screen.getByText('Bords de Marne')).toBeInTheDocument()
    expect(screen.getByText(/Alice \(vous\)/)).toBeInTheDocument()
  })

  it('compte les sorties, la série, les km et le dénivelé', async () => {
    mockRuns.mockResolvedValue([
      declaredRun({
        week_key: '2026-11-04',
        distance_km: 8,
        elevation_gain_m: 100,
      }),
      declaredRun(),
    ])

    renderHistory()

    await screen.findByText('Mercredi 4 novembre')

    const runs = screen.getByText('Mes sorties').closest('div')!
    expect(within(runs).getByText('2')).toBeInTheDocument()

    const streak = screen.getByText('Série').closest('div')!
    expect(within(streak).getByText('2')).toBeInTheDocument()

    const distance = screen.getByText('Distance').closest('div')!
    expect(within(distance).getByText('16,4 km')).toBeInTheDocument()

    const elevation = screen.getByText('Dénivelé').closest('div')!
    expect(within(elevation).getByText('220 m')).toBeInTheDocument()
  })

  it('permet à chacun d’indiquer son parcours, même sans avoir répondu', async () => {
    // Seule Bob est présent : Alice peut tout de même déclarer sa sortie,
    // puisque déclarer remet la présence à « going ».
    mockAttendances.mockResolvedValue([
      {
        weekKey: '2026-11-04',
        userNumber: 2,
        firstName: 'Bob',
        lastName: 'Durand',
        status: 'going',
      },
    ])

    renderHistory()

    await screen.findByText('Mercredi 4 novembre')
    expect(
      screen.getByRole('button', {
        name: /Indiquer mon parcours du mercredi 4 novembre/,
      })
    ).toBeInTheDocument()
  })

  it('ne propose de modifier que la semaine la plus récente', async () => {
    renderHistory()

    await screen.findByText('Mercredi 4 novembre')

    // 4 novembre : la semaine encore ouverte, modifiable.
    expect(
      screen.getByRole('button', {
        name: /Indiquer mon parcours du mercredi 4 novembre/,
      })
    ).toBeInTheDocument()

    // 28 octobre et avant : figées, plus aucun bouton.
    expect(
      screen.queryByRole('button', {
        name: /parcours du mercredi 28 octobre/,
      })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: /parcours du mercredi 21 octobre/,
      })
    ).not.toBeInTheDocument()
  })

  it('explique la règle de verrouillage', async () => {
    renderHistory()

    await screen.findByText('Mercredi 4 novembre')

    expect(
      screen.getByText(/déclarer ou corriger ta sortie/)
    ).toHaveTextContent(/jusqu’au mercredi suivant, 14h/)
  })

  it('masque les semaines sans présence ni sortie', async () => {
    renderHistory()

    await screen.findByText('Mercredi 4 novembre')

    // 11 semaines sur 12 n'ont ni présence ni sortie : une seule est ouverte.
    expect(screen.queryByText('Mercredi 21 octobre')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Afficher les 10 semaines vides' })
    ).toBeInTheDocument()
  })

  it('garde la semaine ouverte même sans présence ni sortie', async () => {
    mockAttendances.mockResolvedValue([])
    mockVotes.mockResolvedValue([])
    mockRuns.mockResolvedValue([])

    renderHistory()

    // C'est la semaine où l'on vient déclarer : elle doit rester visible.
    expect(await screen.findByText('Mercredi 4 novembre')).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: /Indiquer mon parcours du mercredi 4 novembre/,
      })
    ).toBeInTheDocument()
    // Les onze autres sont vides : masquées.
    expect(screen.queryByText('Mercredi 28 octobre')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Afficher les 11 semaines vides' })
    ).toBeInTheDocument()
  })

  it('affiche les semaines vides à la demande', async () => {
    const user = userEvent.setup()
    renderHistory()

    await screen.findByText('Mercredi 4 novembre')
    await user.click(
      screen.getByRole('button', { name: 'Afficher les 10 semaines vides' })
    )

    expect(screen.getByText('Mercredi 21 octobre')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Masquer les semaines vides' })
    ).toBeInTheDocument()
  })

  it('signale les semaines clôturées', async () => {
    renderHistory()

    await screen.findByText('Mercredi 4 novembre')

    // Une seule semaine visible est figée : 28 octobre.
    expect(screen.getAllByText('Semaine clôturée')).toHaveLength(1)
  })

  it('permet de retirer sa sortie sur une semaine clôturée', async () => {
    // 28 octobre est figée, et c'est là qu'Alice a déclaré.
    mockRuns.mockResolvedValue([declaredRun({ week_key: '2026-10-28' })])
    const user = userEvent.setup()
    renderHistory()

    await screen.findByText('Mercredi 28 octobre')
    await user.click(
      screen.getByRole('button', {
        name: 'Retirer ma sortie du mercredi 28 octobre',
      })
    )
    expect(
      screen.getByText(/Retirer ta sortie du mercredi 28 octobre/)
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retirer' }))

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith({
        weekKey: '2026-10-28',
        userNumber: 1,
      })
    )
  })

  it('n’offre le retrait que sur ses propres sorties', async () => {
    // Bob a déclaré, pas Alice : aucun bouton de retrait sur la carte.
    mockRuns.mockResolvedValue([
      declaredRun({ week_key: '2026-10-28', user_number: 2 }),
    ])
    renderHistory()

    await screen.findByText('Mercredi 28 octobre')
    expect(
      screen.queryByRole('button', {
        name: 'Retirer ma sortie du mercredi 28 octobre',
      })
    ).not.toBeInTheDocument()
  })

  it('actualise l’historique à la demande', async () => {
    const user = userEvent.setup()
    renderHistory()

    await screen.findByText('Mercredi 4 novembre')
    const callsBefore = mockAttendances.mock.calls.length

    await user.click(
      screen.getByRole('button', { name: 'Actualiser l’historique' })
    )

    await waitFor(() =>
      expect(mockAttendances.mock.calls.length).toBe(callsBefore + 1)
    )
  })

  it('signale une erreur et permet de réessayer', async () => {
    mockRuns.mockRejectedValueOnce(new Error('lecture refusée'))

    renderHistory()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'lecture refusée'
    )
    expect(
      screen.getByRole('button', { name: /Réessayer/ })
    ).toBeInTheDocument()
  })
})

describe('Historique — déclaration du parcours', () => {
  it('enregistre un parcours « autre » sans distance', async () => {
    const user = userEvent.setup()
    renderHistory()

    await screen.findByText('Mercredi 4 novembre')
    await user.click(
      screen.getByRole('button', {
        name: /Indiquer mon parcours du mercredi 4 novembre/,
      })
    )

    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('radio', { name: /Autre parcours/ })
    )
    await user.type(
      within(dialog).getByLabelText('Nom du parcours'),
      'Boucle du parc'
    )
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() =>
      expect(mockDeclare).toHaveBeenCalledWith({
        weekKey: '2026-11-04',
        userNumber: 1,
        parcoursId: null,
        parcoursName: 'Boucle du parc',
        distanceKm: null,
        elevationGainM: null,
        source: 'manual',
      })
    )
  })

  it('corrige une sortie existante avec un parcours enregistré', async () => {
    mockRuns.mockResolvedValue([declaredRun({ week_key: '2026-11-04' })])
    const user = userEvent.setup()
    renderHistory()

    await screen.findByText('Mercredi 4 novembre')
    await user.click(
      screen.getByRole('button', {
        name: /Corriger mon parcours du mercredi 4 novembre/,
      })
    )

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('radio', { name: /Bords de Marne/ })
    ).toBeChecked()

    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() =>
      expect(mockDeclare).toHaveBeenCalledWith({
        weekKey: '2026-11-04',
        userNumber: 1,
        parcoursId: 'p1',
        parcoursName: 'Bords de Marne',
        distanceKm: 8,
        elevationGainM: 100,
        source: 'manual',
      })
    )
  })

  it('présélectionne le parcours voté, pas le premier de la liste', async () => {
    mockVotes.mockResolvedValue([
      { weekKey: '2026-11-04', parcoursId: 'p2', userNumber: 1, status: 'yes' },
    ])
    const user = userEvent.setup()
    renderHistory()

    await screen.findByText('Mercredi 4 novembre')
    await user.click(
      screen.getByRole('button', {
        name: /Indiquer mon parcours du mercredi 4 novembre/,
      })
    )

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('radio', { name: /Forêt/ })).toBeChecked()
    expect(
      within(dialog).getByRole('radio', { name: /Bords de Marne/ })
    ).not.toBeChecked()
  })

  it('ne présélectionne rien sans sortie ni vote', async () => {
    mockVotes.mockResolvedValue([])
    const user = userEvent.setup()
    renderHistory()

    await screen.findByText('Mercredi 4 novembre')
    await user.click(
      screen.getByRole('button', {
        name: /Indiquer mon parcours du mercredi 4 novembre/,
      })
    )

    const dialog = await screen.findByRole('dialog')
    for (const radio of within(dialog).getAllByRole('radio')) {
      expect(radio).not.toBeChecked()
    }
    expect(
      within(dialog).getByRole('button', { name: 'Enregistrer' })
    ).toBeDisabled()
  })

  it('refuse un libellé vide sans appeler la base', async () => {
    const user = userEvent.setup()
    renderHistory()

    await screen.findByText('Mercredi 4 novembre')
    await user.click(
      screen.getByRole('button', {
        name: /Indiquer mon parcours du mercredi 4 novembre/,
      })
    )

    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('radio', { name: /Autre parcours/ })
    )
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Indique le nom du parcours'
    )
    expect(mockDeclare).not.toHaveBeenCalled()
  })

  it('garde la modale ouverte si l’enregistrement échoue', async () => {
    mockRuns.mockResolvedValue([declaredRun({ week_key: '2026-11-04' })])
    mockDeclare.mockRejectedValueOnce(new Error('écriture refusée'))
    const user = userEvent.setup()
    renderHistory()

    await screen.findByText('Mercredi 4 novembre')
    await user.click(
      screen.getByRole('button', {
        name: /Corriger mon parcours du mercredi 4 novembre/,
      })
    )

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Enregistrement impossible'
    )
    expect(dialog).toBeInTheDocument()
  })

  it('retire une sortie déclarée après confirmation', async () => {
    mockRuns.mockResolvedValue([declaredRun({ week_key: '2026-11-04' })])
    const user = userEvent.setup()
    renderHistory()

    await screen.findByText('Mercredi 4 novembre')
    await user.click(
      screen.getByRole('button', {
        name: /Corriger mon parcours du mercredi 4 novembre/,
      })
    )

    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('button', { name: 'Retirer ma sortie' })
    )
    expect(
      within(dialog).getByText(/Retirer ta sortie du mercredi 4 novembre/)
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Retirer' }))

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith({
        weekKey: '2026-11-04',
        userNumber: 1,
      })
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
  })

  it('annule le retrait sans supprimer la sortie', async () => {
    mockRuns.mockResolvedValue([declaredRun({ week_key: '2026-11-04' })])
    const user = userEvent.setup()
    renderHistory()

    await screen.findByText('Mercredi 4 novembre')
    await user.click(
      screen.getByRole('button', {
        name: /Corriger mon parcours du mercredi 4 novembre/,
      })
    )

    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('button', { name: 'Retirer ma sortie' })
    )
    const confirmBox = within(dialog)
      .getByText(/Retirer ta sortie du mercredi 4 novembre/)
      .closest('div')!
    await user.click(
      within(confirmBox).getByRole('button', { name: 'Annuler' })
    )

    expect(mockDelete).not.toHaveBeenCalled()
    expect(
      within(dialog).getByRole('button', { name: 'Retirer ma sortie' })
    ).toBeInTheDocument()
  })

  it('garde la modale ouverte si le retrait échoue', async () => {
    mockRuns.mockResolvedValue([declaredRun({ week_key: '2026-11-04' })])
    mockDelete.mockRejectedValueOnce(new Error('suppression refusée'))
    const user = userEvent.setup()
    renderHistory()

    await screen.findByText('Mercredi 4 novembre')
    await user.click(
      screen.getByRole('button', {
        name: /Corriger mon parcours du mercredi 4 novembre/,
      })
    )

    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('button', { name: 'Retirer ma sortie' })
    )
    await user.click(within(dialog).getByRole('button', { name: 'Retirer' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Retrait impossible'
    )
    expect(dialog).toBeInTheDocument()
  })

  it('ferme la modale avec Échap', async () => {
    const user = userEvent.setup()
    renderHistory()

    await screen.findByText('Mercredi 4 novembre')
    await user.click(
      screen.getByRole('button', {
        name: /Indiquer mon parcours du mercredi 4 novembre/,
      })
    )
    await screen.findByRole('dialog')

    await user.keyboard('{Escape}')

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
  })
})

describe('Historique — proposition de la montre', () => {
  /**
   * La semaine mockée est celle du 11 novembre, donc la semaine encore
   * modifiable est la précédente (le 4 novembre) : `pastWeekKeys` exclut la
   * semaine courante. Une proposition du 4 novembre avant 14h appartient bien
   * à cette semaine-là.
   */
  function proposal(over: Partial<ImportProposal> = {}): ImportProposal {
    return {
      id: 'prop-1',
      user_number: 1,
      source: 'health',
      external_id: '2026-11-04T12:30:00',
      activity_type: 'RUNNING',
      started_at: '2026-11-04T12:30:00',
      duration_s: 2520,
      distance_m: 8200,
      status: 'pending',
      created_at: '2026-11-04T13:00:00Z',
      ...over,
    }
  }

  it('propose la sortie et ne l’enregistre qu’après validation', async () => {
    mockPending.mockResolvedValue([proposal()])
    const user = userEvent.setup()

    renderHistory()

    expect(
      await screen.findByText('Ta montre propose une sortie')
    ).toBeInTheDocument()
    expect(screen.getByText(/mercredi 4 novembre/)).toBeInTheDocument()
    expect(screen.getByText(/8,2 km/)).toBeInTheDocument()
    expect(screen.getByText(/42 min/)).toBeInTheDocument()

    // Avant le clic, rien n'est écrit dans le classement.
    expect(mockDeclare).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Valider' }))

    await waitFor(() =>
      expect(mockDeclare).toHaveBeenCalledWith({
        weekKey: '2026-11-04',
        userNumber: 1,
        parcoursId: null,
        parcoursName: 'Sortie importée',
        distanceKm: 8.2,
        elevationGainM: null,
        source: 'health',
      })
    )
    expect(mockProposalStatus).toHaveBeenCalledWith('prop-1', 'accepted')
  })

  it('ignore une proposition sans écrire de sortie', async () => {
    mockPending.mockResolvedValue([proposal()])
    const user = userEvent.setup()

    renderHistory()

    await screen.findByText('Ta montre propose une sortie')
    await user.click(screen.getByRole('button', { name: 'Ignorer' }))

    await waitFor(() =>
      expect(mockProposalStatus).toHaveBeenCalledWith('prop-1', 'ignored')
    )
    expect(mockDeclare).not.toHaveBeenCalled()
  })

  it('n’affiche pas la proposition si la semaine a déjà une sortie', async () => {
    mockPending.mockResolvedValue([proposal()])
    mockRuns.mockResolvedValue([
      declaredRun({ week_key: '2026-11-04', parcours_name: 'Forêt' }),
    ])

    renderHistory()

    await screen.findByText('Mercredi 4 novembre')
    expect(
      screen.queryByText('Ta montre propose une sortie')
    ).not.toBeInTheDocument()
  })

  it('ignore une proposition d’une semaine déjà clôturée', async () => {
    // Une sortie du 28 octobre appartient à une semaine close : la montre ne
    // doit pas pouvoir réécrire un classement passé.
    mockPending.mockResolvedValue([
      proposal({
        external_id: '2026-10-28T12:30:00',
        started_at: '2026-10-28T12:30:00',
      }),
    ])

    renderHistory()

    await screen.findByText('Mercredi 4 novembre')
    expect(
      screen.queryByText('Ta montre propose une sortie')
    ).not.toBeInTheDocument()
  })

  it('n’affiche pas une sortie d’un autre jour que le mercredi', async () => {
    // Un run du mardi 3 novembre tombe dans la semaine du 4 : sans la règle du
    // mercredi, il serait proposé alors que le groupe n'a pas couru ce jour-là.
    mockPending.mockResolvedValue([
      proposal({
        external_id: '2026-11-03T18:00:00',
        started_at: '2026-11-03T18:00:00',
      }),
    ])

    renderHistory()

    await screen.findByText('Mercredi 4 novembre')
    expect(
      screen.queryByText('Ta montre propose une sortie')
    ).not.toBeInTheDocument()
  })
})
