import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PhoneFrame from '../PhoneFrame'
import Printed from '../hero/Printed'
import { sceneProgress } from '../hero/world'
import { lenisRef } from '../../scroll/lenisRef'
import type { ActKey, ScreenKey, TeardownStory } from '../../content/teardown/types'
import type { TeardownFrame } from './TeardownCanvas'
import { layoutCardLabels } from './labels'
import { routeLeaders, type Box, type Point } from './leaders'
import { ACT_SCREEN, PHONE, poseAt, projectPoint, projectRect, restPoints, type Interaction, type Pose, type WorldRect } from './rig'
import { RIDE_FADE, actAt, actCopyRide, actWindows, ramp, totalSpan } from './timeline'
import '../../styles/teardown.css'

const TeardownCanvas = lazy(() => import('./TeardownCanvas'))

type Mode = 'dom' | 'gl' | 'static'
type Ride = ReturnType<typeof actCopyRide>

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
const DETENT_DEPTH = 0.5
const DETENT_WIDTH = 0.35
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
 * One project told as a pinned teardown. The track's height reserves the
 * pinned travel up front, so the Projects placeholder can match it and the
 * page never grows under the reader. Copy is real DOM in reading order, and
 * the canvas only draws.
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
  const isStatic = mode === 'static'
  const windows = useMemo(() => actWindows(story.acts), [story])
  const backdrops = useMemo(() => story.acts.map((a) => a.backdrop), [story])
  const coachLow = useMemo(() => story.pose.points.reduce((low, v, i) => (i % 2 ? Math.min(low, v) : low), 0), [story])
  const travel = totalSpan(story.acts)
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
      el.style.setProperty('--copy-y', `${((ride.y * scale * 100) / stageH).toFixed(2)}svh`)
      el.style.setProperty('--copy-o', ride.opacity.toFixed(3))
    })
  }, [windows, floorAt, proofIndex])

  // Sets the act, the arrival print, the copy ride, and the proof readout from one progress value. The
  // scroll listener calls it in dom mode and onFrame calls it with the canvas's glided progress in gl mode,
  // so the copy moves in step with the stage the reader sees.
  const follow = useCallback((progress: number) => {
    const current = actAt(windows, progress)
    setAct(current.index)
    if (progress > 0) setPrinted(true)
    rideCopy(progress)
    if (current.index === proofIndex) {
      // Typing starts 3% into the act, so the first line is about half typed by the time the panel's ride brings
      // it to full opacity at about 0.1. The last line is typed by about 0.49, and the readout rests for about
      // 0.57 viewport-heights before the stack closes at 0.8.
      stageRef.current?.querySelectorAll<HTMLElement>('.teardown__readout li').forEach((li, i, all) => {
        li.style.setProperty('--typed', clamp((current.local - 0.03) * all.length * 2.2 - i, 0, 1).toFixed(3))
      })
    }
  }, [windows, proofIndex, rideCopy])

  // Scroll drives the copy only in dom mode, before the renderer is ready and after a fallback. The stage is
  // transparent in every mode, so the chapter never reports the page background's cover signal (heroCover.ts).
  useEffect(() => {
    if (!track || mode !== 'dom') return
    let raf = 0
    const update = () => {
      raf = 0
      const top = track.getBoundingClientRect().top + window.scrollY
      follow(sceneProgress(window.scrollY - top, track.offsetHeight, stageRef.current?.clientHeight || window.innerHeight))
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
  }, [track, mode, follow])

  // The root carries teardown-pinned while the track spans the whole viewport, which is when the sticky
  // stage is pinned and covers it. base.css then dims the vintage overlay's scanlines and Background.tsx
  // stops the page graph's pointer halos, which otherwise light up across the product. This runs in dom
  // and gl mode alike, and the class never outlives the chapter. The same measurement starts the heading's
  // print once the stage's top third is on screen, so the title is typing as the stage arrives instead of
  // waiting for the pin.
  useEffect(() => {
    if (!track || isStatic) return
    const root = document.documentElement
    let raf = 0
    let pinned = false
    const update = () => {
      raf = 0
      const rect = track.getBoundingClientRect()
      if (rect.top < window.innerHeight * 0.65 && rect.bottom > 0) setPrinted(true)
      const next = rect.top <= 0.5 && rect.bottom + 0.5 >= window.innerHeight
      if (next === pinned) return
      pinned = next
      root.classList.toggle('teardown-pinned', pinned)
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update) }
    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      root.classList.remove('teardown-pinned')
    }
  }, [track, isStatic])

  // Focus inside a hidden act (the close act's links, which stay focusable) scrolls the window to the
  // middle of that act's window, so the act and the focused link are on screen. In gl mode the act then
  // follows once the glided progress arrives.
  useEffect(() => {
    if (!track || mode === 'static') return
    const onFocusIn = (event: FocusEvent) => {
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
        const progress = (lenis.targetScroll - top) / travel
        if (progress <= 0 || progress >= 1) return true
        const rests = restPoints(windows, window.innerWidth < NARROW_MAX)
        const nearest = rests.reduce((best, r) => Math.min(best, Math.abs(r - progress)), Infinity) * travel
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
  }, [track, windows, mode])

  useEffect(() => {
    if (!track || mode === 'static' || failed) return
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setNear(true)
      observer.disconnect()
    }, { rootMargin: '150% 0px' })
    observer.observe(track)
    return () => observer.disconnect()
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
      if (place) label.style.transform = `translate3d(${place.left.toFixed(1)}px, ${place.top.toFixed(1)}px, 0)`
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
        writes.push(() => { path.style.opacity = '0' })
        continue
      }
      // The path runs from the callout to the anchor, so its dash draws in from the callout's side.
      const d = route.map((point, k) => `${k ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join('')
      writes.push(() => {
        path.setAttribute('d', d)
        path.style.strokeDashoffset = (1 - drawn).toFixed(3)
        path.style.opacity = (0.75 * reveal).toFixed(3)
      })
    }
    writes.forEach((write) => write())
  }, [glassIndex])
  const onFrame = useCallback((frame: TeardownFrame) => {
    if (modeRef.current === 'gl') follow(frame.progress)
    placeOverlay(frame)
  }, [follow, placeOverlay])
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
      className={`teardown ${isStatic ? 'teardown--static' : `is-${mode}`}`}
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
            <TeardownCanvas story={story} track={track} onFrame={onFrame} onReady={onReady} onFallback={onFallback} />
          </Suspense>
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
            const phone = STATIC_PHONE_ACTS.has(a.key) ? screenFor(a.key) : null
            return (
              // The close act stays out of inert so its links keep their place in the tab order. See onFocusIn.
              <div
                key={a.key}
                className={`teardown__act teardown__act--${a.key}${isActive(ai) ? ' is-active' : ''}`}
                data-act-key={a.key}
                inert={!isActive(ai) && a.key !== 'close'}
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
    </section>
  )
}

export default memo(Teardown)
