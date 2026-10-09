/**
 * Maps the rig's frame (camera looking along +z, phone screen facing -normal)
 * into three.js's frame (camera looking along -z, meshes facing +z) by
 * negating z. A reflection alone would mirror every mesh, so the phone's
 * local z axis becomes -normal: local +z is the screen side, as three.js
 * geometry expects, and every matrix stays a proper rotation.
 * No three.js import, so node tests load this module directly.
 */
import type { Vec3 } from './rig.ts'

export function toThreePosition(v: Vec3): Vec3 {
  return [v[0], v[1], -v[2]]
}

/** Column-major 4x4 for Matrix4.fromArray: columns right, up, screen-side (-normal), translation. */
export function toThreeMatrix(position: Vec3, right: Vec3, up: Vec3, normal: Vec3): number[] {
  const p = toThreePosition(position)
  return [
    right[0], right[1], -right[2], 0,
    up[0], up[1], -up[2], 0,
    -normal[0], -normal[1], normal[2], 0,
    p[0], p[1], p[2], 1,
  ]
}

/** Vertical field of view in degrees for the rig's focal length (uv.y spans -1 to 1). */
export function verticalFov(focal: number): number {
  return (2 * Math.atan(1 / focal) * 180) / Math.PI
}

/**
 * Moves the principal point by the rig's lens shift. `shift` is in the rig's uv
 * units. Entries 8 and 9 are overwritten, so `projection` must be a centred
 * perspective matrix, such as a fresh `updateProjectionMatrix()` result.
 */
export function applyLensShift(projection: number[], shift: [number, number], aspect: number): number[] {
  const out = projection.slice()
  out[8] = -shift[0] / aspect
  out[9] = -shift[1]
  return out
}
