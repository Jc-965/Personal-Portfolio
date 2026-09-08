import { useEffect, useRef } from 'react'
import { useGyroscope } from '../context/GyroscopeContext'
import { getScrollProgress, onScroll } from '../scroll/scrollSignal'
import { isHeroCovering, onHeroCover } from './hero/heroCover'
import { acquireLink, releaseLink } from './background/link'
import { getPerformanceProfile } from './background/profile'
import { rasterizeNoiseTile } from './background/noiseTile'
import type { BackgroundMessage } from './background/protocol'

/**
 * The page background canvas. This component owns everything that needs the
 * DOM (sizing, input, visibility, what covers the canvas) and streams it as
 * messages to the renderer, which draws in a worker on an OffscreenCanvas
 * when the browser supports one and on the main thread otherwise.
 */

const spawnWorker = () =>
  typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function'
    ? new Worker(new URL('./background/background.worker.ts', import.meta.url), { type: 'module' })
    : null

// The renderer is its own chunk so first paint does not wait on it; the
// canvas sits under the hero's opaque terminal until well after it lands.
const loadRenderer = () => import('./background/renderer')

const coveredBySketchbook = () => {
  // The Sketchbook overlay is an opaque sheet from its first frame, and the
  // page marks the start of its exit before that sheet begins to lift.
  const classes = document.documentElement.classList
  return classes.contains('sketchbook-mode') && !classes.contains('sketchbook-returning')
}

export default function Background() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const postRef = useRef<((message: BackgroundMessage) => void) | null>(null)
  const gyro = useGyroscope()

  // Subscribe to gyroscope updates
  useEffect(() => {
    if (!gyro.permitted) return
    return gyro.subscribe((x, y) => {
      postRef.current?.({ type: 'gyro', x, y })
    })
  }, [gyro, gyro.permitted])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const link = acquireLink(canvas, { reducedMotion: prefersReduced, spawnWorker, loadRenderer })
    const post = (message: BackgroundMessage, transfer?: Transferable[]) => link.post(message, transfer)
    postRef.current = post
    let disposed = false

    let w = window.innerWidth
    let h = window.innerHeight
    let stableCompactHeight = h
    let profile = getPerformanceProfile()
    let tileScale = 0
    let tileRequest = 0

    // The film grain is rasterised at the canvas's own pixel density so it
    // lands on the same pixel grid it used to as a CSS layer.
    const sendNoise = () => {
      const scale = profile.dpr
      if (scale === tileScale) return
      tileScale = scale
      const request = ++tileRequest
      rasterizeNoiseTile(scale).then(async (tile) => {
        if (!tile || request !== tileRequest || disposed) return
        if (!link.worker) {
          post({ type: 'noise', tile, scale })
          return
        }
        const bitmap = await createImageBitmap(tile)
        if (request !== tileRequest || disposed) {
          bitmap.close()
          return
        }
        post({ type: 'noise', tile: bitmap, scale }, [bitmap])
      })
    }

    const resize = () => {
      const nextW = window.innerWidth
      const nextH = window.innerHeight
      const nextProfile = getPerformanceProfile()
      const compactChromeShift =
        nextProfile.isCompact &&
        profile.isCompact &&
        Math.abs(nextW - w) < 12 &&
        Math.abs(nextH - stableCompactHeight) < 160

      w = nextW
      if (compactChromeShift) {
        stableCompactHeight = Math.max(stableCompactHeight, nextH)
        h = stableCompactHeight
      } else {
        h = nextH
        stableCompactHeight = nextH
      }
      profile = nextProfile
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      post({ type: 'resize', width: w, height: h, profile })
      sendNoise()
    }

    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const debouncedResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(resize, 250)
    }

    resize()
    window.addEventListener('resize', debouncedResize)

    if (prefersReduced) {
      return () => {
        if (resizeTimer) clearTimeout(resizeTimer)
        window.removeEventListener('resize', debouncedResize)
        postRef.current = null
        disposed = true
        releaseLink(canvas)
      }
    }

    // While something opaque spans the viewport the canvas cannot be seen, so
    // the renderer keeps simulating but stops painting.
    let heroCovering = isHeroCovering()
    let sketchbookCovering = coveredBySketchbook()
    let covered = false
    const syncCovered = () => {
      const next = heroCovering || sketchbookCovering
      if (next === covered) return
      covered = next
      post({ type: 'covered', covered })
    }
    const stopHeroCover = onHeroCover((covering) => {
      heroCovering = covering
      syncCovered()
    })
    const classObserver = new MutationObserver(() => {
      sketchbookCovering = coveredBySketchbook()
      syncCovered()
    })
    classObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    syncCovered()

    let progress = getScrollProgress()
    if (progress !== 0) post({ type: 'scroll', progress })
    const stopScroll = onScroll((next) => {
      if (next === progress) return
      progress = next
      post({ type: 'scroll', progress })
    })

    const onMove = (e: PointerEvent) => post({ type: 'pointer', x: e.clientX, y: e.clientY })
    const onLeave = () => post({ type: 'leave' })
    const onPointerDown = (e: PointerEvent) => post({ type: 'interact', x: e.clientX, y: e.clientY })
    const onPointerUp = () => post({ type: 'end' })
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      if (t) post({ type: 'interact', x: t.clientX, y: t.clientY })
    }
    const onTouchEnd = () => post({ type: 'end' })
    const handleVisibility = () => post({ type: 'hidden', hidden: document.hidden })

    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave, { passive: true })
    document.addEventListener('pointerdown', onPointerDown, { passive: true })
    document.addEventListener('pointerup', onPointerUp, { passive: true })
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    document.addEventListener('touchcancel', onTouchEnd, { passive: true })
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      window.removeEventListener('resize', debouncedResize)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchEnd)
      document.removeEventListener('visibilitychange', handleVisibility)
      stopHeroCover()
      stopScroll()
      classObserver.disconnect()
      postRef.current = null
      disposed = true
      releaseLink(canvas)
    }
  }, [])

  return (
    <div className="background" aria-hidden="true">
      <canvas ref={canvasRef} className="background__canvas" />
    </div>
  )
}
