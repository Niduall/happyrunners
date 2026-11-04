import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

/**
 * Réserve une page aux personnes connectées.
 *
 * Le chat n'est plus lisible par un visiteur : sans identité, on renvoie vers
 * l'accueil, qui porte l'écran de connexion. Le garde empêche aussi le montage
 * de la page, donc ses requêtes de messages.
 */
export function RequireUser({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    )
  }

  if (!user) return <Navigate to="/" replace />

  return <>{children}</>
}
