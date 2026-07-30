import type { MutableRefObject } from 'react'

/**
 * The bridge between the DOM shell (overlay + HUD) and the 3D world.
 * Selection is two-way: HUD tabs and in-world clicks drive the same state,
 * so pointing at a tower and pressing a tab are the same gesture.
 */

export interface SkyState {
  count: number
  live: boolean
  /** This browser owns a star it can drag in the 3D sky. */
  ownStar: boolean
}

export interface SkyTooltip {
  x: number
  y: number
  text: string
  color: string
}

export interface GridSelection {
  /** Selected project index (always one active). */
  project: number
  /** Selected journey role index, or null when none is focused. */
  role: number | null
  /** Which selection the camera is flown onto, if any. Explicit picks set
   * this; scrolling off the station or clicking empty street clears it. */
  focus: 'project' | 'role' | null
}

export interface GridInteraction {
  progressRef: MutableRefObject<number>
  dragActiveRef?: MutableRefObject<boolean>
  onSky?: (state: SkyState) => void
  onTooltip?: (tooltip: SkyTooltip | null) => void
  selection: GridSelection
  onSelectProject: (index: number) => void
  onSelectRole: (index: number | null) => void
}
