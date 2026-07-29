import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react'

interface MagnetProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  padding?: number
  disabled?: boolean
  magnetStrength?: number
  activeTransition?: string
  inactiveTransition?: string
  wrapperClassName?: string
  innerClassName?: string
}

export default function Magnet({
  children,
  padding = 100,
  disabled = false,
  magnetStrength = 2,
  activeTransition = 'transform 0.3s ease-out',
  inactiveTransition = 'transform 0.5s ease-in-out',
  wrapperClassName = '',
  innerClassName = '',
  ...props
}: MagnetProps) {
  const magnetRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (disabled) {
      if (innerRef.current) {
        innerRef.current.style.transform = 'translate3d(0px, 0px, 0)'
        innerRef.current.style.transition = inactiveTransition
      }
      return undefined
    }

    let frame = 0
    let pointerX = 0
    let pointerY = 0
    let wasActive = false
    let lastTransform = 'translate3d(0px, 0px, 0)'
    let canInteract = true

    const resetPosition = () => {
      if (!innerRef.current) return
      if (wasActive) {
        innerRef.current.style.transition = inactiveTransition
        wasActive = false
      }
      if (lastTransform !== 'translate3d(0px, 0px, 0)') {
        innerRef.current.style.transform = 'translate3d(0px, 0px, 0)'
        lastTransform = 'translate3d(0px, 0px, 0)'
      }
    }

    const updatePosition = () => {
      frame = 0
      if (!magnetRef.current || !innerRef.current) return

      const { left, top, width, height } = magnetRef.current.getBoundingClientRect()
      const centerX = left + width / 2
      const centerY = top + height / 2
      const distX = Math.abs(centerX - pointerX)
      const distY = Math.abs(centerY - pointerY)
      const isActive = distX < width / 2 + padding && distY < height / 2 + padding
      const transform = isActive
        ? `translate3d(${(pointerX - centerX) / magnetStrength}px, ${(pointerY - centerY) / magnetStrength}px, 0)`
        : 'translate3d(0px, 0px, 0)'

      if (isActive !== wasActive) {
        innerRef.current.style.transition = isActive ? activeTransition : inactiveTransition
        wasActive = isActive
      }
      if (transform !== lastTransform) {
        innerRef.current.style.transform = transform
        lastTransform = transform
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      pointerX = e.clientX
      pointerY = e.clientY
      if (!canInteract) {
        resetPosition()
        return
      }
      if (!frame) frame = requestAnimationFrame(updatePosition)
    }

    const observer = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          ([entry]) => { canInteract = entry.isIntersecting },
          { rootMargin: `${padding}px` },
        )
    if (magnetRef.current) observer?.observe(magnetRef.current)

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [activeTransition, disabled, inactiveTransition, magnetStrength, padding])

  return (
    <div
      ref={magnetRef}
      className={wrapperClassName}
      style={{ position: 'relative', display: 'inline-block' }}
      {...props}
    >
      <div
        ref={innerRef}
        className={innerClassName}
        style={{
          transform: 'translate3d(0px, 0px, 0)',
          transition: inactiveTransition,
          willChange: 'transform'
        }}
      >
        {children}
      </div>
    </div>
  )
}
