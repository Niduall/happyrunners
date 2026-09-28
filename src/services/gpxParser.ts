import gpxParser from 'gpxparser'
import type { GPXPoint, Parcours } from '../types'

export function parseGPX(gpxContent: string): Parcours | null {
  try {
    // Nettoyer le contenu (BOM, espaces)
    const cleanContent = gpxContent.trim().replace(/^\uFEFF/, '')
    
    if (!cleanContent) {
      console.error('GPX vide')
      return null
    }

    // Debug: afficher plus d'infos pour diagnostic
    console.log('=== GPX DEBUG ===')
    console.log('Content length:', cleanContent.length)
    console.log('First 500 chars:', cleanContent.substring(0, 500))
    console.log('Last 200 chars:', cleanContent.substring(Math.max(0, cleanContent.length - 200)))
    
    // Essayer de parser en JSON d'abord (format Strava JSON export)
    let parsedJson = null
    try {
      parsedJson = JSON.parse(cleanContent)
      console.log('JSON parsed successfully:', Object.keys(parsedJson))
      console.log('Has points:', !!parsedJson.points, 'isArray:', Array.isArray(parsedJson.points))
      if (parsedJson.points) {
        console.log('Points length:', parsedJson.points.length)
        console.log('First point:', parsedJson.points[0])
      }
    } catch (e) {
      console.log('Not valid JSON, trying XML GPX')
    }
    
    // Si c'est du JSON avec un tableau "points", traiter comme format JSON Strava
    if (parsedJson && parsedJson.points && Array.isArray(parsedJson.points)) {
      console.log('Format JSON Strava détecté')
      return parseJSONStrava(parsedJson)
    }
    
    // Si JSON mais pas de points, essayer quand même si c'est un objet avec points
    if (parsedJson && typeof parsedJson === 'object') {
      console.log('JSON parsed but no points array, keys:', Object.keys(parsedJson))
    }
    
    // Sinon, format XML GPX standard
    // Check plus robuste (case-insensitive, ignore BOM/espace)
    const hasGPX = /<gpx/i.test(cleanContent) || /<trk/i.test(cleanContent) || /<rte/i.test(cleanContent) || /<wpt/i.test(cleanContent)
    if (!hasGPX) {
      console.error('Pas un fichier GPX valide - pas de balise <gpx>, <trk>, <rte> ou <wpt>')
      console.debug('Premiers 500 chars:', cleanContent.substring(0, 500))
      return null
    }

    const gpx = new gpxParser()
    gpx.parse(cleanContent)

    console.log('GPX parsed:', {
      tracksCount: gpx.tracks?.length || 0,
      routesCount: gpx.routes?.length || 0,
      waypointsCount: gpx.waypoints?.length || 0,
    })

    // Essayer tracks d'abord
    if (gpx.tracks && gpx.tracks.length > 0) {
      return buildParcoursFromTrack(gpx.tracks[0])
    }

    // Sinon essayer routes
    if (gpx.routes && gpx.routes.length > 0) {
      return buildParcoursFromRoute(gpx.routes[0])
    }

    // Sinon waypoints
    if (gpx.waypoints && gpx.waypoints.length > 0) {
      return buildParcoursFromWaypoints(gpx.waypoints)
    }

    console.error('Aucune trace, route ou waypoint trouvée')
    return null
  } catch (err) {
    console.error('GPX parse error:', err)
    return null
  }
}

function buildParcoursFromTrack(track: any): Parcours | null {
  const points: GPXPoint[] = []

  console.log('Track structure:', {
    name: track.name,
    desc: track.desc,
    type: track.type,
    pointsType: typeof track.points,
    pointsIsArray: Array.isArray(track.points),
    pointsLength: track.points?.length,
    firstPointKeys: track.points?.[0] ? Object.keys(track.points[0]) : null,
    firstSegment: track.points?.[0],
  })

  // CAS 1: track.points est un tableau PLAT de points (format Strava)
  if (track.points && Array.isArray(track.points) && track.points.length > 0) {
    const firstPoint = track.points[0]
    
    // Si le premier élément a lat/lon directement -> format plat
    if (firstPoint && typeof firstPoint === 'object' && firstPoint.lat != null && firstPoint.lon != null) {
      console.log('Format flat détecté (points directs)')
      for (const point of track.points) {
        if (point.lat != null && point.lon != null) {
          points.push({
            lat: Number(point.lat),
            lng: Number(point.lon),
            ele: point.ele != null ? Number(point.ele) : undefined,
            time: point.time,
          })
        }
      }
    }
    // Sinon format segments (tableau de tableaux)
    else if (Array.isArray(firstPoint)) {
      console.log('Format segments détecté')
      for (const segment of track.points) {
        if (Array.isArray(segment)) {
          for (const point of segment) {
            if (point.lat != null && point.lon != null) {
              points.push({
                lat: Number(point.lat),
                lng: Number(point.lon),
                ele: point.ele != null ? Number(point.ele) : undefined,
                time: point.time,
              })
            }
          }
        }
      }
    }
  }

  // Fallback: track.segments
  if (points.length === 0 && track.segments && Array.isArray(track.segments)) {
    console.log('Trying track.segments...')
    for (const segment of track.segments) {
      if (Array.isArray(segment)) {
        for (const point of segment) {
          if (point.lat != null && point.lon != null) {
            points.push({
              lat: Number(point.lat),
              lng: Number(point.lon),
              ele: point.ele != null ? Number(point.ele) : undefined,
              time: point.time,
            })
          }
        }
      }
    }
  }

  if (points.length === 0) {
    console.error('Aucun point valide dans la trace après tous les fallbacks')
    return null
  }

  console.log(`Successfully parsed ${points.length} points`)
  return buildParcours(track.name, track.desc, points)
}

