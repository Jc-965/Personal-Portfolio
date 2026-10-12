import { lazy, memo, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import PhoneFrame from '../PhoneFrame'
import Printed from '../hero/Printed'
import { sceneProgress } from '../hero/world'
import { lenisRef } from '../../scroll/lenisRef'
import { pageScrollY } from '../../scroll/scrollSignal'
import { setCovering } from '../hero/heroCover'
import type { ActKey, ScreenKey, TeardownStory } from '../../content/teardown/types'
import type { TeardownControl, TeardownFrame, TeardownView } from './TeardownCanvas'
import { layoutCardLabels } from './labels'
import { routeLeaders, type Box, type Point } from './leaders'
import { ACT_SCREEN, LAUNCH_MS, PHONE, poseAt, projectPoint, projectRect, restPoints, type Interaction, type Pose, type WorldRect } from './rig'
import { journeyAt, journeyPath } from './route'
import { RIDE_FADE, actAt, actCopyRide, actWindows, previewEnd, previewProgress, previewTravel, ramp, totalSpan } from './timeline'
import '../../styles/teardown.css'

const TeardownCanvas = lazy(() => import('./TeardownCanvas'))

type Mode = 'dom' | 'gl' | 'static'
type Ride = ReturnType<typeof actCopyRide>

/**
 * The value last written to each element's inline style property or attribute by setStyle. The overlay and the
 * copy ride rewrite every act, label, and leader each frame, and most of them have not moved, so only changed
 * values reach the DOM. Nothing else writes these properties, which keeps the cache true.
 */
const written = new WeakMap<Element, Map<string, string>>()
/** Writes a custom property (--name), the path's d attribute (d), or a camel-case style property, skipping unchanged values. */
const setStyle = (el: HTMLElement | SVGElement, prop: string, value: string) => {
  let last = written.get(el)
  if (!last) written.set(el, (last = new Map()))
  if (last.get(prop) === value) return
  last.set(prop, value)
  if (prop === 'd') el.setAttribute('d', value)
  else if (prop.startsWith('--')) el.style.setProperty(prop, value)
  else el.style[prop as 'opacity' | 'transform' | 'strokeDashoffset'] = value
}

/** Acts that show a phone in the reduced-motion layout. Each shows the rig's screen for that act, so the hand act's callouts sit beside the form they describe. */
const STATIC_PHONE_ACTS: ReadonlySet<ActKey> = new Set<ActKey>(['arrival', 'hand', 'day', 'coach', 'close'])
const AMBER = '#eab76a'
/** Stage widths below this use the phone layout, matching the 767px breakpoint in teardown.css. */
const NARROW_MAX = 768
/** CSS px the phone layout's copy region starts below the product's lowest projected point. */
const FLOOR_GAP = 12
/** A product part counts toward the floor once its opacity reaches this, so a card fading in or out off frame does not move the copy. */
const FLOOR_OPACITY = 0.05
/** copyRide's full travel, +0.45 to -0.45, in units of the ride scale. A phone ride is capped so that travel fits its region. */
const RIDE_SPAN = 0.9
/** copyRide's |y| while the copy is fully opaque. The phone ride is scaled so the block's top meets the floor there. */
const RIDE_OPAQUE = RIDE_FADE[0]
/** Smallest phone ride scale as a fraction of the stage height, so a block with no headroom still moves. */
const RIDE_FLOOR = 0.08
/** Teardown has no pointer state, so the floor is taken from the still pose. A drag lowers the product by up to a tenth of the stage until it is released. */
const STILL: Interaction = { dragYaw: 0, tiltX: 0, tiltY: 0 }
/** A leader line draws in as its callout's ride y falls from LINE_START to LINE_END, each callout LINE_STEP after the one before it in callout order. */
const LINE_START = 0.4
const LINE_END = 0.24
const LINE_STEP = 0.025
/** Explode values over which a glass leader may draw, so none lands on layers that are still stacked together. */
const GLASS_APART: readonly [number, number] = [0.5, 0.8]
/**
 * CSS px the proof readout keeps between its bottom border and the stage's bottom edge on phones. The readout types
 * from 3% of its act, so on the way in it rises only from this line instead of from below the edge.
 */
const READOUT_CLEAR = 20

/**
 * Scroll detents. At each rest point the wheel moves the page by 1 - DETENT_DEPTH of its usual distance, easing
 * back to full over about DETENT_WIDTH viewport heights either side, so leaving a finished state for the next
 * section takes a little more scrolling. Nothing ever moves the page on its own: an earlier lock that eased the
 * page to the nearest rest after a pause read as snappy. Lenis applies the detent, so touch scrolling, which Lenis
 * leaves native, has none.
 */
const DETENT_DEPTH = 0.4
const DETENT_WIDTH = 0.35
/** Milliseconds the stage fades out and back in when the journey closes from past the preview's last frame. */
const SWAP_MS = 250

/** Where the window scrolls in the layout effect after a view swap. */
type PendingScroll = { kind: 'journey'; progress: number } | { kind: 'home'; y: number } | { kind: 'preview-end' }
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value))

const prefersReduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Lowest projected point of the product as a fraction of the stage height, 0 when nothing projects. A part
 * counts while its opacity is at least FLOOR_OPACITY and its projection crosses the frame's width, so the
 * deck's cards move the floor only while they are in frame. The coach figure counts by its feet, `coachLow`
 * being the skeleton's lowest body-centred y.
 */
function productFloor(pose: Pose, aspect: number, coachLow: number): number {
  let low = 0
  const rect = (part: WorldRect) => {
    const bounds = projectRect(pose, part, aspect)
    if (bounds && bounds.right > 0 && bounds.left < 1) low = Math.max(low, bounds.bottom)
  }
  const { phone } = pose
  rect({ center: phone.pos, right: phone.right, up: phone.up, halfW: PHONE.hx, halfH: PHONE.hy })
  rect({ center: pose.glass.center, right: phone.right, up: phone.up, halfW: PHONE.sx, halfH: PHONE.sy })
  for (const plane of [pose.screen, pose.code, ...pose.cards]) {
    if (plane.opacity >= FLOOR_OPACITY) rect(plane)
  }
  if (pose.coach.amount > 0.01) {
    const feet = projectPoint(pose, [pose.coach.pos[0], pose.coach.pos[1] + coachLow * pose.coach.scale, pose.coach.pos[2]], aspect)
    if (feet) low = Math.max(low, feet.y)
  }
  return low
}

/**
 * One project told as a pinned teardown, in two views of one instance. The
 * home page's preview pins the arrival only and holds it with the phone
 * clickable. The journey, an in-app history entry at journeyPath, pins the
 * whole story. Switching views changes the track's travel and the scroll
 * offset in one frame while the stage stays pinned, so the renderer keeps
 * running and the frame never changes. The track's height reserves the pinned
 * travel up front, so the page never grows under the reader. Copy is real DOM
 * in reading order, and the canvas only draws.
 */
