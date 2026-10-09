import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PhoneFrame from '../PhoneFrame'
import { setCovering } from '../hero/heroCover'
import Printed from '../hero/Printed'
import { sceneProgress } from '../hero/world'
import { lenisRef } from '../../scroll/lenisRef'
import type { ScreenKey, TeardownStory } from '../../content/teardown/types'
import type { TeardownFrame } from './TeardownCanvas'
import { actAt, actWindows, totalSpan } from './timeline'
import '../../styles/teardown.css'

const TeardownCanvas = lazy(() => import('./TeardownCanvas'))

type Mode = 'dom' | 'gl' | 'static'

/** Screen the DOM stage and the static layout show per act. Acts not listed show Home. */
const ACT_SCREEN: Partial<Record<string, ScreenKey>> = { arrival: 'welcome', hand: 'welcome' }
/** Acts that show a phone in the reduced-motion layout. */
const STATIC_PHONE = new Set(['arrival', 'hand', 'day', 'close'])
const AMBER = '#eab76a'
/** Milliseconds the copy keeps moving after an act change: the .2 s --td-handoff and .9 s rise in teardown.css, three 90 ms stagger steps, and margin. */
const COPY_MS = 1500

const prefersReduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * One project told as a pinned teardown. The track's height reserves the
 * pinned travel up front, so the Projects placeholder can match it and the
 * page never grows under the reader. Copy is real DOM in reading order, and
 * the canvas only draws.
 */
