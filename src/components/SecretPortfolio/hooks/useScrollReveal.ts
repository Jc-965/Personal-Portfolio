import { useRef, useEffect, useState, useCallback } from 'react'

interface ScrollRevealOptions {
  threshold?: number
  rootMargin?: string
  once?: boolean
}

export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options: ScrollRevealOptions = {}
) {
  const { threshold = 0.15, rootMargin = '0px 0px -60px 0px', once = true } = options
  const ref = useRef<T>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          if (once) observer.unobserve(el)
        } else if (!once) {
          setIsVisible(false)
        }
      },
      { threshold, rootMargin }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, rootMargin, once])

  return { ref, isVisible }
}

/** Hook to track scroll progress within a container (0–1) */
export function useScrollProgress(containerRef: React.RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      const max = scrollHeight - clientHeight
      setProgress(max > 0 ? scrollTop / max : 0)
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [containerRef])

  return progress
}

/** Returns a scroll-linked value for parallax. factor=1 means normal, factor=0.5 means half speed */
export function useParallaxOffset(
  containerRef: React.RefObject<HTMLElement | null>,
  factor: number = 0.5
) {
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onScroll = () => {
      setOffset(el.scrollTop * factor)
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [containerRef, factor])

  return offset
}

/** Mouse tilt effect for cards — returns style object with perspective transform */
export function useMouseTilt(intensity: number = 8) {
  const ref = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const el = ref.current
    if (!el) return
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      if (!el) return
      const rect = el.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2
      el.style.transform = `perspective(600px) rotateX(${y * -intensity}deg) rotateY(${x * intensity}deg)`
    })
  }, [intensity])

  const onMouseLeave = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    if (ref.current) {
      ref.current.style.transform = 'perspective(600px) rotateX(0deg) rotateY(0deg)'
      ref.current.style.transition = 'transform 0.4s ease'
      setTimeout(() => {
        if (ref.current) ref.current.style.transition = ''
      }, 400)
    }
  }, [])

  return { ref, onMouseMove, onMouseLeave }
}
