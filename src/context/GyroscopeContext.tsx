import { createContext, useContext, useEffect, useRef, useCallback, useState } from 'react'

const LERP = 0.18
const INPUT_SMOOTH = 0.25
const MAX_TILT = 35
const OUTPUT_SCALE = 0.72
const DISABLE_GYRO_ON_MOBILE = true

function lerpVal(a: number, b: number, t: number) {
  return a + (b - a) * t
}
function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max)
}

function shouldDisableGyroOnMobile() {
  if (typeof window === 'undefined') return false
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  const isMobileUa = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  return DISABLE_GYRO_ON_MOBILE && (isMobileUa || (isTouchDevice && window.innerWidth <= 1024))
}

export interface GyroValue {
  x: number
  y: number
  supported: boolean
  permitted: boolean
  requestPermission: () => Promise<boolean>
  subscribe: (cb: (x: number, y: number) => void) => () => void
}

const GyroscopeContext = createContext<GyroValue>({
  x: 0,
  y: 0,
  supported: false,
  permitted: false,
  requestPermission: async () => false,
  subscribe: () => () => {},
})

export function GyroscopeProvider({ children }: { children: React.ReactNode }) {
  const [supported, setSupported] = useState(false)
  const [permitted, setPermitted] = useState(false)
  const current = useRef({ x: 0, y: 0 })
  const target = useRef({ x: 0, y: 0 })
  const subscribers = useRef(new Set<(x: number, y: number) => void>())
  const rafId = useRef(0)
  const listenersAttached = useRef(false)

  const attachListeners = useCallback(() => {
    if (listenersAttached.current || shouldDisableGyroOnMobile()) return

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const gamma = e.gamma ?? 0
      const beta = e.beta ?? 0
      const neutralBeta = 30
      const adjustedBeta = beta - neutralBeta

      const rawX = clamp(gamma / MAX_TILT, -1, 1)
      const rawY = clamp(adjustedBeta / MAX_TILT, -1, 1)

      // Low-pass filter on input to remove sensor noise/jumps
      target.current.x += (rawX - target.current.x) * INPUT_SMOOTH
      target.current.y += (rawY - target.current.y) * INPUT_SMOOTH
    }

    window.addEventListener('deviceorientation', handleOrientation, { passive: true })
    listenersAttached.current = true
  }, [])

  // Smooth interpolation loop
  useEffect(() => {
    if (!permitted) return

    const tick = () => {
      current.current.x = lerpVal(current.current.x, target.current.x * OUTPUT_SCALE, LERP)
      current.current.y = lerpVal(current.current.y, target.current.y * OUTPUT_SCALE, LERP)
      subscribers.current.forEach(cb => cb(current.current.x, current.current.y))
      rafId.current = requestAnimationFrame(tick)
    }
    rafId.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId.current)
  }, [permitted])

  // Auto-attach on Android / older iOS (only on touch devices to avoid desktop laptops)
  useEffect(() => {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    const hasAPI = 'DeviceOrientationEvent' in window && isTouchDevice
    const disabledOnMobile = shouldDisableGyroOnMobile()
    setSupported(hasAPI && !disabledOnMobile)

    if (disabledOnMobile) {
      setPermitted(false)
      current.current = { x: 0, y: 0 }
      target.current = { x: 0, y: 0 }
      return
    }

    if (hasAPI && !(DeviceOrientationEvent as any).requestPermission) {
      setPermitted(true)
      attachListeners()
    }
  }, [attachListeners])

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!supported || shouldDisableGyroOnMobile()) return false
    const DOE = DeviceOrientationEvent as any
    if (typeof DOE.requestPermission === 'function') {
      try {
        const result = await DOE.requestPermission()
        if (result === 'granted') {
          setPermitted(true)
          attachListeners()
          return true
        }
        return false
      } catch {
        return false
      }
    }
    setPermitted(true)
    attachListeners()
    return true
  }, [supported, attachListeners])

  const subscribe = useCallback((cb: (x: number, y: number) => void) => {
    subscribers.current.add(cb)
    return () => { subscribers.current.delete(cb) }
  }, [])

  const value: GyroValue = {
    get x() { return current.current.x },
    get y() { return current.current.y },
    supported,
    permitted,
    requestPermission,
    subscribe,
  }

  return (
    <GyroscopeContext.Provider value={value}>
      {children}
    </GyroscopeContext.Provider>
  )
}

export function useGyroscope() {
  return useContext(GyroscopeContext)
}
