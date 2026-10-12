import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type Ref } from 'react'
import Printed from '../hero/Printed'
import { sceneProgress } from '../hero/world'
import { usePinnedStage, usePrintGate, useWheelDetent } from '../chapter/stageHooks'
import { setStyle } from '../chapter/dom'
import { layoutLabelRows } from '../teardown/labels'
import { routeLeaders, type Box, type Point } from '../teardown/leaders'
import { RIDE_FADE, actAt, actCopyRide, actWindows, ramp, totalSpan } from '../teardown/timeline'
import type { StageFrame } from './RolesStage'
import type { RoleFacts, RoleStory } from './types'
import '../../styles/teardown.css'

/** Stage widths below this use the phone layout, matching the 767px breakpoint in teardown.css. */
const NARROW_MAX = 768
/** CSS px the phone layout's copy region starts below the island's lowest projected point. */
const FLOOR_GAP = 12
/** copyRide's full travel in units of the ride scale, its opaque |y|, and the smallest phone ride, as in Chapter. */
const RIDE_SPAN = 0.9
const RIDE_OPAQUE = RIDE_FADE[0]
const RIDE_FLOOR = 0.08
/** A leader draws in as its callout's ride y falls from LINE_START to LINE_END, each callout LINE_STEP later. */
const LINE_START = 0.4
const LINE_END = 0.24
const LINE_STEP = 0.025

export interface RoleJourneyHandle {
  onFrame(frame: StageFrame): void
  onReady(): void
}

export interface RoleJourneyProps {
  story: RoleStory
  facts: RoleFacts
  roles: readonly { id: string; company: string; accent: string }[]
  isStatic: boolean
  /** Set during the commit, before the section's layout effects attach the stage to this journey. */
  trackRef: MutableRefObject<HTMLElement | null>
  stageRef: MutableRefObject<HTMLDivElement | null>
  handle: Ref<RoleJourneyHandle>
  returnRef: Ref<HTMLParagraphElement | null>
  onBack(): void
  onSwitch(id: string): void
  onChoose(command: string, value: string): void
}

/**
 * One role's journey: a pinned track whose acts ride a copy card on the right of the island (below it on phones),
 * with leaders, panel labels, a rail of every role's stop along the bottom, and the back control. The island is
 * drawn by the section's shared stage, which calls `handle.onFrame` every frame. Under reduced motion the acts stack
 * in normal flow with the role's poster.
 */
