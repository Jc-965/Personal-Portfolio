import * as THREE from 'three'
import { BG_COLOR, STATIONS, STATION_T } from '../gridConfig'

/**
 * The district color script. Every scene material's background/fade uniform
 * references this single mutable Color; the camera rig lerps it (and the GL
 * clear color) along the rail, so the whole world grades from district to
 * district with zero per-material bookkeeping.
 */
export const SCENE_BG = new THREE.Color(BG_COLOR)

// Near-black tints, one per station — read as atmosphere, not filters.
const STATION_BG = [
  '#020409', // home — teal night
  '#050408', // journey — warmed by amber
  '#020310', // projects — indigo
  '#070310', // beyond — magenta dusk
  '#050503', // skills — amber haze
  '#01030c', // sky — deep blue
].map(hex => new THREE.Color(hex))

const scratch = new THREE.Color()

/** Update SCENE_BG for a rail progress value; returns it for convenience. */
export function gradeSceneBg(progress: number): THREE.Color {
  let leg = 0
  while (leg < STATION_T.length - 2 && progress >= STATION_T[leg + 1]) leg++
  const span = STATION_T[leg + 1] - STATION_T[leg]
  const local = THREE.MathUtils.clamp((progress - STATION_T[leg]) / span, 0, 1)
  scratch.copy(STATION_BG[leg]).lerp(STATION_BG[leg + 1], local)
  // Ease toward the target so navigation jumps don't pop the grade.
  SCENE_BG.lerp(scratch, 0.08)
  return SCENE_BG
}

export const stationCount = STATIONS.length
