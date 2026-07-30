import * as THREE from 'three'
import {
  STATIONS,
  STATION_COUNT,
  STATION_T,
  RAIL_POINTS,
  STRUCTURE_AABBS,
  CORRIDOR_RADIUS,
} from '../gridConfig'

/**
 * The camera rail. Position rides a Catmull-Rom spline through RAIL_POINTS
 * (station anchors + shaping vias); the gaze target is smoothstep-lerped
 * between STATION look points across each station-to-station span, so arrival
 * at every station lands on its authored framing while travel between them
 * stays continuous. The camera never rolls.
 */

const lookPoints = STATIONS.map(s => new THREE.Vector3(...s.look))

// Centripetal parameterization keeps the spline from overshooting between
// anchors with very different leg lengths (the final climb to the sky deck).
const curve = new THREE.CatmullRomCurve3(
  RAIL_POINTS.map(p => new THREE.Vector3(...p)),
  false,
  'centripetal',
  0.5,
)

const smoothstep = (x: number) => x * x * (3 - 2 * x)

export interface RailSample {
  position: THREE.Vector3
  lookAt: THREE.Vector3
}

const scratchLook = new THREE.Vector3()

/** Sample the rail at progress 0..1. Writes into (and returns) `out`. */
export function sampleRail(progress: number, out: RailSample): RailSample {
  const p = THREE.MathUtils.clamp(progress, 0, 1)
  curve.getPoint(p, out.position)

  // Station spans are non-uniform (via points stretch some legs), so the
  // gaze leg is found against the station progress table.
  let leg = 0
  while (leg < STATION_COUNT - 2 && p >= STATION_T[leg + 1]) leg++
  const span = STATION_T[leg + 1] - STATION_T[leg]
  const local = smoothstep(THREE.MathUtils.clamp((p - STATION_T[leg]) / span, 0, 1))
  out.lookAt.copy(lookPoints[leg]).lerp(scratchLook.copy(lookPoints[leg + 1]), local)
  return out
}

export function nearestStation(progress: number): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < STATION_COUNT; i++) {
    const d = Math.abs(progress - STATION_T[i])
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}

// XZ samples of the full rail, used by the city generator to carve the
// corridor so no procedural tower ever intersects the camera path.
const corridorSamples: Array<{ x: number; z: number }> = []
for (let i = 0; i <= 160; i++) {
  const p = curve.getPoint(i / 160)
  corridorSamples.push({ x: p.x, z: p.z })
}

/** Minimum XZ distance from a point to the camera rail — for placing street
 * furniture close enough to feel (parallax) but never collide. */
export function distanceToRail(x: number, z: number): number {
  let best = Infinity
  for (const s of corridorSamples) {
    const dx = x - s.x
    const dz = z - s.z
    const d2 = dx * dx + dz * dz
    if (d2 < best) best = d2
  }
  return Math.sqrt(best)
}

export function isInCorridor(x: number, z: number, extraRadius = 0): boolean {
  const r = CORRIDOR_RADIUS + extraRadius
  const r2 = r * r
  for (const s of corridorSamples) {
    const dx = x - s.x
    const dz = z - s.z
    if (dx * dx + dz * dz < r2) return true
  }
  return false
}

/**
 * Dev-only guard: walk the rail densely and flag any sample inside a
 * structure's no-fly box. Catches the class of bug where an edit to a
 * station, via, or structure quietly routes the camera through a building.
 */
export function validateRail(): string[] {
  const problems: string[] = []
  const v = new THREE.Vector3()
  for (let i = 0; i <= 400; i++) {
    curve.getPoint(i / 400, v)
    for (const box of STRUCTURE_AABBS) {
      if (
        v.x > box.min[0] && v.x < box.max[0] &&
        v.y > box.min[1] && v.y < box.max[1] &&
        v.z > box.min[2] && v.z < box.max[2]
      ) {
        problems.push(
          `rail enters ${box.name} at progress ${(i / 400).toFixed(3)} ` +
          `(${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)})`,
        )
        break
      }
    }
  }
  return problems
}
