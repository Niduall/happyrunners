import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, KeyRound, Search, ShieldCheck, ShieldOff } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card, CardContent } from '../components/ui/Card'
import { AdminPinResetModal } from '../components/AdminPinResetModal'
import { useAuth } from '../hooks/useAuth'
import { verifyAdminCode } from '../services/adminCode'
import {
  getProfilesWithPinStatus,
  removeUserPin,
  resetUserPin,
  type ProfileWithPinStatus,
} from '../services/supabaseService'

/** Recherche insensible aux accents et à la casse (« cecile » trouve « Cécile »). */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Console d'administration : réinitialiser le PIN d'une personne.
 *
 * L'accès est protégé par le même code que la gestion des parcours, et
 * redemandé à chaque visite (aucun stockage). Ce n'est pas une authentification
 * forte — le code vit dans le bundle — mais cela empêche une manipulation
 * accidentelle.
 */
export function Admin() {
  const navigate = useNavigate()
  const { adminLockEnabled } = useAuth()

  const [unlocked, setUnlocked] = useState(false)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [profiles, setProfiles] = useState<ProfileWithPinStatus[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState<ProfileWithPinStatus | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setProfiles(await getProfilesWithPinStatus())
    } catch (err) {
      console.error('[ADMIN] Erreur chargement des profils:', err)
      setError('Impossible de charger la liste des personnes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (unlocked) void load()
  }, [unlocked, load])

  // Un retour depuis l'historique ne doit jamais rouvrir la console. Le
  // déverrouillage ne vit que tant que la page est réellement affichée :
  // si le navigateur la restaure depuis son cache (bfcache), on le retire.
  useEffect(() => {
    const relock = () => setUnlocked(false)
    window.addEventListener('pagehide', relock)
    window.addEventListener('pageshow', relock)
    return () => {
      window.removeEventListener('pagehide', relock)
      window.removeEventListener('pageshow', relock)
    }
  }, [])

  const handleUnlock = (event: FormEvent) => {
    event.preventDefault()
    if (code.length === 0) {
      setCodeError('Saisis le code')
      return
    }
    if (!verifyAdminCode(code)) {
      setCodeError('Code incorrect')
      setCode('')
      return
    }
    setCode('')
    setCodeError('')
    setUnlocked(true)
  }

  const filtered = useMemo(() => {
    const needle = normalize(search)
    if (!needle) return profiles
    return profiles.filter((profile) =>
      normalize(`${profile.first_name} ${profile.last_name} ${profile.user_number}`).includes(
        needle
      )
    )
  }, [profiles, search])

  const handleResetPin = async (profile: ProfileWithPinStatus, pin: string) => {
    await resetUserPin(profile.user_number, pin)
    setProfiles((current) =>
      current.map((row) =>
        row.user_number === profile.user_number ? { ...row, hasPin: true } : row
      )
    )
  }

  const handleRemovePin = async (profile: ProfileWithPinStatus) => {
    await removeUserPin(profile.user_number)
    setProfiles((current) =>
      current.map((row) =>
        row.user_number === profile.user_number ? { ...row, hasPin: false } : row
      )
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            aria-label="Retour à l'accueil"
            className="shrink-0 px-2 sm:px-3"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="ml-1 hidden sm:inline">Accueil</span>
          </Button>
          <h1 className="truncate text-lg font-bold text-primary sm:text-xl">
            Administration
          </h1>
          <span className="w-16 shrink-0" aria-hidden="true" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        {!adminLockEnabled ? (
          <Card>
            <CardContent className="space-y-3 py-8 text-center">
              <ShieldOff className="mx-auto h-8 w-8 text-gray-400" />
              <p className="font-medium text-gray-900">Console indisponible</p>
              <p className="text-sm text-gray-500">
                Le code administrateur n'est pas configuré sur cette installation
                (<code className="text-xs">VITE_ADMIN_CODE</code>).
              </p>
              <Button variant="outline" size="sm" onClick={() => navigate('/')}>
                Retour à l'accueil
              </Button>
            </CardContent>
          </Card>
        ) : !unlocked ? (
          <Card>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-center">
                <KeyRound className="mx-auto h-8 w-8 text-primary" />
                <h2 className="font-semibold text-gray-900">Code administrateur</h2>
                <p className="text-sm text-gray-500">
                  Saisis le code pour réinitialiser un PIN. Il est redemandé à
                  chaque visite.
                </p>
              </div>

              <form onSubmit={handleUnlock} className="space-y-3">
                {codeError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                  >
                    {codeError}
                  </div>
                )}

                <div>
                  <label
                    htmlFor="admin-code"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Code
                  </label>
                  <input
                    id="admin-code"
                    type="password"
                    value={code}
                    onChange={(event) => {
                      setCode(event.target.value)
                      setCodeError('')
                    }}
                    autoComplete="off"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-primary"
                  />
                </div>

                <Button type="submit" className="w-full">
                  Déverrouiller
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="space-y-4">
                <div>
                  <h2 className="font-semibold text-gray-900">Réinitialiser un PIN</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Pour une personne qui a oublié son code. Le contenu du PIN
                    n'est jamais affiché : tu en choisis un nouveau, ou tu retires
                    la protection.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="admin-search"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Rechercher une personne
                  </label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                      aria-hidden="true"
                    />
                    <input
                      id="admin-search"
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Prénom, nom ou numéro"
                      className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-transparent focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {error && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                <span>{error}</span>
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  Réessayer
                </Button>
              </div>
            )}

            <Card>
              <CardContent>
                {loading && profiles.length === 0 ? (
                  <div className="flex justify-center py-10">
                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-500">
                    {profiles.length === 0
                      ? 'Aucun profil pour l’instant.'
                      : 'Aucune personne ne correspond à cette recherche.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {filtered.map((profile) => (
                      <li
                        key={profile.user_number}
                        className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            aria-hidden="true"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-600"
                          >
                            {profile.first_name.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-gray-900">
                              {profile.first_name} {profile.last_name}
                            </p>
                            <p className="text-xs text-gray-500">
                              #{profile.user_number}
                              <span className="mx-1.5" aria-hidden="true">·</span>
                              <span
                                className={
                                  profile.hasPin
                                    ? 'inline-flex items-center gap-1 text-green-700'
                                    : 'inline-flex items-center gap-1 text-gray-500'
                                }
                              >
                                {profile.hasPin ? (
                                  <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                                ) : (
                                  <ShieldOff className="h-3 w-3" aria-hidden="true" />
                                )}
                                {profile.hasPin ? 'PIN actif' : 'Sans PIN'}
                              </span>
                            </p>
                          </div>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPending(profile)}
                          aria-label={`Gérer le PIN de ${profile.first_name} ${profile.last_name}`}
                        >
                          {profile.hasPin ? 'Réinitialiser' : 'Définir un PIN'}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <p className="px-1 text-xs text-gray-500">
              L'accès administrateur est redemandé à chaque visite. Le code n'est
              pas une authentification forte : il empêche une erreur, pas une
              attaque délibérée.
            </p>
          </>
        )}
      </main>

      {pending && (
        <AdminPinResetModal
          profile={pending}
          onClose={() => setPending(null)}
          onResetPin={(pin) => handleResetPin(pending, pin)}
          onRemovePin={() => handleRemovePin(pending)}
        />
      )}
    </div>
  )
}
