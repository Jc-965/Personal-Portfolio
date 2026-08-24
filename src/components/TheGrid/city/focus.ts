import * as THREE from 'three'
import { content, gantryZ, marqueeCenter, PROJECT_SITES } from '../gridConfig'
import type { GridSelection } from './interaction'

/**
 * Fly-to focus: authored hero framings for each project marquee and each
 * role gantry. When a visitor explicitly selects one (in-world click, sr-only
 * button, or arrow key), the camera rig blends off the scroll rail into the
 * matching pose — the selection IS the camera move. Every pose floats in the
 * open roadway, clear of all structure AABBs, and scrolling away releases it.
 */

export interface FocusPose {
  /** Station whose neighborhood this pose belongs to (focus fades with
   * distance from it, so a stale selection can never grab a far camera). */
  station: number
  position: THREE.Vector3
  lookAt: THREE.Vector3
}

const projectPoses: FocusPose[] = PROJECT_SITES.map(site => {
  const center = marqueeCenter(site)
  return {
    station: 2,
    // Rise off the road toward the screen, framing the marquee, its stat
    // cards, and the street inlay from across the centerline.
    position: new THREE.Vector3(-site.side * 4.6, 6.6, center.z + 13),
    lookAt: new THREE.Vector3(center.x, site.screenY - 0.4, center.z),
  }
})

const rolePoses: FocusPose[] = content.experiences.map((_, i) => {
  const z = gantryZ(i)
  return {
    station: 1,
    // Frame the holographic dossier as the hero — gantry overhead and
    // platform kiosk still read in the periphery.
    position: new THREE.Vector3(-2.4, 5.8, z + 11.2),
    lookAt: new THREE.Vector3(3.6, 5.2, z + 4.4),
  }
})

export function focusPose(selection: GridSelection): FocusPose | null {
  if (selection.focus === 'project') return projectPoses[selection.project] ?? null
  if (selection.focus === 'role' && selection.role !== null) return rolePoses[selection.role] ?? null
  return null
}
