import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import useTouchDevice from '../../hooks/useTouchDevice'
import SecretPortfolioEntryAnimation from './SecretPortfolioEntryAnimation'
import SecretPortfolioExitAnimation from './SecretPortfolioExitAnimation'

interface SketchPortfolioOverlayProps {
  onClose: () => void
}

const notebookFacts = [
  { label: 'base', value: 'Carnegie Mellon SCS' },
  { label: 'focus', value: 'mobile, product systems, full-stack' },
  { label: 'bias', value: 'real users over abstract demos' },
  { label: 'mode', value: 'prototype visually, then harden the system' },
]

const designNotes = [
  'I care about software that feels intentional, not generic.',
  'The strongest projects here solve a practical problem first and then earn their style.',
  'This folio reads like a field notebook lifted from the sketch terrain after walking the site.',
]

const fieldKit = [
  { label: 'notebook mode', value: 'draft in the field, refine at the desk' },
  { label: 'favorite surface', value: 'product systems' },
  { label: 'default tool', value: 'mobile + full-stack' },
  { label: 'quality bar', value: 'useful before flashy' },
]

const marginFragments = [
  'follow the ridge to the notes',
  'tape the idea to the wall',
  'make the system readable',
]

const projectSheets = [
  {
    name: 'Levio',
    tag: 'mobile health / cross-platform care',
    summary: "A Parkinson's care product that combines symptom tracking, medication routines, recovery media, and community support in one mobile experience.",
    bullets: [
      'Shipped iOS and Android release engineering with staged testing and automation.',
      'Blended cloud auth/data with local JSON caching so core care flows stayed usable offline.',
      'Built the product around consistency, trust, and daily usability instead of one-off feature spikes.',
    ],
    artifact: 'care flows that survive bad connectivity',
    constraint: 'health products need trust, not friction',
    tilt: '-2.4deg',
    accent: '106, 165, 175',
  },
  {
    name: 'Agoriai',
    tag: 'anonymous networking / tartan hacks 2026',
    summary: 'An anonymous career network for candid questions about internships, recruiting, and companies without the usual social risk.',
    bullets: [
      'Designed identity controls, moderated messaging, and mutual reveal flows for safer interactions.',
      'Implemented hashed-session auth and graph-driven discovery across company pages and relationship maps.',
      'Used a stronger visual system to make a socially risky product feel calm and navigable.',
    ],
    artifact: 'anonymous networking with safer reveal logic',
    constraint: 'social risk had to feel controlled',
    tilt: '1.8deg',
    accent: '76, 139, 255',
  },
  {
    name: 'MyCommunity',
    tag: 'android civic tech / geospatial discovery',
    summary: 'A scouting app for finding nearby troops, service opportunities, and local updates in one mobile workflow.',
    bullets: [
      'Connected cloud-backed troop profiles, live news, and map-first search in a single Android experience.',
      'Turned geospatial browsing into a practical discovery tool instead of a novelty map view.',
      'Focused on clear local utility: where to go, what is happening, and who is active nearby.',
    ],
    artifact: 'map-first civic discovery on Android',
    constraint: 'location needs clarity, not clutter',
    tilt: '-1.1deg',
    accent: '179, 142, 93',
  },
  {
    name: 'Tarocchi',
    tag: 'interactive web / creative systems',
    summary: 'A tarot-inspired interactive narrative built to feel exploratory, replayable, and atmospheric instead of linear.',
    bullets: [
      'Structured twenty-four branching routes through prompt-based choice logic.',
      'Synced parallax motion and layered soundscapes to reinforce mood and pacing.',
      'Used web interactions as storytelling structure, not just decoration.',
    ],
    artifact: 'narrative atmosphere built from interaction',
    constraint: 'the web experience had to feel ritualistic',
    tilt: '2.3deg',
    accent: '156, 127, 174',
  },
]

