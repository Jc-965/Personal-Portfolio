import * as THREE from 'three'
import { content, PROJECT_SITES, TRANSIT, transitStopZ } from '../gridConfig'
import type { GridSelection } from './interaction'

/**
 * Fly-to focus: authored hero framings for each project tower and each
 * transit stop. When a visitor explicitly selects one (in-world click, HUD
 * tab, or arrow key), the camera rig blends off the scroll rail into the
 * matching pose — the selection IS the camera move. Every pose floats in the
 * open avenue, clear of all structure AABBs, and scrolling away releases it.
 */

export interface FocusPose {
  /** Station whose neighborhood this pose belongs to (focus fades with
   * distance from it, so a stale selection can never grab a far camera). */
  station: number
  position: THREE.Vector3
  lookAt: THREE.Vector3
}

const projectPoses: FocusPose[] = PROJECT_SITES.map(site => {
  const screenY = site.height * 0.45
  return {
    station: 2,
    // Hover in the avenue, quartering onto the tower's screen face. Pulled
    // back far enough that the billboard, stat holograms, crown, and street
    // inlay share the frame — and aimed a touch south so the screen sits
    // right of the HUD panel instead of behind it.
    position: new THREE.Vector3(site.x - 16, screenY + 2.6, site.z + 8),
    lookAt: new THREE.Vector3(site.x - 4.15, screenY - 0.2, site.z - 1.5),
  }
})

const rolePoses: FocusPose[] = content.experiences.map((_, i) => {
  const z = transitStopZ(i)
  return {
    station: 1,
    // Just off the platform edge, slightly above the beam, angled down the
    // line — with the aim biased so the stop's signage clears the HUD panel.
    position: new THREE.Vector3(TRANSIT.x + 10.2, TRANSIT.beamY + 2.4, z + 6.2),
    lookAt: new THREE.Vector3(TRANSIT.x - 1, TRANSIT.beamY + 0.9, z + 1.5),
  }
})

export function focusPose(selection: GridSelection): FocusPose | null {
  if (selection.focus === 'project') return projectPoses[selection.project] ?? null
  if (selection.focus === 'role' && selection.role !== null) return rolePoses[selection.role] ?? null
  return null
}
