import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncDeviceSubscription } from './pushSync'
import {
  getCurrentSubscription,
  isPushConfigured,
  isPushSupported,
  needsInstallForPush,
  permissionState,
  resubscribeToPush,
  toSubscriptionRecord,
} from './push'
import { savePushSubscription } from './supabaseService'
import { currentPushConfig, savePushConfig } from './pushConfigStore'
import {
  getPushDeviceUser,
  isPushOptedOut,
  markPushDeviceUser,
} from './pushDevice'

vi.mock('./push', () => ({
  getCurrentSubscription: vi.fn(),
  isPushConfigured: vi.fn(),
  isPushSupported: vi.fn(),
  needsInstallForPush: vi.fn(),
  permissionState: vi.fn(),
  resubscribeToPush: vi.fn(),
  toSubscriptionRecord: vi.fn(),
}))

vi.mock('./supabaseService', () => ({
  savePushSubscription: vi.fn(),
}))

vi.mock('./pushConfigStore', () => ({
  currentPushConfig: vi.fn(),
  savePushConfig: vi.fn(),
}))

vi.mock('./pushDevice', () => ({
  getPushDeviceUser: vi.fn(),
  isPushOptedOut: vi.fn(),
  markPushDeviceUser: vi.fn(),
}))

const mockCurrent = vi.mocked(getCurrentSubscription)
const mockSupported = vi.mocked(isPushSupported)
const mockConfigured = vi.mocked(isPushConfigured)
const mockNeedsInstall = vi.mocked(needsInstallForPush)
const mockPermission = vi.mocked(permissionState)
const mockResubscribe = vi.mocked(resubscribeToPush)
const mockToRecord = vi.mocked(toSubscriptionRecord)
const mockSaveSubscription = vi.mocked(savePushSubscription)
const mockCurrentConfig = vi.mocked(currentPushConfig)
const mockSaveConfig = vi.mocked(savePushConfig)
const mockDeviceUser = vi.mocked(getPushDeviceUser)
const mockOptedOut = vi.mocked(isPushOptedOut)
const mockMarkDeviceUser = vi.mocked(markPushDeviceUser)

const record = {
  endpoint: 'https://push.example/abc',
  p256dh: 'p',
  auth: 'a',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSupported.mockReturnValue(true)
  mockConfigured.mockReturnValue(true)
  mockNeedsInstall.mockReturnValue(false)
  mockPermission.mockReturnValue('granted')
  mockCurrent.mockResolvedValue(null)
  mockResubscribe.mockResolvedValue(record)
  mockToRecord.mockReturnValue(record)
  mockSaveSubscription.mockResolvedValue()
  mockCurrentConfig.mockReturnValue({
    url: 'https://test.supabase.co',
    anonKey: 'anon',
    userNumber: 14,
    vapidPublicKey: 'vapid',
  })
  mockSaveConfig.mockResolvedValue()
  mockDeviceUser.mockReturnValue(14)
  mockOptedOut.mockReturnValue(false)
})

describe('syncDeviceSubscription — resynchronisation', () => {
  it('réenregistre un abonnement existant', async () => {
    mockCurrent.mockResolvedValue({ endpoint: record.endpoint } as never)

    await expect(syncDeviceSubscription(14)).resolves.toEqual(record)

    expect(mockSaveSubscription).toHaveBeenCalledWith(14, record)
    expect(mockSaveConfig).toHaveBeenCalledWith({
      url: 'https://test.supabase.co',
      anonKey: 'anon',
      userNumber: 14,
      vapidPublicKey: 'vapid',
    })
    expect(mockMarkDeviceUser).toHaveBeenCalledWith(14)
  })

  it('recrée un abonnement disparu si l’appareil était abonné', async () => {
    await expect(syncDeviceSubscription(14)).resolves.toEqual(record)

    expect(mockResubscribe).toHaveBeenCalledOnce()
    expect(mockSaveSubscription).toHaveBeenCalledWith(14, record)
  })

  it('ne recrée rien pour un autre profil', async () => {
    mockDeviceUser.mockReturnValue(8)

    await expect(syncDeviceSubscription(14)).resolves.toBeNull()

    expect(mockResubscribe).not.toHaveBeenCalled()
    expect(mockSaveSubscription).not.toHaveBeenCalled()
  })

  it('ne fait rien après un retrait explicite', async () => {
    mockOptedOut.mockReturnValue(true)

    await expect(syncDeviceSubscription(14)).resolves.toBeNull()

    expect(mockResubscribe).not.toHaveBeenCalled()
  })

  it('ne fait rien sans permission accordée', async () => {
    mockPermission.mockReturnValue('default')

    await expect(syncDeviceSubscription(14)).resolves.toBeNull()
  })

  it('ne fait rien sur iPhone non installé', async () => {
    mockNeedsInstall.mockReturnValue(true)

    await expect(syncDeviceSubscription(14)).resolves.toBeNull()
  })

  it('ne fait rien si le navigateur ou le build ne suit pas', async () => {
    mockSupported.mockReturnValue(false)
    await expect(syncDeviceSubscription(14)).resolves.toBeNull()

    mockSupported.mockReturnValue(true)
    mockConfigured.mockReturnValue(false)
    await expect(syncDeviceSubscription(14)).resolves.toBeNull()
  })
})
