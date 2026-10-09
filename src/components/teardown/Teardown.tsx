import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PhoneFrame from '../PhoneFrame'
import { setCovering } from '../hero/heroCover'
import Printed from '../hero/Printed'
import { sceneProgress } from '../hero/world'
import { lenisRef } from '../../scroll/lenisRef'
import type { ScreenKey, TeardownStory } from '../../content/teardown/types'
import type { TeardownFrame } from './TeardownCanvas'
import { PHONE, poseAt, projectPoint, type Interaction, type Pose, type Vec3 } from './rig'
import { actAt, actWindows, copyRide, localOf, ramp, totalSpan } from './timeline'
import '../../styles/teardown.css'

const TeardownCanvas = lazy(() => import('./TeardownCanvas'))

type Mode = 'dom' | 'gl' | 'static'
type Ride = ReturnType<typeof copyRide>

/** Screen the DOM stage shows per act, matching the rig's screen texture, which swaps to Home late in the quiet act. Acts not listed show Home. */
const ACT_SCREEN: Partial<Record<string, ScreenKey>> = { arrival: 'welcome', hand: 'welcome', day: 'welcome', quiet: 'welcome' }
/** Acts that show a phone in the reduced-motion layout, and the screen each shows. The day act's phone shows Home, the first screen its card labels name. */
const STATIC_PHONE: Partial<Record<string, ScreenKey>> = { arrival: 'welcome', hand: 'welcome', day: 'home', close: 'home' }
const AMBER = '#eab76a'
/** A card's label shows once the card's develop, 0 to 1, reaches this. */
const LABEL_DEVELOP = 0.85
/** CSS px every card label keeps from the stage edges. */
const LABEL_EDGE = 12
/** CSS px two shown card labels keep between them. */
const LABEL_GAP = 8
/** Stage widths below this use the phone layout, matching the 767px breakpoint in teardown.css. */
const NARROW_MAX = 768
/**
 * Share of the first and last acts over which their copy holds the centre. The arrival copy is in place
 * when the chapter pins and rides out over the act's last 60%, and the close copy rides in over the act's
 * first 60% and then holds, so the chapter opens and ends with its copy in place.
 */
const EDGE_HOLD = 0.4
/** CSS px the phone layout's copy region starts below the product's lowest projected point. */
const FLOOR_GAP = 12
/** A product part counts toward the floor once its opacity reaches this, so a card fading in or out off frame does not move the copy. */
const FLOOR_OPACITY = 0.05
/** copyRide's full travel, +0.45 to -0.45, in units of the ride scale. A phone ride is capped so that travel fits its region. */
const RIDE_SPAN = 0.9
/** copyRide's |y| while the copy is fully opaque. The phone ride is scaled so the block's top meets the floor there. */
const RIDE_OPAQUE = 0.28
/** Smallest phone ride scale as a fraction of the stage height, so a block with no headroom still moves. */
const RIDE_FLOOR = 0.08
/** Teardown has no pointer state, so the floor is taken from the still pose. A drag lowers the product by up to a tenth of the stage until it is released. */
const STILL: Interaction = { dragYaw: 0, tiltX: 0, tiltY: 0 }
const CORNERS: readonly [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
/** A leader line draws in as its callout's ride y falls from LINE_START to LINE_END, each callout LINE_STEP after the one above. */
const LINE_START = 0.4
const LINE_END = 0.24
const LINE_STEP = 0.025

const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value))
/** Local progress an act's copy rides on. The first act starts in place and the last settles in place (EDGE_HOLD). */
const rideLocal = (index: number, count: number, local: number) => {
  if (index === 0) return 0.5 + 0.5 * clamp((local - EDGE_HOLD) / (1 - EDGE_HOLD), 0, 1)
  if (index === count - 1) return 0.5 * clamp(local / (1 - EDGE_HOLD), 0, 1)
  return local
}

const prefersReduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Lowest projected point of the product as a fraction of the stage height, 0 when nothing projects. A part
 * counts while its opacity is at least FLOOR_OPACITY and its projection crosses the frame's width, so the
 * deck's cards move the floor only while they are in frame. The coach figure counts by its feet, `coachLow`
 * being the skeleton's lowest body-centred y.
 */
