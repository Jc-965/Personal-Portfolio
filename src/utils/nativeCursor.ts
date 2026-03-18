const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)'
const CUSTOM_CURSOR_CLASS = 'has-custom-cursor'

declare global {
  interface Window {
    __nativeCursorBootstrapped?: boolean
  }
}

export const shouldUseCustomCursor = () => {
  if (typeof window === 'undefined') return false
  return window.matchMedia(FINE_POINTER_QUERY).matches && navigator.maxTouchPoints === 0
}

export const applyNativeCursorSuppression = () => {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  const body = document.body

  root.classList.add(CUSTOM_CURSOR_CLASS)
  body?.classList.add(CUSTOM_CURSOR_CLASS)
  root.style.setProperty('cursor', 'none', 'important')
  body?.style.setProperty('cursor', 'none', 'important')
}

export const clearNativeCursorSuppression = () => {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  const body = document.body

  root.classList.remove(CUSTOM_CURSOR_CLASS)
  body?.classList.remove(CUSTOM_CURSOR_CLASS)
  root.style.removeProperty('cursor')
  body?.style.removeProperty('cursor')
}

export const bootstrapNativeCursorSuppression = () => {
  if (typeof window === 'undefined' || window.__nativeCursorBootstrapped || !shouldUseCustomCursor()) return

  window.__nativeCursorBootstrapped = true

  const scheduleApply = () => {
    window.requestAnimationFrame(() => {
      applyNativeCursorSuppression()
    })
  }

  const handleVisibilityChange = () => {
    if (!document.hidden) {
      scheduleApply()
    }
  }

  applyNativeCursorSuppression()

  window.addEventListener('focus', scheduleApply, { passive: true })
  window.addEventListener('pageshow', scheduleApply, { passive: true })
  window.addEventListener('mouseenter', scheduleApply, { passive: true })
  document.addEventListener('mouseover', scheduleApply, { capture: true, passive: true })
  document.addEventListener('visibilitychange', handleVisibilityChange)
}
