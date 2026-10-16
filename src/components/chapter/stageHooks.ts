/**
 * Behaviour every pinned chapter shares around its stage: the title's print gate, the pinned state with the page
 * background's cover signal, the wheel detents at rest points, the renderer's boot gate, and focus into a hidden
 * act. The ParkiWell teardown and the generic chapters use the same hooks, so their scroll and loading behave
 * alike.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { lenisRef } from '../../scroll/lenisRef'
import { pageScrollY } from '../../scroll/scrollSignal'
import { setCovering } from '../hero/heroCover'

/** Which track a chapter scrolls through: the home page's arrival preview or the full journey. */
export type ChapterView = 'preview' | 'journey'

/** What a chapter can ask of its running canvas. */
export interface StageControl {
  /** Plays the launch bump: the camera eases closer and back and the lit body flares, over LAUNCH_MS. */
  pulse(): void
  /**
   * Remeasures the track and lands the glide on the scroll's progress. A view swap calls it in the same frame,
   * after setting the scroll, so no frame draws with the old track or glides between the views.
   */
  sync(): void
  /** Forwards a choice from the copy to the scene. Only the generic chapters' canvas implements it. */
  command?(name: string, value: string): void
}

/**
 * Scroll detents. At each rest point the wheel moves the page by 1 - DETENT_DEPTH of its usual distance, easing
 * back to full over about DETENT_WIDTH viewport heights either side, so leaving a finished state for the next
 * section takes a little more scrolling. Nothing ever moves the page on its own: an earlier lock that eased the
 * page to the nearest rest after a pause read as snappy. Lenis applies the detent, so touch scrolling, which Lenis
 * leaves native, has none.
 */
const DETENT_DEPTH = 0.4
const DETENT_WIDTH = 0.35

/** The title prints once the stage has come on screen (requestPrint) and the centrepiece has loaded in (allowPrint). */
export function usePrintGate() {
  const [printed, setPrinted] = useState(false)
  const wantedRef = useRef(false)
  const allowedRef = useRef(false)
  const requestPrint = useCallback(() => {
    wantedRef.current = true
    if (allowedRef.current) setPrinted(true)
  }, [])
  const allowPrint = useCallback(() => {
    allowedRef.current = true
    if (wantedRef.current) setPrinted(true)
  }, [])
  return { printed, requestPrint, allowPrint }
}

/**
 * The root carries teardown-pinned while the track spans the whole viewport, which is when the sticky stage is
 * pinned and covers it. base.css then dims the vintage overlay's scanlines and fades the page background out, and
 * the chapter claims the background's cover signal (heroCover.ts) under `coverKey`, so the grid and graph never
 * show anywhere on the pinned stage and the background stops painting. The class never outlives the chapter. The
 * same measurement requests the heading's print once the stage's top third is on screen, so the title is typing as
 * the stage arrives instead of waiting for the pin. The track's page offset and height are measured only when the
 * track or the page resizes, and each frame derives the rect from the scroll offset, because this runs after the
 * canvas has written the frame's copy and overlay and a rect read here would force a second layout pass. Returns
 * the measure, which a view swap calls in the swap's frame.
 */
export function usePinnedStage(track: HTMLElement | null, enabled: boolean, coverKey: string, requestPrint: () => void): RefObject<() => void> {
  const measureRef = useRef<() => void>(() => {})
  useEffect(() => {
    if (!track || !enabled) return
    const root = document.documentElement
    let raf = 0
    let pinned = false
    let trackTop = 0
    let trackHeight = 0
    const update = () => {
      raf = 0
      const top = trackTop - pageScrollY()
      const bottom = top + trackHeight
      if (top < window.innerHeight * 0.65 && bottom > 0) requestPrint()
      const next = top <= 0.5 && bottom + 0.5 >= window.innerHeight
      if (next === pinned) return
      pinned = next
      root.classList.toggle('teardown-pinned', pinned)
      setCovering(coverKey, pinned)
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update) }
    const measure = () => {
      trackTop = track.getBoundingClientRect().top + window.scrollY
      trackHeight = track.offsetHeight
      schedule()
    }
    measure()
    measureRef.current = measure
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(track)
    resizeObserver.observe(document.body)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', measure, { passive: true })
    return () => {
      measureRef.current = () => {}
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', measure)
      if (pinned) root.classList.remove('teardown-pinned')
      setCovering(coverKey, false)
    }
  }, [track, enabled, coverKey, requestPrint])
  return measureRef
}

