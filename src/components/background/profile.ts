/**
 * Device profile for the background canvas. Read on the main thread (it needs
 * `window` and `navigator`) and handed to the renderer as plain data, so the
 * same values reach a worker unchanged.
 */

const MOBILE_BREAKPOINT = 768
const LOW_POWER_THREADS = 4

export interface PerformanceProfile {
  isTouch: boolean
  isMobile: boolean
  isCompact: boolean
  isActualMobile: boolean
  isLowPower: boolean
  useSimpleGrid: boolean
  dpr: number
  targetFps: number
  /** Strength of the film-grain overlay, matching the old CSS layer's opacity. */
  noiseAlpha: number
}

export function getPerformanceProfile(): PerformanceProfile {
  const width = window.innerWidth
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  const isMobileUa = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const isCompact = width < MOBILE_BREAKPOINT
  const isActualMobile = isCompact && (isTouch || isMobileUa)
  const isLowPower = (navigator.hardwareConcurrency || 8) <= LOW_POWER_THREADS || (deviceMemory !== undefined && deviceMemory <= 4)
  const useSimpleGrid = isLowPower || isActualMobile

  return {
    isTouch,
    isMobile: isTouch || isMobileUa,
    isCompact,
    isActualMobile,
    isLowPower,
    useSimpleGrid,
    dpr: Math.min(window.devicePixelRatio || 1, isLowPower ? 1.15 : isActualMobile ? 1.28 : 2),
    targetFps: isLowPower ? (isCompact ? 42 : 36) : isActualMobile ? 56 : 60,
    noiseAlpha: window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches ? 0.18 : 0.4,
  }
}

/** True when a profile change would not require rebuilding the node graph. */
export function sameProfile(a: PerformanceProfile, b: PerformanceProfile) {
  return (
    a.isTouch === b.isTouch &&
    a.isCompact === b.isCompact &&
    a.isActualMobile === b.isActualMobile &&
    a.isLowPower === b.isLowPower &&
    a.useSimpleGrid === b.useSimpleGrid &&
    a.dpr === b.dpr &&
    a.targetFps === b.targetFps
  )
}
