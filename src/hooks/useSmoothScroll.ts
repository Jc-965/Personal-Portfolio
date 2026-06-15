import { useEffect, useRef } from 'react'
import Lenis from 'lenis'

/**
 * Site-wide inertial smooth scrolling (Lenis). Desktop pointer devices only:
 * touch scrolling is already native-smooth, and reduced-motion users keep
 * default scrolling. `anchors: true` keeps the navbar # links working.
 */
export default function useSmoothScroll(enabled: boolean) {
  const lenisRef = useRef<Lenis | null>(null)

  useEffect(() => {
    if (!enabled) return undefined
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const coarse = window.matchMedia('(pointer: coarse)').matches
    if (reduced || coarse) return undefined

    const lenis = new Lenis({
      duration: 1.1,
      anchors: true,
    })
    lenisRef.current = lenis

    let frame = 0
    const loop = (time: number) => {
      lenis.raf(time)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(frame)
      lenis.destroy()
      lenisRef.current = null
    }
  }, [enabled])

  return lenisRef
}
