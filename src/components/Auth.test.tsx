import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginForm } from './Auth'
import { AuthProvider, useAuth } from '../hooks/useAuth'
import {
  findProfileByName,
  createUserProfile as createProfileInDb,
  getUserProfile,
  updateUserProfile,
} from '../services/supabaseService'
import { hashPin } from '../services/pin'

vi.mock('../services/supabaseService', () => ({
  getUserProfile: vi.fn(),
  createUserProfile: vi.fn(),
  updateUserProfile: vi.fn(),
  findProfileByName: vi.fn(),
}))

const mockGetProfile = vi.mocked(getUserProfile)
const mockCreate = vi.mocked(createProfileInDb)
const mockUpdate = vi.mocked(updateUserProfile)
const mockFind = vi.mocked(findProfileByName)

const profile = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    id: 'uuid-1',
    user_number: 1,
    first_name: 'Paul',
    last_name: 'Martin',
    pin_hash: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...over,
  }) as never

/** Rend le formulaire dans un vrai AuthProvider */
const renderForm = () =>
  render(
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  )

const fillIdentity = async (user: ReturnType<typeof userEvent.setup>, first = 'Paul', last = 'Martin') => {
  await user.type(screen.getByLabelText('Prénom'), first)
  await user.type(screen.getByLabelText('Nom'), last)
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mockGetProfile.mockResolvedValue(null)
  mockCreate.mockResolvedValue(profile())
  mockUpdate.mockResolvedValue(profile())
  mockFind.mockResolvedValue(null)
})

