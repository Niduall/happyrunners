import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { RequireUser } from './components/RequireUser'
import './index.css'

/**
 * Les pages secondaires ne sont téléchargées qu'à la navigation : le premier
 * écran n'embarque ni l'import GPX, ni la console admin, ni le chat. Home
 * reste chargé d'emblée, c'est la page d'arrivée.
 */
const ParcoursList = lazy(() =>
  import('./pages/ParcoursList').then((module) => ({
    default: module.ParcoursList,
  }))
)
const Chat = lazy(() =>
  import('./pages/Chat').then((module) => ({ default: module.Chat }))
)
const Admin = lazy(() =>
  import('./pages/Admin').then((module) => ({ default: module.Admin }))
)

function PageLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gray-50">
      <div
        role="status"
        aria-label="Chargement de la page"
        className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"
      />
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/parcours" element={<ParcoursList />} />
          <Route
            path="/messages"
            element={
              <RequireUser>
                <Chat />
              </RequireUser>
            }
          />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
