import { Suspense, lazy } from 'react'
import type { MapViewProps } from './MapView'

/**
 * Carte Leaflet chargée à la demande.
 *
 * `leaflet` pèse ~150 kB minifié (43 kB gzip) et n'est utile que si
 * l'utilisateur ouvre un tracé : il n'a rien à faire dans le bundle
 * principal ni dans l'analyse faite au démarrage. Le module n'est donc
 * téléchargé qu'au premier affichage de carte, puis mis en cache par le
 * service worker.
 *
 * Toujours importer `LazyMapView`, jamais `MapView` en direct : un import
 * statique ferait revenir Leaflet dans le bundle principal.
 */
const MapView = lazy(() =>
  import('./MapView').then((module) => ({ default: module.MapView }))
)

export function LazyMapView(props: MapViewProps) {
  const height = props.height ?? 300

  return (
    <Suspense
      fallback={
        // Même hauteur que la carte : rien ne bouge quand elle arrive.
        <div
          style={{ height }}
          className="w-full rounded-lg bg-gray-100 flex items-center justify-center text-sm text-gray-500"
          role="status"
        >
          Chargement de la carte…
        </div>
      }
    >
      <MapView {...props} height={height} />
    </Suspense>
  )
}
