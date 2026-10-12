import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Printed from '../hero/Printed'
import { sceneProgress } from '../hero/world'
import { LABEL_DEVELOP, LABEL_OPACITY, layoutCardLabels, type CardShot, type LabelPlace } from '../teardown/labels'
import { routeLeaders, type Box, type Point } from '../teardown/leaders'
import { RIDE_FADE, actAt, actCopyRide, actWindows, previewEnd, previewProgress, previewTravel, ramp, totalSpan } from '../teardown/timeline'
import type { ChapterFrame } from './ChapterCanvas'
import { prefersReduced, setStyle } from './dom'
import { useFocusAct, useNearBoot, usePinnedStage, usePrintGate, useWheelDetent, type StageControl } from './stageHooks'
import type { ChapterStory } from './types'
import { useJourneyView } from './useJourneyView'
import '../../styles/teardown.css'
import '../../styles/chapter.css'

const ChapterCanvas = lazy(() => import('./ChapterCanvas'))

type Mode = 'dom' | 'gl' | 'static'
type Ride = ReturnType<typeof actCopyRide>

/** Stage widths below this use the phone layout, matching the 767px breakpoint in teardown.css. */
const NARROW_MAX = 768
/** CSS px the phone layout's copy region starts below the scene's lowest projected point. */
const FLOOR_GAP = 12
/** copyRide's full travel in units of the ride scale, its opaque |y|, and the smallest phone ride, as in Teardown. */
const RIDE_SPAN = 0.9
const RIDE_OPAQUE = RIDE_FADE[0]
const RIDE_FLOOR = 0.08
/** A leader draws in as its callout's ride y falls from LINE_START to LINE_END, each callout LINE_STEP later. */
const LINE_START = 0.4
const LINE_END = 0.24
const LINE_STEP = 0.025
/** CSS px a phone readout keeps above the stage's bottom edge while it types in. */
const READOUT_CLEAR = 20
/** Fonts already requested, by stylesheet URL. */
const fontsLoaded = new Set<string>()

/**
 * Places panel labels row by row. Labels that can show and whose anchors sit within a label's height of each other
 * form a row, which layoutCardLabels pushes apart, and labels in other rows keep their places. A label that cannot
 * show (undeveloped or faded) is placed alone, so a hidden anchor between two shown labels never chains them into
 * one row. ParkiWell's cards always hang in one row, but a compass of cards or a fan of scenes hangs labels at
 * several heights, and one row would push a label away from a card it does not overlap. Every card still counts as
 * cover for every label.
 */
function layoutLabelRows(panels: readonly CardShot[], sizes: readonly { w: number; h: number }[], stage: { width: number; height: number }) {
  const rows: number[][] = []
  panels.forEach((panel, k) => {
    const y = panel.anchor?.y
    if (y === undefined) return
    if (panel.develop < LABEL_DEVELOP || panel.opacity < LABEL_OPACITY) {
      rows.push([k])
      return
    }
    const row = rows.find((r) => {
      const first = panels[r[0]]
      if (first.develop < LABEL_DEVELOP || first.opacity < LABEL_OPACITY) return false
      return r.some((j) => Math.abs((panels[j].anchor?.y ?? Infinity) - y) < Math.max(sizes[j]?.h ?? 0, sizes[k]?.h ?? 0))
    })
    if (row) row.push(k)
    else rows.push([k])
  })
  const places: (LabelPlace | null)[] = panels.map(() => null)
  for (const row of rows) {
    const members = new Set(row)
    const masked = panels.map((panel, k) => (members.has(k) ? panel : { ...panel, anchor: null }))
    layoutCardLabels(masked, sizes, stage).forEach((place, k) => { if (members.has(k)) places[k] = place })
  }
  return places
}

/**
 * One project told as a pinned chapter on the generic engine, in the same two views as ParkiWell's teardown: the
 * home page's preview pins the arrival and holds it with the centrepiece clickable, and the journey at /<id> pins
 * the whole story. The story's theme sets the fonts and colours through custom properties on the section. Copy
 * is real DOM in reading order, and the canvas only draws.
 */
