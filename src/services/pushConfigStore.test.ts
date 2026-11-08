import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  clearPushConfig,
  currentPushConfig,
  savePushConfig,
} from './pushConfigStore'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('pushConfigStore — sans IndexedDB', () => {
  it('ne lève pas quand le stockage manque', async () => {
    await expect(
      savePushConfig({
        url: 'https://test.supabase.co',
        anonKey: 'anon',
        userNumber: 3,
        vapidPublicKey: 'vapid',
      })
    ).resolves.toBeUndefined()

    await expect(clearPushConfig()).resolves.toBeUndefined()
  })

  it('lit la configuration du build', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'vapid')

    expect(currentPushConfig(14)).toEqual({
      url: 'https://test.supabase.co',
      anonKey: 'anon',
      userNumber: 14,
      vapidPublicKey: 'vapid',
    })
  })
})
