/**
 * Full 3D on every device means the low end must still look intentional:
 * fewer towers, no post pass, DPR 1 — a sparser city, not a broken one.
 * Mirrors the heuristics Background.tsx uses for its canvas profile.
 */

export type GridTier = 'low' | 'mid' | 'high'

export interface GridQuality {
  tier: GridTier
  maxDpr: number
  towerDensity: number
  postEnabled: boolean
  antialias: boolean
}

export function getGridQuality(): GridQuality {
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  const cores = nav?.hardwareConcurrency ?? 4
  const memory = (nav as { deviceMemory?: number } | undefined)?.deviceMemory ?? 4
  const coarse = typeof window !== 'undefined'
    && window.matchMedia?.('(pointer: coarse)').matches === true

  if (cores >= 8 && memory >= 8 && !coarse) {
    return { tier: 'high', maxDpr: 2, towerDensity: 0.62, postEnabled: true, antialias: true }
  }
  if (cores <= 4 || memory <= 4) {
    return { tier: 'low', maxDpr: 1, towerDensity: 0.38, postEnabled: false, antialias: false }
  }
  return { tier: 'mid', maxDpr: 1.4, towerDensity: 0.52, postEnabled: true, antialias: false }
}
