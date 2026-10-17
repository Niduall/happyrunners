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

    it('ne mémorise rien dans le navigateur', async () => {
      // Le déverrouillage appartient à la page de gestion, pas au stockage :
      // un verrou rangé ici survivrait à la personne qui l'a ouvert.
      const { verifyAdminCode } = await load()
      expect(verifyAdminCode('club-secret')).toBe(true)

      expect(sessionStorage.length).toBe(0)
      expect(localStorage.length).toBe(0)
    })
  })
})
