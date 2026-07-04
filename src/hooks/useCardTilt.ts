import { useEffect, useRef } from 'react'
import { useGyroscope } from '../context/GyroscopeContext'
import useIsPhone from './useIsPhone'

interface TiltOptions {
  /** Max rotation in degrees at the edges. */
  max?: number
  /** Enable gyroscope-driven tilt on phones. */
  gyro?: boolean
  /** Translate amount (px) applied alongside gyro tilt. */
  gyroTranslate?: number
  /** When set, bakes a perspective() into the element transform. */
  perspective?: number
}

/**
 * Pointer + gyroscope 3D tilt for a card/frame element. Extracted from the
 * duplicated handlers in Projects.tsx / Journey.tsx so WindowFrame and the
 * cards share one implementation.
 *
 * Returns a ref to attach to the tilting element and the mouse handlers to
 * spread onto it. Desktop = pointer tilt; phone = gyroscope tilt.
 */
export default function useCardTilt({
  max = 8,
  gyro: gyroEnabled = true,
  gyroTranslate = 6,
  perspective,
}: TiltOptions = {}) {
  const ref = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  const rectRef = useRef<DOMRect | null>(null)
  const gyro = useGyroscope()
  const isPhone = useIsPhone()
  const persp = perspective ? `perspective(${perspective}px) ` : ''

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  useEffect(() => {
    const el = ref.current
    if (!el || !isPhone || !gyroEnabled || !gyro.permitted) return

    return gyro.subscribe((gx, gy) => {
      el.style.transform =
        `perspective(${perspective ?? 800}px) rotateX(${gy * -max}deg) rotateY(${gx * max}deg) ` +
        `translate(${gx * gyroTranslate}px, ${gy * gyroTranslate * 0.7}px)`
    })
  }, [gyro, isPhone, gyroEnabled, max, gyroTranslate, perspective])

  const updateRect = () => {
    if (!isPhone && ref.current) {
      rectRef.current = ref.current.getBoundingClientRect()
    }
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (isPhone || !ref.current) return
    cancelAnimationFrame(rafRef.current)
    const el = ref.current
    const rect = rectRef.current ?? el.getBoundingClientRect()
    rectRef.current = rect
    rafRef.current = requestAnimationFrame(() => {
      const x = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width - 0.5) * 2))
      const y = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height - 0.5) * 2))
      el.style.transform = `${persp}rotateX(${y * -max}deg) rotateY(${x * max}deg)`
    })
  }

  const onMouseLeave = () => {
    cancelAnimationFrame(rafRef.current)
    rectRef.current = null
    if (ref.current) ref.current.style.transform = `${persp}rotateX(0deg) rotateY(0deg)`
  }

  return { ref, tiltProps: { onMouseEnter: updateRect, onMouseMove, onMouseLeave } }
}
