import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import portfolio from '../../content/portfolio.json'
import { ROLE_STORIES } from '../../content/roles'
import { savesData, whenIdle } from '../../utils/whenIdle'
import { prefersReduced } from '../chapter/dom'
import type { RoleEntry, RolesStage, StageFrame } from './RolesStage'
import RoleJourney, { type RoleJourneyHandle } from './RoleJourney'
import type { RoleFacts } from './types'
import { LEAVE_MS } from './timing'
import { useRolesView } from './useRolesView'
import '../../styles/roles.css'

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
/** The longest the stage chunk's request waits for an idle period after the load event, ms. */
const CHUNK_WARM_TIMEOUT = 2000

/**
 * Records a User Timing measure from `start` (a performance.now() value) to now. It is local because gpu.ts's
 * `timed` would pull three.js into this section's chunk.
 */
const timed = (name: string, start: number) => {
  try {
    performance.measure(name, { start, end: performance.now() })
  } catch {
    // The measure is diagnostic only.
  }
}

type Mode = 'gl' | 'static'

/**
 * The Journey section: every role as a stop on one path, its copy on the left and its live island on the right,
 * and the open role's journey in place of the rows. One shared stage (RolesStage) draws every island. It boots as
 * the section nears, is released when the section is far, and stays up while a journey is open. Under reduced
 * motion, or without WebGL, rows show each role's poster and journeys stack their acts.
 */
function RolesSection() {
  const rootRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<RolesStage | null>(null)
  const slotsRef = useRef(new Map<string, HTMLElement>())
  const fromRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null)
  const trackRef = useRef<HTMLElement | null>(null)
  const journeyStageRef = useRef<HTMLDivElement | null>(null)
  const journeyRef = useRef<RoleJourneyHandle>(null)
  const [mode, setMode] = useState<Mode>(() => (prefersReduced() ? 'static' : 'gl'))
  const [near, setNear] = useState(false)
  const [booted, setBooted] = useState(false)
  /** Roles whose island failed to load, build, or compile, which show their poster in the slot instead. */
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set())

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

  const onLeave = useCallback((kind: 'switch' | 'close') => {
    stageRef.current?.leaveJourney(kind)
    return LEAVE_MS
  }, [])

  const { openId, nextId, prevId, open, switchTo, back, returnRef, startRef } = useRolesView({ ids: IDS, titleOf, trackRef, onLeave, onSettled })
  const openIdRef = useRef(openId)
  useEffect(() => { openIdRef.current = openId }, [openId])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setMode(query.matches ? 'static' : 'gl')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  // The stage's chunk carries three.js. It is requested in an idle period after the load event, and the shared
  // environment map is built then, so the boot below starts from a module and a map the browser already holds.
  // The request creates no stage. The boot keeps its own conditions.
  useEffect(() => {
    if (mode !== 'gl' || savesData()) return
    let cancel: (() => void) | null = null
    const warm = () => {
      cancel = whenIdle(() => { import('./RolesStage').then(({ warmEnvironment }) => warmEnvironment()).catch(() => undefined) }, CHUNK_WARM_TIMEOUT)
    }
    if (document.readyState === 'complete') warm()
    else window.addEventListener('load', warm, { once: true })
    return () => {
      window.removeEventListener('load', warm)
      cancel?.()
    }
  }, [mode])

  // The stage boots once the section is within BOOT_MARGIN and the page has been scrolled, or at once on a journey
  // page, and is released when the section is beyond RELEASE_MARGIN with no journey open. A project's journey hides
  // the section, which leaves it without a box and reads as far. The stage is kept through that journey, since
  // dropping it costs a teardown on open and a full boot on close, and the distance is taken again when it closes.
  useEffect(() => {
    const root = rootRef.current
    if (!root || mode !== 'gl') return
    const page = document.documentElement
    let pageWatch: MutationObserver | null = null
    let intersecting = false
    // Once near, a scroll event skips the scrollY read, which forces a layout after a frame's style writes.
    let isNear = false
    const check = () => {
      if (!isNear && intersecting && (window.scrollY > 0 || openIdRef.current)) {
        isNear = true
        setNear(true)
      }
    }
    const boot = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting
      check()
    }, { rootMargin: BOOT_MARGIN })
    const far = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting || openIdRef.current) return
      if (page.classList.contains('journey-open')) {
        pageWatch ??= new MutationObserver(() => {
          if (page.classList.contains('journey-open')) return
          pageWatch?.disconnect()
          pageWatch = null
          far.unobserve(root)
          far.observe(root)
        })
        pageWatch.observe(page, { attributes: true, attributeFilter: ['class'] })
        return
      }
      isNear = false
      setNear(false)
    }, { rootMargin: RELEASE_MARGIN })
    boot.observe(root)
    far.observe(root)
    window.addEventListener('scroll', check, { passive: true })
    if (openIdRef.current) {
      isNear = true
      setNear(true)
    }
    return () => {
      boot.disconnect()
      far.disconnect()
      pageWatch?.disconnect()
      window.removeEventListener('scroll', check)
    }
  }, [mode])

  useEffect(() => {
    if (!near || mode !== 'gl') return
    let cancelled = false
    let stage: RolesStage | null = null
    const importStart = performance.now()
    import('./RolesStage').then(async ({ createRolesStage, warmEnvironment }) => {
      timed('roles:chunk', importStart)
      // The stage takes the shared environment map. A boot that arrives before the map waits for it without
      // blocking, where building the map inside the stage holds the main thread for about 300 ms.
      await warmEnvironment()
      const host = hostRef.current
      if (cancelled || !host) return
      stage = createRolesStage(host, ROLES, () => setMode('static'), (id) => setBroken((current) => new Set(current).add(id)))
      if (!stage) {
        setMode('static')
        return
      }
      stageRef.current = stage
      slotsRef.current.forEach((el, id) => stage?.setSlot(id, el))
      setBooted(true)
      if (openIdRef.current) attach(openIdRef.current, null)
    }, (error) => {
      console.warn('[roles] the Journey falls back to posters: its renderer failed to load', error)
      setMode('static')
    })
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
      {/* The stage creates its canvas here on every boot (RolesStage). */}
      <div ref={hostRef} className="roles__host" />
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
                explore the journey <span aria-hidden="true">→</span>
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
              {(isStatic || broken.has(story.id)) && <img src={story.poster.src} alt="" loading="lazy" decoding="async" />}
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
          startRef={startRef}
          next={nextId ? BY_ID.get(nextId)?.facts.company ?? null : null}
          previous={prevId ? BY_ID.get(prevId)?.facts.company ?? null : null}
          onBack={back}
          onSwitch={switchTo}
          onChoose={choose}
        />
      )}
    </div>
  )
}

export default memo(RolesSection)
