import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AttendanceBanner } from './AttendanceBanner'
import type { AttendanceStatus } from '../services/supabaseService'

const renderBanner = (myStatus: AttendanceStatus | null, onChange = vi.fn()) =>
  render(
    <AttendanceBanner
      myStatus={myStatus}
      saving={false}
      subtitle="Mercredi 28 octobre · 12h30 · dans 3 jours"
      onChange={onChange}
    />
  )

const bouton = (name: string | RegExp) => screen.getByRole('button', { name })

// Jetons de classe exacts : « hover:bg-primary/10 » (variant outline) ne doit
// pas être confondu avec « bg-primary » (variant rempli).
const classes = (name: string | RegExp) => [...bouton(name).classList]

describe('AttendanceBanner', () => {
  it('n’affiche aucun bouton rempli tant qu’on n’a pas répondu', () => {
    // Défaut relevé en usage réel : « Je viens » apparaissait violet alors que
    // rien n'était encore choisi, ce qui laissait croire à une réponse déjà
    // enregistrée. L'apparence « sélectionné » doit suivre l'état, pas servir
    // d'appel à l'action.
    renderBanner(null)

    expect(classes('Je viens')).not.toContain('bg-primary')
    expect(classes("Pas cette semaine")).not.toContain('bg-error')
    expect(classes("Pas cette semaine")).not.toContain('bg-gray-100')
    expect(bouton('Je viens')).toHaveAttribute('aria-pressed', 'false')
    expect(bouton("Pas cette semaine")).toHaveAttribute('aria-pressed', 'false')
  })

  it('remplit « Je viens » seulement quand il est choisi', () => {
    renderBanner('going')

    expect(classes('Je viens')).toContain('bg-primary')
    expect(bouton('Je viens')).toHaveAttribute('aria-pressed', 'true')
    expect(bouton("Pas cette semaine")).toHaveAttribute('aria-pressed', 'false')
  })

  it('remplit « Pas cette semaine » seulement quand il est choisi', () => {
    renderBanner('skip')

    expect(classes("Pas cette semaine")).toContain('bg-gray-100')
    expect(classes("Pas cette semaine")).not.toContain('bg-error')
    expect(bouton("Pas cette semaine")).toHaveAttribute('aria-pressed', 'true')
    // Rien ne doit suggérer un « oui » quand on a répondu non
    expect(classes('Je viens')).not.toContain('bg-primary')
    expect(bouton('Je viens')).toHaveAttribute('aria-pressed', 'false')
  })

  it('affiche le rappel seulement tant qu’on n’a pas répondu', () => {
    const { rerender } = renderBanner(null)
    expect(screen.getByText(/pas encore répondu/)).toBeInTheDocument()

    rerender(
      <AttendanceBanner myStatus="going" saving={false} subtitle="Mercredi 28 octobre · 12h30" onChange={vi.fn()} />
    )
    expect(screen.queryByText(/pas encore répondu/)).not.toBeInTheDocument()
  })

  it('transmet le statut cliqué', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderBanner(null, onChange)

    await user.click(bouton('Je viens'))
    expect(onChange).toHaveBeenLastCalledWith('going')

    await user.click(bouton("Pas cette semaine"))
    expect(onChange).toHaveBeenLastCalledWith('skip')
  })

  it('ne réagit pas pendant l’enregistrement', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <AttendanceBanner myStatus={null} saving subtitle="Mercredi 28 octobre · 12h30" onChange={onChange} />
    )

    await user.click(bouton('Je viens'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
