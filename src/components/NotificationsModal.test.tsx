import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationsModal } from './NotificationsModal'
import type {
  PushStatus,
  TestPushStatus,
} from '../hooks/usePushNotifications'

const defaults = {
  status: 'available' as PushStatus,
  preferences: { messages: true, runReminder: true },
  saving: false,
  error: '',
  testing: false,
  testStatus: 'idle' as TestPushStatus,
  testError: '',
  onEnable: vi.fn(),
  onDisable: vi.fn(),
  onTest: vi.fn(),
  onPreferenceChange: vi.fn(),
  onClose: vi.fn(),
}

function renderModal(over: Partial<typeof defaults> = {}) {
  const props = { ...defaults, ...over }
  const user = userEvent.setup()
  render(<NotificationsModal {...props} />)
  return { user, props }
}

describe('NotificationsModal — états', () => {
  it('affiche le titre et les deux catégories', () => {
    renderModal()

    expect(
      screen.getByRole('heading', { name: 'Notifications' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'Nouveaux messages' })
    ).toBeChecked()
    expect(
      screen.getByRole('switch', { name: 'Rappel du mardi soir' })
    ).toBeChecked()
  })

  it('propose l’activation sur un appareil prêt', async () => {
    const { user, props } = renderModal()

    await user.click(
      screen.getByRole('button', { name: /Activer sur cet appareil/ })
    )

    expect(props.onEnable).toHaveBeenCalledOnce()
  })

  it('confirme l’abonnement et permet de le retirer', async () => {
    const { user, props } = renderModal({ status: 'subscribed' })

    expect(screen.getByText(/Notifications actives/)).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: /Désactiver sur cet appareil/ })
    )

    expect(props.onDisable).toHaveBeenCalledOnce()
  })

  it('envoie un test depuis l’appareil abonné', async () => {
    const { user, props } = renderModal({ status: 'subscribed' })

    await user.click(
      screen.getByRole('button', { name: /Tester les notifications/ })
    )

    expect(props.onTest).toHaveBeenCalledOnce()
  })

  it('affiche le résultat du test', () => {
    renderModal({ status: 'subscribed', testStatus: 'ok' })

    expect(screen.getByRole('status')).toHaveTextContent(/Notification envoyée/)
  })

  it('affiche l’erreur du test', () => {
    renderModal({
      status: 'subscribed',
      testStatus: 'error',
      testError: 'Abonnement inconnu',
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Abonnement inconnu')
  })

  it('désactive le test pendant un envoi', () => {
    renderModal({ status: 'subscribed', testing: true })

    expect(screen.getByRole('button', { name: /Envoi/ })).toBeDisabled()
  })

  it('explique le blocage du navigateur', () => {
    renderModal({ status: 'denied' })

    expect(screen.getByText(/bloque les notifications/)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Activer sur cet appareil/ })
    ).not.toBeInTheDocument()
  })

  it('explique l’installation iPhone', () => {
    renderModal({ status: 'needs-install' })

    expect(
      screen.getByText(/installe d’abord l’application/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/iOS 16.4/)).toBeInTheDocument()
  })

  it('signale un navigateur incompatible', () => {
    renderModal({ status: 'unsupported' })

    expect(screen.getByText(/ne prend pas en charge/)).toBeInTheDocument()
  })

  it('signale une installation non configurée', () => {
    renderModal({ status: 'unconfigured' })

    expect(screen.getByText(/ne sont pas configurées/)).toBeInTheDocument()
  })

  it('affiche une erreur sans masquer les réglages', () => {
    renderModal({ status: 'subscribed', error: 'Permission refusée' })

    expect(screen.getByRole('alert')).toHaveTextContent('Permission refusée')
    expect(screen.getByRole('switch', { name: 'Nouveaux messages' })).toBeInTheDocument()
  })

  it('n’affiche pas les réglages pendant le chargement', () => {
    renderModal({ status: 'loading' })

    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
})

describe('NotificationsModal — réglages', () => {
  it('transmet le changement de chaque catégorie', async () => {
    const { user, props } = renderModal({
      preferences: { messages: true, runReminder: false },
    })

    await user.click(screen.getByRole('switch', { name: 'Nouveaux messages' }))
    await user.click(screen.getByRole('switch', { name: 'Rappel du mardi soir' }))

    expect(props.onPreferenceChange).toHaveBeenNthCalledWith(1, 'messages', false)
    expect(props.onPreferenceChange).toHaveBeenNthCalledWith(2, 'runReminder', true)
  })

  it('désactive les interrupteurs pendant un enregistrement', () => {
    renderModal({ saving: true })

    expect(
      screen.getByRole('switch', { name: 'Nouveaux messages' })
    ).toBeDisabled()
  })

  it('ferme avec la croix et avec Échap', async () => {
    const { user, props } = renderModal()

    await user.click(screen.getByRole('button', { name: 'Fermer la fenêtre' }))
    await user.keyboard('{Escape}')

    expect(props.onClose).toHaveBeenCalledTimes(2)
  })

  it('ignore Échap pendant un enregistrement', async () => {
    const { user, props } = renderModal({ saving: true })

    await user.keyboard('{Escape}')

    expect(props.onClose).not.toHaveBeenCalled()
  })
})
