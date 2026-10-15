import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('adminCode', () => {
  // Le service lit import.meta.env.VITE_ADMIN_CODE au moment de l'appel.
  // On stubbe la variable puis on recharge le module pour que la valeur
  // soit prise en compte.
  let code: string | undefined

  const load = async () => {
    if (code === undefined) vi.stubEnv('VITE_ADMIN_CODE', '')
    else vi.stubEnv('VITE_ADMIN_CODE', code)
    vi.resetModules()
    return import('./adminCode')
  }

  beforeEach(() => {
    code = undefined
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    sessionStorage.clear()
  })

  describe('code non configuré', () => {
    it('le verrou est désactivé', async () => {
      const { isAdminLockEnabled } = await load()
      expect(isAdminLockEnabled()).toBe(false)
    })

    it('refuse tout code', async () => {
      const { verifyAdminCode } = await load()
      expect(verifyAdminCode('')).toBe(false)
      expect(verifyAdminCode('nimporte-quoi')).toBe(false)
    })

    it('ne déverrouille rien même en sessionStorage', async () => {
      // Un verrou absent ne doit surtout pas laisser passer
      sessionStorage.setItem('happyrunners_admin_unlocked', '1')
      const { isAdminUnlocked } = await load()
      expect(isAdminUnlocked()).toBe(false)
    })
  })

  describe('code configuré', () => {
    beforeEach(() => {
      code = 'club-secret'
    })

    it('le verrou est actif', async () => {
      const { isAdminLockEnabled } = await load()
      expect(isAdminLockEnabled()).toBe(true)
    })

    it('accepte le bon code', async () => {
      const { verifyAdminCode } = await load()
      expect(verifyAdminCode('club-secret')).toBe(true)
    })

    it('refuse un code faux', async () => {
      const { verifyAdminCode } = await load()
      expect(verifyAdminCode('club-secre')).toBe(false)
      expect(verifyAdminCode('club-secrets')).toBe(false)
      expect(verifyAdminCode('Club-secret')).toBe(false)
      expect(verifyAdminCode('')).toBe(false)
    })

    it('mémorise le déverrouillage dans sessionStorage', async () => {
      const { setAdminUnlocked, isAdminUnlocked } = await load()
      expect(isAdminUnlocked()).toBe(false)
      setAdminUnlocked(true)
      expect(sessionStorage.getItem('happyrunners_admin_unlocked')).toBe('1')
      expect(isAdminUnlocked()).toBe(true)
    })

    it('permet de reverrouiller', async () => {
      const { setAdminUnlocked, isAdminUnlocked } = await load()
      setAdminUnlocked(true)
      setAdminUnlocked(false)
      expect(isAdminUnlocked()).toBe(false)
      expect(sessionStorage.getItem('happyrunners_admin_unlocked')).toBeNull()
    })

    it('n’utilise PAS localStorage', async () => {
      // Avec localStorage, un téléphone qui reste ouvert garderait l'accès
      // admin après redémarrage : c'est le point de cette implémentation.
      const { setAdminUnlocked } = await load()
      setAdminUnlocked(true)
      expect(localStorage.getItem('happyrunners_admin_unlocked')).toBeNull()
    })

    it('ignore une valeur inattendue en sessionStorage', async () => {
      sessionStorage.setItem('happyrunners_admin_unlocked', 'oui')
      const { isAdminUnlocked } = await load()
      expect(isAdminUnlocked()).toBe(false)
    })
  })
})