function RoleJourney({ story, facts, roles, isStatic, trackRef, stageRef, handle, returnRef, onBack, onSwitch, onChoose }: RoleJourneyProps) {
  const [track, setTrack] = useState<HTMLElement | null>(null)
  const localStage = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const linesRef = useRef<SVGSVGElement>(null)
  const ridesRef = useRef<ReturnType<typeof actCopyRide>[]>([])
  const floorRef = useRef(-1)
  const frameFloorRef = useRef(0)
  const [act, setAct] = useState(0)
  const [ready, setReady] = useState(false)
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const { printed, requestPrint, allowPrint } = usePrintGate()
  const windows = useMemo(() => actWindows(story.acts), [story])
  const travel = totalSpan(story.acts)
  const lastIndex = story.acts.length - 1

  const setTrackEl = useCallback((el: HTMLElement | null) => {
    trackRef.current = el
    setTrack(el)
  }, [trackRef])
  const setStageEl = useCallback((el: HTMLDivElement | null) => {
    stageRef.current = el
    localStage.current = el
  }, [stageRef])
  usePinnedStage(track, !isStatic, `role:${story.id}`, requestPrint)
  const rests = useCallback(() => windows.map((w, i) => w.start + (story.restLocal[i] ?? 0.6) * (w.end - w.start)), [windows, story])
  useWheelDetent(track, localStage, !isStatic, rests)

  // Rides every act's card with the scroll (--copy-y in svh, --copy-o), as Chapter.rideCopy. On phones the copy
  // region starts at the island's floor.
  const rideCopy = useCallback((progress: number) => {
    const stage = localStage.current
    const rail = railRef.current
    if (!stage || !rail) return
    const stageH = stage.clientHeight || 1
    const narrow = stage.clientWidth < NARROW_MAX
    const acts = Array.from(rail.children) as HTMLElement[]
    const floor = narrow ? Math.round(frameFloorRef.current > 0 ? frameFloorRef.current + FLOOR_GAP : stageH * 0.55) : 0
    const railTop = rail.offsetTop
    const rides = windows.map((_, i) => actCopyRide(windows, i, progress))
    ridesRef.current = rides
    if (narrow && floor !== floorRef.current) {
      floorRef.current = floor
      rail.style.setProperty('--copy-floor', `${floor}px`)
    }
    acts.forEach((el, i) => {
      const ride = rides[i]
      if (!ride) return
      const scale = narrow ? Math.min((stageH - floor) / RIDE_SPAN, Math.max(RIDE_FLOOR * stageH, Math.abs(railTop + el.offsetTop - floor) / RIDE_OPAQUE)) : stageH
      setStyle(el, '--copy-y', `${((ride.y * scale * 100) / stageH).toFixed(2)}svh`)
      setStyle(el, '--copy-o', ride.opacity.toFixed(3))
    })
  }, [windows])

  const follow = useCallback((progress: number) => {
    const current = actAt(windows, progress)
    setAct(current.index)
    rideCopy(progress)
    const readout = story.acts[current.index]?.readout
    if (readout?.length) {
      localStage.current?.querySelectorAll<HTMLElement>(`.teardown__act:nth-child(${current.index + 1}) .teardown__readout li`).forEach((li, i, all) => {
        setStyle(li, '--typed', Math.min(1, Math.max(0, (current.local - 0.03) * all.length * 2.2 - i)).toFixed(3))
      })
    }
  }, [windows, story, rideCopy])

  // Before the island's first frame, and without WebGL, the copy follows the scroll directly.
  useEffect(() => {
    if (!track || ready) return
    let raf = 0
    const update = () => {
      raf = 0
      const top = track.getBoundingClientRect().top + window.scrollY
      follow(sceneProgress(window.scrollY - top, track.offsetHeight, localStage.current?.clientHeight || window.innerHeight))
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update) }
    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule)
    }
  }, [track, ready, follow])

  const placeOverlay = useCallback((frame: StageFrame) => {
    const stage = localStage.current
    const svg = linesRef.current
    if (!stage || !svg) return
    const stageRect = stage.getBoundingClientRect()
    const writes: (() => void)[] = []
    const labels = Array.from(stage.querySelectorAll<HTMLElement>('.teardown__card-label'))
    const sizes = labels.map((label) => ({ w: label.offsetWidth, h: label.offsetHeight }))
    const panels = frame.panels.map((panel) => ({
      ...panel,
      anchor: panel.anchor && { x: panel.anchor.x - stageRect.left, y: panel.anchor.y - stageRect.top },
      rect: panel.rect && { left: panel.rect.left - stageRect.left, top: panel.rect.top - stageRect.top, right: panel.rect.right - stageRect.left, bottom: panel.rect.bottom - stageRect.top },
    }))
    const places = layoutLabelRows(panels, sizes, { width: stageRect.width, height: stageRect.height })
    labels.forEach((label, k) => writes.push(() => {
      const place = places[k]
      if (place) setStyle(label, 'transform', `translate3d(${place.left.toFixed(1)}px, ${place.top.toFixed(1)}px, 0)`)
      label.classList.toggle('is-on', place?.on ?? false)
    }))
    const narrow = stageRect.width < NARROW_MAX
    const clipTop = narrow && railRef.current ? railRef.current.getBoundingClientRect().top : -Infinity
    const leaders = Array.from(stage.querySelectorAll<HTMLElement>('.teardown__callout[data-anchor]'), (label) => {
      const ai = Number(label.dataset.act ?? -1)
      const ride = ridesRef.current[ai]
      const rect = ride && ride.opacity > 0 ? label.getBoundingClientRect() : null
      const box: Box | null = rect && rect.top + rect.height / 2 >= clipTop
        ? { left: rect.left - stageRect.left, top: rect.top - stageRect.top, right: rect.right - stageRect.left, bottom: rect.bottom - stageRect.top }
        : null
      const at = frame.anchors.get(label.dataset.point ?? '') ?? null
      return {
        key: label.dataset.anchor ?? '',
        ai,
        ci: Number(label.dataset.index ?? 0),
        ride,
        box,
        anchor: at && { x: at.x - stageRect.left, y: at.y - stageRect.top },
        path: svg.querySelector<SVGPathElement>(`path[data-anchor="${label.dataset.anchor ?? ''}"]`),
      }
    })
    const routes = new Map<string, Point[] | null>()
    for (const ai of new Set(leaders.map((leader) => leader.ai))) {
      const group = leaders.filter((leader) => leader.ai === ai)
      const route = routeLeaders(group.map((leader) => leader.box), group.map((leader) => leader.anchor), narrow)
      group.forEach((leader, k) => routes.set(leader.key, route[k]))
    }
    for (const { key, ci, ride, path } of leaders) {
      if (!path) continue
      const route = routes.get(key)
      const lineStart = LINE_START - LINE_STEP * ci
      const drawn = ride ? (ride.y > 0 ? 1 - ramp(ride.y, lineStart - (LINE_START - LINE_END), lineStart) : 1) : 0
      const reveal = route && ride ? drawn * ride.opacity : 0
      if (!route || reveal <= 0) {
        writes.push(() => setStyle(path, 'opacity', '0'))
        continue
      }
      const d = route.map((point, k) => `${k ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join('')
      writes.push(() => {
        setStyle(path, 'd', d)
        setStyle(path, 'strokeDashoffset', (1 - drawn).toFixed(3))
        setStyle(path, 'opacity', (0.75 * reveal).toFixed(3))
      })
    }
    writes.forEach((write) => write())
  }, [])

  useImperativeHandle(handle, () => ({
    onFrame(frame) {
      frameFloorRef.current = frame.floor
      follow(frame.progress)
      placeOverlay(frame)
    },
    onReady() {
      setReady(true)
      window.setTimeout(allowPrint, 500)
    },
  }), [follow, placeOverlay, allowPrint])

  useEffect(() => { if (isStatic) allowPrint() }, [isStatic, allowPrint])

  const choose = (command: string, value: string) => {
    setChosen((current) => ({ ...current, [command]: value }))
    onChoose(command, value)
  }
  const titleId = `role-${story.id}-title`
  const tipId = `role-${story.id}-tip`
  const actKey = story.acts[act]?.key ?? story.acts[0].key
  const [title, lede, ...rest] = story.acts[0].lines

  return (
    <section
      ref={setTrackEl}
      className={`teardown role-journey role-journey--${story.id} teardown--journey is-journey ${isStatic ? 'teardown--static' : 'is-gl'}`}
      style={{ '--teardown-travel': travel, '--role-accent': facts.accent } as CSSProperties}
      data-act={isStatic ? undefined : actKey}
      aria-labelledby={titleId}
    >
      <div ref={setStageEl} className="teardown__stage">
        <svg ref={linesRef} className="teardown__leaders" aria-hidden="true">
          <defs>
            <marker id={tipId} viewBox="0 0 5 5" refX="2.5" refY="2.5" markerWidth="5" markerHeight="5" markerUnits="userSpaceOnUse">
              <rect width="5" height="5" className="role-journey__tip" />
            </marker>
          </defs>
          {story.acts.flatMap((a, ai) => a.callouts.map((c) => <path key={`${ai}:${c.anchor}`} data-anchor={`${ai}:${c.anchor}`} pathLength={1} markerEnd={`url(#${tipId})`} />))}
        </svg>

        <div ref={railRef} className="teardown__rail">
          {story.acts.map((a, ai) => (
            <div
              key={a.key}
              className={`teardown__act teardown__act--${a.key}${ai === 0 ? ' teardown__act--arrival' : ''}${ai === lastIndex ? ' teardown__act--close' : ''}${isStatic || ai === act ? ' is-active' : ''}`}
              data-act-key={a.key}
              inert={!isStatic && ai !== act && ai !== lastIndex}
            >
              {isStatic && ai === 0 && <img className="role-journey__poster" src={story.poster.src} alt={story.poster.alt} loading="lazy" decoding="async" />}
              {ai === 0 ? (
                <>
                  <p className="teardown__eyebrow role-journey__meta">{facts.period} · {facts.location}{facts.status ? ` · ${facts.status}` : ''}</p>
                  <h3 id={titleId} className="teardown__title">
                    {isStatic ? title : printed ? <Printed text={title} delay={0} speed={14} /> : (
                      <>
                        <span className="sr-only">{title}</span>
                        <span className="teardown__unprinted" aria-hidden="true">{title}</span>
                      </>
                    )}
                  </h3>
                  {lede && <p className="teardown__line teardown__lede">{lede}</p>}
                  {rest.map((line) => <p key={line} className="teardown__line">{line}</p>)}
                </>
              ) : (
                <>
                  {a.eyebrow && <p className="teardown__eyebrow">{a.eyebrow}</p>}
                  {a.lines.map((line) => <p key={line} className="teardown__line">{line}</p>)}
                </>
              )}
              {a.choices && a.choices.length > 0 && !isStatic && (
                <p className="role-journey__choices">
                  {a.choices.map((c) => {
                    const on = (chosen[c.command] ?? a.choices?.[0]?.value) === c.value
                    return (
                      <button key={c.value} type="button" className={`role-journey__choice${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => choose(c.command, c.value)}>
                        {c.label}
                      </button>
                    )
                  })}
                </p>
              )}
              {a.readout && a.readout.length > 0 && (
                <ul className="teardown__readout">
                  {a.readout.map((line) => <li key={line}><span className="teardown__prompt" aria-hidden="true">›</span> {line}</li>)}
                </ul>
              )}
              {a.callouts.length > 0 && (
                <ul className="teardown__callouts teardown__callouts--anchored">
                  {a.callouts.map((c, ci) => (
                    <li key={c.text} className="teardown__callout" data-anchor={`${ai}:${c.anchor}`} data-point={c.anchor} data-act={ai} data-index={ci}>{c.text}</li>
                  ))}
                </ul>
              )}
              {ai === lastIndex && (
                <>
                  <p className="teardown__tags">{facts.stack.map((t) => <span key={t} className="teardown__tag">{t}</span>)}</p>
                  {story.links.length > 0 && (
                    <p className="teardown__links">
                      {story.links.map((l) => <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="teardown__link">{l.label} ↗</a>)}
                    </p>
                  )}
                  {story.credit && <p className="role-journey__credit">{story.credit}</p>}
                  {!isStatic && (
                    <p ref={returnRef} className="teardown__return" aria-hidden="true">
                      <span>keep scrolling to return home</span>
                      <span className="teardown__return-bar" />
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {!isStatic && story.panels.length > 0 && (
          <ol className="teardown__cards is-active" aria-label={`${facts.company} highlights`}>
            {story.panels.map((label) => <li key={label} className="teardown__card-label">{label}</li>)}
          </ol>
        )}

        <nav className="role-journey__stops" aria-label="Other roles">
          {roles.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`role-journey__stop${r.id === story.id ? ' is-on' : ''}`}
              style={{ '--stop-accent': r.accent } as CSSProperties}
              aria-current={r.id === story.id ? 'page' : undefined}
              onClick={() => onSwitch(r.id)}
            >
              <span className="role-journey__dot" aria-hidden="true" />
              {r.company}
            </button>
          ))}
        </nav>
      </div>
      <button type="button" className="teardown__back is-shown role-journey__back" onClick={onBack}>
        <span aria-hidden="true">←</span> back
      </button>
    </section>
  )
}

export default memo(RoleJourney)
