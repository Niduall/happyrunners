import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  clearOfflineCacheForTests,
  readCache,
  readThrough,
  writeCache,
} from './offlineCache'
import { getOfflineStatus, resetOfflineStatusForTests } from './offlineStore'

function setNavigatorOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
}

beforeEach(() => {
  clearOfflineCacheForTests()
  resetOfflineStatusForTests()
  setNavigatorOnline(true)
})

describe('offlineCache — lecture avec repli', () => {
  it('met en cache une lecture réussie et note sa date', async () => {
    const data = await readThrough('parcours', async () => [{ id: 'a' }])

    expect(data).toEqual([{ id: 'a' }])
    expect(readCache('parcours')?.data).toEqual([{ id: 'a' }])
    expect(getOfflineStatus().oldestAt).toBeTypeOf('number')
  })

  it('sert l’instantané hors ligne sans appeler le réseau', async () => {
    writeCache('parcours', [{ id: 'a' }], Date.now() - 5_000)
    setNavigatorOnline(false)

    const fetcher = vi.fn()
    const data = await readThrough('parcours', fetcher)

    expect(fetcher).not.toHaveBeenCalled()
    expect(data).toEqual([{ id: 'a' }])
    expect(getOfflineStatus().online).toBe(false)
    // La date affichée est celle de la donnée, pas celle de l'essai.
    expect(getOfflineStatus().oldestAt).toBeLessThanOrEqual(Date.now() - 5_000)
  })

  it('laisse remonter l’erreur hors ligne quand rien n’est en cache', async () => {
    setNavigatorOnline(false)

    await expect(
      readThrough('absent', async () => {
        throw new Error('réseau')
      })
    ).rejects.toThrow('réseau')
  })

  it('bascule sur l’instantané si le réseau tombe pendant la requête', async () => {
    writeCache('parcours', [{ id: 'cache' }])

    const data = await readThrough('parcours', async () => {
      setNavigatorOnline(false)
      throw new Error('réseau perdu')
    })

    expect(data).toEqual([{ id: 'cache' }])
  })

  it('ne masque pas une erreur serveur quand l’appareil est en ligne', async () => {
    writeCache('parcours', [{ id: 'ancien' }])

    await expect(
      readThrough('parcours', async () => {
        throw new Error('500')
      })
    ).rejects.toThrow('500')
  })

  it('ignore un instantané illisible', () => {
    localStorage.setItem('happyrunners:cache:v1:parcours', '{oops')

    expect(readCache('parcours')).toBeNull()
  })

  it('ignore un instantané de plus de 30 jours', () => {
    const at = Date.now() - 31 * 24 * 60 * 60 * 1000
    localStorage.setItem('happyrunners:cache:v1:parcours', JSON.stringify({ at, data: [] }))

    expect(readCache('parcours')).toBeNull()
  })

  it('une écriture impossible ne casse pas la lecture réseau', async () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

    try {
      await expect(readThrough('parcours', async () => [1])).resolves.toEqual([1])
    } finally {
      setItem.mockRestore()
    }
  })
})
