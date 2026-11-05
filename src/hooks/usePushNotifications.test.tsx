import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { usePushNotifications } from './usePushNotifications'
import {
  deletePushSubscription,
  getNotificationPreferences,
  saveNotificationPreferences,
  savePushSubscription,
} from '../services/supabaseService'
import {
  getCurrentSubscription,
  isPushConfigured,
  isPushSupported,
  needsInstallForPush,
  permissionState,
  subscribeToPush,
  unsubscribeFromPush,
} from '../services/push'

vi.mock('../services/supabaseService', () => ({
  savePushSubscription: vi.fn(),
  deletePushSubscription: vi.fn(),
  getNotificationPreferences: vi.fn(),
  saveNotificationPreferences: vi.fn(),
}))

vi.mock('../services/push', () => ({
  getCurrentSubscription: vi.fn(),
  isPushConfigured: vi.fn(),
  isPushSupported: vi.fn(),
  needsInstallForPush: vi.fn(),
  permissionState: vi.fn(),
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
}))

const mockSupported = vi.mocked(isPushSupported)
const mockConfigured = vi.mocked(isPushConfigured)
const mockNeedsInstall = vi.mocked(needsInstallForPush)
const mockPermission = vi.mocked(permissionState)
const mockCurrent = vi.mocked(getCurrentSubscription)
const mockSubscribe = vi.mocked(subscribeToPush)
const mockUnsubscribe = vi.mocked(unsubscribeFromPush)
const mockSaveSubscription = vi.mocked(savePushSubscription)
const mockDeleteSubscription = vi.mocked(deletePushSubscription)
const mockGetPreferences = vi.mocked(getNotificationPreferences)
const mockSavePreferences = vi.mocked(saveNotificationPreferences)

beforeEach(() => {
  vi.clearAllMocks()
  mockSupported.mockReturnValue(true)
  mockConfigured.mockReturnValue(true)
  mockNeedsInstall.mockReturnValue(false)
  mockPermission.mockReturnValue('default')
  mockCurrent.mockResolvedValue(null)
  mockGetPreferences.mockResolvedValue({ messages: true, runReminder: true })
  mockSaveSubscription.mockResolvedValue()
  mockDeleteSubscription.mockResolvedValue()
  mockSavePreferences.mockResolvedValue()
})

describe('usePushNotifications — état de l’appareil', () => {
  it('signale un navigateur incompatible', async () => {
    mockSupported.mockReturnValue(false)

    const { result } = renderHook(() => usePushNotifications(14))
    await waitFor(() => expect(result.current.status).toBe('unsupported'))
  })

  it('signale une installation sans clé VAPID', async () => {
    mockConfigured.mockReturnValue(false)

    const { result } = renderHook(() => usePushNotifications(14))
    await waitFor(() => expect(result.current.status).toBe('unconfigured'))
  })

  it('demande l’installation sur iPhone avant tout abonnement', async () => {
    mockNeedsInstall.mockReturnValue(true)

    const { result } = renderHook(() => usePushNotifications(14))
    await waitFor(() => expect(result.current.status).toBe('needs-install'))
  })

  it('signale une permission refusée', async () => {
    mockPermission.mockReturnValue('denied')

    const { result } = renderHook(() => usePushNotifications(14))
    await waitFor(() => expect(result.current.status).toBe('denied'))
  })

  it('reconnaît un appareil déjà abonné', async () => {
    mockCurrent.mockResolvedValue({ endpoint: 'https://push.example/abc' } as never)

    const { result } = renderHook(() => usePushNotifications(14))
    await waitFor(() => expect(result.current.status).toBe('subscribed'))
  })

  it('propose l’activation quand tout est prêt', async () => {
    const { result } = renderHook(() => usePushNotifications(14))
    await waitFor(() => expect(result.current.status).toBe('available'))
  })

  it('charge les préférences de la personne', async () => {
    mockGetPreferences.mockResolvedValue({ messages: false, runReminder: true })

    const { result } = renderHook(() => usePushNotifications(14))
    await waitFor(() =>
      expect(result.current.preferences).toEqual({
        messages: false,
        runReminder: true,
      })
    )
    expect(mockGetPreferences).toHaveBeenCalledWith(14)
  })

  it('garde les valeurs par défaut si les préférences ne se lisent pas', async () => {
    mockGetPreferences.mockRejectedValue(new Error('hors ligne'))

    const { result } = renderHook(() => usePushNotifications(14))
    await waitFor(() => expect(result.current.status).toBe('available'))
    expect(result.current.preferences).toEqual({
      messages: true,
      runReminder: true,
    })
  })

  it('n’interroge pas les préférences sans profil', async () => {
    const { result } = renderHook(() => usePushNotifications(null))
    await waitFor(() => expect(result.current.status).toBe('available'))

    expect(mockGetPreferences).not.toHaveBeenCalled()
  })
})

