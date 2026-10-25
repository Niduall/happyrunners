import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseGPX, simplifyPoints, getBounds } from './gpxParser'
import type { GPXPoint } from '../types'

/** Deux points séparés de 0,01° de latitude ≈ 1,11 km */
const START = { lat: 48.8566, lng: 2.3522 }
const NORTH = { lat: 48.8666, lng: 2.3522 }

const gpxTrack = (points: string, name = 'Boucle', desc = 'Test') => `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${name}</name>
    <desc>${desc}</desc>
    <trkseg>${points}</trkseg>
  </trk>
</gpx>`

const trkpt = (lat: number, lon: number, ele?: number, time?: string) =>
  `<trkpt lat="${lat}" lon="${lon}">${ele !== undefined ? `<ele>${ele}</ele>` : ''}${
    time ? `<time>${time}</time>` : ''
  }</trkpt>`

describe('parseGPX — entrées invalides', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retourne null pour une chaîne vide ou blanche', () => {
    expect(parseGPX('')).toBeNull()
    expect(parseGPX('   \n\t ')).toBeNull()
  })

  it('retourne null pour un JSON sans tableau points', () => {
    expect(parseGPX('{"name":"x"}')).toBeNull()
  })

  it('retourne null pour un texte quelconque', () => {
    expect(parseGPX('ceci n’est pas un GPX')).toBeNull()
  })

  it('retourne null pour une trace sans point', () => {
    expect(parseGPX('<gpx><trk><name>Vide</name></trk></gpx>')).toBeNull()
  })

  it('retourne null pour un JSON dont aucun point n’est valide', () => {
    expect(parseGPX(JSON.stringify({ name: 'X', points: [{ lng: 2.3 }, { lat: 48.8 }] }))).toBeNull()
  })
})

describe('parseGPX — XML GPX', () => {
  it('parse une trace (trk) : nom, description et points', () => {
    const xml = gpxTrack(trkpt(START.lat, START.lng, 35) + trkpt(NORTH.lat, NORTH.lng, 45))

    const parcours = parseGPX(xml)

    expect(parcours).not.toBeNull()
    expect(parcours!.name).toBe('Boucle')
    expect(parcours!.description).toBe('Test')
    expect(parcours!.points).toHaveLength(2)
    expect(parcours!.points[0]).toMatchObject({ lat: START.lat, lng: START.lng, ele: 35 })
  })

  it('convertit la date GPX (Date) en chaîne ISO', () => {
    const xml = gpxTrack(trkpt(START.lat, START.lng, 35, '2026-10-07T10:00:00.000Z'))

    const parcours = parseGPX(xml)

    expect(parcours!.points[0].time).toBe('2026-10-07T10:00:00.000Z')
  })

  it('parse une route (rte)', () => {
    const xml = `<?xml version="1.0"?>
<gpx version="1.1">
  <rte>
    <name>Route</name>
    <rtept lat="${START.lat}" lon="${START.lng}"><ele>100</ele></rtept>
    <rtept lat="${NORTH.lat}" lon="${NORTH.lng}"><ele>120</ele></rtept>
  </rte>
</gpx>`

    const parcours = parseGPX(xml)

    expect(parcours!.name).toBe('Route')
    expect(parcours!.points).toHaveLength(2)
    expect(parcours!.elevation_gain_m).toBe(20)
  })

  it('parse des points isolés (wpt)', () => {
    const xml = `<?xml version="1.0"?>
<gpx version="1.1">
  <wpt lat="${START.lat}" lon="${START.lng}"><ele>50</ele></wpt>
  <wpt lat="${NORTH.lat}" lon="${NORTH.lng}"><ele>60</ele></wpt>
</gpx>`

    const parcours = parseGPX(xml)

    expect(parcours!.name).toBe('Parcours waypoints')
    expect(parcours!.points).toHaveLength(2)
  })

  it('fusionne plusieurs segments (trkseg)', () => {
    const xml = `<?xml version="1.0"?>
<gpx version="1.1">
  <trk>
    <name>Segments</name>
    <trkseg>${trkpt(START.lat, START.lng, 10)}</trkseg>
    <trkseg>${trkpt(NORTH.lat, NORTH.lng, 20)}</trkseg>
  </trk>
</gpx>`

    const parcours = parseGPX(xml)

    expect(parcours!.points).toHaveLength(2)
    expect(parcours!.elevation_gain_m).toBe(10)
  })

  it('accepte les balises préfixées (gpx:trk)', () => {
    const xml = `<?xml version="1.0"?>
<gpx:gpx version="1.1" xmlns:gpx="http://www.topografix.com/GPX/1/1">
  <gpx:trk>
    <gpx:name>Préfixé</gpx:name>
    <gpx:trkseg>
      <gpx:trkpt lat="${START.lat}" lon="${START.lng}"><gpx:ele>35</gpx:ele></gpx:trkpt>
      <gpx:trkpt lat="${NORTH.lat}" lon="${NORTH.lng}"><gpx:ele>45</gpx:ele></gpx:trkpt>
    </gpx:trkseg>
  </gpx:trk>
</gpx:gpx>`

    const parcours = parseGPX(xml)

    expect(parcours!.name).toBe('Préfixé')
    expect(parcours!.points).toHaveLength(2)
    expect(parcours!.elevation_gain_m).toBe(10)
  })
})

