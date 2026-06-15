import { useEffect } from 'react'
import Lenis from 'lenis'
import { updateScrollSignal } from './scrollSignal'

/**
 * Owns the site-wide scroll engine. Mounted once (after the loading screen).
 *
 * - Lenis provides weighted inertial smooth scrolling on desktop pointer
 *   devices. Touch + reduced-motion keep native scrolling (already smooth /
 *   respectful of user preference). Lenis scrolls the real window, so native
 *   `position: sticky` scenes and anchor links keep working.
 * - A single rAF loop drives Lenis and refreshes the imperative scrollSignal,
 *   which the WebGL background reads per-frame.
 *
 * Renders no DOM. Idempotent under StrictMode double-invoke.
 */
export default function ScrollProvider() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const useLenis = !reduce && !coarse

    let lenis: Lenis | null = null
    if (useLenis) {
      lenis = new Lenis({
        duration: 1.15,
        anchors: true,
        lerp: 0.1,
        wheelMultiplier: 1,
      })
      document.documentElement.classList.add('lenis-active')
    }

    let rafId = 0
    const raf = (time: number) => {
      lenis?.raf(time)
      updateScrollSignal(time)
      rafId = requestAnimationFrame(raf)
    }
    rafId = requestAnimationFrame(raf)

    return () => {
      cancelAnimationFrame(rafId)
      lenis?.destroy()
      document.documentElement.classList.remove('lenis-active')
    }
  }, [])

  return null
}
