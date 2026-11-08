import { describe, it, expect, beforeEach } from 'vitest'
import {
  clearPushDeviceUser,
  clearPushOptOut,
  getPushDeviceUser,
  isPushOptedOut,
  markPushDeviceUser,
  markPushOptedOut,
} from './pushDevice'

beforeEach(() => {
  localStorage.clear()
})

describe('pushDevice — marqueurs locaux', () => {
  it('n’est ni en retrait ni rattaché par défaut', () => {
    expect(isPushOptedOut()).toBe(false)
    expect(getPushDeviceUser()).toBeNull()
  })

  it('mémorise puis lève le retrait explicite', () => {
    markPushOptedOut()
    expect(isPushOptedOut()).toBe(true)

    clearPushOptOut()
    expect(isPushOptedOut()).toBe(false)
  })

  it('mémorise puis oublie le profil abonné', () => {
    markPushDeviceUser(14)
    expect(getPushDeviceUser()).toBe(14)

    clearPushDeviceUser()
    expect(getPushDeviceUser()).toBeNull()
  })

  it('ignore une valeur de profil illisible', () => {
    localStorage.setItem('happyrunners_push_user', 'pas-un-nombre')

    expect(getPushDeviceUser()).toBeNull()
  })
})
