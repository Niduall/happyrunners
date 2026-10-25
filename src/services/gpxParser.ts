import type { GPXPoint, Parcours } from '../types'

/**
 * Point brut, tel que le renvoie un GPX (lat/lon) ou un export JSON Strava
 * (lat/lng). Les valeurs peuvent arriver en chaînes : on les convertit.
 */
interface RawPoint {
  lat?: number | string
  lon?: number | string
  lng?: number | string
  ele?: number | string
  time?: string | Date | null
}

interface RawStravaExport {
  name?: string
  title?: string
  description?: string
  points?: RawPoint[]
}

/**
 * Parse un GPX (XML) ou un export JSON Strava.
 *
 * Le XML est lu avec le `DOMParser` natif : `gpxparser` tirait un jsdom 15 et
 * `jsdom-global`, qui remplaçaient le DOM de Vitest au moment de l'import et
 * cassaient le teardown des tests. On ne garde que ce dont l'app a besoin.
 */
export function parseGPX(gpxContent: string): Parcours | null {
  // Nettoyer le contenu (BOM, espaces)
  const cleanContent = gpxContent.trim().replace(/^\uFEFF/, '')

  if (!cleanContent) {
    console.error('GPX vide')
    return null
  }

  // Format JSON d'abord (export Strava récent)
  const parsedJson = tryParseJson(cleanContent)
  if (isStravaExport(parsedJson)) {
    return parseJSONStrava(parsedJson)
  }

  // Sinon, format XML GPX standard (insensible à la casse)
  const hasGPX =
    /<gpx/i.test(cleanContent) ||
    /<trk/i.test(cleanContent) ||
    /<rte/i.test(cleanContent) ||
    /<wpt/i.test(cleanContent)
  if (!hasGPX) {
    console.error('Pas un fichier GPX valide - pas de balise <gpx>, <trk>, <rte> ou <wpt>')
    return null
  }

  const doc = parseXml(cleanContent)
  if (!doc) {
    console.error('GPX parse error: XML invalide')
    return null
  }

  const track = firstDescendant(doc, 'trk')
  if (track) {
    const points = readXmlPoints(descendants(track, 'trkpt'))
    if (points.length > 0) {
      return buildParcours(childText(track, 'name'), childText(track, 'desc'), points)
    }
  }

  const route = firstDescendant(doc, 'rte')
  if (route) {
    const points = readXmlPoints(descendants(route, 'rtept'))
    if (points.length > 0) {
      return buildParcours(childText(route, 'name'), childText(route, 'desc'), points)
    }
  }

  const waypointElements = descendants(doc, 'wpt')
  if (waypointElements.length > 0) {
    const points = readXmlPoints(waypointElements)
    if (points.length > 0) {
      return buildParcours('Parcours waypoints', undefined, points)
    }
  }

  console.error('Aucune trace, route ou waypoint trouvée')
  return null
}

function tryParseJson(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

function isStravaExport(value: unknown): value is RawStravaExport {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as RawStravaExport).points)
  )
}

function parseXml(content: string): Document | null {
  const doc = new DOMParser().parseFromString(content, 'text/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) return null
  return doc
}

/**
 * Éléments par nom local, quel que soit le préfixe ou l'espace de noms
 * (`trk`, `gpx:trk`…). `getElementsByTagName` seul raterait les préfixes.
 */
function descendants(root: Document | Element, localName: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', localName))
}

function firstDescendant(root: Document, localName: string): Element | null {
  return descendants(root, localName)[0] ?? null
}

/** Enfant direct uniquement : évite de confondre le nom d'une trace imbriquée. */
function directChild(parent: Element, localName: string): Element | null {
  for (const child of Array.from(parent.children)) {
    if (child.localName === localName) return child
  }
  return null
}

function childText(parent: Element, localName: string): string | undefined {
  const text = directChild(parent, localName)?.textContent?.trim()
  return text ? text : undefined
}

function readXmlPoints(elements: Element[]): GPXPoint[] {
  const points: GPXPoint[] = []

  for (const element of elements) {
    const lat = toNumber(element.getAttribute('lat'))
    const lng = toNumber(element.getAttribute('lon'))
    if (lat === undefined || lng === undefined) continue

    const eleElement = directChild(element, 'ele')
    points.push({
      lat,
      lng,
      ele: eleElement ? toNumber(eleElement.textContent) : undefined,
      time: childText(element, 'time'),
    })
  }

  return points
}

function appendPoints(target: GPXPoint[], rawPoints: RawPoint[]): void {
  for (const point of rawPoints) {
    const lat = toNumber(point.lat)
    const lng = toNumber(point.lng ?? point.lon)
    if (lat === undefined || lng === undefined) continue

    target.push({
      lat,
      lng,
      ele: toNumber(point.ele),
      time: toTime(point.time),
    })
  }
}

// Parser pour le format JSON Strava (export récent)
function parseJSONStrava(json: RawStravaExport): Parcours | null {
  const points: GPXPoint[] = []
  appendPoints(points, json.points ?? [])

  if (points.length === 0) {
    console.error('Aucun point valide dans le JSON')
    return null
  }

  const name = json.name || json.title || 'Parcours Strava'
  return buildParcours(name, json.description, points)
}

function buildParcours(name: string | undefined, desc: string | undefined, points: GPXPoint[]): Parcours {
  let distance = 0
  for (let i = 1; i < points.length; i++) {
    distance += haversineDistance(points[i - 1], points[i])
  }

  // Le dénivelé ne se cumule qu'entre deux altitudes connues : compter une
  // altitude manquante comme 0 inventerait une montée (voir A8).
  let elevationGain = 0
  let previousEle: number | undefined
  for (const point of points) {
    if (point.ele === undefined) continue
    if (previousEle !== undefined && point.ele > previousEle) {
      elevationGain += point.ele - previousEle
    }
    previousEle = point.ele
  }

  const now = new Date().toISOString()

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    }),
    name: name || 'Parcours sans nom',
    description: desc,
    distance_km: Math.round(distance * 100) / 100,
    elevation_gain_m: Math.round(elevationGain),
    points,
    created_by: null,
    created_at: now,
    updated_at: now,
  }
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function toTime(value: string | Date | null | undefined): string | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString()
  }
  return typeof value === 'string' && value ? value : undefined
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