function productFloor(pose: Pose, aspect: number, coachLow: number): number {
  let low = 0
  const rect = (center: Vec3, right: Vec3, up: Vec3, halfW: number, halfH: number) => {
    let left = Infinity
    let rightEdge = -Infinity
    let bottom = 0
    for (const [u, v] of CORNERS) {
      const point: Vec3 = [
        center[0] + right[0] * u * halfW + up[0] * v * halfH,
        center[1] + right[1] * u * halfW + up[1] * v * halfH,
        center[2] + right[2] * u * halfW + up[2] * v * halfH,
      ]
      const at = projectPoint(pose, point, aspect)
      if (!at) return
      left = Math.min(left, at.x)
      rightEdge = Math.max(rightEdge, at.x)
      bottom = Math.max(bottom, at.y)
    }
    if (rightEdge > 0 && left < 1) low = Math.max(low, bottom)
  }
  const { phone } = pose
  rect(phone.pos, phone.right, phone.up, PHONE.hx, PHONE.hy)
  rect(pose.glass.center, phone.right, phone.up, PHONE.sx, PHONE.sy)
  for (const plane of [pose.screen, pose.code, ...pose.cards]) {
    if (plane.opacity >= FLOOR_OPACITY) rect(plane.center, plane.right, plane.up, plane.halfW, plane.halfH)
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
  const screenOf = (key: ScreenKey) => story.screens.find((s) => s.key === key) ?? story.screens[0]
  const screenFor = (actKey: string) => screenOf(ACT_SCREEN[actKey] ?? 'home')

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
  // rest on. Every height is read before the first write, so the call forces no layout of its own.
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
    const rides = windows.map((w, i) => copyRide(rideLocal(i, windows.length, localOf(windows, w.key, progress))))
    ridesRef.current = rides
    if (narrow && floor !== floorRef.current) {
      floorRef.current = floor
      rail.style.setProperty('--copy-floor', `${floor}px`)
    }
    acts.forEach((el, i) => {
      const ride = rides[i]
      if (!ride) return
      el.style.setProperty('--copy-y', `${((ride.y * scales[i] * 100) / stageH).toFixed(2)}svh`)
      el.style.setProperty('--copy-o', ride.opacity.toFixed(3))
    })
  }, [windows, floorAt])

  // Sets the act, the arrival print, the copy ride, and the proof readout from one progress value. The
  // scroll listener calls it in dom mode and onFrame calls it with the canvas's glided progress in gl mode,
  // so the copy moves in step with the stage the reader sees.
  const follow = useCallback((progress: number) => {
    const current = actAt(windows, progress)
    setAct(current.index)
    if (progress > 0) setPrinted(true)
    rideCopy(progress)
    if (current.index === proofIndex) {
      // Typing starts 3% into the act, so the first line is half typed by the time the panel's ride brings it to
      // full opacity at about 0.1, and the last line is typed by about 0.62, before the panel rides out.
      stageRef.current?.querySelectorAll<HTMLElement>('.teardown__readout li').forEach((li, i, all) => {
        li.style.setProperty('--typed', clamp((current.local - 0.03) * all.length * 1.7 - i, 0, 1).toFixed(3))
      })
    }
  }, [windows, proofIndex, rideCopy])

  // Scroll drives the copy only in dom mode, before the renderer is ready and after a fallback.
  useEffect(() => {
    if (!track || mode !== 'dom') return
    let raf = 0
    const update = () => {
      raf = 0
      const stage = stageRef.current
      const top = track.getBoundingClientRect().top + window.scrollY
      follow(sceneProgress(window.scrollY - top, track.offsetHeight, stage?.clientHeight || window.innerHeight))
      // TeardownCanvas reports cover under its own source once the renderer is ready. Until then, and
      // after a fallback, the opaque DOM stage reports it here. A collapsed phone toolbar leaves a strip
      // below the 100svh stage, so the stage must reach the visual viewport's bottom edge.
      if (stage) {
        const rect = stage.getBoundingClientRect()
        const visibleHeight = window.visualViewport?.height ?? window.innerHeight
        setCovering('teardown-dom', rect.top <= 0.5 && rect.bottom + 0.5 >= visibleHeight)
      }
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update) }
    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      setCovering('teardown-dom', false)
    }
  }, [track, mode, follow])

  // The root carries teardown-pinned while the track spans the whole viewport, which is when the sticky
  // stage is pinned and covers it, and base.css then dims the vintage overlay's scanlines. This runs in dom
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

    // Each card label is centred under its card and held inside the stage. It shows while its card has
    // developed to LABEL_DEVELOP and the card's anchor is in frame, so a deck card that has crossed off the
    // phone layout takes its label with it. Cards land in story order from the left, and a card slides past
    // the landed ones to its slot, so each shown label is pushed right of the one before it with LABEL_GAP
    // between, and the row is then pushed back from the right edge. A pushed label slides onto its centre as
    // its card lands. Hidden labels keep tracking their cards while they fade out.
    const labels = Array.from(stage.querySelectorAll<HTMLElement>('.teardown__card-label'), (label, k) => {
      const anchor = frame.anchors.get(label.dataset.anchor ?? '')
      if (!anchor) return { label, box: null, on: false }
      const w = label.offsetWidth
      const h = label.offsetHeight
      const box = { left: clamp(anchor.x - w / 2, LABEL_EDGE, stageRect.width - LABEL_EDGE - w), top: clamp(anchor.y, LABEL_EDGE, stageRect.height - LABEL_EDGE - h), w }
      const inFrame = anchor.x >= 0 && anchor.x <= stageRect.width && anchor.y >= 0 && anchor.y <= stageRect.height
      // cards is optional at runtime only while a hot reload has this file ahead of TeardownCanvas.
      return { label, box, on: inFrame && (frame.cards?.[k] ?? 0) >= LABEL_DEVELOP }
    })
    const row: { left: number; w: number }[] = []
    for (const entry of labels) if (entry.on && entry.box) row.push(entry.box)
    for (let i = 1; i < row.length; i++) row[i].left = Math.max(row[i].left, row[i - 1].left + row[i - 1].w + LABEL_GAP)
    for (let i = row.length - 1; i >= 0; i--) {
      const limit = i === row.length - 1 ? stageRect.width - LABEL_EDGE - row[i].w : row[i + 1].left - row[i].w - LABEL_GAP
      row[i].left = Math.min(row[i].left, limit)
    }
    labels.forEach(({ label, box, on }) => writes.push(() => {
      if (box) label.style.transform = `translate3d(${box.left.toFixed(1)}px, ${box.top.toFixed(1)}px, 0)`
      label.classList.toggle('is-on', on)
    }))

    // A leader line draws from its callout toward the anchor as the callout rides in (positive ride.y), holds
    // its full length on the way out, and fades with its callout through the opacity, so it never retracts
    // from the anchor while the callout is still readable. Its start follows the callout's ridden rect every
    // frame.
    stage.querySelectorAll<HTMLElement>('.teardown__callout[data-anchor]').forEach((label) => {
      const key = label.dataset.anchor ?? ''
      const line = svg.querySelector<SVGPathElement>(`path[data-anchor="${key}"]`)
      if (!line) return
      const [, ai, ci] = key.split(':').map(Number)
      const ride = ridesRef.current[ai]
      const anchor = gl ? frame.anchors.get(key) : null
      const start = LINE_START - LINE_STEP * ci
      const drawn = ride ? (ride.y > 0 ? 1 - ramp(ride.y, start - (LINE_START - LINE_END), start) : 1) : 0
      const reveal = anchor && ride ? drawn * ride.opacity : 0
      if (!anchor || reveal <= 0) {
        writes.push(() => { line.style.opacity = '0' })
        return
      }
      const r = label.getBoundingClientRect()
      const x1 = (r.right - stageRect.left + 8).toFixed(1)
      const y1 = (r.top + r.height / 2 - stageRect.top).toFixed(1)
      // The path runs from the callout to the anchor, so its dash draws in from the callout's side.
      const d = `M${x1} ${y1}L${anchor.x.toFixed(1)} ${anchor.y.toFixed(1)}`
      writes.push(() => {
        line.setAttribute('d', d)
        line.style.strokeDashoffset = (1 - drawn).toFixed(3)
        line.style.opacity = (0.75 * reveal).toFixed(3)
      })
    })
    writes.forEach((write) => write())
  }, [])
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
            const staticKey = STATIC_PHONE[a.key]
            const phone = staticKey ? screenOf(staticKey) : null
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
                  <ul className="teardown__callouts">
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
            {story.cards.map((card, k) => (
              <li key={card.screen} className="teardown__card-label" data-anchor={`k:${k}`}>{card.label}</li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

export default memo(Teardown)
