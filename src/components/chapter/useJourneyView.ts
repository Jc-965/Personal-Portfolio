/**
 * A chapter's two views and the moves between them. The home page's preview pins the arrival and holds it with
 * the centrepiece clickable. The journey, an in-app history entry at journeyPath, pins the whole story. Opening
 * pushes the entry, adds journey-open to the root (which hides every other section), swaps the track's travel,
 * and sets the scroll so the pinned stage keeps its frame. Closing (the back control, Escape, the browser's Back,
 * or scrolling on past the journey's end) restores the home offset. A close runs once.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { lenisRef } from '../../scroll/lenisRef'
import { pageScrollY } from '../../scroll/scrollSignal'
import { LAUNCH_MS } from '../teardown/rig'
import { journeyAt, journeyPath } from '../teardown/route'
import { prefersReduced } from './dom'
import type { ChapterView, StageControl } from './stageHooks'

/**
 * Milliseconds the stage drifts up and fades out when the journey closes from past the preview's last frame, and
 * the milliseconds the home scene then takes to settle in from below. teardown.css times both transitions.
 */
const SWAP_MS = 450
const SETTLE_MS = 700
/**
 * Scrolling on past the journey's end returns to the home page. The push counts only after the page has rested
 * at the bottom for RETURN_ARM ms, fills after RETURN_PUSH viewport-heights of input, and drains after
 * RETURN_DRAIN ms without input, so a flick's momentum that reaches the end does not carry the reader out. The bar
 * follows the push on a RETURN_EASE second ease, so it fills and drains smoothly between wheel events.
 */
const RETURN_ARM = 250
const RETURN_PUSH = 0.6
const RETURN_DRAIN = 500
const RETURN_EASE = 0.12

/** Where the window scrolls in the layout effect after a view swap. */
type PendingScroll = { kind: 'journey'; progress: number } | { kind: 'home'; y: number } | { kind: 'preview-end' }

export interface JourneyViewOptions {
  id: string
  /** The document title while the journey is open. */
  title: string
  track: HTMLElement | null
  stageRef: RefObject<HTMLElement | null>
  controlRef: RefObject<StageControl | null>
  /** The chapter progress last shown, glided in gl mode. */
  progressRef: RefObject<number>
  pinMeasureRef: RefObject<() => void>
  /** Chapter progress where the preview ends. */
  previewEnd: number
  /** The preview track's travel fraction at previewEnd, where a close after a direct load lands. */
  previewEndFraction: number
}

