import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../hooks/useAuth'
import { Chat } from './Chat'
import {
  getAllProfiles,
  getRecentMessages,
  purgeOldMessages,
} from '../services/supabaseService'
import { MESSAGES_LAST_READ_KEY } from '../services/messages'
import type { Message } from '../types/supabase'

// Mock partiel : on ne remplace que ce que la page appelle réellement.
vi.mock('../services/supabaseService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/supabaseService')>()
  return {
    ...actual,
    getRecentMessages: vi.fn(),
    getAllProfiles: vi.fn(),
    purgeOldMessages: vi.fn(),
  }
})

const mockGet = vi.mocked(getRecentMessages)
const mockProfiles = vi.mocked(getAllProfiles)
const mockPurge = vi.mocked(purgeOldMessages)

const NOW = new Date().toISOString()

function message(id: string, userNumber: number, body: string): Message {
  return { id, user_number: userNumber, body, created_at: NOW }
}

function renderChat() {
  return render(
    <MemoryRouter initialEntries={['/messages']}>
      <AuthProvider>
        <Chat />
      </AuthProvider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockGet.mockResolvedValue([])
  mockPurge.mockResolvedValue(undefined)
  mockProfiles.mockResolvedValue([
    { user_number: 2, first_name: 'Ada', last_name: 'Lovelace' },
  ])
})

describe('Chat — lecture ouverte', () => {
  it('affiche les messages avec le prénom de leur auteur', async () => {
    mockGet.mockResolvedValue([
      message('m1', 2, 'Bonjour tout le monde'),
      message('m2', 2, 'Ça va ?'),
    ])

    renderChat()

    expect(await screen.findByText('Bonjour tout le monde')).toBeInTheDocument()
    expect(screen.getByText('Ça va ?')).toBeInTheDocument()
    expect(screen.getByText('Aujourd’hui')).toBeInTheDocument()
    // Deux messages consécutifs du même auteur : le prénom n'est écrit qu'une fois.
    expect(screen.getAllByText('Ada')).toHaveLength(1)
  })

  it('distingue deux personnes qui partagent un prénom', async () => {
    // Le groupe compte deux Julie : « Julie » seul ne dirait pas qui parle.
    mockProfiles.mockResolvedValue([
      { user_number: 9, first_name: 'Julie', last_name: 'Dalla Valle' },
      { user_number: 14, first_name: 'Julie', last_name: 'Moudin' },
    ])
    mockGet.mockResolvedValue([
      message('m1', 9, 'Je pars de la gare'),
      message('m2', 14, 'Moi aussi'),
    ])

    renderChat()

    expect(await screen.findByText('Julie D.')).toBeInTheDocument()
    expect(screen.getByText('Julie M.')).toBeInTheDocument()
  })

  it('propose de se connecter pour écrire sans identité', async () => {
    renderChat()

    expect(
      await screen.findByText('Choisis ton nom pour écrire.')
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Ton message')).not.toBeInTheDocument()
  })

  it('invite à lancer la conversation quand le fil est vide', async () => {
    renderChat()

    expect(
      await screen.findByText(/Aucun message pour l’instant/)
    ).toBeInTheDocument()
  })

  it('marque le fil comme lu après chargement', async () => {
    mockGet.mockResolvedValue([message('m1', 2, 'Bonjour')])

    renderChat()
    await screen.findByText('Bonjour')

    await waitFor(() =>
      expect(localStorage.getItem(MESSAGES_LAST_READ_KEY)).not.toBeNull()
    )
  })

  it('signale une erreur de chargement sans casser la page', async () => {
    mockGet.mockRejectedValue(new Error('lecture refusée'))

    renderChat()

    expect(await screen.findByRole('alert')).toHaveTextContent('lecture refusée')
    // La zone de saisie reste disponible : l'erreur est passagère.
    expect(
      screen.getByText('Choisis ton nom pour écrire.')
    ).toBeInTheDocument()
  })
})
