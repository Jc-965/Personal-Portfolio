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
    tilt: '-1.2deg',
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
    tilt: '1.4deg',
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
    tilt: '-0.8deg',
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
    tilt: '1.1deg',
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
      aria-label="Hidden sketch portfolio"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onMouseDown={onMouseDown}
    >
      {phase === 'entering' && (
        <SecretPortfolioEntryAnimation onComplete={() => setPhase('active')} />
      )}

      {(phase === 'active' || phase === 'exiting') && (
      <div className="sketch-secret-shell">
        <header className="sketch-secret-masthead">
          <span className="sketch-secret-masthead__stamp">field notebook / lifted from the graphite forest</span>
          <nav className="sketch-secret-masthead__nav" aria-label="Sketch portfolio sections">
            <button className="sketch-secret-masthead__link" type="button" onClick={() => scrollToSection('sketch-secret-projects')}>projects</button>
            <button className="sketch-secret-masthead__link" type="button" onClick={() => scrollToSection('sketch-secret-journey')}>journey</button>
            <button className="sketch-secret-masthead__link" type="button" onClick={() => scrollToSection('sketch-secret-toolkit')}>toolkit</button>
            <button className="sketch-secret-masthead__link" type="button" onClick={() => scrollToSection('sketch-secret-beyond')}>beyond</button>
            <button className="sketch-secret-masthead__link" type="button" onClick={() => scrollToSection('sketch-secret-contact')}>contact</button>
          </nav>
          <div className="sketch-secret-masthead__actions">
            <span className="sketch-secret-masthead__badge">terrain notes</span>
            <button className="sketch-btn sketch-secret-masthead__close" type="button" onClick={requestClose}>
              return to ridge
            </button>
          </div>
        </header>

        <main className="sketch-secret-layout">
          <section className="sketch-secret-hero" id="sketch-secret-top">
            <article className="sketch-secret-hero__sheet">
              <span className="sketch-secret-paper-tape sketch-secret-paper-tape--left" aria-hidden="true" />
              <span className="sketch-secret-paper-tape sketch-secret-paper-tape--right" aria-hidden="true" />
              <div className="sketch-secret-hero__meta">
                <span className="sketch-secret-hero__eyebrow">Jesse Chen // field notebook recovered from the sketch terrain</span>
                <span className="sketch-secret-hero__stamp">notes unsealed</span>
              </div>
              <h1 className="sketch-secret-hero__title">
                A field notebook pulled from the graphite forest.
              </h1>
              <p className="sketch-secret-hero__lede">
                First-year CS student focused on products that solve meaningful problems without losing personality.
                The public site is the clean overlook. This hidden pass is the terrain archive underneath it:
                taped sheets, margin notes, and the projects reframed like observations taken in the field.
              </p>
              <div className="sketch-secret-hero__actions">
                <button className="sketch-btn" type="button" onClick={() => scrollToSection('sketch-secret-projects')}>open project sheets</button>
                <button className="sketch-btn" type="button" onClick={() => scrollToSection('sketch-secret-journey')}>follow the build log</button>
              </div>
              <div className="sketch-secret-hero__doodles" aria-hidden="true">
                {marginFragments.map(fragment => (
                  <div key={fragment} className="sketch-secret-hero__doodle">
                    {fragment}
                  </div>
                ))}
              </div>
            </article>

            <div className="sketch-secret-sideboard">
              <article className="sketch-secret-note sketch-secret-note--facts">
                <span className="sketch-secret-note__label">field notes</span>
                <div className="sketch-secret-facts">
                  {notebookFacts.map(fact => (
                    <div key={fact.label} className="sketch-secret-facts__row">
                      <span>{fact.label}</span>
                      <strong>{fact.value}</strong>
                    </div>
                  ))}
                </div>
              </article>

              <article className="sketch-secret-note sketch-secret-note--thoughts">
                <span className="sketch-secret-note__label">working principles</span>
                <ul className="sketch-secret-note__list">
                  {designNotes.map(note => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </article>

              <article className="sketch-secret-note sketch-secret-note--kit">
                <span className="sketch-secret-note__label">field kit</span>
                <div className="sketch-secret-kit-grid">
                  {fieldKit.map(item => (
                    <div key={item.label} className="sketch-secret-kit-grid__item">
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </section>

          <section className="sketch-secret-section sketch-secret-section--projects" id="sketch-secret-projects">
            <div className="sketch-secret-section__heading">
              <div>
                <span className="sketch-secret-section__eyebrow">project sheets</span>
                <h2 className="sketch-secret-section__title">Selected builds</h2>
              </div>
              <p className="sketch-secret-section__note">
                Products, systems, and interactive work refiled as pages from the notebook hidden in the terrain.
              </p>
            </div>

            <div className="sketch-secret-project-grid">
              {projectSheets.map((project, index) => (
                <article
                  key={project.name}
                  className="sketch-secret-project-card"
                  style={{
                    '--folio-tilt': project.tilt,
                    '--folio-accent': project.accent,
                  } as CSSProperties}
                >
                  <span className="sketch-secret-project-card__sheet-number">sheet {String(index + 1).padStart(2, '0')}</span>
                  <div className="sketch-secret-project-card__header">
                    <div>
                      <span className="sketch-secret-project-card__tag">{project.tag}</span>
                      <h3 className="sketch-secret-project-card__title">{project.name}</h3>
                    </div>
                    <span className="sketch-secret-project-card__pin" aria-hidden="true" />
                  </div>
                  <p className="sketch-secret-project-card__summary">{project.summary}</p>
                  <div className="sketch-secret-project-card__facts">
                    <div className="sketch-secret-project-card__fact">
                      <span>artifact</span>
                      <strong>{project.artifact}</strong>
                    </div>
                    <div className="sketch-secret-project-card__fact">
                      <span>constraint</span>
                      <strong>{project.constraint}</strong>
                    </div>
                  </div>
                  <ul className="sketch-secret-project-card__list">
                    {project.bullets.map(bullet => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>

          <section className="sketch-secret-section sketch-secret-section--journey" id="sketch-secret-journey">
            <div className="sketch-secret-section__heading">
              <div>
                <span className="sketch-secret-section__eyebrow">build log</span>
                <h2 className="sketch-secret-section__title">Journey</h2>
              </div>
              <p className="sketch-secret-section__note">
                A chronological trail of the teams, products, and systems shaping how I build.
              </p>
            </div>

            <div className="sketch-secret-timeline">
              {journeyEntries.map(entry => (
                <article key={entry.pid} className="sketch-secret-timeline__card">
                  <span className="sketch-secret-timeline__pid">{entry.pid}</span>
                  <span className="sketch-secret-timeline__track">{entry.track}</span>
                  <span className="sketch-secret-timeline__period">{entry.period}</span>
                  <h3 className="sketch-secret-timeline__title">{entry.title}</h3>
                  <p className="sketch-secret-timeline__role">{entry.role}</p>
                  <p className="sketch-secret-timeline__summary">{entry.summary}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="sketch-secret-section sketch-secret-section--toolkit" id="sketch-secret-toolkit">
            <div className="sketch-secret-section__heading">
              <div>
                <span className="sketch-secret-section__eyebrow">tool roll</span>
                <h2 className="sketch-secret-section__title">Toolkit</h2>
              </div>
              <p className="sketch-secret-section__note">
                The stack packed into the field bag: languages, frameworks, and systems that keep the work grounded.
              </p>
            </div>

            <div className="sketch-secret-tool-grid">
              {skillGroups.map(group => (
                <article key={group.name} className="sketch-secret-tool-card">
                  <h3 className="sketch-secret-tool-card__title">{group.name}</h3>
                  <p className="sketch-secret-tool-card__note">{group.note}</p>
                  <div className="sketch-secret-tool-card__tags">
                    {group.items.map(item => (
                      <span key={item} className="sketch-secret-tool-card__tag">{item}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="sketch-secret-section sketch-secret-section--beyond" id="sketch-secret-beyond">
            <div className="sketch-secret-section__heading">
              <div>
                <span className="sketch-secret-section__eyebrow">outside the terminal</span>
                <h2 className="sketch-secret-section__title">Beyond the build</h2>
              </div>
              <p className="sketch-secret-section__note">
                Leadership, performance, and community work that still shows up in how I navigate teams.
              </p>
            </div>

            <div className="sketch-secret-life-grid">
              {lifeNotes.map(note => (
                <article key={note.title} className="sketch-secret-life-card">
                  <span className="sketch-secret-life-card__caption">{note.caption}</span>
                  <h3 className="sketch-secret-life-card__title">{note.title}</h3>
                  <p className="sketch-secret-life-card__summary">{note.summary}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="sketch-secret-section sketch-secret-section--contact" id="sketch-secret-contact">
            <div className="sketch-secret-contact">
              <article className="sketch-secret-contact__postcard">
                <span className="sketch-secret-section__eyebrow">contact + exit</span>
                <h2 className="sketch-secret-section__title">Pack the notebook away or step back into the terrain</h2>
                <p className="sketch-secret-contact__text">
                  The public portfolio stays like the overlook. This one is the rougher notebook tucked underneath it.
                  Reach out through the usual channels, or close the folio and head back to the hills.
                </p>
              </article>

              <div className="sketch-secret-contact__actions">
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
