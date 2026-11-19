import { describe, it, expect, beforeEach } from 'vitest'
import {
  WATCH_TOKEN_HASH_LENGTH,
  buildWatchIngestUrl,
  clearStoredWatchToken,
  generateWatchToken,
  hashWatchToken,
  readStoredWatchToken,
  storeWatchToken,
  watchTokenStorageKey,
} from './watchLink'

beforeEach(() => {
  localStorage.clear()
})

describe('generateWatchToken', () => {
  it('produit un jeton base64url de 32 octets', () => {
    const token = generateWatchToken()

    // 32 octets → 43 caractères en base64url (sans le bourrage « = »).
    expect(token).toHaveLength(43)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)

    const binary = atob(token.replace(/-/g, '+').replace(/_/g, '/'))
    expect(binary).toHaveLength(32)
  })

  it('ne réutilise jamais le même jeton', () => {
    const tokens = new Set(Array.from({ length: 50 }, generateWatchToken))
    expect(tokens.size).toBe(50)
  })
})

describe('hashWatchToken', () => {
  it('calcule le SHA-256 hexadécimal attendu', async () => {
    // Vecteurs de référence FIPS 180-2.
    expect(await hashWatchToken('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
    expect(await hashWatchToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })

  it('renvoie toujours 64 caractères hexadécimaux', async () => {
    const hash = await hashWatchToken(generateWatchToken())
    expect(hash).toHaveLength(WATCH_TOKEN_HASH_LENGTH)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('ne dépend que du jeton, pas de l’appel', async () => {
    const token = generateWatchToken()
    expect(await hashWatchToken(token)).toBe(await hashWatchToken(token))
  })
})

describe('buildWatchIngestUrl', () => {
  it('pointe vers l’Edge Function avec le jeton en paramètre', () => {
    const url = buildWatchIngestUrl('abc-123_XYZ')

    expect(url).toMatch(/^https:\/\/[^/]+\/functions\/v1\/ingest\?t=/)
    expect(url.endsWith('t=abc-123_XYZ')).toBe(true)
  })

  it('encode les caractères qui casseraient une URL', () => {
    // Un jeton base64url n'en contient pas, mais l'encodage protège d'un
    // copier-coller abîmé ou d'un futur format de jeton.
    const url = buildWatchIngestUrl('a+b/c=')
    expect(url.endsWith('t=a%2Bb%2Fc%3D')).toBe(true)
  })
})

describe('stockage local du jeton', () => {
  it('garde le jeton par personne', () => {
    storeWatchToken(1, 'jeton-alice')
    storeWatchToken(2, 'jeton-bob')

    expect(readStoredWatchToken(1)).toBe('jeton-alice')
    expect(readStoredWatchToken(2)).toBe('jeton-bob')
    expect(watchTokenStorageKey(1)).toBe('watch_token_1')
  })

  it('renvoie null quand aucun jeton n’est stocké', () => {
    expect(readStoredWatchToken(42)).toBeNull()
  })

  it('efface le jeton d’une personne sans toucher aux autres', () => {
    storeWatchToken(1, 'jeton-alice')
    storeWatchToken(2, 'jeton-bob')

    clearStoredWatchToken(1)

    expect(readStoredWatchToken(1)).toBeNull()
    expect(readStoredWatchToken(2)).toBe('jeton-bob')
  })
})