function Chapter({ story }: { story: ChapterStory }) {
  const [track, setTrack] = useState<HTMLElement | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const linesRef = useRef<SVGSVGElement>(null)
  const hitRef = useRef<HTMLButtonElement>(null)
  const modeRef = useRef<Mode>('dom')
  const ridesRef = useRef<Ride[]>([])
  const floorRef = useRef(-1)
  /** The phone layout's floor from the last frame, stage px. */
  const frameFloorRef = useRef(0)
  const controlRef = useRef<StageControl | null>(null)
  const progressRef = useRef(0)
  const [mode, setMode] = useState<Mode>(() => (prefersReduced() ? 'static' : 'dom'))
  const [failed, setFailed] = useState(false)
  const [act, setAct] = useState(0)
  const actRef = useRef(0)
  /** The chosen value per command, for the act's choice buttons. */
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const choose = useCallback((command: string, value: string) => {
    setChosen((current) => ({ ...current, [command]: value }))
    controlRef.current?.command?.(command, value)
  }, [])
  const isStatic = mode === 'static'
  const { printed, requestPrint, allowPrint } = usePrintGate()
  const pinMeasureRef = usePinnedStage(track, !isStatic, `chapter:${story.id}`, requestPrint)
  const { view, viewRef, open, back, returnRef } = useJourneyView({
    id: story.id,
    title: `${story.name} ${story.titleNoun} · Jesse Chen`,
    track,
    stageRef,
    controlRef,
    progressRef,
    pinMeasureRef,
    previewEnd: previewEnd(story.acts),
    previewEndFraction: (previewEnd(story.acts) * totalSpan(story.acts)) / previewTravel(story.acts),
  })
  const windows = useMemo(() => actWindows(story.acts), [story])
  const travel = view === 'journey' ? totalSpan(story.acts) : previewTravel(story.acts)
  const toProgress = useCallback((fraction: number) => (viewRef.current === 'preview' ? previewProgress(fraction, story.acts) : fraction), [story, viewRef])
  const near = useNearBoot(track, mode !== 'static' && !failed, viewRef, true)

  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { actRef.current = act }, [act])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setMode(query.matches ? 'static' : 'dom')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  // The theme's fonts load as the chapter nears, or at once on its journey page or under reduced motion.
  useEffect(() => {
    if (!(near || view === 'journey' || isStatic) || fontsLoaded.has(story.theme.fontsHref)) return
    fontsLoaded.add(story.theme.fontsHref)
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = story.theme.fontsHref
    document.head.appendChild(link)
  }, [near, view, isStatic, story])

  const detentRests = useCallback(() => {
    const preview = viewRef.current === 'preview'
    const scale = preview ? totalSpan(story.acts) / previewTravel(story.acts) : 1
    const last = preview ? previewEnd(story.acts) + 1e-9 : 1
    return windows
      .map((w, i) => w.start + (story.restLocal[i] ?? 0.7) * (w.end - w.start))
      .filter((r) => r <= last)
      .map((r) => r * scale)
  }, [windows, story, viewRef])
  useWheelDetent(track, stageRef, mode !== 'static', detentRests)
  useFocusAct(track, stageRef, mode !== 'static', windows, actRef, viewRef, '.teardown__act')

  // Rides every act's copy block with the scroll (--copy-y in svh, --copy-o), as Teardown.rideCopy. On phones the
  // copy region starts at the scene's floor, FLOOR_GAP below its lowest projected point.
  const rideCopy = useCallback((progress: number) => {
    const stage = stageRef.current
    const rail = railRef.current
    if (!stage || !rail) return
    const stageH = stage.clientHeight || 1
    const narrow = stage.clientWidth < NARROW_MAX
    const acts = Array.from(rail.children) as HTMLElement[]
    const floor = narrow ? Math.round(modeRef.current === 'gl' && frameFloorRef.current > 0 ? frameFloorRef.current + FLOOR_GAP : stageH * 0.58) : 0
    const railTop = rail.offsetTop
    const scales = acts.map((el) => {
      if (!narrow) return stageH
      const headroom = railTop + el.offsetTop - floor
      return Math.min((stageH - floor) / RIDE_SPAN, Math.max(RIDE_FLOOR * stageH, Math.abs(headroom) / RIDE_OPAQUE))
    })
    const readoutIndex = story.acts.findIndex((a) => a.readout?.length)
    const readout = narrow && readoutIndex >= 0 ? acts[readoutIndex] : undefined
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
  }, [windows, story])

  const follow = useCallback((progress: number) => {
    progressRef.current = progress
    const current = actAt(windows, progress)
    setAct(current.index)
    if (progress > 0) requestPrint()
    rideCopy(progress)
    if (story.acts[current.index]?.readout?.length) {
      stageRef.current?.querySelectorAll<HTMLElement>(`.teardown__act:nth-child(${current.index + 1}) .teardown__readout li`).forEach((li, i, all) => {
        setStyle(li, '--typed', Math.min(1, Math.max(0, (current.local - 0.03) * all.length * 2.2 - i)).toFixed(3))
      })
    }
  }, [windows, story, rideCopy, requestPrint])

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

  // Panel labels and leader lines for one frame, read first and written after, as Teardown.placeOverlay.
  const placeOverlay = useCallback((frame: ChapterFrame) => {
    const stage = stageRef.current
    const svg = linesRef.current
    if (!stage || !svg) return
    const gl = modeRef.current === 'gl'
    const stageRect = stage.getBoundingClientRect()
    const writes: (() => void)[] = []
    const labels = Array.from(stage.querySelectorAll<HTMLElement>('.teardown__card-label'))
    const sizes = labels.map((label) => ({ w: label.offsetWidth, h: label.offsetHeight }))
    const places = layoutLabelRows(frame.panels, sizes, { width: stageRect.width, height: stageRect.height })
    labels.forEach((label, k) => writes.push(() => {
      const place = places[k]
      if (place) setStyle(label, 'transform', `translate3d(${place.left.toFixed(1)}px, ${place.top.toFixed(1)}px, 0)`)
      label.classList.toggle('is-on', place?.on ?? false)
    }))
    const narrow = stageRect.width < NARROW_MAX
    const clipTop = narrow && railRef.current ? railRef.current.getBoundingClientRect().top : -Infinity
    const leaders = Array.from(stage.querySelectorAll<HTMLElement>('.teardown__callout[data-anchor]'), (label) => {
      const key = label.dataset.anchor ?? ''
      const ai = Number(label.dataset.act ?? -1)
      const ci = Number(label.dataset.index ?? 0)
      const ride = ridesRef.current[ai]
      const rect = gl && ride && ride.opacity > 0 ? label.getBoundingClientRect() : null
      const box: Box | null = rect && rect.top + rect.height / 2 >= clipTop
        ? { left: rect.left - stageRect.left, top: rect.top - stageRect.top, right: rect.right - stageRect.left, bottom: rect.bottom - stageRect.top }
        : null
      return { key, ai, ci, ride, box, anchor: gl ? frame.anchors.get(label.dataset.point ?? '') ?? null : null, path: svg.querySelector<SVGPathElement>(`path[data-anchor="${key}"]`) }
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
    const hit = hitRef.current
    if (hit) {
      const r = frame.hit
      writes.push(() => {
        setStyle(hit, '--hit-x', `${(r?.left ?? 0).toFixed(1)}px`)
        setStyle(hit, '--hit-y', `${(r?.top ?? 0).toFixed(1)}px`)
        setStyle(hit, '--hit-w', `${(r?.width ?? 0).toFixed(1)}px`)
        setStyle(hit, '--hit-h', `${(r?.height ?? 0).toFixed(1)}px`)
      })
    }
    writes.forEach((write) => write())
  }, [])
  const onFrame = useCallback((frame: ChapterFrame) => {
    frameFloorRef.current = frame.floor
    if (modeRef.current === 'gl') follow(frame.progress)
    placeOverlay(frame)
  }, [follow, placeOverlay])
  const onReady = useCallback((formMs: number) => {
    setMode((m) => (m === 'static' ? m : 'gl'))
    window.setTimeout(allowPrint, formMs ? formMs * 0.7 : 300)
  }, [allowPrint])
  const onFallback = useCallback(() => {
    allowPrint()
    setFailed(true)
    setMode((m) => (m === 'static' ? m : 'dom'))
  }, [allowPrint])

  const isActive = (index: number) => isStatic || index === act
  const actKey = story.acts[act]?.key ?? story.acts[0].key
  const titleId = `project-${story.id}-title`
  const tipId = `chapter-${story.id}-tip`
  const sectionStyle = { ...story.theme.vars, '--teardown-travel': travel } as CSSProperties
  const lastIndex = story.acts.length - 1

  return (
    <section
      ref={setTrack}
      id={`project-${story.id}`}
      className={`teardown story story--${story.id} teardown--${view}${view === 'journey' ? ' is-journey' : ''} ${isStatic ? 'teardown--static' : `is-${mode}`}${!isStatic && mode === 'dom' && !failed ? ' is-loading' : ''}`}
      style={sectionStyle}
      data-act={isStatic ? undefined : actKey}
      aria-labelledby={titleId}
    >
      <div ref={stageRef} className="teardown__stage">
        {!isStatic && failed && (
          <div className="teardown__dom-stage story__poster">
            <img src={story.poster.src} alt={story.poster.alt} loading="lazy" decoding="async" />
          </div>
        )}
        {!isStatic && near && !failed && track && (
          <Suspense fallback={null}>
            <ChapterCanvas story={story} track={track} onFrame={onFrame} onReady={onReady} onFallback={onFallback} view={viewRef} control={controlRef} />
          </Suspense>
        )}
        {/* The centrepiece opens the journey. This target follows its projected bounds, and the open button in the
            arrival copy is the keyboard and screen-reader control for the same action. */}
        {!isStatic && view === 'preview' && mode === 'gl' && (
          <button ref={hitRef} type="button" className="teardown__phone-hit" aria-hidden="true" tabIndex={-1} onClick={open} />
        )}
        <svg ref={linesRef} className="teardown__leaders" aria-hidden="true">
          <defs>
            <marker id={tipId} viewBox="0 0 5 5" refX="2.5" refY="2.5" markerWidth="5" markerHeight="5" markerUnits="userSpaceOnUse">
              <rect width="5" height="5" className="story__tip" />
            </marker>
          </defs>
          {story.acts.flatMap((a, ai) => a.callouts.map((c) => (
            <path key={`${ai}:${c.anchor}`} data-anchor={`${ai}:${c.anchor}`} pathLength={1} markerEnd={`url(#${tipId})`} />
          )))}
        </svg>

        <div ref={railRef} className="teardown__rail">
          {story.acts.map((a, ai) => {
            if (isStatic && view === 'preview' && ai > 0) return null
            return (
              <div
                key={a.key}
                className={`teardown__act teardown__act--${a.key}${ai === 0 ? ' teardown__act--arrival' : ''}${ai === lastIndex ? ' teardown__act--close' : ''}${isActive(ai) ? ' is-active' : ''}`}
                data-act-key={a.key}
                inert={view === 'preview' ? ai > 0 : !isActive(ai) && ai !== lastIndex}
              >
                {isStatic && ai === 0 && <img className="story__static-poster" src={story.poster.src} alt={story.poster.alt} loading="lazy" decoding="async" />}
                {ai === 0 ? (
                  <>
                    <h3 id={titleId} className="teardown__title">
                      {isStatic ? <span>{a.lines[0]}</span> : printed ? <span><Printed text={a.lines[0]} delay={0} speed={14} /></span> : (
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
                      [ step inside <span aria-hidden="true">→</span> ]
                    </button>
                  </>
                ) : (
                  <>
                    {a.eyebrow && <p className="teardown__eyebrow"><span aria-hidden="true">// </span>{a.eyebrow}</p>}
                    {a.lines.map((line) => <p key={line} className="teardown__line">{line}</p>)}
                  </>
                )}
                {a.choices && a.choices.length > 0 && !isStatic && (
                  <p className="story__choices">
                    {a.choices.map((c, k) => {
                      const on = (chosen[c.command] ?? a.choices?.[0]?.value) === c.value
                      return (
                        <button key={c.value} type="button" className={`story__choice${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => choose(c.command, c.value)} data-index={k}>
                          [ {c.label} ]
                        </button>
                      )
                    })}
                  </p>
                )}
                {a.readout && a.readout.length > 0 && (
                  <ul className="teardown__readout">
                    {a.readout.map((line) => (
                      <li key={line}><span className="teardown__prompt" aria-hidden="true">$</span> {line}</li>
                    ))}
                  </ul>
                )}
                {a.callouts.length > 0 && (
                  <ul className="teardown__callouts teardown__callouts--anchored">
                    {a.callouts.map((c, ci) => (
                      <li key={c.text} className="teardown__callout" data-anchor={`${ai}:${c.anchor}`} data-point={c.anchor} data-act={ai} data-index={ci}>
                        <span className="teardown__slashes" aria-hidden="true">//</span> {c.text}
                      </li>
                    ))}
                  </ul>
                )}
                {ai === lastIndex && (
                  <>
                    <p className="teardown__tags">{story.tags.map((t) => <span key={t} className="teardown__tag">[{t}]</span>)}</p>
                    {story.links.length > 0 && (
                      <p className="teardown__links">
                        {story.links.map((l) => (
                          <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="teardown__link">[ {l.label} ↗ ]</a>
                        ))}
                      </p>
                    )}
                    {story.credit && <p className="story__credit">{story.credit}</p>}
                    {view === 'journey' && !isStatic && (
                      <p ref={returnRef} className="teardown__return" aria-hidden="true">
                        <span>// keep scrolling to return home</span>
                        <span className="teardown__return-bar" />
                      </p>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>

        {!isStatic && story.panels.length > 0 && (
          <ol className="teardown__cards is-active" aria-label={`${story.name} highlights`}>
            {story.panels.map((label) => <li key={label} className="teardown__card-label">{label}</li>)}
          </ol>
        )}
      </div>
      <button type="button" className={`teardown__back${view === 'journey' ? ' is-shown' : ''}`} onClick={back} inert={view !== 'journey'}>
        [ <span aria-hidden="true">←</span> back ]
      </button>
    </section>
  )
}

export default memo(Chapter)
