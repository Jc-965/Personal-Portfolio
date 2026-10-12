import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import portfolio from '../../content/portfolio.json'
import { ROLE_STORIES } from '../../content/roles'
import { prefersReduced } from '../chapter/dom'
import type { RoleEntry, RolesStage, StageFrame } from './RolesStage'
import RoleJourney, { type RoleJourneyHandle } from './RoleJourney'
import type { RoleFacts } from './types'
import { useRolesView } from './useRolesView'
import '../../styles/roles.css'

/** The section's type, loaded as the section nears: a warm grotesque title, a friendly sans, and a mono label. */
const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Figtree:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap'
/** The stage boots within BOOT_MARGIN of the viewport and is released beyond RELEASE_MARGIN, unless a journey is open. */
const BOOT_MARGIN = '150% 0px'
const RELEASE_MARGIN = '350% 0px'

const ROLES: RoleEntry[] = portfolio.experiences.map((experience) => {
  const { id, company, role, track, period, location, status, summary, stack, accent } = experience as RoleFacts & { status?: string }
  return { story: ROLE_STORIES[id], facts: { id, company, role, track, period, location, status, summary, stack, accent } }
}).filter((entry) => !!entry.story)
const IDS = ROLES.map((r) => r.story.id)
const BY_ID = new Map(ROLES.map((r) => [r.story.id, r]))
const STOPS = ROLES.map((r) => ({ id: r.story.id, company: r.facts.company, accent: r.facts.accent }))
const titleOf = (id: string) => `${BY_ID.get(id)?.facts.company ?? 'Journey'} · Jesse Chen`

type Mode = 'gl' | 'static'

/**
 * The Journey section: every role as a stop on one path, its copy on the left and its live island on the right,
 * and the open role's journey in place of the rows. One shared stage (RolesStage) draws every island. It boots as
 * the section nears, is released when the section is far, and stays up while a journey is open. Under reduced
 * motion, or without WebGL, rows show each role's poster and journeys stack their acts.
 */