function Teardown({ story }: { story: TeardownStory }) {
  const [track, setTrack] = useState<HTMLElement | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const linesRef = useRef<SVGSVGElement>(null)
  const modeRef = useRef<Mode>('dom')
  /** Each act's ride from the last follow, in act order. placeOverlay draws the leader lines from it. */
  const ridesRef = useRef<Ride[]>([])
  /** The --copy-floor last written to the rail, CSS px, so an unchanged floor costs no layout. */
  const floorRef = useRef(-1)
  const [mode, setMode] = useState<Mode>(() => (prefersReduced() ? 'static' : 'dom'))
  const [near, setNear] = useState(false)
  const [failed, setFailed] = useState(false)
  const [act, setAct] = useState(0)
  const actRef = useRef(0)
  const [printed, setPrinted] = useState(false)
  const [view, setView] = useState<TeardownView>(() => (journeyAt(window.location.pathname, [story.id]) ? 'journey' : 'preview'))
  /** The view the scroll handlers and the canvas map with. It changes in the same task as setView. */
  const viewRef = useRef<TeardownView>(view)
  const controlRef = useRef<TeardownControl | null>(null)
  /** The chapter progress last shown, glided in gl mode. */
  const progressRef = useRef(0)
  /** The home page's scroll offset when the journey opened, restored when it closes. */
  const homeYRef = useRef<number | null>(null)
  /** True while the journey entry on the history was pushed by this page, so closing it goes back instead of replacing. */
  const pushedRef = useRef(false)
  const pendingScrollRef = useRef<PendingScroll | null>(null)
  const titleRef = useRef('')
  const phoneHitRef = useRef<HTMLButtonElement>(null)
  /** Remeasures the pinned effect's track geometry. A view swap calls it in the swap's frame. */
  const pinMeasureRef = useRef<() => void>(() => {})
  const isStatic = mode === 'static'
  const windows = useMemo(() => actWindows(story.acts), [story])
  const backdrops = useMemo(() => story.acts.map((a) => a.backdrop), [story])
  const coachLow = useMemo(() => story.pose.points.reduce((low, v, i) => (i % 2 ? Math.min(low, v) : low), 0), [story])
  const travel = view === 'journey' ? totalSpan(story.acts) : previewTravel(story.acts)
  /** Chapter progress at `fraction` of the track's travel in the current view. */
  const toProgress = useCallback((fraction: number) => (viewRef.current === 'preview' ? previewProgress(fraction, story.acts) : fraction), [story])
  const proofIndex = story.acts.findIndex((a) => a.key === 'proof')
  const glassIndex = story.acts.findIndex((a) => a.key === 'glass')
  const screenOf = (key: ScreenKey) => story.screens.find((s) => s.key === key) ?? story.screens[0]
  // The DOM stage and the static layout draw no day cards, so their day and quiet acts show the first card's
  // screen instead of repeating the hand act's form, which the GL phone keeps under the cards.
  const screenFor = (actKey: ActKey) => screenOf((actKey === 'day' || actKey === 'quiet') && story.cards[0] ? story.cards[0].screen : ACT_SCREEN[actKey])

  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { actRef.current = act }, [act])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setMode(query.matches ? 'static' : 'dom')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  // The phone layout's floor in stage px: the product's lowest projected point plus FLOOR_GAP. In gl mode it
  // comes from the rig at the glided progress, the same pose the canvas drew. In dom mode it is the bottom of
  // the DOM stage's phone.
  const floorAt = useCallback((progress: number, stage: HTMLElement, stageH: number) => {
    if (modeRef.current === 'gl') {
      const aspect = stage.clientWidth / stageH
      const pose = poseAt({ progress, windows, backdrops, narrow: true, aspect, interaction: STILL, poseFrames: story.pose.frames })
      return productFloor(pose, aspect, coachLow) * stageH + FLOOR_GAP
    }
    const phone = stage.querySelector<HTMLElement>('.teardown__dom-phones')
    return phone ? phone.offsetTop + phone.offsetHeight + FLOOR_GAP : 0
  }, [windows, backdrops, coachLow, story])

  // Rides every act's copy block with the scroll, writing --copy-y in svh (1svh is 1% of the 100svh stage)
  // and --copy-o on the act, with no React render. On wide stages a block's path spans the stage height.
  // On phones the copy region runs from the floor to the stage bottom: --copy-floor on the rail sets the
  // region's top each frame, and the rail's clip keeps a block off the product. An act rests at the region's
  // bottom, and its ride is scaled to its headroom so that on the way out its top meets the floor at
  // |y| = RIDE_OPAQUE, where the fade starts. The path is symmetric, so on the way in the block starts that
  // far below its rest, past the stage bottom, and rises in from the edge. A block taller than the region is
  // scaled by its overflow instead, so its top shows at the same point on the way in and its bottom from
  // rest on. The proof readout types while it rides in, so on the way in it rises only from READOUT_CLEAR above
  // the stage bottom. Every height is read before the first write, so the call forces no layout of its own.
  const rideCopy = useCallback((progress: number) => {
    const stage = stageRef.current
    const rail = railRef.current
    if (!stage || !rail) return
    const stageH = stage.clientHeight || 1
    const narrow = stage.clientWidth < NARROW_MAX
    const acts = Array.from(rail.children) as HTMLElement[]
    const floor = narrow ? Math.round(floorAt(progress, stage, stageH)) : 0
    const railTop = rail.offsetTop
    const scales = acts.map((el) => {
      if (!narrow) return stageH
      const headroom = railTop + el.offsetTop - floor
      return Math.min((stageH - floor) / RIDE_SPAN, Math.max(RIDE_FLOOR * stageH, Math.abs(headroom) / RIDE_OPAQUE))
    })
    const readout = narrow ? acts[proofIndex] : undefined
    const readoutDrop = readout ? Math.max(0, stageH - READOUT_CLEAR - (railTop + readout.offsetTop + readout.offsetHeight)) : 0
    const rides = windows.map((_, i) => actCopyRide(windows, i, progress))
    ridesRef.current = rides
    if (narrow && floor !== floorRef.current) {
      floorRef.current = floor
      rail.style.setProperty('--copy-floor', `${floor}px`)
    }
    acts.forEach((el, i) => {
      const ride = rides[i]
      if (!ride) return
      const scale = el === readout && ride.y > 0 ? Math.min(scales[i], readoutDrop / RIDE_OPAQUE) : scales[i]
      setStyle(el, '--copy-y', `${((ride.y * scale * 100) / stageH).toFixed(2)}svh`)
      setStyle(el, '--copy-o', ride.opacity.toFixed(3))
    })
  }, [windows, floorAt, proofIndex])

  // Sets the act, the arrival print, the copy ride, and the proof readout from one progress value. The
  // scroll listener calls it in dom mode and onFrame calls it with the canvas's glided progress in gl mode,
  // so the copy moves in step with the stage the reader sees.
  const follow = useCallback((progress: number) => {
    progressRef.current = progress
    const current = actAt(windows, progress)
    setAct(current.index)
    if (progress > 0) setPrinted(true)
    rideCopy(progress)
    if (current.index === proofIndex) {
      // Typing starts 3% into the act, so the first line is about half typed by the time the panel's ride brings
      // it to full opacity at about 0.1. The last line is typed by about 0.49, and the readout rests for about
      // 0.57 viewport-heights before the stack closes at 0.8.
      stageRef.current?.querySelectorAll<HTMLElement>('.teardown__readout li').forEach((li, i, all) => {
        setStyle(li, '--typed', clamp((current.local - 0.03) * all.length * 2.2 - i, 0, 1).toFixed(3))
      })
    }
  }, [windows, proofIndex, rideCopy])

  // Scroll drives the copy only in dom mode, before the renderer is ready and after a fallback.
  useEffect(() => {
    if (!track || mode !== 'dom') return
    let raf = 0
    const update = () => {
      raf = 0
      const top = track.getBoundingClientRect().top + window.scrollY
      follow(toProgress(sceneProgress(window.scrollY - top, track.offsetHeight, stageRef.current?.clientHeight || window.innerHeight)))
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update) }
    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [track, mode, follow, toProgress, view])

  // The root carries teardown-pinned while the track spans the whole viewport, which is when the sticky
  // stage is pinned and covers it. base.css then dims the vintage overlay's scanlines and fades the page
  // background out, and the chapter claims the background's cover signal (heroCover.ts), so the grid and
  // graph never show anywhere on the pinned stage and the background stops painting. This runs in dom
  // and gl mode alike, and the class never outlives the chapter. The same measurement starts the heading's
  // print once the stage's top third is on screen, so the title is typing as the stage arrives instead of
  // waiting for the pin. The track's page offset and height are measured only when the track or the page
  // resizes, and each frame derives the rect from the scroll offset, because this runs after the canvas has
  // written the frame's copy and overlay and a rect read here would force a second layout pass.
  useEffect(() => {
    if (!track || isStatic) return
    const root = document.documentElement
    let raf = 0
    let pinned = false
    let trackTop = 0
    let trackHeight = 0
    const update = () => {
      raf = 0
      const top = trackTop - pageScrollY()
      const bottom = top + trackHeight
      if (top < window.innerHeight * 0.65 && bottom > 0) setPrinted(true)
      const next = top <= 0.5 && bottom + 0.5 >= window.innerHeight
      if (next === pinned) return
      pinned = next
      root.classList.toggle('teardown-pinned', pinned)
      setCovering('teardown', pinned)
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update) }
    const measure = () => {
      trackTop = track.getBoundingClientRect().top + window.scrollY
      trackHeight = track.offsetHeight
      schedule()
    }
    measure()
    pinMeasureRef.current = measure
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(track)
    resizeObserver.observe(document.body)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', measure, { passive: true })
    return () => {
      pinMeasureRef.current = () => {}
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', measure)
      root.classList.remove('teardown-pinned')
      setCovering('teardown', false)
    }
  }, [track, isStatic])

  // Focus inside a hidden act (the close act's links, which stay focusable) scrolls the window to the
  // middle of that act's window, so the act and the focused link are on screen. In gl mode the act then
  // follows once the glided progress arrives. The preview has no hidden act to reach, since every act after
  // the arrival is inert there.
  useEffect(() => {
    if (!track || mode === 'static') return
    const onFocusIn = (event: FocusEvent) => {
      if (viewRef.current === 'preview') return
      const key = (event.target as Element | null)?.closest<HTMLElement>('.teardown__act')?.dataset.actKey
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
  }, [track, windows, mode])

  // The wheel meets a soft detent at each finished state. The hook runs on every wheel event before Lenis applies
  // it and scales the delta by how close the page is heading to a rest point. Lenis can mount after the chapter,
  // so the hook attaches once it exists.
  useEffect(() => {
    if (!track || mode === 'static') return
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
        // The preview's track runs previewTravel viewport-heights for the whole story's totalSpan, and holds
        // only the rests up to its last frame.
        const preview = viewRef.current === 'preview'
        const scale = preview ? totalSpan(story.acts) / previewTravel(story.acts) : 1
        const last = preview ? previewEnd(story.acts) + 1e-9 : 1
        const rests = restPoints(windows, window.innerWidth < NARROW_MAX).filter((r) => r <= last).map((r) => r * scale)
        const nearest = rests.reduce((best, r) => Math.min(best, Math.abs(r - fraction)), Infinity) * travel
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
  }, [track, windows, mode, story])

  // The renderer boots once the track is within 1.5 viewports and the page has been scrolled, or at once on the
  // journey page. The first load of the home page never fetches the three.js chunk or the screens, even when a
  // short initial layout puts the chapter that close.
  useEffect(() => {
    if (!track || mode === 'static' || failed) return
    let intersecting = false
    const boot = () => {
      if (!intersecting || (window.scrollY <= 0 && viewRef.current !== 'journey')) return
      setNear(true)
      observer.disconnect()
      window.removeEventListener('scroll', boot)
    }
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting
      boot()
    }, { rootMargin: '150% 0px' })
    observer.observe(track)
    window.addEventListener('scroll', boot, { passive: true })
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', boot)
    }
  }, [track, mode, failed])

  // Places the card labels and the leader lines for one frame. Runs after rideCopy, so the callout rects it
  // reads include this frame's ride. Reads every rect first, then writes, so one call forces layout once.
  const placeOverlay = useCallback((frame: TeardownFrame) => {
    const stage = stageRef.current
    const svg = linesRef.current
    if (!stage || !svg) return
    const gl = modeRef.current === 'gl'
    const stageRect = stage.getBoundingClientRect()
    const writes: (() => void)[] = []

    // Card labels follow labels.ts: centred under their cards, hidden while a nearer card covers them, and
    // pushed apart in order of x. The labels are in story order, the order of frame.cards.
    const labels = Array.from(stage.querySelectorAll<HTMLElement>('.teardown__card-label'))
    const sizes = labels.map((label) => ({ w: label.offsetWidth, h: label.offsetHeight }))
    // frame.cards is absent at runtime only while a hot reload has this file ahead of TeardownCanvas.
    const places = layoutCardLabels(frame.cards ?? [], sizes, { width: stageRect.width, height: stageRect.height })
    labels.forEach((label, k) => writes.push(() => {
      const place = places[k]
      if (place) setStyle(label, 'transform', `translate3d(${place.left.toFixed(1)}px, ${place.top.toFixed(1)}px, 0)`)
      label.classList.toggle('is-on', place?.on ?? false)
    }))

    // A leader line draws from its callout toward the anchor as the callout rides in (positive ride.y), holds
    // its full length on the way out, and fades with its callout through the opacity, so it never retracts
    // from the anchor while the callout is still readable. leaders.ts routes each act's leaders from the
    // callouts' ridden rects, which are read every frame only for acts whose copy is showing. On phones a
    // callout whose middle is above the rail's top, where the rail's clip hides it, keeps no leader. A glass
    // leader also waits for the stack to come apart (GLASS_APART), so it never points at layers that are still
    // stacked together.
    const narrow = stageRect.width < NARROW_MAX
    const clipTop = narrow && railRef.current ? railRef.current.getBoundingClientRect().top : -Infinity
    const leaders = Array.from(stage.querySelectorAll<HTMLElement>('.teardown__callout[data-anchor]'), (label) => {
      const key = label.dataset.anchor ?? ''
      const [, ai, ci] = key.split(':').map(Number)
      const ride = ridesRef.current[ai]
      const rect = gl && ride && ride.opacity > 0 ? label.getBoundingClientRect() : null
      const box: Box | null = rect && rect.top + rect.height / 2 >= clipTop
        ? { left: rect.left - stageRect.left, top: rect.top - stageRect.top, right: rect.right - stageRect.left, bottom: rect.bottom - stageRect.top }
        : null
      return { key, ai, ci, ride, box, anchor: gl ? frame.anchors.get(key) ?? null : null, path: svg.querySelector<SVGPathElement>(`path[data-anchor="${key}"]`) }
    })
    // The callouts are in DOM order, which is callout order within each act whatever order teardown.css shows.
    const routes = new Map<string, Point[] | null>()
    for (const ai of new Set(leaders.map((leader) => leader.ai))) {
      const group = leaders.filter((leader) => leader.ai === ai)
      const route = routeLeaders(group.map((leader) => leader.box), group.map((leader) => leader.anchor), narrow)
      group.forEach((leader, k) => routes.set(leader.key, route[k]))
    }
    for (const { key, ai, ci, ride, path } of leaders) {
      if (!path) continue
      const route = routes.get(key)
      const start = LINE_START - LINE_STEP * ci
      // frame.explode is absent at runtime only while a hot reload has this file ahead of TeardownCanvas.
      const apart = ai === glassIndex ? ramp(frame.explode ?? 1, GLASS_APART[0], GLASS_APART[1]) : 1
      const drawn = ride ? (ride.y > 0 ? 1 - ramp(ride.y, start - (LINE_START - LINE_END), start) : 1) * apart : 0
      const reveal = route && ride ? drawn * ride.opacity : 0
      if (!route || reveal <= 0) {
        writes.push(() => setStyle(path, 'opacity', '0'))
        continue
      }
      // The path runs from the callout to the anchor, so its dash draws in from the callout's side.
      const d = route.map((point, k) => `${k ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join('')
      writes.push(() => {
        setStyle(path, 'd', d)
        setStyle(path, 'strokeDashoffset', (1 - drawn).toFixed(3))
        setStyle(path, 'opacity', (0.75 * reveal).toFixed(3))
      })
    }
    // The phone's click target follows its projected screen, so the cursor locks onto the phone as it turns.
    const hit = phoneHitRef.current
    if (hit) {
      const r = frame.phone
      writes.push(() => {
        setStyle(hit, '--hit-x', `${(r?.left ?? 0).toFixed(1)}px`)
        setStyle(hit, '--hit-y', `${(r?.top ?? 0).toFixed(1)}px`)
        setStyle(hit, '--hit-w', `${(r?.width ?? 0).toFixed(1)}px`)
        setStyle(hit, '--hit-h', `${(r?.height ?? 0).toFixed(1)}px`)
      })
    }
    writes.forEach((write) => write())
  }, [glassIndex])
  const onFrame = useCallback((frame: TeardownFrame) => {
    if (modeRef.current === 'gl') follow(frame.progress)
    placeOverlay(frame)
  }, [follow, placeOverlay])

  // Opening and closing the journey. The class on the root hides every other section (teardown.css), the view
  // swaps the track's travel, and the layout effect below sets the scroll so the pinned stage keeps its frame.
  const enterJourney = useCallback((progress: number) => {
    viewRef.current = 'journey'
    if (!titleRef.current) titleRef.current = document.title
    document.title = `${story.name} teardown · Jesse Chen`
    document.documentElement.classList.add('journey-open')
    pendingScrollRef.current = { kind: 'journey', progress }
    setView('journey')
  }, [story])

  const leaveJourney = useCallback(() => {
    if (viewRef.current !== 'journey') return
    const swap = () => {
      viewRef.current = 'preview'
      if (titleRef.current) document.title = titleRef.current
      document.documentElement.classList.remove('journey-open')
      const homeY = homeYRef.current
      homeYRef.current = null
      pendingScrollRef.current = homeY === null ? { kind: 'preview-end' } : { kind: 'home', y: homeY }
      setView('preview')
    }
    // Past the preview's last frame the poses differ, so the stage fades out, swaps, and fades back in instead
    // of gliding back through every act in between.
    const stage = stageRef.current
    if (!stage || prefersReduced() || progressRef.current <= previewEnd(story.acts) + 1e-4) { swap(); return }
    stage.classList.add('is-swapping')
    window.setTimeout(() => {
      swap()
      window.setTimeout(() => stage.classList.remove('is-swapping'), 60)
    }, SWAP_MS)
  }, [story])

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
    window.history.pushState({ teardown: story.id }, '', journeyPath(story.id))
    pushedRef.current = true
    enterJourney(progressRef.current)
  }, [story, enterJourney])

  const back = useCallback(() => {
    if (viewRef.current !== 'journey') return
    if (pushedRef.current) {
      // popstate closes the journey, so Back in the browser and this control take one path.
      window.history.back()
      return
    }
    window.history.replaceState(null, '', '/')
    leaveJourney()
  }, [leaveJourney])

  useEffect(() => {
    const onPop = () => {
      const id = journeyAt(window.location.pathname, [story.id])
      if (id && viewRef.current !== 'journey') {
        pushedRef.current = true
        homeYRef.current = pageScrollY()
        enterJourney(progressRef.current)
      } else if (!id && viewRef.current === 'journey') {
        pushedRef.current = false
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
  }, [story, enterJourney, leaveJourney, back])

  // A direct load of the journey path opens the journey before the first paint, from the start of the story.
  useLayoutEffect(() => {
    if (viewRef.current !== 'journey') return
    if (!titleRef.current) titleRef.current = document.title
    document.title = `${story.name} teardown · Jesse Chen`
    document.documentElement.classList.add('journey-open')
    return () => document.documentElement.classList.remove('journey-open')
  }, [story])

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
        : top + (previewEnd(story.acts) * totalSpan(story.acts) / previewTravel(story.acts)) * travelPx
    const lenis = lenisRef.current
    if (lenis) {
      lenis.resize()
      lenis.scrollTo(y, { immediate: true, force: true })
    } else window.scrollTo({ top: y, behavior: 'instant' })
    pinMeasureRef.current()
    controlRef.current?.sync()
    // Scroll anchoring can still move the window while the restored sections settle, and Lenis swallows that
    // scroll event after its own immediate scroll. It starts the next wheel ease from its own offset, so on the
    // next frame it takes the window's offset, or that wheel jumps by the difference.
    const resync = requestAnimationFrame(() => {
      const live = lenisRef.current
      if (live && Math.abs(live.animatedScroll - window.scrollY) > 0.5) live.scrollTo(window.scrollY, { immediate: true, force: true })
    })
    return () => cancelAnimationFrame(resync)
  }, [view, track, story])
  const onReady = useCallback(() => setMode((m) => (m === 'static' ? m : 'gl')), [])
  const onFallback = useCallback(() => {
    setFailed(true)
    setMode((m) => (m === 'static' ? m : 'dom'))
  }, [])

  const isActive = (index: number) => isStatic || index === act
  const actKey = story.acts[act]?.key ?? 'arrival'
  const domScreen = screenFor(actKey)
  // Every screen the DOM stage can show stays mounted, so an act change crossfades instead of cutting.
  const domScreens = Array.from(new Set(story.acts.map((a) => screenFor(a.key))))
  const titleId = `project-${story.id}-title`
  const tipId = `teardown-${story.id}-tip`

  return (
    <section
      ref={setTrack}
      id={`project-${story.id}`}
      className={`teardown teardown--${view} ${isStatic ? 'teardown--static' : `is-${mode}`}`}
      style={{ '--teardown-travel': travel } as React.CSSProperties}
      data-act={isStatic ? undefined : actKey}
      aria-labelledby={titleId}
    >
      <div ref={stageRef} className="teardown__stage">
        {!isStatic && (
          <div className="teardown__dom-stage" aria-hidden={mode === 'gl'}>
            <div className="teardown__dom-phones">
              {domScreens.map((s) => (
                <PhoneFrame key={s.key} src={s.src} alt={s.alt} aspect={`${s.width} / ${s.height}`} accent={AMBER} className={s === domScreen ? 'is-active' : undefined} />
              ))}
            </div>
            {(actKey === 'glass' || actKey === 'proof') && <pre className="teardown__code" aria-hidden="true">{story.code}</pre>}
          </div>
        )}
        {!isStatic && near && !failed && track && (
          <Suspense fallback={null}>
            <TeardownCanvas story={story} track={track} onFrame={onFrame} onReady={onReady} onFallback={onFallback} view={viewRef} control={controlRef} />
          </Suspense>
        )}
        {/* The phone opens the journey. This target follows its projected screen (placeOverlay), and the open
            button in the arrival copy is the keyboard and screen-reader control for the same action. */}
        {!isStatic && view === 'preview' && mode === 'gl' && (
          <button ref={phoneHitRef} type="button" className="teardown__phone-hit" aria-hidden="true" tabIndex={-1} onClick={open} />
        )}
        <svg ref={linesRef} className="teardown__leaders" aria-hidden="true">
          <defs>
            <marker id={tipId} viewBox="0 0 5 5" refX="2.5" refY="2.5" markerWidth="5" markerHeight="5" markerUnits="userSpaceOnUse">
              <rect width="5" height="5" fill={AMBER} />
            </marker>
          </defs>
          {/* pathLength 1 lets placeOverlay draw each line with a dash of length 1, whatever its pixel length. */}
          {story.acts.flatMap((a, ai) => a.callouts.map((_, ci) => (
            <path key={`c:${ai}:${ci}`} data-anchor={`c:${ai}:${ci}`} pathLength={1} markerEnd={`url(#${tipId})`} />
          )))}
        </svg>

        <div ref={railRef} className="teardown__rail">
          {story.acts.map((a, ai) => {
            // The static preview stacks the arrival alone. The full stack belongs to the journey.
            if (isStatic && view === 'preview' && ai > 0) return null
            const phone = STATIC_PHONE_ACTS.has(a.key) ? screenFor(a.key) : null
            return (
              // In the journey the close act stays out of inert so its links keep their place in the tab order
              // (see onFocusIn). The preview reaches only the arrival, so every later act is inert there.
              <div
                key={a.key}
                className={`teardown__act teardown__act--${a.key}${isActive(ai) ? ' is-active' : ''}`}
                data-act-key={a.key}
                inert={view === 'preview' ? ai > 0 : !isActive(ai) && a.key !== 'close'}
              >
                {isStatic && phone && (
                  <PhoneFrame src={phone.src} alt={phone.alt} aspect={`${phone.width} / ${phone.height}`} accent={AMBER} className="teardown__static-phone" />
                )}
                {a.key === 'arrival' && (
                  <>
                    <h3 id={titleId} className="teardown__title">
                      {isStatic ? a.lines[0] : printed ? <Printed text={a.lines[0]} delay={0} speed={14} /> : (
                        // Hidden until the print starts, so the print never replaces visible text. The hidden
                        // copy holds the heading's box, and the sr-only copy holds its accessible name.
                        <>
                          <span className="sr-only">{a.lines[0]}</span>
                          <span className="teardown__unprinted" aria-hidden="true">{a.lines[0]}</span>
                        </>
                      )}
                    </h3>
                    {a.lines.slice(1).map((line, i) => (
                      <p key={line} className={`teardown__line${i === 0 ? ' teardown__lede' : ''}`}>{line}</p>
                    ))}
                    <button type="button" className="teardown__open" onClick={open} inert={view !== 'preview'}>
                      [ open the teardown <span aria-hidden="true">→</span> ]
                    </button>
                  </>
                )}
                {a.key === 'proof' && (
                  <ul className="teardown__readout">
                    {a.lines.map((line) => (
                      <li key={line}><span className="teardown__prompt" aria-hidden="true">$</span> {line}</li>
                    ))}
                  </ul>
                )}
                {a.key === 'coach' && (
                  <>
                    <p className="teardown__eyebrow"><span aria-hidden="true">// </span>{a.lines[0]}</p>
                    {a.lines.slice(1).map((line) => <p key={line} className="teardown__line">{line}</p>)}
                  </>
                )}
                {a.key !== 'arrival' && a.key !== 'proof' && a.key !== 'coach' && a.lines.map((line) => (
                  <p key={line} className="teardown__line">{line}</p>
                ))}
                {mode !== 'gl' && a.key === 'day' && (
                  <ul className="teardown__callouts">
                    {story.cards.map((card) => (
                      <li key={card.screen} className="teardown__callout">
                        <span className="teardown__slashes" aria-hidden="true">//</span> {card.label}
                      </li>
                    ))}
                  </ul>
                )}
                {a.callouts.length > 0 && (
                  <ul className="teardown__callouts teardown__callouts--anchored">
                    {a.callouts.map((c, ci) => (
                      <li key={c.text} className="teardown__callout" data-anchor={`c:${ai}:${ci}`}>
                        <span className="teardown__slashes" aria-hidden="true">//</span> {c.text}
                      </li>
                    ))}
                  </ul>
                )}
                {isStatic && a.key === 'glass' && <pre className="teardown__code">{story.code}</pre>}
                {a.key === 'close' && (
                  <>
                    <p className="teardown__tags">{story.tags.map((t) => <span key={t} className="teardown__tag">[{t}]</span>)}</p>
                    <p className="teardown__links">
                      {story.links.map((l) => (
                        <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="teardown__link">[ {l.label} ↗ ]</a>
                      ))}
                    </p>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {!isStatic && (
          <ol className={`teardown__cards${actKey === 'day' ? ' is-active' : ''}`} aria-label={`${story.name} features`}>
            {story.cards.map((card) => (
              <li key={card.screen} className="teardown__card-label">{card.label}</li>
            ))}
          </ol>
        )}
      </div>
      <button type="button" className={`teardown__back${view === 'journey' ? ' is-shown' : ''}`} onClick={back} inert={view !== 'journey'}>
        [ <span aria-hidden="true">←</span> back ]
      </button>
    </section>
  )
}

export default memo(Teardown)
