import { type Parcours, type Participation, type User } from '../types'

const STORAGE_KEYS = {
  PARCOURS: 'running_parcours',
  PARTICIPATIONS: 'running_participations',
  USER: 'running_user',
} as const

// Re-export types for consumers
export type { Parcours, Participation, User }

// --- Parcours ---
export function getParcours(): Parcours[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.PARCOURS)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function saveParcours(parcours: Parcours[]): void {
  localStorage.setItem(STORAGE_KEYS.PARCOURS, JSON.stringify(parcours))
}

export function addParcours(parcours: Parcours): void {
  const all = getParcours()
  all.unshift(parcours)
  saveParcours(all)
}

export function deleteParcours(id: string): void {
  const all = getParcours().filter(p => p.id !== id)
  saveParcours(all)
}

export function getNextParcours(): Parcours | null {
  const all = getParcours()
  return all.length > 0 ? all[0] : null
}

// --- Participations ---
export function getParticipations(): Participation[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.PARTICIPATIONS)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function saveParticipation(participation: Participation): void {
  const all = getParticipations()
  const idx = all.findIndex(p => p.parcoursId === participation.parcoursId && p.userId === participation.userId)
  if (idx >= 0) {
    all[idx] = participation
  } else {
    all.push(participation)
  }
  localStorage.setItem(STORAGE_KEYS.PARTICIPATIONS, JSON.stringify(all))
}

export function getParticipation(parcoursId: string, userId: string): Participation | null {
  const all = getParticipations()
  return all.find(p => p.parcoursId === parcoursId && p.userId === userId) || null
}

export function getParticipationsForParcours(parcoursId: string): Participation[] {
  return getParticipations().filter(p => p.parcoursId === parcoursId)
}

// --- User ---
export function getUser(): User | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.USER)
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

export function setUser(user: User): void {
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user))
}

export function createUser(firstName: string, lastName: string): User {
  const trimmedFirst = firstName.trim()
  const trimmedLast = lastName.trim()
  const name = `${trimmedFirst} ${trimmedLast}`
  const user: User = {
    id: generateUserId(trimmedFirst, trimmedLast),
    firstName: trimmedFirst,
    lastName: trimmedLast,
    name,
  }
  setUser(user)
  return user
}

export function generateUserId(firstName: string, lastName: string): string {
  // ID déterministe : même nom → même ID sur tous les navigateurs/OS
  const normalize = (s: string): string =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // retirer accents
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') // garder seulement lettres + chiffres
  return `${normalize(firstName)}_${normalize(lastName)}`
}

// --- Export/Import ---
export function exportParcours(): string {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    parcours: getParcours(),
    participations: getParticipations(),
  }
  return JSON.stringify(data, null, 2)
}

export function downloadExport(): void {
  const json = exportParcours()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `happyrunners-backup-${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function importParcours(json: string): { success: boolean; message: string; count: number } {
  try {
    const data = JSON.parse(json)
    
    if (!data.parcours || !Array.isArray(data.parcours)) {
      return { success: false, message: 'Format invalide : "parcours" manquant', count: 0 }
    }
    
    let imported = 0
    const existing = getParcours()
    const existingIds = new Set(existing.map(p => p.id))
    
    for (const p of data.parcours) {
      if (!existingIds.has(p.id)) {
        addParcours(p)
        imported++
      }
    }
    
    // Import participations aussi
    if (data.participations && Array.isArray(data.participations)) {
      const existingParts = getParticipations()
      for (const part of data.participations) {
        const exists = existingParts.some(p => 
          p.parcoursId === part.parcoursId && p.userId === part.userId
        )
        if (!exists) {
          saveParticipation(part)
        }
      }
    }
    
    return { success: true, message: `${imported} parcours importé(s)`, count: imported }
  } catch (err) {
    return { success: false, message: 'Erreur lecture fichier JSON', count: 0 }
  }
}

export function importFromFile(file: File): Promise<{ success: boolean; message: string; count: number }> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = importParcours(e.target?.result as string)
      resolve(result)
    }
    reader.onerror = () => resolve({ success: false, message: 'Erreur lecture fichier', count: 0 })
    reader.readAsText(file)
  })
}