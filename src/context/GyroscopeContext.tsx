import { createContext, useContext, useEffect, useRef, useCallback, useState } from 'react'

const LERP = 0.12
const MAX_TILT = 35

function lerpVal(a: number, b: number, t: number) {
  return a + (b - a) * t
}
function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max)
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
    if (listenersAttached.current) return

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const gamma = e.gamma ?? 0
      const beta = e.beta ?? 0
      const neutralBeta = 30
      const adjustedBeta = beta - neutralBeta

      target.current.x = clamp(gamma / MAX_TILT, -1, 1)
      target.current.y = clamp(adjustedBeta / MAX_TILT, -1, 1)
    }

    window.addEventListener('deviceorientation', handleOrientation, { passive: true })
    listenersAttached.current = true
  }, [])

  // Smooth interpolation loop
  useEffect(() => {
    if (!permitted) return

    const tick = () => {
      current.current.x = lerpVal(current.current.x, target.current.x, LERP)
      current.current.y = lerpVal(current.current.y, target.current.y, LERP)
      subscribers.current.forEach(cb => cb(current.current.x, current.current.y))
      rafId.current = requestAnimationFrame(tick)
    }
    rafId.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId.current)
  }, [permitted])

  // Auto-attach on Android / older iOS
  useEffect(() => {
    const hasAPI = 'DeviceOrientationEvent' in window
    setSupported(hasAPI)

    if (hasAPI && !(DeviceOrientationEvent as any).requestPermission) {
      setPermitted(true)
      attachListeners()
    }
  }, [attachListeners])

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!supported) return false
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
