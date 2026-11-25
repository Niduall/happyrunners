import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OfflineBanner } from './OfflineBanner'
import { useOfflineStatus } from '../hooks/useOfflineStatus'

vi.mock('../hooks/useOfflineStatus', () => ({ useOfflineStatus: vi.fn() }))

const mockStatus = vi.mocked(useOfflineStatus)

/** 23 novembre 2026 à 7h42, heure locale : l'heure affichée est stable. */
const SNAPSHOT = new Date(2026, 10, 23, 7, 42, 0).getTime()

beforeEach(() => {
  vi.clearAllMocks()
})

describe('OfflineBanner', () => {
  it('ne montre rien quand l’appareil est en ligne', () => {
    mockStatus.mockReturnValue({ online: true, oldestAt: SNAPSHOT })

    render(<OfflineBanner />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('affiche la date des dernières données hors ligne', () => {
    mockStatus.mockReturnValue({ online: false, oldestAt: SNAPSHOT })

    render(<OfflineBanner />)

    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent('Hors ligne.')
    expect(banner).toHaveTextContent(
      /Dernières données du \w+ \d{1,2} \w+ à 7h42\./
    )
  })

  it('le dit quand aucun instantané n’est enregistré', () => {
    mockStatus.mockReturnValue({ online: false, oldestAt: null })

    render(<OfflineBanner />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Aucune donnée enregistrée sur cet appareil.'
    )
  })
})