function Teardown({ story }: { story: TeardownStory }) {
  const [track, setTrack] = useState<HTMLElement | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const linesRef = useRef<SVGSVGElement>(null)
  const modeRef = useRef<Mode>('dom')
  const lastFrame = useRef<TeardownFrame | null>(null)
  const [mode, setMode] = useState<Mode>(() => (prefersReduced() ? 'static' : 'dom'))
  const [near, setNear] = useState(false)
  const [failed, setFailed] = useState(false)
  const [act, setAct] = useState(0)
  const actRef = useRef(0)
  const [printed, setPrinted] = useState(false)
  const windows = useMemo(() => actWindows(story.acts), [story])
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

  // Sets the act, the arrival print, and the proof readout from one progress value. The scroll listener
  // calls it in dom mode and onFrame calls it with the canvas's glided progress in gl mode, so the copy
  // changes in step with the stage the reader sees.
  const followProgress = useCallback((progress: number) => {
    const current = actAt(windows, progress)
    setAct(current.index)
    if (progress > 0) setPrinted(true)
    if (current.index === proofIndex) {
      stageRef.current?.querySelectorAll<HTMLElement>('.teardown__readout li').forEach((li, i, all) => {
        li.style.setProperty('--typed', String(Math.min(1, Math.max(0, current.local * all.length * 1.4 - i))))
      })
    }
  }, [windows, proofIndex])

  // Scroll drives the copy only in dom mode, before the renderer is ready and after a fallback.
  useEffect(() => {
    if (!track || mode !== 'dom') return
    let raf = 0
    const update = () => {
      raf = 0
      const stage = stageRef.current
      const top = track.getBoundingClientRect().top + window.scrollY
      followProgress(sceneProgress(window.scrollY - top, track.offsetHeight, stage?.clientHeight || window.innerHeight))
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
  }, [track, mode, followProgress])

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

  // Reads every rect first, then writes, so one call never forces layout twice. A leader line is on only
  // while its callout's act is active, and lines keep tracking their callouts while they fade out.
  const placeOverlay = useCallback((frame: TeardownFrame) => {
    const stage = stageRef.current
    const svg = linesRef.current
    if (!stage || !svg) return
    const gl = modeRef.current === 'gl'
    const stageRect = stage.getBoundingClientRect()
    const writes: (() => void)[] = []
    stage.querySelectorAll<HTMLElement>('.teardown__card-label').forEach((label) => {
      const anchor = frame.anchors.get(label.dataset.anchor ?? '')
      if (anchor) writes.push(() => { label.style.transform = `translate3d(${anchor.x.toFixed(1)}px, ${anchor.y.toFixed(1)}px, 0) translateX(-50%)` })
    })
    stage.querySelectorAll<HTMLElement>('.teardown__callout').forEach((label) => {
      const key = label.dataset.anchor ?? ''
      const line = svg.querySelector<SVGLineElement>(`line[data-anchor="${key}"]`)
      if (!line) return
      const anchor = gl ? frame.anchors.get(key) : null
      if (!anchor) {
        writes.push(() => line.classList.remove('is-on'))
        return
      }
      const r = label.getBoundingClientRect()
      const on = label.classList.contains('is-active')
      const x1 = (r.right - stageRect.left + 8).toFixed(1)
      const y1 = (r.top + r.height / 2 - stageRect.top).toFixed(1)
      writes.push(() => {
        line.setAttribute('x1', x1)
        line.setAttribute('y1', y1)
        line.setAttribute('x2', anchor.x.toFixed(1))
        line.setAttribute('y2', anchor.y.toFixed(1))
        line.classList.toggle('is-on', on)
      })
    })
    writes.forEach((write) => write())
  }, [])
  const onFrame = useCallback((frame: TeardownFrame) => {
    lastFrame.current = frame
    if (modeRef.current === 'gl') followProgress(frame.progress)
    placeOverlay(frame)
  }, [followProgress, placeOverlay])
  // placeOverlay reads the committed is-active classes and modeRef, but the canvas draws only while
  // something moves, so its last draw often lands before the act or mode change it caused has committed.
  // The copy also keeps rising for COPY_MS after the change. Replaying the last frame on every animation
  // frame for that long keeps each leader line attached to its own callout.
  useEffect(() => {
    let raf = 0
    const until = performance.now() + COPY_MS
    const replay = () => {
      if (lastFrame.current) placeOverlay(lastFrame.current)
      raf = modeRef.current === 'gl' && performance.now() < until ? requestAnimationFrame(replay) : 0
    }
    replay()
    return () => cancelAnimationFrame(raf)
  }, [act, mode, placeOverlay])
  const onReady = useCallback(() => setMode((m) => (m === 'static' ? m : 'gl')), [])
  const onFallback = useCallback(() => {
    setFailed(true)
    setMode((m) => (m === 'static' ? m : 'dom'))
  }, [])

  const isStatic = mode === 'static'
  const isActive = (index: number) => isStatic || index === act
  // Passed acts wait 14px above their resting place and later acts 14px below it (teardown.css), so the copy moves with the scroll.
  const actState = (index: number) => (isActive(index) ? ' is-active' : index < act ? ' is-past' : '')
  const actKey = story.acts[act]?.key ?? 'arrival'
  const domScreen = screenFor(actKey)
  // Every screen the DOM stage can show stays mounted, so an act change crossfades instead of cutting.
  const domScreens = Array.from(new Set(story.acts.map((a) => screenFor(a.key))))
  const titleId = `project-${story.id}-title`

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
          {story.acts.flatMap((a, ai) => a.callouts.map((_, ci) => (
            <line key={`c:${ai}:${ci}`} data-anchor={`c:${ai}:${ci}`} style={{ '--i': ci } as React.CSSProperties} />
          )))}
        </svg>

        <div className="teardown__rail">
          {story.acts.map((a, ai) => {
            const phone = screenFor(a.key)
            return (
              // The close act stays out of inert so its links keep their place in the tab order. See onFocusIn.
              <div
                key={a.key}
                className={`teardown__act teardown__act--${a.key}${actState(ai)}`}
                data-act-key={a.key}
                inert={!isActive(ai) && a.key !== 'close'}
              >
                {isStatic && STATIC_PHONE.has(a.key) && (
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
                    {a.lines.slice(1).map((line) => <p key={line} className="teardown__line">{line}</p>)}
                  </>
                )}
                {a.key === 'proof' && (
                  <ul className="teardown__readout">
                    {a.lines.map((line, i) => (
                      <li key={line} style={{ '--i': i } as React.CSSProperties}><span className="teardown__prompt" aria-hidden="true">$</span> {line}</li>
                    ))}
                  </ul>
                )}
                {a.key === 'coach' && (
                  <>
                    <p className="teardown__eyebrow"><span aria-hidden="true">// </span>{a.lines[0]}</p>
                    {a.lines.slice(1).map((line) => <p key={line} className="teardown__line">{line}</p>)}
                  </>
                )}
                {a.key !== 'arrival' && a.key !== 'proof' && a.key !== 'coach' && a.lines.map((line) => <p key={line} className="teardown__line">{line}</p>)}
                {mode !== 'gl' && a.key === 'day' && (
                  <ul className="teardown__callouts">
                    {story.cards.map((card, i) => (
                      <li key={card.screen} className="teardown__callout is-active" style={{ '--i': i } as React.CSSProperties}>
                        <span className="teardown__slashes" aria-hidden="true">//</span> {card.label}
                      </li>
                    ))}
                  </ul>
                )}
                {a.callouts.length > 0 && (
                  <ul className="teardown__callouts">
                    {a.callouts.map((c, ci) => (
                      <li
                        key={c.text}
                        className={`teardown__callout${isActive(ai) ? ' is-active' : ''}`}
                        data-anchor={`c:${ai}:${ci}`}
                        style={{ '--i': ci } as React.CSSProperties}
                      >
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
