import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RequireUser } from './RequireUser'
import { useAuth } from '../hooks/useAuth'
import type { User } from '../types'

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

const mockAuth = vi.mocked(useAuth)

const USER: User = {
  id: 14,
  firstName: 'Julie',
  lastName: 'Moudin',
  name: 'Julie Moudin',
}

function setup() {
  return render(
    <MemoryRouter initialEntries={['/messages']}>
      <Routes>
        <Route
          path="/messages"
          element={
            <RequireUser>
              <p>Fil de discussion</p>
            </RequireUser>
          }
        />
        <Route path="/" element={<p>Accueil</p>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RequireUser — accès au chat', () => {
  it('renvoie un visiteur vers l’accueil', () => {
    mockAuth.mockReturnValue({ user: null, loading: false } as ReturnType<typeof useAuth>)

    setup()

    expect(screen.getByText('Accueil')).toBeInTheDocument()
    expect(screen.queryByText('Fil de discussion')).not.toBeInTheDocument()
  })

  it('laisse passer une personne connectée', () => {
    mockAuth.mockReturnValue({ user: USER, loading: false } as ReturnType<typeof useAuth>)

    setup()

    expect(screen.getByText('Fil de discussion')).toBeInTheDocument()
    expect(screen.queryByText('Accueil')).not.toBeInTheDocument()
  })

  it('attend la fin du chargement avant de rediriger', () => {
    mockAuth.mockReturnValue({ user: null, loading: true } as ReturnType<typeof useAuth>)

    setup()

    expect(screen.queryByText('Accueil')).not.toBeInTheDocument()
    expect(screen.queryByText('Fil de discussion')).not.toBeInTheDocument()
  })
})
