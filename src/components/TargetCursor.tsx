import { useCallback, useEffect, useMemo, useRef } from 'react'
import { gsap } from 'gsap'

interface TargetCursorProps {
  targetSelector?: string
  spinDuration?: number
  hideDefaultCursor?: boolean
  hoverDuration?: number
  parallaxOn?: boolean
}

const wrapperStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: 0,
  height: 0,
  pointerEvents: 'none',
  zIndex: 100000,
  mixBlendMode: 'screen',
} as const

const cornerBaseStyle = {
  position: 'absolute',
  left: 0,
  top: 0,
  width: 12,
  height: 12,
  border: '2px solid rgba(0, 255, 255, 0.95)',
  boxShadow: '0 0 10px rgba(0, 255, 255, 0.2)',
  opacity: 0,
  willChange: 'transform',
} as const

const cornerStyles = [
  {
    borderRight: 'none',
    borderBottom: 'none',
  },
  {
    borderLeft: 'none',
    borderBottom: 'none',
  },
  {
    borderLeft: 'none',
    borderTop: 'none',
  },
  {
    borderRight: 'none',
    borderTop: 'none',
  },
] as const

export default function TargetCursor({
  targetSelector = 'a, button, input, textarea, [data-cursor]',
  spinDuration = 2,
  hideDefaultCursor = true,
  hoverDuration = 0.2,
  parallaxOn = true,
}: TargetCursorProps) {
  const cursorRef = useRef<HTMLDivElement>(null)
  const cornersRef = useRef<NodeListOf<HTMLDivElement> | null>(null)
  const spinTl = useRef<gsap.core.Timeline | null>(null)
  const targetCornerPositionsRef = useRef<{ x: number; y: number }[] | null>(null)
  const tickerFnRef = useRef<(() => void) | null>(null)
  const activeStrengthRef = useRef({ current: 0 })
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null)

  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return true
    const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    const isSmallScreen = window.innerWidth <= 768
    const userAgent = navigator.userAgent || navigator.vendor || ''
    const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i
    const isMobileUserAgent = mobileRegex.test(userAgent.toLowerCase())
    return (hasTouchScreen && isSmallScreen) || isMobileUserAgent
  }, [])

  const constants = useMemo(() => ({ borderWidth: 2, cornerSize: 12 }), [])

  const moveCursor = useCallback((x: number, y: number) => {
    if (!cursorRef.current) return
    gsap.set(cursorRef.current, { x, y })
  }, [])

  useEffect(() => {
    if (isMobile || !cursorRef.current) return

    const cursor = cursorRef.current
    const activeStrength = activeStrengthRef.current
    const root = document.documentElement
    const originalCursor = document.body.style.cursor
    cornersRef.current = cursor.querySelectorAll<HTMLDivElement>('.target-cursor-corner')

    let activeTarget: Element | null = null
    let resumeTimeout: ReturnType<typeof setTimeout> | null = null

    if (hideDefaultCursor) {
      document.body.style.cursor = 'none'
    }

    gsap.set(cursor, {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    })

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const createSpinTimeline = () => {
      spinTl.current?.kill()
      // Honour reduced-motion: skip the perpetual rotation entirely. All other
      // spinTl uses are optional-chained/guarded, so leaving it null is safe and
      // the reticle simply stays static (snapping to targets still works).
      if (prefersReducedMotion) {
        spinTl.current = null
        return
      }
      spinTl.current = gsap.timeline({ repeat: -1 }).to(cursor, {
        rotation: '+=360',
        duration: spinDuration,
        ease: 'none',
      })
    }

    const getCornerResetPositions = () => {
      const { cornerSize } = constants

      return [
        { x: -cornerSize * 1.5, y: -cornerSize * 1.5 },
        { x: cornerSize * 0.5, y: -cornerSize * 1.5 },
        { x: cornerSize * 0.5, y: cornerSize * 0.5 },
        { x: -cornerSize * 1.5, y: cornerSize * 0.5 },
      ]
    }

    const getTargetCornerPositions = (target: Element) => {
      const rect = target.getBoundingClientRect()
      const { borderWidth, cornerSize } = constants

      return [
        { x: rect.left - borderWidth, y: rect.top - borderWidth },
        { x: rect.right + borderWidth - cornerSize, y: rect.top - borderWidth },
        { x: rect.right + borderWidth - cornerSize, y: rect.bottom + borderWidth - cornerSize },
        { x: rect.left - borderWidth, y: rect.bottom + borderWidth - cornerSize },
      ]
    }

    const getPointerPosition = () => {
      if (lastPointerRef.current) return lastPointerRef.current

      return {
        x: gsap.getProperty(cursorRef.current, 'x') as number,
        y: gsap.getProperty(cursorRef.current, 'y') as number,
      }
    }

    const scheduleSpinResume = () => {
      if (resumeTimeout) {
        clearTimeout(resumeTimeout)
      }

      resumeTimeout = setTimeout(() => {
        if (!activeTarget && cursorRef.current && spinTl.current) {
          const currentRotation = gsap.getProperty(cursorRef.current, 'rotation') as number
          const normalizedRotation = currentRotation % 360

          spinTl.current.kill()
          spinTl.current = gsap.timeline({ repeat: -1 }).to(cursorRef.current, {
            rotation: '+=360',
            duration: spinDuration,
            ease: 'none',
          })

          gsap.to(cursorRef.current, {
            rotation: normalizedRotation + 360,
            duration: spinDuration * (1 - normalizedRotation / 360),
            ease: 'none',
            onComplete: () => {
              spinTl.current?.restart()
            },
          })
        }

        resumeTimeout = null
      }, 50)
    }

    createSpinTimeline()

    const tickerFn = () => {
      if (!cursorRef.current || !cornersRef.current || !activeTarget) return
      const strength = activeStrengthRef.current.current
      if (strength === 0) return

      const { x: cursorX, y: cursorY } = getPointerPosition()
      targetCornerPositionsRef.current = getTargetCornerPositions(activeTarget)

      Array.from(cornersRef.current).forEach((corner, i) => {
        const currentX = gsap.getProperty(corner, 'x') as number
        const currentY = gsap.getProperty(corner, 'y') as number
        const targetX = targetCornerPositionsRef.current![i].x - cursorX
        const targetY = targetCornerPositionsRef.current![i].y - cursorY
        const finalX = currentX + (targetX - currentX) * strength
        const finalY = currentY + (targetY - currentY) * strength
        const duration = strength >= 0.99 ? (parallaxOn ? 0.2 : 0) : 0.05

        gsap.to(corner, {
          x: finalX,
          y: finalY,
          duration,
          ease: duration === 0 ? 'none' : 'power1.out',
          overwrite: 'auto',
        })
      })
    }

    tickerFnRef.current = tickerFn

    const deactivateTarget = (skipSpinResume = false) => {
      if (!cornersRef.current) return

      activeTarget = null
      targetCornerPositionsRef.current = null
      gsap.ticker.remove(tickerFnRef.current!)
      gsap.set(activeStrengthRef.current, { current: 0, overwrite: true })

      const corners = Array.from(cornersRef.current)
      const positions = getCornerResetPositions()
      corners.forEach((corner, index) => {
        gsap.killTweensOf(corner)
        gsap.to(corner, {
          x: positions[index].x,
          y: positions[index].y,
          opacity: 0,
          duration: 0.18,
          ease: 'power3.out',
          overwrite: 'auto',
        })
      })

      if (!skipSpinResume) {
        scheduleSpinResume()
      }
    }

    const activateTarget = (target: Element) => {
      if (!cursorRef.current || !cornersRef.current) return

      if (resumeTimeout) {
        clearTimeout(resumeTimeout)
        resumeTimeout = null
      }

      const isStartingHover = activeTarget === null
      activeTarget = target

      const corners = Array.from(cornersRef.current)
      const { x: cursorX, y: cursorY } = getPointerPosition()
      targetCornerPositionsRef.current = getTargetCornerPositions(target)

      if (isStartingHover) {
        corners.forEach(corner => gsap.killTweensOf(corner))
        gsap.killTweensOf(cursorRef.current, 'rotation')
        spinTl.current?.pause()
        gsap.set(cursorRef.current, { rotation: 0 })
        gsap.to(corners, { opacity: 1, duration: 0.12, overwrite: 'auto' })
        gsap.ticker.add(tickerFnRef.current!)
        gsap.to(activeStrengthRef.current, {
          current: 1,
          duration: hoverDuration,
          ease: 'power2.out',
        })
      }

      corners.forEach((corner, i) => {
        gsap.to(corner, {
          x: targetCornerPositionsRef.current![i].x - cursorX,
          y: targetCornerPositionsRef.current![i].y - cursorY,
          duration: isStartingHover ? 0.2 : 0.12,
          ease: 'power2.out',
          overwrite: 'auto',
        })
      })
    }

    const resolveTargetAtPoint = (x: number, y: number) => (
      document.elementFromPoint(x, y)?.closest(targetSelector) ?? null
    )

    const isSketchbookActive = () => root.classList.contains('sketchbook-mode')

    const resolveTargetFromLastPoint = () => {
      if (!lastPointerRef.current) return null
      return resolveTargetAtPoint(lastPointerRef.current.x, lastPointerRef.current.y)
    }

    const syncTarget = (candidate: Element | null) => {
      if (candidate) {
        activateTarget(candidate)
        return
      }

      if (activeTarget) {
        deactivateTarget()
      }
    }

    const moveHandler = (e: MouseEvent) => {
      if (isSketchbookActive()) {
        lastPointerRef.current = null
        if (activeTarget) {
          deactivateTarget()
        }
        return
      }

      lastPointerRef.current = { x: e.clientX, y: e.clientY }
      moveCursor(e.clientX, e.clientY)
      syncTarget(resolveTargetAtPoint(e.clientX, e.clientY))
    }

    const scrollHandler = () => {
      if (isSketchbookActive()) return
      syncTarget(resolveTargetFromLastPoint())
    }

    const syncSketchbookState = () => {
      if (!isSketchbookActive()) return
      lastPointerRef.current = null
      if (activeTarget) {
        deactivateTarget()
      }
    }

    const classObserver = new MutationObserver(syncSketchbookState)
    classObserver.observe(root, { attributes: true, attributeFilter: ['class'] })
    syncSketchbookState()

    const pageLeaveHandler = () => {
      lastPointerRef.current = null
      if (activeTarget) {
        deactivateTarget()
      }
    }

    const mouseDownHandler = () => {
      if (!cursorRef.current) return
      const corners = cornersRef.current ? Array.from(cornersRef.current) : []

      gsap.killTweensOf(cursorRef.current)
      if (corners.length > 0) gsap.killTweensOf(corners)

      gsap.to(cursorRef.current, { scale: 0.84, duration: 0.14, ease: 'power2.out', overwrite: 'auto' })

      if (corners.length > 0) {
        gsap.fromTo(
          corners,
          { scale: 1 },
          { scale: 0.78, duration: 0.14, ease: 'power2.out', yoyo: true, repeat: 1, overwrite: 'auto' },
        )
      }
    }

    const mouseUpHandler = () => {
      if (!cursorRef.current) return
      gsap.to(cursorRef.current, { scale: 1, duration: 0.24, ease: 'power3.out', overwrite: 'auto' })
    }

    window.addEventListener('mousemove', moveHandler)
    window.addEventListener('scroll', scrollHandler, { passive: true })
    window.addEventListener('mousedown', mouseDownHandler)
    window.addEventListener('mouseup', mouseUpHandler)
    window.addEventListener('blur', pageLeaveHandler)
    document.addEventListener('mouseleave', pageLeaveHandler)

    return () => {
      if (tickerFnRef.current) {
        gsap.ticker.remove(tickerFnRef.current)
      }
      window.removeEventListener('mousemove', moveHandler)
      window.removeEventListener('scroll', scrollHandler)
      window.removeEventListener('mousedown', mouseDownHandler)
      window.removeEventListener('mouseup', mouseUpHandler)
      window.removeEventListener('blur', pageLeaveHandler)
      document.removeEventListener('mouseleave', pageLeaveHandler)
      classObserver.disconnect()
      if (resumeTimeout) {
        clearTimeout(resumeTimeout)
      }
      if (activeTarget) {
        deactivateTarget(true)
      }
      spinTl.current?.kill()
      if (hideDefaultCursor) {
        document.body.style.cursor = originalCursor
      }
      targetCornerPositionsRef.current = null
      activeStrength.current = 0
    }
  }, [constants, hideDefaultCursor, hoverDuration, isMobile, moveCursor, parallaxOn, spinDuration, targetSelector])

  useEffect(() => {
    if (isMobile || !cursorRef.current || !spinTl.current) return
    if (spinTl.current.isActive()) {
      spinTl.current.kill()
      spinTl.current = gsap.timeline({ repeat: -1 }).to(cursorRef.current, {
        rotation: '+=360',
        duration: spinDuration,
        ease: 'none',
      })
    }
  }, [isMobile, spinDuration])

  if (isMobile) return null

  return (
    <div ref={cursorRef} className="target-cursor" aria-hidden="true" style={wrapperStyle}>
      {cornerStyles.map((cornerStyle, index) => (
        <div
          key={index}
          className="target-cursor-corner"
          style={{ ...cornerBaseStyle, ...cornerStyle }}
        />
      ))}
    </div>
  )
}
