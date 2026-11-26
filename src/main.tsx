import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './hooks/useAuth'
import { startNotificationCleanup } from './services/notificationCleanup'
import { startServiceWorkerUpdates } from './services/swUpdate'
import App from './App.tsx'

// En production seulement : en dev, aucun service worker n'est généré
// (`devOptions.enabled: false`) et l'enregistrement renverrait un 404.
if (import.meta.env.PROD) {
  startServiceWorkerUpdates()
  startNotificationCleanup()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
)