const journeyEntries = [
  {
    pid: '001',
    title: 'Blue Shield of California',
    role: 'Incoming Mobile Software Engineering Intern',
    period: 'Summer 2026',
    track: 'health systems',
    summary: 'Preparing to work on mobile healthcare technology with production constraints and real patient-facing stakes.',
  },
  {
    pid: '002',
    title: 'Sorcea Labs',
    role: 'Mobile Software Engineering Intern',
    period: 'Dec 2025 - Present',
    track: 'mobile product',
    summary: 'Built onboarding, profile, guided tutorial, and skin-analysis flows in Flutter/Dart for personalized skincare recommendations used by 1.5k+ people.',
  },
  {
    pid: '003',
    title: 'CMUMaps',
    role: 'Data & Software Engineer',
    period: 'Sep 2025 - Present',
    track: 'data systems',
    summary: 'Normalized OpenStreetMap building data into versioned JSON pipelines and built geometry anchors for cleaner rendering and labels.',
  },
  {
    pid: '004',
    title: 'Coding Minds Academy',
    role: 'Instructor',
    period: 'Jun 2025 - Feb 2026',
    track: 'teaching',
    summary: 'Designed and taught curriculum in programming, algorithms, and project labs that translated abstract logic into working code.',
  },
  {
    pid: '005',
    title: 'Game Creation Society',
    role: 'Core Developer',
    period: 'Sep 2025 - Dec 2025',
    track: 'games',
    summary: 'Implemented grapple and tether mechanics in Unreal Engine 5 with physics-driven control and local multiplayer synchronization.',
  },
  {
    pid: '006',
    title: 'SoftCom Lab',
    role: 'Research Intern',
    period: 'Jun 2023 - Aug 2024',
    track: 'research',
    summary: "Built reproducible Python pipelines for a Parkinson's-focused mobile-health study under faculty mentorship, contributing to a peer-reviewed paper.",
  },
]

const skillGroups = [
  {
    name: 'languages',
    note: 'The stuff I reach for when I need raw control, fast iteration, or real implementation depth.',
    items: ['Python', 'TypeScript', 'JavaScript', 'C++', 'Dart', 'Java', 'C', 'SQL', 'Assembly'],
  },
  {
    name: 'frameworks',
    note: 'The higher-level surfaces where product decisions become something people can actually use.',
    items: ['React', 'Flutter', 'Firebase', 'Framer Motion', 'Tailwind CSS', 'Unreal Engine 5', 'Android SDK'],
  },
  {
    name: 'data & ml',
    note: 'The analysis and data plumbing stack I use when the problem is noisy, spatial, or too messy for manual inspection.',
    items: ['NumPy', 'Pandas', 'scikit-learn', 'Data Pipelines', 'Signal Processing', 'GeoJSON', 'OpenStreetMap'],
  },
  {
    name: 'systems & tools',
    note: 'The working kit that keeps builds reproducible, collaborative, and durable once the first prototype is done.',
    items: ['Git', 'Unix Shell', 'SSH', 'GitHub Actions', 'CI/CD', 'Docker', 'Figma'],
  },
]

const lifeNotes = [
  {
    title: 'Arcadia App Development',
    caption: 'campus systems',
    summary: 'Built a digital student ID system and helped grow a student app program that supported thousands of real check-ins.',
  },
  {
    title: 'Eagle Scout',
    caption: 'leadership',
    summary: 'Led the planning and construction of outdoor signage for a local elementary school and coordinated volunteers end to end.',
  },
  {
    title: 'Clarinet Section Leader',
    caption: 'performance',
    summary: 'Performed nationally and abroad while coaching younger musicians and keeping a section aligned under pressure.',
  },
]