function buildParcoursFromRoute(route: any): Parcours | null {
  const points: GPXPoint[] = []

  if (route.points && Array.isArray(route.points)) {
    for (const point of route.points) {
      if (point.lat != null && point.lon != null) {
        points.push({
          lat: Number(point.lat),
          lng: Number(point.lon),
          ele: point.ele != null ? Number(point.ele) : undefined,
          time: point.time,
        })
      }
    }
  }

  if (points.length === 0) return null
  return buildParcours(route.name, route.desc, points)
}

function buildParcoursFromWaypoints(waypoints: any[]): Parcours | null {
  const points: GPXPoint[] = []

  for (const wp of waypoints) {
    if (wp.lat != null && wp.lon != null) {
      points.push({
        lat: Number(wp.lat),
        lng: Number(wp.lon),
        ele: wp.ele != null ? Number(wp.ele) : undefined,
        time: wp.time,
      })
    }
  }

  if (points.length === 0) return null
  return buildParcours('Parcours waypoints', undefined, points)
}

// Parser pour le format JSON Strava (export récent)
function parseJSONStrava(json: any): Parcours | null {
  if (!json.points || !Array.isArray(json.points) || json.points.length === 0) {
    console.error('Format JSON invalide: pas de tableau points')
    return null
  }

  console.log(`Parsing JSON Strava: ${json.points.length} points`)

  const points: GPXPoint[] = []
  
  for (const point of json.points) {
    if (point.lat != null && point.lng != null) {
      points.push({
        lat: Number(point.lat),
        lng: Number(point.lng),
        ele: point.ele != null ? Number(point.ele) : undefined,
        time: point.time,
      })
    }
  }

  if (points.length === 0) {
    console.error('Aucun point valide dans le JSON')
    return null
  }

  console.log(`Successfully parsed ${points.length} points from JSON`)
  
  // Utiliser le nom du fichier ou un nom par défaut
  const name = json.name || json.title || 'Parcours Strava'
  
  return buildParcours(name, json.description, points)
}

function buildParcours(name: string | undefined, desc: string | undefined, points: GPXPoint[]): Parcours {
  let distance = 0
  for (let i = 1; i < points.length; i++) {
    distance += haversineDistance(points[i - 1], points[i])
  }

  let elevationGain = 0
  for (let i = 1; i < points.length; i++) {
    const prevEle = points[i - 1].ele ?? 0
    const currEle = points[i].ele ?? 0
    if (currEle > prevEle) {
      elevationGain += currEle - prevEle
    }
  }

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    }),
    name: name || 'Parcours sans nom',
    description: desc,
    distance: Math.round(distance * 100) / 100,
    distance_km: Math.round(distance * 100) / 100,
    elevationGain: Math.round(elevationGain),
    elevation_gain_m: Math.round(elevationGain),
    points,
    createdAt: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

function haversineDistance(p1: GPXPoint, p2: GPXPoint): number {
  const R = 6371
  const dLat = toRad(p2.lat - p1.lat)
  const dLon = toRad(p2.lng - p1.lng)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRad(deg: number): number {
  return deg * Math.PI / 180
}

export function simplifyPoints(points: GPXPoint[], maxPoints = 500): GPXPoint[] {
  if (points.length <= maxPoints) return points
  const factor = Math.ceil(points.length / maxPoints)
  return points.filter((_, i) => i % factor === 0)
}

export function getBounds(points: GPXPoint[]): { minLat: number; maxLat: number; minLng: number; maxLng: number } | null {
  if (points.length === 0) return null
  let minLat = points[0].lat, maxLat = points[0].lat
  let minLng = points[0].lng, maxLng = points[0].lng
  for (const p of points) {
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
    minLng = Math.min(minLng, p.lng)
    maxLng = Math.max(maxLng, p.lng)
  }
  return { minLat, maxLat, minLng, maxLng }
}