import { distanceToRail } from './rail'
import { STRUCTURE_AABBS, STREET } from '../gridConfig'

/**
 * Streetlight placement, shared by the pole meshes (Structures) and the
 * wet-street light streaks (Atmosphere). Poles stagger down both sidewalks
 * of the avenue; anything hugging the camera rail too closely — or standing
 * inside a signature structure's no-fly box — is dropped, so the drive gets
 * parallax off the lamps without ever grazing one.
 */

export interface StreetlightSpot {
  x: number
  z: number
  /** Which kerb: −1 west, +1 east. The arm reaches back over the street. */
  side: -1 | 1
}

export const LAMP_HEIGHT = 7.4
export const LAMP_ARM = 1.35

const spots: StreetlightSpot[] = []
for (let z = 42; z >= STREET.zEnd; z -= 12) {
  for (const side of [-1, 1] as const) {
    const zs = side === 1 ? z - 6 : z // staggered, not paired
    const x = side * 10.0
    if (zs < STREET.zEnd) continue
    if (distanceToRail(x, zs) < 2.2) continue
    const blocked = STRUCTURE_AABBS.some(
      box =>
        x > box.min[0] - 0.6 &&
        x < box.max[0] + 0.6 &&
        zs > box.min[2] - 0.6 &&
        zs < box.max[2] + 0.6,
    )
    if (blocked) continue
    spots.push({ x, z: zs, side })
  }
}

export const STREETLIGHTS = spots