function RolesSection() {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<RolesStage | null>(null)
  const slotsRef = useRef(new Map<string, HTMLElement>())
  const fromRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null)
  const trackRef = useRef<HTMLElement | null>(null)
  const journeyStageRef = useRef<HTMLDivElement | null>(null)
  const journeyRef = useRef<RoleJourneyHandle>(null)
  const [mode, setMode] = useState<Mode>(() => (prefersReduced() ? 'static' : 'gl'))
  const [near, setNear] = useState(false)
  const [booted, setBooted] = useState(false)

  const attach = useCallback((id: string, from: { left: number; top: number; width: number; height: number } | null) => {
    const stage = stageRef.current
    const track = trackRef.current
    const journeyStage = journeyStageRef.current
    if (!stage || !track || !journeyStage) return
    stage.openJourney(id, {
      track,
      stage: journeyStage,
      from,
      onFrame: (frame: StageFrame) => journeyRef.current?.onFrame(frame),
      onReady: () => journeyRef.current?.onReady(),
    })
  }, [])

  const onSettled = useCallback((change: { kind: 'open' | 'switch' | 'close'; id: string }) => {
    const stage = stageRef.current
    if (change.kind === 'close') {
      const slot = slotsRef.current.get(change.id)
      const rect = slot?.getBoundingClientRect()
      stage?.closeJourney(rect && rect.bottom > 0 && rect.top < window.innerHeight ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null)
      return
    }
    attach(change.id, change.kind === 'open' ? fromRef.current : null)
    fromRef.current = null
  }, [attach])

  const { openId, open, switchTo, back, returnRef } = useRolesView({ ids: IDS, titleOf, trackRef, onSettled })
  const openIdRef = useRef(openId)
  useEffect(() => { openIdRef.current = openId }, [openId])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setMode(query.matches ? 'static' : 'gl')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  // The stage boots once the section is within BOOT_MARGIN and the page has been scrolled, or at once on a journey
  // page, and is released when the section is beyond RELEASE_MARGIN with no journey open.
  useEffect(() => {
    const root = rootRef.current
    if (!root || mode !== 'gl') return
    let intersecting = false
    const check = () => {
      if (intersecting && (window.scrollY > 0 || openIdRef.current)) setNear(true)
    }
    const boot = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting
      check()
    }, { rootMargin: BOOT_MARGIN })
    const far = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting && !openIdRef.current) setNear(false)
    }, { rootMargin: RELEASE_MARGIN })
    boot.observe(root)
    far.observe(root)
    window.addEventListener('scroll', check, { passive: true })
    if (openIdRef.current) setNear(true)
    return () => {
      boot.disconnect()
      far.disconnect()
      window.removeEventListener('scroll', check)
    }
  }, [mode])

  useEffect(() => {
    if (!near || mode !== 'gl') return
    const link = document.querySelector(`link[href="${FONTS_HREF}"]`)
    if (!link) {
      const added = document.createElement('link')
      added.rel = 'stylesheet'
      added.href = FONTS_HREF
      document.head.appendChild(added)
    }
    let cancelled = false
    let stage: RolesStage | null = null
    import('./RolesStage').then(({ createRolesStage }) => {
      const canvas = canvasRef.current
      if (cancelled || !canvas) return
      stage = createRolesStage(canvas, ROLES, () => setMode('static'))
      if (!stage) {
        setMode('static')
        return
      }
      stageRef.current = stage
      slotsRef.current.forEach((el, id) => stage?.setSlot(id, el))
      setBooted(true)
      if (openIdRef.current) attach(openIdRef.current, null)
    }, () => setMode('static'))
    return () => {
      cancelled = true
      stage?.dispose()
      stageRef.current = null
      setBooted(false)
    }
  }, [near, mode, attach])

  // A layout change the stage cannot see (fonts arriving, the journey opening) remeasures the slots.
  useEffect(() => {
    if (!booted) return
    const stage = stageRef.current
    const root = rootRef.current
    if (!stage || !root) return
    const observer = new ResizeObserver(() => stage.measure())
    observer.observe(root)
    document.fonts?.ready.then(() => stage.measure(), () => undefined)
    return () => observer.disconnect()
  }, [booted])

  const setSlot = useCallback((id: string, el: HTMLElement | null) => {
    if (el) slotsRef.current.set(id, el)
    else slotsRef.current.delete(id)
    stageRef.current?.setSlot(id, el)
  }, [])

  const openFrom = useCallback((id: string) => {
    const slot = slotsRef.current.get(id)
    const rect = slot?.getBoundingClientRect()
    fromRef.current = mode === 'gl' && rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null
    stageRef.current?.pulse()
    open(id)
  }, [mode, open])

  const choose = useCallback((command: string, value: string) => stageRef.current?.command(command, value), [])
  const opened = openId ? BY_ID.get(openId) : null
  const isStatic = mode === 'static'

  return (
    <div ref={rootRef} className={`roles${isStatic ? ' roles--static' : ''}`}>
      {!isStatic && <canvas ref={canvasRef} className="roles__canvas" aria-hidden="true" />}
      <ol className="roles__list">
        {ROLES.map(({ story, facts }) => (
          <li key={story.id} id={`role-${story.id}`} className="roles__stop" style={{ '--role-accent': facts.accent } as CSSProperties}>
            <div className="roles__copy">
              <p className="roles__when">
                <span className="roles__dot" aria-hidden="true" />
                {facts.period}
              </p>
              <p className="roles__track">{facts.track}</p>
              <h3 className="roles__company">{facts.company}</h3>
              <p className="roles__role">{facts.role}</p>
              <p className="roles__where">{facts.location}{facts.status ? ` · ${facts.status}` : ''}</p>
              <p className="roles__summary">{facts.summary}</p>
              <ul className="roles__stack" aria-label={`${facts.company} stack`}>
                {facts.stack.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <button type="button" className="roles__open" onClick={() => openFrom(story.id)}>
                Explore the journey <span aria-hidden="true">→</span>
              </button>
            </div>
            <button
              ref={(el) => setSlot(story.id, el)}
              type="button"
              className="roles__island"
              aria-hidden="true"
              tabIndex={-1}
              onClick={() => openFrom(story.id)}
            >
              {isStatic && <img src={story.poster.src} alt="" loading="lazy" decoding="async" />}
            </button>
          </li>
        ))}
      </ol>
      {opened && (
        <RoleJourney
          key={opened.story.id}
          story={opened.story}
          facts={opened.facts}
          roles={STOPS}
          isStatic={isStatic}
          trackRef={trackRef}
          stageRef={journeyStageRef}
          handle={journeyRef}
          returnRef={returnRef}
          onBack={back}
          onSwitch={switchTo}
          onChoose={choose}
        />
      )}
    </div>
  )
}

export default memo(RolesSection)
