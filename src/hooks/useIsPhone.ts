import { useEffect, useState } from 'react'

export const PHONE_BREAKPOINT = 640

export default function useIsPhone(breakpoint = PHONE_BREAKPOINT) {
  const [isPhone, setIsPhone] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= breakpoint
  })

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const update = () => setIsPhone(mediaQuery.matches)
    const legacyMediaQuery = mediaQuery as MediaQueryList & {
      addListener?: (listener: (event: MediaQueryListEvent) => void) => void
      removeListener?: (listener: (event: MediaQueryListEvent) => void) => void
    }

    update()

    if ('addEventListener' in mediaQuery) {
      mediaQuery.addEventListener('change', update)
      return () => mediaQuery.removeEventListener('change', update)
    }

    legacyMediaQuery.addListener?.(update)
    return () => legacyMediaQuery.removeListener?.(update)
  }, [breakpoint])

  return isPhone
}
