import { storageGet, storageSet } from './safeStorage'

export const CONSTELLATION_COLORS = [
  { value: '#00ffff', label: 'Cyan' },
  { value: '#ff00ff', label: 'Magenta' },
  { value: '#00ff41', label: 'Green' },
  { value: '#ffcc00', label: 'Yellow' },
  { value: '#ff3366', label: 'Red' },
] as const

function createId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.()
  if (randomId) return randomId
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// Both the flat constellation and the Grid import this module. Keeping the
// identity here guarantees they refer to one visitor star during this page
// lifetime instead of creating competing stars from separate lazy chunks.
const pageVisitId = createId('visit')
let visitStarCreationClaimed = false

export function getConstellationVisitId(): string {
  return pageVisitId
}

export function claimConstellationVisitStarCreation(): boolean {
  if (visitStarCreationClaimed) return false
  visitStarCreationClaimed = true
  return true
}

export function markConstellationVisitStarCreated(): void {
  visitStarCreationClaimed = true
}

export function getConstellationSessionSecret(): string {
  let id = storageGet('constellation-session')
  if (!id) {
    id = createId('session')
    storageSet('constellation-session', id)
  }
  return id
}