describe('parseGPX — JSON Strava', () => {
  it('parse un export JSON avec lat/lng', () => {
    const json = JSON.stringify({
      name: 'Sortie Strava',
      description: 'Export récent',
      points: [
        { lat: START.lat, lng: START.lng, ele: 35 },
        { lat: NORTH.lat, lng: NORTH.lng, ele: 45 },
      ],
    })

    const parcours = parseGPX(json)

    expect(parcours!.name).toBe('Sortie Strava')
    expect(parcours!.description).toBe('Export récent')
    expect(parcours!.points).toHaveLength(2)
    expect(parcours!.points[1]).toMatchObject({ lat: NORTH.lat, lng: NORTH.lng, ele: 45 })
  })

  it('accepte des coordonnées en chaînes', () => {
    const json = JSON.stringify({
      points: [
        { lat: String(START.lat), lng: String(START.lng) },
        { lat: String(NORTH.lat), lng: String(NORTH.lng) },
      ],
    })

    const parcours = parseGPX(json)

    expect(parcours!.points[0]).toMatchObject({ lat: START.lat, lng: START.lng })
  })

  it('utilise le titre puis un nom par défaut', () => {
    const points = [{ lat: START.lat, lng: START.lng }]

    expect(parseGPX(JSON.stringify({ title: 'Titre', points }))!.name).toBe('Titre')
    expect(parseGPX(JSON.stringify({ points }))!.name).toBe('Parcours Strava')
  })
})

describe('parseGPX — distance et dénivelé', () => {
  it('calcule la distance en km, arrondie au centième', () => {
    const xml = gpxTrack(trkpt(START.lat, START.lng) + trkpt(NORTH.lat, NORTH.lng))

    // 0,01° de latitude ≈ 1,11 km
    expect(parseGPX(xml)!.distance_km).toBeCloseTo(1.11, 2)
  })

  it('additionne les montées et ignore les descentes', () => {
    const json = JSON.stringify({
      points: [
        { lat: 48.85, lng: 2.35, ele: 100 },
        { lat: 48.86, lng: 2.35, ele: 130 },
        { lat: 48.87, lng: 2.35, ele: 110 },
        { lat: 48.88, lng: 2.35, ele: 125 },
      ],
    })

    expect(parseGPX(json)!.elevation_gain_m).toBe(45) // +30 puis +15
  })

  it('ne compte pas une altitude manquante comme 0 (A8)', () => {
    const json = JSON.stringify({
      points: [
        { lat: 48.85, lng: 2.35 }, // altitude inconnue
        { lat: 48.86, lng: 2.35, ele: 100 },
        { lat: 48.87, lng: 2.35, ele: 110 },
      ],
    })

    // Sans le correctif : 0 → 100 → 110 donnerait 110 m de D+.
    expect(parseGPX(json)!.elevation_gain_m).toBe(10)
  })

  it('ignore les altitudes manquantes au milieu du parcours', () => {
    const json = JSON.stringify({
      points: [
        { lat: 48.85, lng: 2.35, ele: 100 },
        { lat: 48.86, lng: 2.35 },
        { lat: 48.87, lng: 2.35, ele: 130 },
      ],
    })

    // Comparaison avec le dernier point connu : 100 → 130 = +30.
    expect(parseGPX(json)!.elevation_gain_m).toBe(30)
  })
})

describe('simplifyPoints', () => {
  const line = (n: number): GPXPoint[] =>
    Array.from({ length: n }, (_, i) => ({ lat: 48 + i / 1000, lng: 2 }))

  it('renvoie le tableau tel quel sous la limite', () => {
    const points = line(10)
    expect(simplifyPoints(points, 10)).toBe(points)
    expect(simplifyPoints(points, 500)).toBe(points)
  })

  it('réduit une trace trop longue', () => {
    const points = line(1200)
    const simplified = simplifyPoints(points, 500)

    expect(simplified.length).toBeLessThanOrEqual(500)
    expect(simplified.length).toBeGreaterThan(0)
    expect(simplified[0]).toEqual(points[0])
  })

  it('garde l’ordre des points', () => {
    const simplified = simplifyPoints(line(1001), 500)
    for (let i = 1; i < simplified.length; i++) {
      expect(simplified[i].lat).toBeGreaterThan(simplified[i - 1].lat)
    }
  })
})

describe('getBounds', () => {
  it('retourne null sans point', () => {
    expect(getBounds([])).toBeNull()
  })

  it('retourne les extrêmes', () => {
    const bounds = getBounds([
      { lat: 48.85, lng: 2.34 },
      { lat: 48.9, lng: 2.3 },
      { lat: 48.8, lng: 2.4 },
    ])

    expect(bounds).toEqual({ minLat: 48.8, maxLat: 48.9, minLng: 2.3, maxLng: 2.4 })
  })
})
