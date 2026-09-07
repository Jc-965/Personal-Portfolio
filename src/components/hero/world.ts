/** Pure helpers for the hero world: cell grid sizing, camera travel, glyph mapping. */

/** Dark to bright. Index 0 is the empty cell. */
export const GLYPH_RAMP = ' .·:-=+*#%@'

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export interface Grid {
  cols: number
  rows: number
  cellW: number
  cellH: number
  offsetX: number
  offsetY: number
}

export function gridFor(width: number, height: number, cellW: number, cellH: number): Grid {
  const cols = Math.max(1, Math.floor(width / cellW + 1e-6))
  const rows = Math.max(1, Math.floor(height / cellH + 1e-6))
  return { cols, rows, cellW, cellH, offsetX: (width - cols * cellW) / 2, offsetY: (height - rows * cellH) / 2 }
}

/** The camera path ends when the next section first enters the viewport. */
export function sceneProgress(scrollY: number, trackHeight: number, viewportHeight: number): number {
  return clamp01(scrollY / Math.max(1, trackHeight - viewportHeight))
}

/** Keep the outgoing environment alive throughout the next section's arrival. */
export function arrivalProgress(scrollY: number, trackHeight: number, viewportHeight: number): number {
  return clamp01((scrollY - Math.max(0, trackHeight - viewportHeight)) / Math.max(1, viewportHeight))
}

/** Opening camera shared by the scene shader and the DOM copy that rides with the name. */
export const CAMERA = { y: 2, startZ: -12, endZ: 14.2, focal: 1.65 } as const
/** Gateway placement and camera tilt per orientation. Portrait centres the gate and looks up. */
export const RIG = {
  wide: { gate: { x: 6.4, y: 3.2, z: 12 }, tilt: 0.05 },
  narrow: { gate: { x: 0, y: 5, z: 12 }, tilt: 0.26 },
} as const

/** Eased flight along the camera path for a normalized scroll progress. */
export function advanceOf(progress: number): number {
  const p = clamp01(progress)
  return p * p * (3 - 2 * p)
}

export interface Projected {
  /** Fraction of the viewport width from the left. */
  x: number
  /** Fraction of the viewport height from the top. */
  y: number
  depth: number
}

/**
 * Projects a world point through the wide-viewport opening camera at a given
 * progress. Returns null once the point is beside or behind the camera.
 */
export function project(point: readonly [number, number, number], progress: number, aspect: number, narrow = false): Projected | null {
  const rig = narrow ? RIG.narrow : RIG.wide
  const a = advanceOf(progress)
  const cameraX = rig.gate.x * a
  const cameraY = CAMERA.y + (rig.gate.y - CAMERA.y) * a
  const cameraZ = CAMERA.startZ + (CAMERA.endZ - CAMERA.startZ) * a
  const depth = point[2] - cameraZ
  if (depth < 0.5) return null
  const uvX = CAMERA.focal * (point[0] - cameraX) / depth
  const uvY = CAMERA.focal * (point[1] - cameraY) / depth + rig.tilt * (1 - a)
  return { x: (uvX / aspect + 1) / 2, y: (1 - uvY) / 2, depth }
}

export function glyphIndex(lum: number, count: number = GLYPH_RAMP.length): number {
  const clamped = Math.min(1, Math.max(0, lum))
  return Math.round(clamped * (count - 1))
}
