/**
 * Imperative, React-free signal that says whether an opaque stage (the hero's
 * terminal sheet or the teardown chapter's stage) currently spans the whole
 * viewport. While any producer covers, anything fixed beneath (the page
 * background canvas) is invisible and can skip painting.
 *
 * Written by AsciiWorld and TeardownCanvas on scroll and resize, read by Background per change.
 */

type CoverListener = (covering: boolean) => void

const sources = new Set<string>()
const listeners = new Set<CoverListener>()

/** Marks one producer as covering or not. Listeners hear only changes to the combined state. */
export function setCovering(source: string, next: boolean) {
  const before = sources.size > 0
  if (next) sources.add(source)
  else sources.delete(source)
  const after = sources.size > 0
  if (after !== before) listeners.forEach((listener) => listener(after))
}

export function setHeroCovering(next: boolean) {
  setCovering('hero', next)
}

export function isHeroCovering() {
  return sources.size > 0
}

/** Subscribe to cover changes. Returns the unsubscribe function. */
export function onHeroCover(listener: CoverListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
