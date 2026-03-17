import { useRef, useEffect, useState, useCallback } from 'react'

export function useScrollTransition(sectionRef: React.RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0)
  const progressRef = useRef(0)
  const rafId = useRef(0)

  const updateProgress = useCallback(() => {
    const el = sectionRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const vh = window.innerHeight

    // progress: 0 when section top is at bottom of viewport, 1 when top is at top
    const raw = 1.0 - rect.top / vh
    const clamped = Math.max(0, Math.min(1, raw))

    if (Math.abs(clamped - progressRef.current) > 0.001) {
      progressRef.current = clamped
      setProgress(clamped)
    }
  }, [sectionRef])

  useEffect(() => {
    const onScroll = () => {
      cancelAnimationFrame(rafId.current)
      rafId.current = requestAnimationFrame(updateProgress)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    updateProgress()

    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(rafId.current)
    }
  }, [updateProgress])

  return { progress, progressRef }
}