const contactLinks = [
  { label: 'GitHub', href: 'https://github.com/Jc-965' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/jessechen2/' },
]

const waypoints = [
  { id: 'sketch-secret-cover', code: 'hinge 00', label: 'cover sheet' },
  { id: 'sketch-secret-survey', code: 'grid 14', label: 'survey board' },
  { id: 'sketch-secret-specimens', code: 'drawer 28', label: 'specimen cabinet' },
  { id: 'sketch-secret-journal', code: 'drift 41', label: 'field journal' },
  { id: 'sketch-secret-arsenal', code: 'kit 52', label: 'tool legend' },
  { id: 'sketch-secret-dispatch', code: 'exit 99', label: 'dispatch' },
]

const journeyLayouts = [
  { top: '10%', left: '6%', width: '39%', rotate: '-2.2deg' },
  { top: '15%', left: '52%', width: '38%', rotate: '1.8deg' },
  { top: '39%', left: '12%', width: '34%', rotate: '-0.9deg' },
  { top: '45%', left: '50%', width: '31%', rotate: '2.2deg' },
  { top: '68%', left: '8%', width: '36%', rotate: '-1.5deg' },
  { top: '72%', left: '53%', width: '37%', rotate: '1.2deg' },
]

const toolTilts = ['-1.6deg', '0.9deg', '-0.8deg', '1.4deg']
const waypointTilts = ['-3deg', '2deg', '-1.4deg', '2.6deg', '-2.2deg', '1.2deg']

export default function SketchPortfolioOverlay({ onClose }: SketchPortfolioOverlayProps) {
  const cursorRef = useRef<HTMLDivElement>(null)
  const clickResetRef = useRef<number | null>(null)
  const [phase, setPhase] = useState<'entering' | 'active' | 'exiting'>('entering')
  const [cursorState, setCursorState] = useState<'default' | 'hover'>('default')
  const [cursorClicking, setCursorClicking] = useState(false)
  const isTouchDevice = useTouchDevice()

  useLayoutEffect(() => {
    document.documentElement.classList.add('sketch-secret-mode')
    document.body.style.overflow = 'hidden'
    document.body.style.setProperty('cursor', 'none', 'important')
    document.documentElement.style.setProperty('cursor', 'none', 'important')
    return () => {
      document.documentElement.classList.remove('sketch-secret-mode')
      document.body.style.overflow = ''
      document.body.style.removeProperty('cursor')
      document.documentElement.style.removeProperty('cursor')
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPhase(current => (current === 'exiting' ? current : 'exiting'))
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    return () => {
      if (clickResetRef.current) {
        window.clearTimeout(clickResetRef.current)
      }
    }
  }, [])

  const scrollToSection = (id: string) => {
    if (phase !== 'active') return
    document.getElementById(id)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  const requestClose = () => {
    setPhase(current => (current === 'exiting' ? current : 'exiting'))
  }

  const onMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isTouchDevice || !cursorRef.current) return

    const nextState = (event.target as HTMLElement).closest('a, button')
      ? 'hover'
      : 'default'

    cursorRef.current.style.left = `${event.clientX}px`
    cursorRef.current.style.top = `${event.clientY}px`
    cursorRef.current.style.opacity = '1'
    setCursorState(current => (current === nextState ? current : nextState))
  }

  const onMouseLeave = () => {
    if (isTouchDevice || !cursorRef.current) return
    cursorRef.current.style.opacity = '0'
  }

  const onMouseDown = () => {
    if (isTouchDevice) return

    setCursorClicking(true)
    if (clickResetRef.current) {
      window.clearTimeout(clickResetRef.current)
    }

    clickResetRef.current = window.setTimeout(() => {
      setCursorClicking(false)
      clickResetRef.current = null
    }, 220)
  }

  const content = (
    <div
      className={`sketch-secret-overlay sketch-secret-overlay--${phase}`}
      role="dialog"
      aria-modal="true"
      aria-label="Secret graphite board"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onMouseDown={onMouseDown}
    >
      {phase === 'entering' && (
        <SecretPortfolioEntryAnimation onComplete={() => setPhase('active')} />
      )}

      {(phase === 'active' || phase === 'exiting') && (
        <div className="sketch-secret-shell">
          <header className="sketch-secret-toolbar">
            <span className="sketch-secret-toolbar__stamp">graphite archive // private field folio</span>
            <div className="sketch-secret-toolbar__cluster">
              <span className="sketch-secret-toolbar__badge">messy board / sketchbook / surreal journal</span>
              <button className="sketch-btn sketch-secret-toolbar__close" type="button" onClick={requestClose}>
                return to ridge
              </button>
            </div>
          </header>

          <section className="sketch-secret-cover" id="sketch-secret-cover">
            <article className="sketch-secret-manifesto">
              <span className="sketch-secret-paper-tape sketch-secret-paper-tape--left" aria-hidden="true" />
              <span className="sketch-secret-paper-tape sketch-secret-paper-tape--right" aria-hidden="true" />

              <div className="sketch-secret-manifesto__meta">
                <span className="sketch-secret-manifesto__eyebrow">
                  Jesse Chen // field notebook recovered from the sketch terrain
                </span>
                <span className="sketch-secret-manifesto__stamp">notes unsealed</span>
              </div>

              <h1 className="sketch-secret-manifesto__title">
                The portfolio, pulled apart into a graphite atlas.
              </h1>

              <p className="sketch-secret-manifesto__lede">
                First-year CS student focused on products that solve meaningful problems without losing personality.
                The public site stays clean and legible. This hidden pass redraws the same work as a dramatic board
                of evidence: site coordinates, torn studies, handwritten fragments, and field notes left half-finished.
              </p>

              <div className="sketch-secret-manifesto__actions">
                <button className="sketch-btn" type="button" onClick={() => scrollToSection('sketch-secret-survey')}>
                  walk the survey grid
                </button>
                <button className="sketch-btn" type="button" onClick={() => scrollToSection('sketch-secret-specimens')}>
                  open the specimen drawer
                </button>
              </div>

              <div className="sketch-secret-manifesto__scribbles" aria-hidden="true">
                {marginFragments.map(fragment => (
                  <span key={fragment} className="sketch-secret-manifesto__scribble">
                    {fragment}
                  </span>
                ))}
              </div>

              <div className="sketch-secret-manifesto__crosshair" aria-hidden="true" />
            </article>

            <div className="sketch-secret-cover__rail">
              <aside className="sketch-secret-wayfinder" aria-label="Exploratory wayfinder">
                <span className="sketch-secret-wayfinder__label">wayfinder</span>
                <div className="sketch-secret-wayfinder__grid">
                  {waypoints.map((waypoint, index) => (
                    <button
                      key={waypoint.id}
                      className="sketch-secret-waypoint"
                      type="button"
                      style={{ '--waypoint-rotate': waypointTilts[index] } as CSSProperties}
                      onClick={() => scrollToSection(waypoint.id)}
                    >
                      <span className="sketch-secret-waypoint__code">{waypoint.code}</span>
                      <strong className="sketch-secret-waypoint__label">{waypoint.label}</strong>
                    </button>
                  ))}
                </div>
              </aside>

              <aside className="sketch-secret-mini-note sketch-secret-mini-note--facts">
                <span className="sketch-secret-mini-note__label">observed constants</span>
                <div className="sketch-secret-mini-note__rows">
                  {notebookFacts.map(fact => (
                    <div key={fact.label} className="sketch-secret-mini-note__row">
                      <span>{fact.label}</span>
                      <strong>{fact.value}</strong>
                    </div>
                  ))}
                </div>
              </aside>

              <aside className="sketch-secret-mini-note sketch-secret-mini-note--kit">
                <span className="sketch-secret-mini-note__label">field kit</span>
                <div className="sketch-secret-kit-grid">
                  {fieldKit.map(item => (
                    <div key={item.label} className="sketch-secret-kit-grid__item">
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          </section>

          <main className="sketch-secret-board">
            <section className="sketch-secret-zone sketch-secret-zone--survey" id="sketch-secret-survey">
              <div className="sketch-secret-zone__heading">
                <div>
                  <span className="sketch-secret-zone__eyebrow">architectural drawing board</span>
                  <h2 className="sketch-secret-zone__title">The build trail plotted like a site survey</h2>
                </div>
                <p className="sketch-secret-zone__note">
                  Roles, teams, and time spans are drafted as coordinates instead of resume blocks. This is the cleanest
                  read in the hidden folio, but it still behaves like a marked-up plan.
                </p>
              </div>

              <div className="sketch-secret-survey__board">
                <span className="sketch-secret-survey__label sketch-secret-survey__label--north">
                  northing // active trail
                </span>
                <span className="sketch-secret-survey__label sketch-secret-survey__label--measure">
                  scale shifts / roles blur / systems persist
                </span>

                {journeyEntries.map((entry, index) => {
                  const layout = journeyLayouts[index]

                  return (
                    <article
                      key={entry.pid}
                      className="sketch-secret-plot"
                      style={{
                        '--plot-top': layout.top,
                        '--plot-left': layout.left,
                        '--plot-width': layout.width,
                        '--plot-rotate': layout.rotate,
                      } as CSSProperties}
                    >
                      <span className="sketch-secret-plot__id">{entry.pid}</span>
                      <span className="sketch-secret-plot__track">{entry.track}</span>
                      <h3 className="sketch-secret-plot__title">{entry.title}</h3>
                      <p className="sketch-secret-plot__role">{entry.role}</p>
                      <p className="sketch-secret-plot__summary">{entry.summary}</p>
                      <span className="sketch-secret-plot__period">{entry.period}</span>
                    </article>
                  )
                })}
              </div>
            </section>

            <section className="sketch-secret-zone sketch-secret-zone--specimens" id="sketch-secret-specimens">
              <div className="sketch-secret-zone__heading">
                <div>
                  <span className="sketch-secret-zone__eyebrow">artist sketchbook</span>
                  <h2 className="sketch-secret-zone__title">Project studies pinned as torn specimens</h2>
                </div>
                <p className="sketch-secret-zone__note">
                  The projects stop pretending to be polished case studies here. They turn into fragments, marks,
                  constraints, and useful artifacts taped onto the same page.
                </p>
              </div>

              <div className="sketch-secret-specimen-grid">
                {projectSheets.map((project, index) => (
                  <article
                    key={project.name}
                    className="sketch-secret-specimen"
                    style={{
                      '--specimen-rotate': project.tilt,
                      '--specimen-accent': project.accent,
                    } as CSSProperties}
                  >
                    <span className="sketch-secret-specimen__sheet">
                      study {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="sketch-secret-specimen__tag">{project.tag}</span>
                    <h3 className="sketch-secret-specimen__title">{project.name}</h3>
                    <p className="sketch-secret-specimen__summary">{project.summary}</p>

                    <div className="sketch-secret-specimen__chips">
                      <span>artifact // {project.artifact}</span>
                      <span>constraint // {project.constraint}</span>
                    </div>

                    <div className="sketch-secret-specimen__fragments">
                      {project.bullets.map(bullet => (
                        <span key={bullet} className="sketch-secret-specimen__fragment">
                          {bullet}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="sketch-secret-zone sketch-secret-zone--journal" id="sketch-secret-journal">
              <div className="sketch-secret-zone__heading">
                <div>
                  <span className="sketch-secret-zone__eyebrow">surreal field journal</span>
                  <h2 className="sketch-secret-zone__title">Margins, habits, and life outside the clean grid</h2>
                </div>
                <p className="sketch-secret-zone__note">
                  The same portfolio facts loosen into handwriting here. Principles read like observations, and outside
                  work shows up as weather, residue, and side-notes rather than credentials.
                </p>
              </div>

              <div className="sketch-secret-journal-grid">
                <article className="sketch-secret-journal-note sketch-secret-journal-note--principles">
                  <span className="sketch-secret-journal-note__label">working principles</span>
                  <ul className="sketch-secret-journal-note__list">
                    {designNotes.map(note => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </article>

                <article className="sketch-secret-journal-note sketch-secret-journal-note--life">
                  <span className="sketch-secret-journal-note__label">outside the terminal</span>
                  <div className="sketch-secret-life-fragments">
                    {lifeNotes.map(note => (
                      <div key={note.title} className="sketch-secret-life-fragment">
                        <span>{note.caption}</span>
                        <strong>{note.title}</strong>
                        <p>{note.summary}</p>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="sketch-secret-journal-note sketch-secret-journal-note--margins">
                  <span className="sketch-secret-journal-note__label">margin fragments</span>
                  <div className="sketch-secret-margin-cloud">
                    {marginFragments.map(fragment => (
                      <span key={fragment} className="sketch-secret-margin-cloud__item">
                        {fragment}
                      </span>
                    ))}
                  </div>
                </article>
              </div>
            </section>

            <section className="sketch-secret-zone sketch-secret-zone--arsenal" id="sketch-secret-arsenal">
              <div className="sketch-secret-zone__heading">
                <div>
                  <span className="sketch-secret-zone__eyebrow">tool legend</span>
                  <h2 className="sketch-secret-zone__title">The kit rendered as swarms, stamps, and labels</h2>
                </div>
                <p className="sketch-secret-zone__note">
                  Languages, frameworks, data tooling, and systems gear are packed like an annotated supply table rather
                  than a tidy skills list.
                </p>
              </div>

              <div className="sketch-secret-arsenal-grid">
                {skillGroups.map((group, index) => (
                  <article
                    key={group.name}
                    className="sketch-secret-tool-swarm"
                    style={{ '--swarm-rotate': toolTilts[index] } as CSSProperties}
                  >
                    <span className="sketch-secret-tool-swarm__name">{group.name}</span>
                    <p className="sketch-secret-tool-swarm__note">{group.note}</p>
                    <div className="sketch-secret-tool-swarm__tags">
                      {group.items.map(item => (
                        <span key={item} className="sketch-secret-tool-swarm__tag">
                          {item}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="sketch-secret-zone sketch-secret-zone--dispatch" id="sketch-secret-dispatch">
              <div className="sketch-secret-dispatch">
                <article className="sketch-secret-dispatch__note">
                  <span className="sketch-secret-zone__eyebrow">dispatch</span>
                  <h2 className="sketch-secret-zone__title">Pack the graphite away or keep the line open</h2>
                  <p className="sketch-secret-dispatch__text">
                    The public portfolio stays on the overlook. This hidden one remains the rougher board underneath it.
                    Reach out through the usual channels, or close the folio and step back into the terrain.
                  </p>
                </article>

                <div className="sketch-secret-dispatch__actions">
                  {contactLinks.map(link => (
                    <a
                      key={link.label}
                      className="sketch-btn"
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {link.label}
                    </a>
                  ))}
                  <button className="sketch-btn" type="button" onClick={() => scrollToSection('sketch-secret-cover')}>
                    back to cover
                  </button>
                  <button className="sketch-btn" type="button" onClick={requestClose}>
                    return to terrain
                  </button>
                </div>
              </div>
            </section>
          </main>
        </div>
      )}

      {phase === 'exiting' && (
        <SecretPortfolioExitAnimation onComplete={onClose} />
      )}

      {!isTouchDevice && phase !== 'entering' && (
        <div
          ref={cursorRef}
          className={`sketch-secret-cursor sketch-secret-cursor--${cursorState} ${cursorClicking ? 'sketch-secret-cursor--clicking' : ''}`}
          style={{ opacity: 0 }}
          aria-hidden="true"
        >
          <div className="sketch-secret-cursor__shape" />
        </div>
      )}
    </div>
  )

  return createPortal(content, document.body)
}
