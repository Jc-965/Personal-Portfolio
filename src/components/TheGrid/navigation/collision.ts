export interface WalkerPosition { x: number; y: number; z: number }
export interface Collider { min: [number, number, number]; max: [number, number, number]; name?: string }
export interface WalkSurface {
  minX: number; maxX: number; minZ: number; maxZ: number; y: number
  rise?: number; axis?: 'x' | 'z'
}
export interface CollisionWorld {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  colliders: Collider[]
  surfaces: WalkSurface[]
}
export const CAPSULE_RADIUS = 0.34
export const EYE_HEIGHT = 1.7
const STEP_HEIGHT = 0.32
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function isCapsuleFree(p: WalkerPosition, colliders: Collider[]): boolean {
  return !colliders.some(box => {
    if (p.y + 0.04 >= box.max[1] || p.y + EYE_HEIGHT <= box.min[1]) return false
    const dx = p.x - clamp(p.x, box.min[0], box.max[0])
    const dz = p.z - clamp(p.z, box.min[2], box.max[2])
    return dx * dx + dz * dz < CAPSULE_RADIUS * CAPSULE_RADIUS
  })
}

export function groundAt(x: number, z: number, currentY: number, surfaces: WalkSurface[]): number {
  let y = 0
  for (const surface of surfaces) {
    if (x < surface.minX || x > surface.maxX || z < surface.minZ || z > surface.maxZ) continue
    const fraction = surface.axis === 'x'
      ? (x - surface.minX) / (surface.maxX - surface.minX)
      : (z - surface.minZ) / (surface.maxZ - surface.minZ)
    const height = surface.y + (surface.rise ?? 0) * fraction
    if (height <= currentY + STEP_HEIGHT && height > y) y = height
  }
  return y
}

/** Substeps prevent tunnelling; axis separation is the Sketchbook's wall-slide model. */
export function moveCapsule(from: WalkerPosition, dx: number, dz: number, world: CollisionWorld): WalkerPosition {
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return { ...from }
  const position = { ...from }
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (CAPSULE_RADIUS * 0.45)))
  const moveX = dx / steps
  const moveZ = dz / steps
  const tryMove = (x: number, z: number) => {
    const boundedX = clamp(x, world.bounds.minX + CAPSULE_RADIUS, world.bounds.maxX - CAPSULE_RADIUS)
    const boundedZ = clamp(z, world.bounds.minZ + CAPSULE_RADIUS, world.bounds.maxZ - CAPSULE_RADIUS)
    const y = groundAt(boundedX, boundedZ, position.y, world.surfaces)
    if (Math.abs(y - position.y) > STEP_HEIGHT) return false
    const next = { x: boundedX, y, z: boundedZ }
    if (!isCapsuleFree(next, world.colliders)) return false
    Object.assign(position, next)
    return true
  }
  for (let i = 0; i < steps; i++) {
    if (tryMove(position.x + moveX, position.z + moveZ)) continue
    tryMove(position.x + moveX, position.z)
    tryMove(position.x, position.z + moveZ)
  }
  return position
}