describe('usePushNotifications — activation', () => {
  it('abonne l’appareil et enregistre l’endpoint', async () => {
    mockSubscribe.mockResolvedValue({
      endpoint: 'https://push.example/abc',
      p256dh: 'p',
      auth: 'a',
    })

    const { result } = renderHook(() => usePushNotifications(14))
    await waitFor(() => expect(result.current.status).toBe('available'))

    await act(async () => {
      await result.current.enable()
    })

    expect(mockSaveSubscription).toHaveBeenCalledWith(14, {
      endpoint: 'https://push.example/abc',
      p256dh: 'p',
      auth: 'a',
    })
    expect(result.current.status).toBe('subscribed')
    expect(result.current.error).toBe('')
  })

  it('explique un refus de permission', async () => {
    mockSubscribe.mockRejectedValue(new Error('Permission refusée'))

    const { result } = renderHook(() => usePushNotifications(14))
    await waitFor(() => expect(result.current.status).toBe('available'))

    await act(async () => {
      await result.current.enable()
    })

    expect(result.current.status).toBe('denied')
    expect(result.current.error).toMatch(/refusé/)
  })

  it('affiche un message si l’abonnement échoue', async () => {
    mockSubscribe.mockRejectedValue(new Error('Réseau indisponible'))

    const { result } = renderHook(() => usePushNotifications(14))
    await waitFor(() => expect(result.current.status).toBe('available'))

    await act(async () => {
      await result.current.enable()
    })

    expect(result.current.status).toBe('available')
    expect(result.current.error).toBe('Réseau indisponible')
  })

  it('désabonne l’appareil et supprime la ligne en base', async () => {
    mockCurrent.mockResolvedValue({ endpoint: 'https://push.example/abc' } as never)
    mockUnsubscribe.mockResolvedValue('https://push.example/abc')

    const { result } = renderHook(() => usePushNotifications(14))
    await waitFor(() => expect(result.current.status).toBe('subscribed'))

    await act(async () => {
      await result.current.disable()
    })

    expect(mockDeleteSubscription).toHaveBeenCalledWith(
      'https://push.example/abc'
    )
    expect(result.current.status).toBe('available')
  })

  it('supporte un appareil sans abonnement à désactiver', async () => {
    mockUnsubscribe.mockResolvedValue(null)

    const { result } = renderHook(() => usePushNotifications(14))
    await waitFor(() => expect(result.current.status).toBe('available'))

    await act(async () => {
      await result.current.disable()
    })

    expect(mockDeleteSubscription).not.toHaveBeenCalled()
    expect(result.current.status).toBe('available')
  })
})

describe('usePushNotifications — préférences', () => {
  it('enregistre un changement', async () => {
    const { result } = renderHook(() => usePushNotifications(14))
    await waitFor(() => expect(result.current.status).toBe('available'))

    await act(async () => {
      await result.current.setPreference('messages', false)
    })

    expect(mockSavePreferences).toHaveBeenCalledWith(14, {
      messages: false,
      runReminder: true,
    })
    expect(result.current.preferences.messages).toBe(false)
  })

  it('revient à l’ancienne valeur si l’enregistrement échoue', async () => {
    mockSavePreferences.mockRejectedValue(new Error('refusé'))

    const { result } = renderHook(() => usePushNotifications(14))
    await waitFor(() => expect(result.current.status).toBe('available'))

    await act(async () => {
      await result.current.setPreference('runReminder', false)
    })

    expect(result.current.preferences.runReminder).toBe(true)
    expect(result.current.error).toMatch(/Impossible/)
  })
})
