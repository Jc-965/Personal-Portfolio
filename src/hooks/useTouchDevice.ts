import { useEffect, useState } from 'react'

const TOUCH_QUERY = '(hover: none), (pointer: coarse)'

function detectTouchDevice() {
  if (typeof window === 'undefined') return false
  return window.matchMedia(TOUCH_QUERY).matches || navigator.maxTouchPoints > 0
}

export default function useTouchDevice() {
  const [isTouchDevice, setIsTouchDevice] = useState(detectTouchDevice)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const mediaQuery = window.matchMedia(TOUCH_QUERY)
    const update = () => setIsTouchDevice(mediaQuery.matches || navigator.maxTouchPoints > 0)
    const legacyMediaQuery = mediaQuery as MediaQueryList & {
      addListener?: (listener: (event: MediaQueryListEvent) => void) => void
      removeListener?: (listener: (event: MediaQueryListEvent) => void) => void
    }

    update()

    if ('addEventListener' in mediaQuery) {
      mediaQuery.addEventListener('change', update)
      window.addEventListener('orientationchange', update)
      return () => {
        mediaQuery.removeEventListener('change', update)
        window.removeEventListener('orientationchange', update)
      }
    }

    legacyMediaQuery.addListener?.(update)
    window.addEventListener('orientationchange', update)
    return () => {
      legacyMediaQuery.removeListener?.(update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return isTouchDevice
}
