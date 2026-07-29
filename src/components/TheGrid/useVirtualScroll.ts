import { useCallback, useEffect, useRef, type RefObject, type MutableRefObject } from 'react'
import { STATION_COUNT, stationT } from './gridConfig'

/**
 * Virtual scroll for the Grid. A DOM scroller can't drive the rail: the
 * canvas layer is position:fixed, and browsers resolve wheel/touch scrolling
 * up the containing-block chain (which for fixed elements is the viewport),
 * so gestures over the scene never reached the scroller. Owning the gesture
 * also lets the sky-station star drag suspend travel cleanly, and leaves the
 * canvas free to take pointer events.
 */

// Wheel pixels for the full journey. Long enough that a leg is a deliberate
// gesture, short enough that flicking through the city stays snappy.
const WHEEL_LENGTH_PX = 9000
// Touch drags map a bit faster than wheel — thumbs travel less than wheels.
const TOUCH_MULTIPLIER = 2.2

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

export interface VirtualScroll {
  /** Current target progress 0..1 — the camera rig damps toward this. */
  progressRef: MutableRefObject<number>
  /** Animate to a station (eased, duration scaled by distance). */
  navigate: (index: number) => void
  setProgress: (progress: number) => void
}

export function useVirtualScroll(
  rootRef: RefObject<HTMLElement | null>,
  {
    enabled,
    reducedMotion,
    dragActiveRef,
    onProgress,
  }: {
    enabled: boolean
    reducedMotion: boolean
    /** While true (star drag in flight), travel gestures are ignored. */
    dragActiveRef?: RefObject<boolean>
    onProgress?: (progress: number) => void
  },
): VirtualScroll {
  const progressRef = useRef(0)
  const animFrame = useRef(0)
  const inertiaFrame = useRef(0)
  const onProgressRef = useRef(onProgress)
  useEffect(() => {
    onProgressRef.current = onProgress
  }, [onProgress])

  const stopAnimations = useCallback(() => {
    if (animFrame.current) window.cancelAnimationFrame(animFrame.current)
    if (inertiaFrame.current) window.cancelAnimationFrame(inertiaFrame.current)
    animFrame.current = 0
    inertiaFrame.current = 0
  }, [])

  const setProgress = useCallback((progress: number) => {
    const next = Math.min(1, Math.max(0, progress))
    progressRef.current = next
    onProgressRef.current?.(next)
  }, [])

  const navigate = useCallback(
    (index: number) => {
      stopAnimations()
      const from = progressRef.current
      const to = stationT(Math.min(STATION_COUNT - 1, Math.max(0, index)))
      if (reducedMotion || Math.abs(to - from) < 1e-4) {
        setProgress(to)
        return
      }
      const legs = Math.abs(to - from) * (STATION_COUNT - 1)
      const duration = Math.min(2200, 550 + legs * 450)
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration)
        setProgress(from + (to - from) * easeInOutCubic(t))
        if (t < 1) animFrame.current = window.requestAnimationFrame(step)
        else animFrame.current = 0
      }
      animFrame.current = window.requestAnimationFrame(step)
    },
    [reducedMotion, setProgress, stopAnimations],
  )

  useEffect(() => {
    const root = rootRef.current
    if (!root || !enabled) return undefined

    // Gestures over the HUD panel scroll the panel, not the city.
    const overPanel = (target: EventTarget | null) =>
      target instanceof Element && target.closest('.grid-hud__panel') !== null

    const onWheel = (e: WheelEvent) => {
      if (overPanel(e.target) || dragActiveRef?.current) return
      stopAnimations()
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      setProgress(progressRef.current + delta / WHEEL_LENGTH_PX)
    }

    let lastY = 0
    let lastT = 0
    let velocity = 0 // progress units per ms
    let touching = false

    const onTouchStart = (e: TouchEvent) => {
      if (overPanel(e.target) || dragActiveRef?.current) return
      stopAnimations()
      touching = true
      lastY = e.touches[0].clientY
      lastT = performance.now()
      velocity = 0
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!touching || dragActiveRef?.current) return
      const y = e.touches[0].clientY
      const now = performance.now()
      const dy = (lastY - y) * TOUCH_MULTIPLIER
      const dp = dy / WHEEL_LENGTH_PX
      const dt = Math.max(1, now - lastT)
      velocity = 0.8 * velocity + 0.2 * (dp / dt)
      lastY = y
      lastT = now
      setProgress(progressRef.current + dp)
      // Stop iOS rubber-banding / pull-to-refresh under the overlay.
      if (e.cancelable) e.preventDefault()
    }

    const onTouchEnd = () => {
      if (!touching) return
      touching = false
      if (reducedMotion || Math.abs(velocity) < 1e-5) return
      let v = velocity
      let prev = performance.now()
      const glide = (now: number) => {
        const dt = now - prev
        prev = now
        setProgress(progressRef.current + v * dt)
        v *= Math.exp(-dt / 320)
        if (Math.abs(v) > 4e-6) inertiaFrame.current = window.requestAnimationFrame(glide)
        else inertiaFrame.current = 0
      }
      inertiaFrame.current = window.requestAnimationFrame(glide)
    }

    root.addEventListener('wheel', onWheel, { passive: true })
    root.addEventListener('touchstart', onTouchStart, { passive: true })
    root.addEventListener('touchmove', onTouchMove, { passive: false })
    root.addEventListener('touchend', onTouchEnd, { passive: true })
    root.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      stopAnimations()
      root.removeEventListener('wheel', onWheel)
      root.removeEventListener('touchstart', onTouchStart)
      root.removeEventListener('touchmove', onTouchMove)
      root.removeEventListener('touchend', onTouchEnd)
      root.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [rootRef, enabled, reducedMotion, dragActiveRef, setProgress, stopAnimations])

  return { progressRef, navigate, setProgress }
}
