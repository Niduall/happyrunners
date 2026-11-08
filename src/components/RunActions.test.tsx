import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RunActions } from './RunActions'

const WEEK_KEY = '2026-11-11'

function removeShare() {
  delete (navigator as { share?: unknown }).share
}

afterEach(() => {
  vi.restoreAllMocks()
  removeShare()
  delete (URL as { createObjectURL?: unknown }).createObjectURL
  delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL
  delete (document as { execCommand?: unknown }).execCommand
})

describe('RunActions', () => {
  it('propose d’ajouter à l’agenda et de partager', () => {
    render(<RunActions weekKey={WEEK_KEY} />)

    expect(
      screen.getByRole('button', { name: 'Ajouter à l’agenda' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Partager' })
    ).toBeInTheDocument()
  })

  it('télécharge un fichier .ics', () => {
    const createObjectURL = vi.fn(() => 'blob:ics')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURL,
      configurable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURL,
      configurable: true,
    })
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    render(<RunActions weekKey={WEEK_KEY} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter à l’agenda' }))

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:ics')
  })

  it('utilise le partage natif quand il est disponible', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', {
      value: share,
      configurable: true,
    })

    render(<RunActions weekKey={WEEK_KEY} />)
    fireEvent.click(screen.getByRole('button', { name: 'Partager' }))

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith(
        expect.objectContaining({ url: window.location.origin })
      )
    )
  })

  it('copie le lien quand le partage natif manque', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    render(<RunActions weekKey={WEEK_KEY} />)
    fireEvent.click(screen.getByRole('button', { name: 'Partager' }))

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(window.location.origin)
    )
    expect(await screen.findByText('Lien copié')).toBeInTheDocument()
  })

  it('utilise execCommand quand le presse-papiers échoue', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('refus'))
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    const execCommand = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', {
      value: execCommand,
      configurable: true,
    })

    render(<RunActions weekKey={WEEK_KEY} />)
    fireEvent.click(screen.getByRole('button', { name: 'Partager' }))

    expect(await screen.findByText('Lien copié')).toBeInTheDocument()
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('signale une copie impossible', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('refus'))
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn(() => false),
      configurable: true,
    })

    render(<RunActions weekKey={WEEK_KEY} />)
    fireEvent.click(screen.getByRole('button', { name: 'Partager' }))

    expect(await screen.findByText('Copie impossible')).toBeInTheDocument()
  })
})
