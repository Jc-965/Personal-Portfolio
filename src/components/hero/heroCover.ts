/**
 * Imperative, React-free signal that says whether the hero's opaque terminal
 * sheet currently spans the whole viewport. While it does, anything fixed
 * beneath it (the page background canvas) is invisible and can skip painting.
 *
 * Written by AsciiWorld on scroll and resize, read by Background per change.
 */

type CoverListener = (covering: boolean) => void

let covering = false
const listeners = new Set<CoverListener>()

export function setHeroCovering(next: boolean) {
  if (next === covering) return
  covering = next
  listeners.forEach((listener) => listener(next))
}

export function isHeroCovering() {
  return covering
}

/** Subscribe to cover changes. Returns the unsubscribe function. */
export function onHeroCover(listener: CoverListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
