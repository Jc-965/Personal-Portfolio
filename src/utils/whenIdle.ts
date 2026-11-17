/**
 * Idle scheduling for work that can wait. This module imports nothing, so a component can use it without pulling
 * a renderer into its chunk.
 */

/** Runs `run` in an idle period, or after `timeout` ms at the latest. Returns a function that cancels the run. */
export function whenIdle(run: () => void, timeout: number): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout })
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(run, 1)
  return () => window.clearTimeout(id)
}

/** True when the visitor asked for reduced data use or is on a 2g connection, where nothing loads ahead of need. */
export function savesData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  return !!connection && (connection.saveData === true || /2g$/.test(connection.effectiveType ?? ''))
}

/** Milliseconds without a scroll event after which the page counts as resting. */
const SCROLL_REST_MS = 100

/**
 * Runs `run` once the page has not scrolled for SCROLL_REST_MS, or after `maxWait` ms at the latest. A build of
 * tens of milliseconds freezes a smooth scroll that is in progress and passes unseen while the page is still.
 * Returns a function that cancels the run.
 */
export function whenScrollRests(run: () => void, maxWait: number): () => void {
  let rest = 0
  let deadline = 0
  const cancel = () => {
    window.clearTimeout(rest)
    window.clearTimeout(deadline)
    window.removeEventListener('scroll', onScroll)
  }
  const done = () => {
    cancel()
    run()
  }
  const onScroll = () => {
    window.clearTimeout(rest)
    rest = window.setTimeout(done, SCROLL_REST_MS)
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  rest = window.setTimeout(done, SCROLL_REST_MS)
  deadline = window.setTimeout(done, maxWait)
  return cancel
}
