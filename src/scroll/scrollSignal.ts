/**
 * Imperative, React-free scroll signal. A single source of truth for global
 * scroll progress (0..1) and velocity, pumped once per frame by ScrollProvider.
 *
 * Consumers that animate per-frame on a canvas (e.g. Background) read it
 * imperatively via getScrollProgress() — no React re-renders. React components
 * that want reactive parallax should prefer framer-motion's useScroll instead;
 * this is only for the non-React render loops.
 */

type ScrollListener = (progress: number, velocity: number) => void

let progress = 0
let velocity = 0
let lastY = 0
let lastTime = 0
let maxScroll = 0

const listeners = new Set<ScrollListener>()

/** Refresh after viewport or document geometry changes, never in a hot frame loop. */
export function refreshScrollBounds() {
  maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
}

/** Called once per animation frame by ScrollProvider's rAF loop. */
export function updateScrollSignal(time: number) {
  const doc = document.documentElement
  const y = window.scrollY || doc.scrollTop || 0
  const next = maxScroll > 0 ? Math.min(1, Math.max(0, y / maxScroll)) : 0
  const dt = lastTime ? Math.max(1, time - lastTime) : 16
  velocity = (y - lastY) / dt
  progress = next
  lastY = y
  lastTime = time
  if (listeners.size) listeners.forEach((l) => l(progress, velocity))
}

export function getScrollProgress() {
  return progress
}

export function getScrollVelocity() {
  return velocity
}

/** Subscribe to per-frame scroll updates (for non-React render loops). */
export function onScroll(cb: ScrollListener) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
