import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Supabase est mocké globalement — aucun appel réseau dans les tests
vi.mock('../lib/supabase', () => {
  const mockQuery = {
    select: () => mockQuery,
    insert: () => mockQuery,
    update: () => mockQuery,
    upsert: () => mockQuery,
    delete: () => mockQuery,
    eq: () => mockQuery,
    order: () => mockQuery,
    limit: () => mockQuery,
    single: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
  }

  return {
    supabase: {
      from: () => mockQuery,
      auth: {
        signInWithOtp: () => Promise.resolve({ error: null }),
        signOut: () => Promise.resolve({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        getSession: () => Promise.resolve({ data: { session: null } }),
        getUser: () => Promise.resolve({ data: { user: null } }),
      },
    },
  }
})

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
})