/**
 * The wheel meets a soft detent at each finished state. The hook runs on every wheel event before Lenis applies
 * it and scales the delta by how close the page is heading to a rest point. `rests` returns the rest points as
 * fractions of the current track's travel. Lenis can mount after the chapter, so the hook attaches once it exists.
 */
export function useWheelDetent(track: HTMLElement | null, stageRef: RefObject<HTMLElement | null>, enabled: boolean, rests: () => number[]) {
  useEffect(() => {
    if (!track || !enabled) return
    let attached: { lenis: NonNullable<typeof lenisRef.current>; previous: ((data: { deltaX: number; deltaY: number; event: WheelEvent | TouchEvent }) => boolean) | undefined } | null = null
    let retry = 0
    const attach = () => {
      const lenis = lenisRef.current
      if (!lenis) {
        retry = window.setTimeout(attach, 500)
        return
      }
      const previous = lenis.options.virtualScroll
      attached = { lenis, previous }
      lenis.options.virtualScroll = (data) => {
        if (previous && previous(data) === false) return false
        const top = track.getBoundingClientRect().top + window.scrollY
        const travel = Math.max(1, track.offsetHeight - (stageRef.current?.clientHeight || window.innerHeight))
        const fraction = (lenis.targetScroll - top) / travel
        if (fraction <= 0 || fraction >= 1) return true
        const nearest = rests().reduce((best, r) => Math.min(best, Math.abs(r - fraction)), Infinity) * travel
        const d = nearest / (DETENT_WIDTH * window.innerHeight)
        data.deltaY *= 1 - DETENT_DEPTH * Math.exp(-d * d)
        return true
      }
    }
    attach()
    return () => {
      window.clearTimeout(retry)
      if (attached) attached.lenis.options.virtualScroll = attached.previous
    }
  }, [track, stageRef, enabled, rests])
}

/** A released renderer's track has moved this far outside the viewport, beyond the 150% boot margin. */
const RELEASE_MARGIN = '350% 0px'

/**
 * The renderer boots once the track is within 1.5 viewports and the page has been scrolled, or at once on the
 * journey page. The first load of the home page never fetches the three.js chunk or the screens, even when a short
 * initial layout puts the chapter that close. With `release`, the home page drops the renderer again once the track
 * is more than 3.5 viewports away and boots it on the next approach, so the stacked chapters never all hold a WebGL
 * context and their textures at once. The journey page never releases.
 */
export function useNearBoot(track: HTMLElement | null, enabled: boolean, viewRef: RefObject<ChapterView>, release = false): boolean {
  const [near, setNear] = useState(false)
  useEffect(() => {
    if (!track || !enabled) return
    let intersecting = false
    let booted = false
    const boot = () => {
      if (booted || !intersecting || (window.scrollY <= 0 && viewRef.current !== 'journey')) return
      booted = true
      setNear(true)
      window.removeEventListener('scroll', boot)
      if (!release) observer.disconnect()
    }
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting
      boot()
    }, { rootMargin: '150% 0px' })
    observer.observe(track)
    window.addEventListener('scroll', boot, { passive: true })
    const far = release ? new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting || !booted || viewRef.current === 'journey') return
      booted = false
      setNear(false)
      window.addEventListener('scroll', boot, { passive: true })
    }, { rootMargin: RELEASE_MARGIN }) : null
    far?.observe(track)
    return () => {
      observer.disconnect()
      far?.disconnect()
      window.removeEventListener('scroll', boot)
    }
  }, [track, enabled, viewRef, release])
  return near
}