export function useJourneyView(o: JourneyViewOptions) {
  const { id, title, track, stageRef, controlRef, progressRef, pinMeasureRef, previewEnd, previewEndFraction } = o
  const [view, setView] = useState<ChapterView>(() => (journeyAt(window.location.pathname, [id]) ? 'journey' : 'preview'))
  /** The view the scroll handlers and the canvas map with. It changes in the same task as setView. */
  const viewRef = useRef<ChapterView>(view)
  /** The home page's scroll offset when the journey opened, restored when it closes. */
  const homeYRef = useRef<number | null>(null)
  /** True while the journey entry on the history was pushed by this page, so closing it goes back instead of replacing. */
  const pushedRef = useRef(false)
  const pendingScrollRef = useRef<PendingScroll | null>(null)
  const titleRef = useRef('')
  const returnRef = useRef<HTMLParagraphElement>(null)
  /** True from the moment a close starts until the home scene has settled, so a close never runs twice. */
  const closingRef = useRef(false)
  /** True between history.back() and its popstate, so a second request cannot step the history back twice. */
  const backPendingRef = useRef(false)

  const enterJourney = useCallback((progress: number) => {
    viewRef.current = 'journey'
    if (!titleRef.current) titleRef.current = document.title
    document.title = title
    document.documentElement.classList.add('journey-open')
    pendingScrollRef.current = { kind: 'journey', progress }
    setView('journey')
  }, [title])

  const leaveJourney = useCallback(() => {
    if (viewRef.current !== 'journey' || closingRef.current) return
    closingRef.current = true
    const lenis = lenisRef.current
    // The page holds still through the close, so a wheel's momentum does not carry on into the home page.
    lenis?.stop()
    const settled = () => {
      closingRef.current = false
      lenis?.start()
    }
    const swap = () => {
      viewRef.current = 'preview'
      if (titleRef.current) document.title = titleRef.current
      document.documentElement.classList.remove('journey-open')
      const homeY = homeYRef.current
      homeYRef.current = null
      pendingScrollRef.current = homeY === null ? { kind: 'preview-end' } : { kind: 'home', y: homeY }
      setView('preview')
    }
    // Past the preview's last frame the poses differ, so the stage drifts up and fades out, swaps, and the home
    // scene settles in from below, instead of gliding back through every act in between.
    const stage = stageRef.current
    if (!stage || prefersReduced() || (progressRef.current ?? 0) <= previewEnd + 1e-4) {
      swap()
      settled()
      return
    }
    stage.classList.add('is-swapping')
    window.setTimeout(() => {
      swap()
      // The swap commits synchronously, so the next frame starts the settle from below with the new pose drawn.
      requestAnimationFrame(() => {
        stage.classList.add('is-entering')
        stage.classList.remove('is-swapping')
        requestAnimationFrame(() => {
          stage.classList.remove('is-entering')
          window.setTimeout(settled, SETTLE_MS)
        })
      })
    }, SWAP_MS)
  }, [stageRef, progressRef, previewEnd])

  const open = useCallback(() => {
    if (viewRef.current === 'journey') return
    homeYRef.current = pageScrollY()
    const lenis = lenisRef.current
    if (!prefersReduced()) {
      controlRef.current?.pulse()
      if (lenis) {
        lenis.stop()
        window.setTimeout(() => lenis.start(), LAUNCH_MS)
      }
    }
    // The chapter restores the home offset itself, and the browser's own restoration on popstate would race it.
    window.history.scrollRestoration = 'manual'
    window.history.pushState({ teardown: id }, '', journeyPath(id))
    pushedRef.current = true
    enterJourney(progressRef.current ?? 0)
  }, [id, controlRef, progressRef, enterJourney])

  const back = useCallback(() => {
    if (viewRef.current !== 'journey' || closingRef.current || backPendingRef.current) return
    if (pushedRef.current) {
      // popstate closes the journey, so Back in the browser and this control take one path.
      backPendingRef.current = true
      window.history.back()
      return
    }
    window.history.replaceState(null, '', '/')
    leaveJourney()
  }, [leaveJourney])

  useEffect(() => {
    const onPop = () => {
      const at = journeyAt(window.location.pathname, [id])
      if (at && viewRef.current !== 'journey') {
        pushedRef.current = true
        homeYRef.current = pageScrollY()
        enterJourney(progressRef.current ?? 0)
      } else if (!at && viewRef.current === 'journey') {
        pushedRef.current = false
        backPendingRef.current = false
        leaveJourney()
      }
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && viewRef.current === 'journey') back() }
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
    }
  }, [id, progressRef, enterJourney, leaveJourney, back])

  // At the journey's end, input that keeps pushing down fills the return hint's bar (--return, eased) and then
  // closes the journey the way the back control does, once: closingRef holds every later push until the home
  // scene has settled.
  useEffect(() => {
    if (view !== 'journey') return
    let target = 0
    let shown = 0
    let armedAt = 0
    let lastInput = 0
    let raf = 0
    let last = 0
    let touchY = 0
    const hint = returnRef.current
    const atBottom = () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
    const tick = (now: number) => {
      raf = 0
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
      last = now
      if (!closingRef.current && target < 1 && now - lastInput > RETURN_DRAIN) target = 0
      shown += (target - shown) * (1 - Math.exp(-dt / RETURN_EASE))
      if (Math.abs(target - shown) < 1e-3) shown = target
      hint?.style.setProperty('--return', shown.toFixed(3))
      if (shown !== target || (target > 0 && target < 1)) raf = requestAnimationFrame(tick)
      else last = 0
    }
    const wake = () => { if (!raf) raf = requestAnimationFrame(tick) }
    let fired = false
    const add = (delta: number) => {
      if (fired || closingRef.current || backPendingRef.current) return
      if (!atBottom()) {
        armedAt = 0
        target = 0
        wake()
        return
      }
      const now = performance.now()
      if (!armedAt) armedAt = now
      if (now - armedAt < RETURN_ARM) return
      lastInput = now
      target = Math.min(1, target + delta / (RETURN_PUSH * window.innerHeight))
      wake()
      if (target >= 1) {
        fired = true
        hint?.classList.add('is-full')
        back()
      }
    }
    const onWheel = (event: WheelEvent) => { if (event.deltaY > 0) add(event.deltaY * (event.deltaMode === 1 ? 16 : 1)) }
    const onTouchStart = (event: TouchEvent) => { touchY = event.touches[0]?.clientY ?? 0 }
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? touchY
      if (touchY > y) add(touchY - y)
      touchY = y
    }
    const onKey = (event: KeyboardEvent) => {
      if (['ArrowDown', 'PageDown', ' ', 'End'].includes(event.key)) add(window.innerHeight * 0.3)
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      hint?.classList.remove('is-full')
      hint?.style.setProperty('--return', '0')
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('keydown', onKey)
    }
  }, [view, back])

  // A direct load of the journey path opens the journey before the first paint, from the start of the story.
  useLayoutEffect(() => {
    if (viewRef.current !== 'journey') return
    if (!titleRef.current) titleRef.current = document.title
    document.title = title
    document.documentElement.classList.add('journey-open')
    return () => document.documentElement.classList.remove('journey-open')
  }, [title])

  // After a view swap commits, the track has its new travel. The scroll lands where the pinned stage keeps its
  // frame (the journey at the same progress, or the home page where it was), and the canvas and the pinned
  // effect remeasure in the same frame, so no frame draws with the old geometry.
  useLayoutEffect(() => {
    const pending = pendingScrollRef.current
    if (!pending || !track) return
    pendingScrollRef.current = null
    const top = track.getBoundingClientRect().top + window.scrollY
    const travelPx = Math.max(1, track.offsetHeight - (stageRef.current?.clientHeight || window.innerHeight))
    const y = pending.kind === 'home'
      ? pending.y
      : pending.kind === 'journey'
        ? top + pending.progress * travelPx
        : top + previewEndFraction * travelPx
    const lenis = lenisRef.current
    if (lenis) {
      lenis.resize()
      lenis.scrollTo(y, { immediate: true, force: true })
    } else window.scrollTo({ top: y, behavior: 'instant' })
    pinMeasureRef.current?.()
    controlRef.current?.sync()
    // Scroll anchoring can still move the window while the restored sections settle, and Lenis swallows that
    // scroll event after its own immediate scroll. It starts the next wheel ease from its own offset, so on the
    // next frame it takes the window's offset, or that wheel jumps by the difference.
    const resync = requestAnimationFrame(() => {
      const live = lenisRef.current
      if (live && Math.abs(live.animatedScroll - window.scrollY) > 0.5) live.scrollTo(window.scrollY, { immediate: true, force: true })
    })
    return () => cancelAnimationFrame(resync)
  }, [view, track, stageRef, controlRef, pinMeasureRef, previewEndFraction])

  return { view, viewRef, open, back, returnRef }
}