describe('LoginForm — écran identité', () => {
  it('affiche Prénom et Nom', async () => {
    renderForm()
    await waitFor(() => expect(screen.getByLabelText('Prénom')).toBeInTheDocument())
    expect(screen.getByLabelText('Nom')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Continuer/ })).toBeInTheDocument()
  })

  it('précise que le nom identifie la personne dans le groupe', async () => {
    renderForm()
    await waitFor(() => expect(screen.getByLabelText('Prénom')).toBeInTheDocument())
    expect(
      screen.getByText("Ton nom te sert d'identifiant dans le groupe.")
    ).toBeInTheDocument()
  })

  it('ne prétend pas que le nom est définitif — il est modifiable', async () => {
    renderForm()
    await waitFor(() => expect(screen.getByLabelText('Prénom')).toBeInTheDocument())
    // « Modifier le nom » existe dans le menu : l'écran ne doit pas dire
    // le contraire, c'était le message de l'ancien identifiant dérivé du nom
    expect(screen.queryByText(/ne sera plus modifiable/)).not.toBeInTheDocument()
  })

  it("n'affiche aucun champ PIN au départ", async () => {
    renderForm()
    await waitFor(() => expect(screen.getByLabelText('Prénom')).toBeInTheDocument())
    expect(screen.queryByLabelText(/PIN/)).not.toBeInTheDocument()
  })

  it('refuse un nom vide', async () => {
    const user = userEvent.setup()
    renderForm()
    await waitFor(() => expect(screen.getByLabelText('Prénom')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Continuer/ }))

    expect(await screen.findByText('Renseigne ton prénom et ton nom')).toBeInTheDocument()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('propose un écran de création si le nom est inconnu', async () => {
    const user = userEvent.setup()
    mockFind.mockResolvedValue(null)
    mockCreate.mockResolvedValue(profile({ user_number: 7 }))

    renderForm()
    await waitFor(() => expect(screen.getByLabelText('Prénom')).toBeInTheDocument())
    await fillIdentity(user)
    await user.click(screen.getByRole('button', { name: /Continuer/ }))

    // Rien n'est encore écrit en base : on demande le PIN d'abord
    expect(await screen.findByLabelText('PIN à 4 chiffres')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirmer le PIN')).toBeInTheDocument()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('connecte directement un profil existant SANS PIN — pas d’écran PIN inutile', async () => {
    const user = userEvent.setup()
    mockFind.mockResolvedValue(profile({ user_number: 3 }))

    renderForm()
    await waitFor(() => expect(screen.getByLabelText('Prénom')).toBeInTheDocument())
    await fillIdentity(user)
    await user.click(screen.getByRole('button', { name: /Continuer/ }))

    await waitFor(() => expect(mockFind).toHaveBeenCalled())
    expect(screen.queryByLabelText(/PIN à 4 chiffres/)).not.toBeInTheDocument()
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('LoginForm — écran de création', () => {
  /** Amène à l'écran de création (nom inconnu) */
  const goToSignup = async (
    user: ReturnType<typeof userEvent.setup>,
    first = 'Jean',
    last = 'Dupont'
  ) => {
    mockFind.mockResolvedValue(null)
    renderForm()
    await waitFor(() => expect(screen.getByLabelText('Prénom')).toBeInTheDocument())
    await fillIdentity(user, first, last)
    await user.click(screen.getByRole('button', { name: /Continuer/ }))
    await screen.findByLabelText('Confirmer le PIN')
  }

  it('accueille la nouvelle personne par son prénom et son nom', async () => {
    const user = userEvent.setup()
    await goToSignup(user)

    expect(screen.getByText('Bienvenue !')).toBeInTheDocument()
    expect(screen.getByText(/Tu rejoins le groupe en tant que Jean Dupont/)).toBeInTheDocument()
  })

  it('demande PIN + confirmation', async () => {
    const user = userEvent.setup()
    await goToSignup(user)

    expect(screen.getByLabelText('PIN à 4 chiffres')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirmer le PIN')).toBeInTheDocument()
    // Pas de « PIN actuel » : ici on crée, on ne modifie pas
    expect(screen.queryByLabelText('PIN actuel')).not.toBeInTheDocument()
  })

  it('crée le profil avec le PIN hashé', async () => {
    const user = userEvent.setup()
    await goToSignup(user)

    await user.type(screen.getByLabelText('PIN à 4 chiffres'), '4321')
    await user.type(screen.getByLabelText('Confirmer le PIN'), '4321')
    await user.click(screen.getByRole('button', { name: /Créer mon compte/ }))

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        first_name: 'Jean',
        last_name: 'Dupont',
        pin_hash: hashPin('4321'),
      })
    )
  })

  it('refuse deux PIN différents', async () => {
    const user = userEvent.setup()
    await goToSignup(user)

    await user.type(screen.getByLabelText('PIN à 4 chiffres'), '4321')
    await user.type(screen.getByLabelText('Confirmer le PIN'), '9999')
    await user.click(screen.getByRole('button', { name: /Créer mon compte/ }))

    expect(await screen.findByText('Les PIN ne correspondent pas')).toBeInTheDocument()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('refuse un PIN trop court', async () => {
    const user = userEvent.setup()
    await goToSignup(user)

    await user.type(screen.getByLabelText('PIN à 4 chiffres'), '43')
    await user.type(screen.getByLabelText('Confirmer le PIN'), '43')
    await user.click(screen.getByRole('button', { name: /Créer mon compte/ }))

    expect(await screen.findByText('Le PIN doit faire 4 chiffres')).toBeInTheDocument()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('« Passer sans PIN » crée quand même le profil', async () => {
    const user = userEvent.setup()
    await goToSignup(user)

    await user.click(screen.getByRole('button', { name: /Passer sans PIN/ }))

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        first_name: 'Jean',
        last_name: 'Dupont',
        pin_hash: null,
      })
    )
  })

  it('avertit qu’un PIN oublié est définitif', async () => {
    const user = userEvent.setup()
    await goToSignup(user)

    expect(screen.getByText(/Personne ne peut le réinitialiser/)).toBeInTheDocument()
  })

  it('« Changer de nom » revient à l’identité en gardant le nom', async () => {
    const user = userEvent.setup()
    await goToSignup(user)

    await user.click(screen.getByRole('button', { name: /Changer de nom/ }))

    // Le nom est conservé : il s'agissait de le corriger, pas de le ressaisir
    expect(await screen.findByLabelText('Prénom')).toHaveValue('Jean')
    expect(screen.getByLabelText('Nom')).toHaveValue('Dupont')
    // Et rien n'a été créé
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('permet de changer de nom puis de créer le bon profil', async () => {
    const user = userEvent.setup()
    mockFind.mockImplementation(async (first: string) =>
      first === 'Jean' ? null : (profile({ user_number: 3, pin_hash: hashPin('1234') }) as never)
    )

    renderForm()
    await waitFor(() => expect(screen.getByLabelText('Prénom')).toBeInTheDocument())
    await fillIdentity(user, 'Jean', 'Dupont')
    await user.click(screen.getByRole('button', { name: /Continuer/ }))
    await screen.findByLabelText('Confirmer le PIN')

    // On s'était trompé de personne
    await user.click(screen.getByRole('button', { name: /Changer de nom/ }))
    await user.clear(screen.getByLabelText('Prénom'))
    await user.clear(screen.getByLabelText('Nom'))
    await user.type(screen.getByLabelText('Prénom'), 'Paul')
    await user.type(screen.getByLabelText('Nom'), 'Martin')
    await user.click(screen.getByRole('button', { name: /Continuer/ }))

    // Paul existe avec un PIN → écran de vérification, pas de création
    expect(await screen.findByLabelText('PIN à 4 chiffres')).toBeInTheDocument()
    expect(screen.getByText('Bonjour Paul')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Créer mon compte/ })).not.toBeInTheDocument()
  })
})

describe('LoginForm — écran PIN (vérification)', () => {
  const goToPinScreen = async (user: ReturnType<typeof userEvent.setup>) => {
    mockFind.mockResolvedValue(profile({ user_number: 3, pin_hash: hashPin('1234') }))
    mockGetProfile.mockResolvedValue(
      profile({ user_number: 3, pin_hash: hashPin('1234') })
    )
    renderForm()
    await waitFor(() => expect(screen.getByLabelText('Prénom')).toBeInTheDocument())
    await fillIdentity(user)
    await user.click(screen.getByRole('button', { name: /Continuer/ }))
    await screen.findByLabelText('PIN à 4 chiffres')
  }

  it('affiche « Bonjour Paul » et un seul champ PIN', async () => {
    const user = userEvent.setup()
    await goToPinScreen(user)

    expect(screen.getByText('Bonjour Paul')).toBeInTheDocument()
    expect(screen.getByLabelText('PIN à 4 chiffres')).toBeInTheDocument()
    // Un seul champ : pas de confusion avec l'écran de création
    expect(screen.queryByLabelText(/Confirmer/)).not.toBeInTheDocument()
  })

  it('refuse un PIN qui n’a pas 4 chiffres', async () => {
    const user = userEvent.setup()
    await goToPinScreen(user)

    await user.type(screen.getByLabelText('PIN à 4 chiffres'), '12')
    await user.click(screen.getByRole('button', { name: /Se connecter/ }))

    expect(await screen.findByText('Le PIN doit faire 4 chiffres')).toBeInTheDocument()
  })

  it('affiche « PIN incorrect » sur un mauvais PIN', async () => {
    const user = userEvent.setup()
    await goToPinScreen(user)

    await user.type(screen.getByLabelText('PIN à 4 chiffres'), '9999')
    await user.click(screen.getByRole('button', { name: /Se connecter/ }))

    expect(await screen.findByText('PIN incorrect')).toBeInTheDocument()
    expect(screen.getByLabelText('PIN à 4 chiffres')).toHaveValue('')
  })

  it('ne garde que les chiffres et 4 maximum', async () => {
    const user = userEvent.setup()
    await goToPinScreen(user)

    const field = screen.getByLabelText('PIN à 4 chiffres')
    await user.type(field, 'a1b2c3d4e5')

    expect(field).toHaveValue('1234')
  })

  it('connecte avec le bon PIN', async () => {
    const user = userEvent.setup()
    await goToPinScreen(user)

    await user.type(screen.getByLabelText('PIN à 4 chiffres'), '1234')
    await user.click(screen.getByRole('button', { name: /Se connecter/ }))

    // Connecté → le formulaire disparaît
    await waitFor(() =>
      expect(screen.queryByLabelText('PIN à 4 chiffres')).not.toBeInTheDocument()
    )
  })

  it('permet d’afficher/masquer le PIN', async () => {
    const user = userEvent.setup()
    await goToPinScreen(user)

    const field = screen.getByLabelText('PIN à 4 chiffres')
    expect(field).toHaveAttribute('type', 'password')

    await user.click(screen.getByLabelText('Afficher le PIN'))
    expect(field).toHaveAttribute('type', 'text')

    await user.click(screen.getByLabelText('Masquer le PIN'))
    expect(field).toHaveAttribute('type', 'password')
  })
})

describe('LoginForm — bouton retour', () => {
  it('« Changer de nom » ramène à l’écran identité', async () => {
    const user = userEvent.setup()
    mockFind.mockResolvedValue(profile({ user_number: 3, pin_hash: hashPin('1234') }))

    renderForm()
    await waitFor(() => expect(screen.getByLabelText('Prénom')).toBeInTheDocument())
    await fillIdentity(user)
    await user.click(screen.getByRole('button', { name: /Continuer/ }))

    await screen.findByLabelText('PIN à 4 chiffres')
    await user.click(screen.getByRole('button', { name: /Changer de nom/ }))

    // Retour à l'étape 1
    expect(await screen.findByLabelText('Prénom')).toBeInTheDocument()
    expect(screen.queryByLabelText('PIN à 4 chiffres')).not.toBeInTheDocument()
    // Les champs sont vidés → on peut ressaisir
    expect(screen.getByLabelText('Prénom')).toHaveValue('')
    expect(screen.getByLabelText('Nom')).toHaveValue('')
  })

  it('« Changer de nom » permet de se connecter avec un AUTRE nom', async () => {
    const user = userEvent.setup()
    mockFind.mockImplementation(async (first: string) =>
      first === 'Paul'
        ? (profile({ user_number: 3, pin_hash: hashPin('1234') }) as never)
        : null
    )

    renderForm()
    await waitFor(() => expect(screen.getByLabelText('Prénom')).toBeInTheDocument())
    await fillIdentity(user, 'Paul', 'Martin')
    await user.click(screen.getByRole('button', { name: /Continuer/ }))
    await screen.findByLabelText('PIN à 4 chiffres')

    // On se trompe de personne → on revient en arrière
    await user.click(screen.getByRole('button', { name: /Changer de nom/ }))
    await fillIdentity(user, 'Jean', 'Dupont')
    await user.click(screen.getByRole('button', { name: /Continuer/ }))

    // Jean n'existe pas → écran de création
    expect(await screen.findByLabelText('Confirmer le PIN')).toBeInTheDocument()
    expect(screen.getByText(/Tu rejoins le groupe en tant que Jean Dupont/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Passer sans PIN/ }))

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        first_name: 'Jean',
        last_name: 'Dupont',
        pin_hash: null,
      })
    )
  })

  it('« J’ai oublié mon PIN » déconnecte proprement', async () => {
    const user = userEvent.setup()
    mockFind.mockResolvedValue(profile({ user_number: 3, pin_hash: hashPin('1234') }))

    renderForm()
    await waitFor(() => expect(screen.getByLabelText('Prénom')).toBeInTheDocument())
    await fillIdentity(user)
    await user.click(screen.getByRole('button', { name: /Continuer/ }))
    await screen.findByLabelText('PIN à 4 chiffres')

    await user.click(screen.getByRole('button', { name: /J'ai oublié mon PIN/ }))

    // On retombe sur l'écran identité, déconnecté
    expect(await screen.findByLabelText('Prénom')).toBeInTheDocument()
    expect(screen.queryByLabelText('PIN à 4 chiffres')).not.toBeInTheDocument()
  })
})

describe('LoginForm — le PIN est demandé à chaque reconnexion par nom', () => {
  it('profil AVEC PIN → écran PIN à chaque saisie de nom', async () => {
    const user = userEvent.setup()
    mockFind.mockResolvedValue(profile({ user_number: 3, pin_hash: hashPin('1234') }))

    // Session 1 : on entre le nom → PIN demandé
    const first = renderForm()
    await waitFor(() => expect(screen.getByLabelText('Prénom')).toBeInTheDocument())
    await fillIdentity(user)
    await user.click(screen.getByRole('button', { name: /Continuer/ }))
    await screen.findByLabelText('PIN à 4 chiffres')
    first.unmount()

    // Session 2 : nouvelle saisie du même nom → PIN demandé à nouveau
    const second = renderForm()
    await waitFor(() => expect(screen.getByLabelText('Prénom')).toBeInTheDocument())
    await fillIdentity(user)
    await user.click(screen.getByRole('button', { name: /Continuer/ }))

    expect(await screen.findByLabelText('PIN à 4 chiffres')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Continuer/ })).not.toBeInTheDocument()
  })

  it('profil SANS PIN → aucun écran PIN', async () => {
    const user = userEvent.setup()
    mockFind.mockResolvedValue(profile({ user_number: 3, pin_hash: null }))

    const first = renderForm()
    await waitFor(() => expect(screen.getByLabelText('Prénom')).toBeInTheDocument())
    await fillIdentity(user)
    await user.click(screen.getByRole('button', { name: /Continuer/ }))
    first.unmount()

    const second = renderForm()
    await waitFor(() => expect(screen.getByLabelText('Prénom')).toBeInTheDocument())
    await fillIdentity(user)
    await user.click(screen.getByRole('button', { name: /Continuer/ }))

    // Connexion directe : ni écran PIN, ni écran de création
    await waitFor(() => expect(screen.queryByLabelText(/Confirmer/)).not.toBeInTheDocument())
    expect(screen.queryByLabelText(/PIN à 4 chiffres/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Créer mon compte/ })).not.toBeInTheDocument()
  })
})

