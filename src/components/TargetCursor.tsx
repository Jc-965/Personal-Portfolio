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
  transform: 'translate(-50%, -50%)',
} as const

const dotStyle = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: 4,
  height: 4,
  background: '#ffffff',
  borderRadius: '50%',
  boxShadow: '0 0 12px rgba(0, 255, 255, 0.45)',
  transform: 'translate(-50%, -50%)',
  willChange: 'transform',
} as const

const cornerBaseStyle = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: 12,
  height: 12,
  border: '2px solid rgba(0, 255, 255, 0.95)',
  boxShadow: '0 0 10px rgba(0, 255, 255, 0.2)',
  opacity: 0,
  willChange: 'transform',
} as const

const cornerStyles = [
  {
    transform: 'translate(-150%, -150%)',
    borderRight: 'none',
    borderBottom: 'none',
  },
  {
    transform: 'translate(50%, -150%)',
    borderLeft: 'none',
    borderBottom: 'none',
  },
  {
    transform: 'translate(50%, 50%)',
    borderLeft: 'none',
    borderTop: 'none',
  },
  {
    transform: 'translate(-150%, 50%)',
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
  const dotRef = useRef<HTMLDivElement>(null)
  const targetCornerPositionsRef = useRef<{ x: number; y: number }[] | null>(null)
  const tickerFnRef = useRef<(() => void) | null>(null)
  const activeStrengthRef = useRef({ current: 0 })

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

  const quickXRef = useRef<gsap.QuickToFunc | null>(null)
  const quickYRef = useRef<gsap.QuickToFunc | null>(null)

  const moveCursor = useCallback((x: number, y: number) => {
    if (!cursorRef.current) return
    if (!quickXRef.current || !quickYRef.current) {
      quickXRef.current = gsap.quickTo(cursorRef.current, 'x', { duration: 0.1, ease: 'power3.out' })
      quickYRef.current = gsap.quickTo(cursorRef.current, 'y', { duration: 0.1, ease: 'power3.out' })
    }
    quickXRef.current(x)
    quickYRef.current(y)
  }, [])

  useEffect(() => {
    if (isMobile || !cursorRef.current) return

    if (hideDefaultCursor) {
      document.body.style.setProperty('cursor', 'none', 'important')
    }

    const cursor = cursorRef.current
    cornersRef.current = cursor.querySelectorAll<HTMLDivElement>('.target-cursor-corner')

    let activeTarget: Element | null = null
    let currentLeaveHandler: (() => void) | null = null
    let resumeTimeout: ReturnType<typeof setTimeout> | null = null

    const cleanupTarget = (target: Element) => {
      if (currentLeaveHandler) {
        target.removeEventListener('mouseleave', currentLeaveHandler)
      }
      currentLeaveHandler = null
    }

    gsap.set(cursor, {
      xPercent: -50,
      yPercent: -50,
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    })

    const createSpinTimeline = () => {
      spinTl.current?.kill()
      spinTl.current = gsap.timeline({ repeat: -1 }).to(cursor, {
        rotation: '+=360',
        duration: spinDuration,
        ease: 'none',
      })
    }

    createSpinTimeline()

    const tickerFn = () => {
      if (!targetCornerPositionsRef.current || !cursorRef.current || !cornersRef.current) return
      const strength = activeStrengthRef.current.current
      if (strength === 0) return

      const cursorX = gsap.getProperty(cursorRef.current, 'x') as number
      const cursorY = gsap.getProperty(cursorRef.current, 'y') as number

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

    const moveHandler = (e: MouseEvent) => moveCursor(e.clientX, e.clientY)
    const scrollHandler = () => {
      if (!activeTarget || !cursorRef.current) return

      const mouseX = gsap.getProperty(cursorRef.current, 'x') as number
      const mouseY = gsap.getProperty(cursorRef.current, 'y') as number
      const elementUnderMouse = document.elementFromPoint(mouseX, mouseY)
      const isStillOverTarget =
        elementUnderMouse &&
        (elementUnderMouse === activeTarget || elementUnderMouse.closest(targetSelector) === activeTarget)

      if (!isStillOverTarget) {
        currentLeaveHandler?.()
      } else if (targetCornerPositionsRef.current && cornersRef.current) {
        // Update corner positions when scrolling so they track the element
        const rect = activeTarget.getBoundingClientRect()
        const { borderWidth, cornerSize } = constants
        targetCornerPositionsRef.current = [
          { x: rect.left - borderWidth, y: rect.top - borderWidth },
          { x: rect.right + borderWidth - cornerSize, y: rect.top - borderWidth },
          { x: rect.right + borderWidth - cornerSize, y: rect.bottom + borderWidth - cornerSize },
          { x: rect.left - borderWidth, y: rect.bottom + borderWidth - cornerSize },
        ]
      }
    }

    const mouseDownHandler = () => {
      if (!dotRef.current || !cursorRef.current) return
      gsap.to(dotRef.current, { scale: 0.7, duration: 0.3 })
      gsap.to(cursorRef.current, { scale: 0.9, duration: 0.2 })
    }

    const mouseUpHandler = () => {
      if (!dotRef.current || !cursorRef.current) return
      gsap.to(dotRef.current, { scale: 1, duration: 0.3 })
      gsap.to(cursorRef.current, { scale: 1, duration: 0.2 })
    }

    const enterHandler = (e: MouseEvent) => {
      const directTarget = e.target as Element
      const allTargets: Element[] = []
      let current: Element | null = directTarget

      while (current && current !== document.body) {
        if (current.matches(targetSelector)) {
          allTargets.push(current)
        }
        current = current.parentElement
      }

      const target = allTargets[0] || null
      if (!target || !cursorRef.current || !cornersRef.current) return
      if (activeTarget === target) return

      if (activeTarget) {
        cleanupTarget(activeTarget)
      }
      if (resumeTimeout) {
        clearTimeout(resumeTimeout)
        resumeTimeout = null
      }

      activeTarget = target

      const corners = Array.from(cornersRef.current)
      corners.forEach(corner => gsap.killTweensOf(corner))
      gsap.killTweensOf(cursorRef.current, 'rotation')
      spinTl.current?.pause()
      gsap.set(cursorRef.current, { rotation: 0 })
      gsap.to(corners, { opacity: 1, duration: 0.12, overwrite: 'auto' })

      const rect = target.getBoundingClientRect()
      const { borderWidth, cornerSize } = constants
      const cursorX = gsap.getProperty(cursorRef.current, 'x') as number
      const cursorY = gsap.getProperty(cursorRef.current, 'y') as number

      targetCornerPositionsRef.current = [
        { x: rect.left - borderWidth, y: rect.top - borderWidth },
        { x: rect.right + borderWidth - cornerSize, y: rect.top - borderWidth },
        { x: rect.right + borderWidth - cornerSize, y: rect.bottom + borderWidth - cornerSize },
        { x: rect.left - borderWidth, y: rect.bottom + borderWidth - cornerSize },
      ]

      gsap.ticker.add(tickerFnRef.current!)
      gsap.to(activeStrengthRef.current, {
        current: 1,
        duration: hoverDuration,
        ease: 'power2.out',
      })

      corners.forEach((corner, i) => {
        gsap.to(corner, {
          x: targetCornerPositionsRef.current![i].x - cursorX,
          y: targetCornerPositionsRef.current![i].y - cursorY,
          duration: 0.2,
          ease: 'power2.out',
        })
      })

      const leaveHandler = () => {
        gsap.ticker.remove(tickerFnRef.current!)
        targetCornerPositionsRef.current = null
        gsap.set(activeStrengthRef.current, { current: 0, overwrite: true })
        activeTarget = null

        if (cornersRef.current) {
          const resetCorners = Array.from(cornersRef.current)
          const positions = [
            { x: -cornerSize * 1.5, y: -cornerSize * 1.5 },
            { x: cornerSize * 0.5, y: -cornerSize * 1.5 },
            { x: cornerSize * 0.5, y: cornerSize * 0.5 },
            { x: -cornerSize * 1.5, y: cornerSize * 0.5 },
          ]

          gsap.killTweensOf(resetCorners)
          const tl = gsap.timeline()
          resetCorners.forEach((corner, index) => {
            tl.to(
              corner,
              {
                x: positions[index].x,
                y: positions[index].y,
                opacity: 0,
                duration: 0.18,
                ease: 'power3.out',
              },
              0,
            )
          })
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

        cleanupTarget(target)
      }

      currentLeaveHandler = leaveHandler
      target.addEventListener('mouseleave', leaveHandler)
    }

    window.addEventListener('mousemove', moveHandler)
    window.addEventListener('mouseover', enterHandler as EventListener)
    window.addEventListener('scroll', scrollHandler, { passive: true })
    window.addEventListener('mousedown', mouseDownHandler)
    window.addEventListener('mouseup', mouseUpHandler)

    return () => {
      if (tickerFnRef.current) {
        gsap.ticker.remove(tickerFnRef.current)
      }
      window.removeEventListener('mousemove', moveHandler)
      window.removeEventListener('mouseover', enterHandler as EventListener)
      window.removeEventListener('scroll', scrollHandler)
      window.removeEventListener('mousedown', mouseDownHandler)
      window.removeEventListener('mouseup', mouseUpHandler)
      if (activeTarget) {
        cleanupTarget(activeTarget)
      }
      spinTl.current?.kill()
      if (document.documentElement.classList.contains('has-custom-cursor')) {
        document.body.style.setProperty('cursor', 'none', 'important')
      } else {
        document.body.style.removeProperty('cursor')
      }
      targetCornerPositionsRef.current = null
      activeStrengthRef.current.current = 0
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
    <div ref={cursorRef} aria-hidden="true" style={wrapperStyle}>
      <div ref={dotRef} style={dotStyle} />
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
