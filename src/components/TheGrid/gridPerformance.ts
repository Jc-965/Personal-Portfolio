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
  shadows?: boolean
  antialias: boolean
  /** MSAA samples for the post-processing composer target (0 = off). The
   * whole city is thin emissive lines — without this the composer pass
   * undoes the canvas's own antialiasing. */
  msaa: number
  /** Planar-reflection wet street (an extra scene render per frame). */
  reflections: boolean
  reflectionSize: number
  rainCount: number
}

export function getGridQuality(): GridQuality {
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  const cores = nav?.hardwareConcurrency ?? 4
  const memory = (nav as { deviceMemory?: number } | undefined)?.deviceMemory ?? 4
  const coarse = typeof window !== 'undefined'
    && window.matchMedia?.('(pointer: coarse)').matches === true

  if (cores >= 8 && memory >= 8 && !coarse) {
    // High-resolution color maps, HDR lighting, planar reflection, and a
    // shadow atlas already occupy substantial GPU memory. Capping DPR avoids
    // context loss while native antialiasing keeps signage crisp.
    return { tier: 'high', shadows: true, maxDpr: 1.35, towerDensity: 0.62, postEnabled: true, antialias: false, msaa: 4, reflections: true, reflectionSize: 512, rainCount: 900 }
  }
  if (cores <= 4 || memory <= 4) {
    return { tier: 'low', shadows: false, maxDpr: 1, towerDensity: 0.38, postEnabled: false, antialias: false, msaa: 0, reflections: false, reflectionSize: 0, rainCount: 260 }
  }
  return { tier: 'mid', shadows: true, maxDpr: 1.2, towerDensity: 0.52, postEnabled: true, antialias: false, msaa: 2, reflections: true, reflectionSize: 512, rainCount: 650 }
}