describe('UserMenu — accès aux options du profil', () => {
  it('expose Modifier le nom et Sécurité une fois connecté', async () => {
    // On rend le UserMenu dans le même provider : on vérifie juste qu'il
    // est absent tant qu'on n'est pas connecté, puis présent après.
    const { default: React } = await import('react')
    const { UserMenu } = await import('./UserMenu')

    function Both() {
      return (
        <AuthProvider>
          <LoginForm />
          <UserMenu />
        </AuthProvider>
      )
    }
    void React

    const user = userEvent.setup()
    render(<Both />)
    await waitFor(() => expect(screen.getByLabelText('Prénom')).toBeInTheDocument())
    // Pas connecté → pas de menu
    expect(screen.queryByLabelText('Menu utilisateur')).not.toBeInTheDocument()

    mockFind.mockResolvedValue(profile({ user_number: 3 }))
    await fillIdentity(user)
    await user.click(screen.getByRole('button', { name: /Continuer/ }))

    const menuButton = await screen.findByLabelText('Menu utilisateur')
    await user.click(menuButton)

    expect(screen.getByRole('button', { name: /Modifier le nom/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sécurité/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Déconnexion/ })).toBeInTheDocument()
    expect(screen.getByText('Numéro #3')).toBeInTheDocument()
  })
})

describe('useAuth importé directement (garde-fou)', () => {
  it('throw hors AuthProvider', async () => {
    const { useAuth } = await import('../hooks/useAuth')
    function Orphan() {
      useAuth()
      return null
    }
    // Silence l'erreur React attendue
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Orphan />)).toThrow(/AuthProvider/)
    spy.mockRestore()
  })
})