/**
 * Focus inside a hidden act (the close act's links, which stay focusable) scrolls the window to the middle of that
 * act's window, so the act and the focused link are on screen. The act then follows once the glided progress
 * arrives. The preview has no hidden act to reach, since every act after the arrival is inert there. `actSelector`
 * matches an act element carrying data-act-key.
 */
export function useFocusAct(
  track: HTMLElement | null,
  stageRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  windows: readonly { key: string; start: number; end: number }[],
  actRef: RefObject<number>,
  viewRef: RefObject<ChapterView>,
  actSelector: string,
) {
  useEffect(() => {
    if (!track || !enabled) return
    const onFocusIn = (event: FocusEvent) => {
      if (viewRef.current === 'preview') return
      const key = (event.target as Element | null)?.closest<HTMLElement>(actSelector)?.dataset.actKey
      const index = windows.findIndex((w) => w.key === key)
      if (index < 0 || index === actRef.current) return
      const top = track.getBoundingClientRect().top + window.scrollY
      const travel = Math.max(1, track.offsetHeight - (stageRef.current?.clientHeight || window.innerHeight))
      const y = top + ((windows[index].start + windows[index].end) / 2) * travel
      const lenis = lenisRef.current
      if (lenis) lenis.scrollTo(y, { immediate: true })
      else window.scrollTo({ top: y, behavior: 'instant' })
    }
    track.addEventListener('focusin', onFocusIn)
    return () => track.removeEventListener('focusin', onFocusIn)
  }, [track, stageRef, enabled, windows, actRef, viewRef, actSelector])
}

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

/**
 * At a journey's end, input that keeps pushing down fills the return hint's bar (--return, eased) and then calls
 * `back`, once. With `edge` 'start', the same holds at the page's top for input that keeps pushing up. `blocked`
 * holds every push while a close or a move is already under way.
 */
export function useReturnAtEnd(active: boolean, back: () => void, returnRef: RefObject<HTMLElement | null>, blocked: () => boolean, edge: 'start' | 'end' = 'end') {
  useEffect(() => {
    if (!active) return
    let target = 0
    let shown = 0
    let armedAt = 0
    let lastInput = 0
    let raf = 0
    let last = 0
    let touchY = 0
    const hint = returnRef.current
    const atEdge = edge === 'end'
      ? () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
      : () => window.scrollY <= 2
    const toward = edge === 'end' ? 1 : -1
    const tick = (now: number) => {
      raf = 0
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
      last = now
      if (!blocked() && target < 1 && now - lastInput > RETURN_DRAIN) target = 0
      shown += (target - shown) * (1 - Math.exp(-dt / RETURN_EASE))
      if (Math.abs(target - shown) < 1e-3) shown = target
      hint?.style.setProperty('--return', shown.toFixed(3))
      if (shown !== target || (target > 0 && target < 1)) raf = requestAnimationFrame(tick)
      else last = 0
    }
    const wake = () => { if (!raf) raf = requestAnimationFrame(tick) }
    let fired = false
    const add = (delta: number) => {
      if (fired || blocked()) return
      if (!atEdge()) {
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
    const keys = edge === 'end' ? ['ArrowDown', 'PageDown', ' ', 'End'] : ['ArrowUp', 'PageUp', 'Home']
    const onWheel = (event: WheelEvent) => {
      const delta = event.deltaY * toward
      if (delta > 0) add(delta * (event.deltaMode === 1 ? 16 : 1))
    }
    const onTouchStart = (event: TouchEvent) => { touchY = event.touches[0]?.clientY ?? 0 }
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? touchY
      // A finger moving up scrolls down the page.
      const delta = (touchY - y) * toward
      if (delta > 0) add(delta)
      touchY = y
    }
    const onKey = (event: KeyboardEvent) => {
      if (keys.includes(event.key)) add(window.innerHeight * 0.3)
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
  }, [active, back, returnRef, blocked, edge])
}
