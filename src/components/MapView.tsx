import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GPXPoint } from '../types'
import { getBounds, simplifyPoints } from '../services/gpxParser'

// Fix pour les icônes Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

interface MapViewProps {
  points: GPXPoint[]
  center?: { lat: number; lng: number }
  zoom?: number
  height?: number
  interactive?: boolean
}

export function MapView({ points, center, zoom = 13, height = 300, interactive = true }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    let initialCenter: [number, number]
    if (center) {
      initialCenter = [center.lat, center.lng]
    } else if (points[0]) {
      initialCenter = [points[0].lat, points[0].lng]
    } else {
      initialCenter = [48.8566, 2.3522]
    }
    
    const map = L.map(mapRef.current, {
      zoomControl: interactive,
      scrollWheelZoom: interactive,
      dragging: interactive,
      touchZoom: interactive,
    }).setView(initialCenter, zoom)

    mapInstanceRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map)

    setMapReady(true)

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!mapInstanceRef.current || !mapReady || points.length === 0) return

    const map = mapInstanceRef.current

    // Nettoyer les anciens layers
    map.eachLayer(layer => {
      if (layer instanceof L.Polyline || layer instanceof L.Marker) {
        map.removeLayer(layer)
      }
    })

    // Simplifier les points si trop nombreux
    const displayPoints = simplifyPoints(points, 500)

    // Tracer le parcours avec la couleur primaire
    const latLngs: [number, number][] = displayPoints.map(p => [p.lat, p.lng])
    const polyline = L.polyline(latLngs, {
      color: '#593A5A',
      weight: 4,
      opacity: 0.8,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map)

    // Marqueur de départ
    if (points.length > 0) {
      L.marker([points[0].lat, points[0].lng], {
        icon: L.divIcon({
          className: 'start-marker',
          html: '<div class="w-3 h-3 bg-primary rounded-full border-2 border-white shadow"></div>',
          iconSize: [16, 16],
        }),
      }).addTo(map).bindPopup('Départ')

      // Marqueur d'arrivée
      const last = points[points.length - 1]
      L.marker([last.lat, last.lng], {
        icon: L.divIcon({
          className: 'end-marker',
          html: '<div class="w-3 h-3 bg-error rounded-full border-2 border-white shadow"></div>',
          iconSize: [16, 16],
        }),
      }).addTo(map).bindPopup('Arrivée')
    }

    // Ajuster la vue aux bounds
    const bounds = getBounds(points)
    if (bounds) {
      map.fitBounds([
        [bounds.minLat, bounds.minLng],
        [bounds.maxLat, bounds.maxLng],
      ], { padding: [20, 20], maxZoom: 16 })
    }
  }, [points, mapReady])

  return (
    <div
      ref={mapRef}
      style={{ height, width: '100%' }}
      className="rounded-lg overflow-hidden"
      role="application"
      aria-label="Carte du parcours"
    />
  )
}