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
  /** The next sky click will place or reposition the visitor's star. */
  placing: boolean
  color: string
  message: string
  savingMessage: boolean
  error: string | null
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

export interface GridSkyController {
  requestPlacement: () => void
  cancelPlacement: () => void
  setColor: (color: string) => void
  saveMessage: (message: string) => Promise<boolean>
}

export interface GridInteraction {
  progressRef: MutableRefObject<number>
  dragActiveRef?: MutableRefObject<boolean>
  onSky?: (state: SkyState) => void
  onSkyController?: (controller: GridSkyController | null) => void
  onTooltip?: (tooltip: SkyTooltip | null) => void
  selection: GridSelection
  onSelectProject: (index: number) => void
  /** Select a journey role. Pass `{ inspect: false }` to update the dossier
   * without locking the camera; in-world clicks and inspect actions default
   * to flying the camera onto the stop. */
  onSelectRole: (index: number | null, options?: { inspect?: boolean }) => void
  /** Begin an in-world star placement/reposition gesture. */
  onPlaceStar?: () => void
}
