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
