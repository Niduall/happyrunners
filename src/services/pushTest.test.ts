import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendTestPush } from './pushTest'

const record = {
  endpoint: 'https://push.example/abc',
  p256dh: 'p',
  auth: 'a',
}

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('sendTestPush', () => {
  it('cible l’abonnement courant et renvoie le résultat', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ type: 'test', sent: 1, failed: 0, removed: 0 }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(sendTestPush(record)).resolves.toEqual({
      type: 'test',
      sent: 1,
      failed: 0,
      removed: 0,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/send-push',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ type: 'test', ...record }),
      })
    )
  })

  it('relaie l’erreur du serveur', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Abonnement inconnu' }),
      })
    )

    await expect(sendTestPush(record)).rejects.toThrow('Abonnement inconnu')
  })

  it('refuse un envoi que le service de push n’a pas accepté', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ sent: 0, failed: 1, removed: 0 }),
      })
    )

    await expect(sendTestPush(record)).rejects.toThrow(/n’a pas accepté/)
  })

  it('exige la configuration Supabase', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')

    await expect(sendTestPush(record)).rejects.toThrow(/non configurées/)
  })
})
