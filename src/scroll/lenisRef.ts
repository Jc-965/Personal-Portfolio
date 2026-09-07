import type Lenis from 'lenis'

/**
 * The live Lenis instance, when the smooth-scroll engine is running.
 * Type-only import keeps lenis itself out of any bundle that reads this.
 * Consumers that drive scrolling must go through Lenis while it is active,
 * because it re-applies its own eased position over native scrolls mid-flight.
 */
export const lenisRef: { current: Lenis | null } = { current: null }
