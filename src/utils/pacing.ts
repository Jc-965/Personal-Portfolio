/**
 * Frame pacing that follows what the device can do. A canvas that tracks the scroll paints on every display
 * frame, which a fast GPU holds easily and a slow one cannot. A follow gate watches the frames that come after
 * such a paint and tells the canvas to drop to every second frame while they arrive late. This module imports
 * nothing, so any chunk can use it.
 */

/** The display's frame interval in ms, 60 Hz until refreshInterval has measured it. */
let refreshMs = 1000 / 60
let probed = false

/**
 * The display's frame interval in ms. The first call starts one short measurement over 20 animation frames and
 * takes their lower quartile, so a few late frames during page load do not lengthen it.
 */
export function refreshInterval(): number {
  if (!probed) {
    probed = true
    const deltas: number[] = []
    let last = 0
    const step = (time: number) => {
      if (last) deltas.push(time - last)
      last = time
      if (deltas.length < 20) requestAnimationFrame(step)
      else refreshMs = Math.min(34, Math.max(4, deltas.sort((a, b) => a - b)[5]))
    }
    requestAnimationFrame(step)
  }
  return refreshMs
}

/** A frame this many display intervals after the one before it arrived late. */
const LATE = 1.6
/** Late frames, net of on-time ones, that start a back-off, and how long the back-off lasts in ms. */
const LATE_FRAMES = 24
const BACK_OFF_MS = 6000

/**
 * Returns a gate to call once per animation frame with the frame's time, the time since the frame before it, and
 * whether that frame before it painted. The gate returns true while a paint on every display frame is holding
 * the display's rate, and false for BACK_OFF_MS after LATE_FRAMES such paints were followed by a late frame.
 */
export function createFollowGate(): (now: number, delta: number, painted: boolean) => boolean {
  let late = 0
  let until = 0
  return (now, delta, painted) => {
    const refresh = refreshInterval()
    // A gap of a quarter second is a pause or a long task elsewhere, which says nothing about the paint's cost.
    if (painted && delta > 0 && delta < 250) {
      late = delta > refresh * LATE ? late + 1 : Math.max(0, late - 1)
      if (late >= LATE_FRAMES) {
        late = 0
        until = now + BACK_OFF_MS
      }
    }
    return now >= until
  }
}
