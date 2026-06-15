import { useEffect, useRef, useState, memo } from 'react'
import { motion, useInView, useScroll, useReducedMotion } from 'framer-motion'
import {
  Terminal,
  Gamepad2,
  Map,
  GraduationCap,
  FlaskConical,
  Shield,
  BrainCircuit,
} from 'lucide-react'
import WindowFrame from './WindowFrame'
import { preloadImage, preloadImages } from '../utils/preloadImage'

interface MediaItem {
  src: string
  label: string
  alt: string
  aspect: string
}

interface ExperienceMedia {
  kind: 'phones' | 'maps'
  items: MediaItem[]
}

interface Experience {
  id: string
  icon: React.ReactNode
  company: string
  role: string
  track: string
  period: string
  location: string
  status?: string
  summary: string
  stack: string[]
  accent: string
  media?: ExperienceMedia
}

const revealEase = [0.22, 1, 0.36, 1] as const

// Reverse-chronological journey, aligned with the résumé.
const experiences: Experience[] = [
  {
    id: 'blue-shield',
    icon: <Shield size={15} />,
    company: 'Blue Shield of California',
    role: 'Incoming Mobile Software Engineer Intern',
    track: 'Healthcare',
    period: 'Jun 2026 – Aug 2026',
    location: 'Long Beach, CA',
    status: 'Incoming',
    summary:
      'Developing Android/Kotlin mobile features in an Agile healthcare engineering workflow, translating Jira tickets into sprint-scoped implementation tasks and production-ready deliverables.',
    stack: ['Android', 'Kotlin', 'Agile', 'Jira'],
    accent: '#2d7ff9',
  },
  {
    id: 'scottylabs-ai',
    icon: <BrainCircuit size={15} />,
    company: 'ScottyLabs AI · CMUGPT',
    role: 'AI Platform Engineer',
    track: 'AI Platform',
    period: 'Apr 2026 – Present',
    location: 'Pittsburgh, PA',
    status: 'Active',
    summary:
      'Launched CMUGPT’s agent layer: a FastAPI/LangGraph StateGraph orchestrating LLMs over runtime-discovered MCP tools with deterministic CMU Maps route embeds. Piped authenticated SSE through an Express/tsoa BFF into NDJSON in a React 19/TanStack client with frame-batched rendering, and hardened it against prompt-injection across 16 live adversarial tests.',
    stack: ['FastAPI', 'LangGraph', 'MCP', 'React 19', 'TanStack', 'SSE/NDJSON'],
    accent: '#a06bff',
  },
  {
    id: 'sorcea',
    icon: <Terminal size={15} />,
    company: 'Sorcea Labs',
    role: 'Mobile Software Engineer Intern',
    track: 'Industry',
    period: 'Dec 2025 – May 2026',
    location: 'Remote',
    status: 'Shipped',
    summary:
      'Shipped onboarding, routine builder, product pages, feed, search, compare, and SHA-256 contact-matched friend discovery for a production Flutter app serving 10k+ users, 80k+ products, and 8M+ reviews. Engineered a CIELAB / Delta-E perceptual color engine with parallelized sampling, and cut home-load latency up to 75% by batching Dio fetches into one parallel call.',
    stack: ['Flutter', 'Dart', 'Dio', 'CustomPainter', 'CIELAB/Delta-E'],
    accent: '#00ffff',
    media: {
      kind: 'phones',
      items: [
        { src: '/sorcea/home.jpg', label: 'sorcea · home', alt: 'Sorcea home feed', aspect: '527 / 1080' },
        { src: '/sorcea/score.jpg', label: 'sorcea · score', alt: 'Sorcea animated score gauge', aspect: '528 / 1080' },
        { src: '/sorcea/search.jpg', label: 'sorcea · search', alt: 'Sorcea product search', aspect: '528 / 1080' },
        { src: '/sorcea/compare.jpg', label: 'sorcea · compare', alt: 'Sorcea comparison view', aspect: '527 / 1080' },
      ],
    },
  },
  {
    id: 'cmumaps',
    icon: <Map size={15} />,
    company: 'CMUMaps · ScottyLabs',
    role: 'Data & Software Engineer',
    track: 'Geospatial',
    period: 'Sep 2025 – Apr 2026',
    location: 'Pittsburgh, PA',
    status: 'Shipped',
    summary:
      'Mapped all 74 campus buildings by engineering a Python geospatial ETL that fuses CMU ArcGIS records with OpenStreetMap extracts (parsing OSM multipolygon relations, entrances, and fuzzy-matched facility IDs), then implemented Mapbox’s polylabel algorithm to compute guaranteed-interior label anchors powering search-zoom navigation and map rendering.',
    stack: ['Python', 'OpenStreetMap', 'ArcGIS', 'polylabel', 'GeoJSON', 'AWS S3'],
    accent: '#00ff41',
    media: {
      kind: 'maps',
      items: [
        { src: '/Maps/cmumaps-overview.jpg', label: 'cmumaps · map', alt: 'CMUMaps campus map with building pins', aspect: '554 / 422' },
        { src: '/Maps/cmumaps-pins.jpg', label: 'cmumaps · pins', alt: 'CMUMaps dense campus building pins', aspect: '538 / 338' },
      ],
    },
  },
  {
    id: 'gcs',
    icon: <Gamepad2 size={15} />,
    company: 'Game Creation Society',
    role: 'Core Developer',
    track: 'Game Systems',
    period: 'Sep 2025 – Dec 2025',
    location: 'Pittsburgh, PA',
    status: 'Shipped',
    summary:
      'Built Unreal Engine 5 Blueprint gameplay systems for grappling, tethering, and local multiplayer combat, synchronizing physics-driven interactions, collision feedback, and elimination state in real time for responsive first-person play.',
    stack: ['Unreal Engine 5', 'Blueprints', 'Physics', 'Multiplayer'],
    accent: '#ff00ff',
  },
  {
    id: 'coding-minds',
    icon: <GraduationCap size={15} />,
    company: 'Coding Minds Academy',
    role: 'Instructor',
    track: 'Teaching',
    period: 'Jun 2025 – Feb 2026',
    location: 'Remote',
    status: 'Complete',
    summary:
      'Designed and taught project-based Python, C++, and JavaScript curriculum centered on algorithms and competitive problem solving, translating abstract CS concepts into repeatable implementation workflows through structured labs.',
    stack: ['Python', 'C++', 'JavaScript', 'ACSL'],
    accent: '#ffcc00',
  },
  {
    id: 'softcom',
    icon: <FlaskConical size={15} />,
    company: 'SoftCom Lab · Cal Poly Pomona',
    role: 'Research Intern',
    track: 'Research',
    period: 'Jun 2023 – Aug 2024',
    location: 'Pomona, CA',
    status: 'Published',
    summary:
      'Developed and evaluated an applied ML/CV model for Parkinson’s motor-symptom assessment: designing reproducible exercise-video trials, analyzing input-quality failure modes, and validating robustness at 95.42% mean / 96.42% median accuracy. Contributed to a peer-reviewed CCSIT paper.',
    stack: ['Python', 'ML/CV', 'NumPy', 'scikit-learn'],
    accent: '#ff3366',
  },
]

/* Journey media uses a text-integrated tabbed viewer (distinct from the
   Projects deck): labelled "screen" tabs live with the copy and switch a single
   framed shot in the media column. */
function ChapterTabs({
  media,
  active,
  setActive,
}: {
  media: ExperienceMedia
  active: number
  setActive: (i: number) => void
}) {
  return (
    <div className="chapter__views">
      <span className="chapter__views-label">
        {media.kind === 'phones' ? '// screens' : '// views'}
      </span>
      <ul className="chapter__views-list">
        {media.items.map((m, i) => {
          const short = m.label.split(/[·/]/).pop()?.trim() ?? m.label
          return (
            <li key={m.src}>
              <button
                type="button"
                className={`chapter__view ${i === active ? 'is-active' : ''}`}
                onClick={() => setActive(i)}
                aria-pressed={i === active}
                data-cursor
              >
                <span className="chapter__view-caret" aria-hidden="true">&rsaquo;</span>
                {short}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ChapterMediaView({
  media,
  accent,
  active,
  direction,
}: {
  media: ExperienceMedia
  accent: string
  active: number
  direction: number
}) {
  const item = media.items[active] ?? media.items[0]
  const reduce = useReducedMotion()
  if (!item) return null

  const enterX = media.kind === 'phones' ? direction * 22 : direction * 7
  const enterY = media.kind === 'phones' ? 0 : 4
  const duration = media.kind === 'phones' ? 0.44 : 0.34

  return (
    <div className={`chapter__media chapter__media--${media.kind}`}>
      <span className="chapter__media-glow" aria-hidden="true" />
      <div className="chapter__viewer">
        <motion.div
          key={item.src}
          className="chapter__shot chapter__shot--base"
          initial={reduce ? false : { opacity: 0.72, x: enterX, y: enterY, scale: 0.986, filter: 'blur(2.5px)' }}
          animate={{ opacity: 1, x: 0, y: 0, scale: 1, filter: 'blur(0px)' }}
          transition={reduce ? { duration: 0 } : { duration, ease: [0.22, 0.61, 0.36, 1] }}
        >
          <WindowFrame
            src={item.src}
            alt={item.alt}
            label={item.label}
            variant={media.kind === 'maps' ? 'browser' : 'terminal'}
            accent={accent}
            aspect={item.aspect}
            tilt={false}
            loading="eager"
          />
        </motion.div>
      </div>
    </div>
  )
}

const Chapter = memo(function Chapter({ exp }: { exp: Experience }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.3, margin: '0px 0px -12% 0px' })
  const [view, setView] = useState({ active: 0, direction: 1 })
  const select = (i: number) => {
    if (exp.media) preloadImage(exp.media.items[i]?.src)
    setView((current) => {
      if (i === current.active) return current
      return { active: i, direction: i > current.active ? 1 : -1 }
    })
  }

  useEffect(() => {
    if (!exp.media || !inView) return
    preloadImages(exp.media.items.map((item) => item.src))
  }, [exp.media, inView])

  return (
    <motion.article
      ref={ref}
      className={`chapter ${exp.media ? 'chapter--has-media' : ''}`}
      style={{ '--chapter-accent': exp.accent } as React.CSSProperties}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: revealEase }}
    >
      <div className="chapter__aside">
        <span className="chapter__period">{exp.period}</span>
        <span className="chapter__location">{exp.location}</span>
      </div>

      <div className="chapter__spine" aria-hidden="true">
        <span className={`chapter__node ${inView ? 'is-live' : ''}`}>{exp.icon}</span>
      </div>

      <div className="chapter__body">
        <div className="chapter__text">
          <div className="chapter__heading">
            <span className="chapter__track">{exp.track}</span>
            {exp.status && <span className="chapter__status">● {exp.status}</span>}
          </div>
          <h3 className="chapter__company">{exp.company}</h3>
          <p className="chapter__role">{exp.role}</p>
          <p className="chapter__summary">{exp.summary}</p>
          <div className="chapter__stack">
            {exp.stack.map((s) => (
              <span key={s} className="chapter__chip">{s}</span>
            ))}
          </div>
          {exp.media && <ChapterTabs media={exp.media} active={view.active} setActive={select} />}
        </div>
        {exp.media && (
          <ChapterMediaView
            media={exp.media}
            accent={exp.accent}
            active={view.active}
            direction={view.direction}
          />
        )}
      </div>
    </motion.article>
  )
})

export default function Journey() {
  const headerRef = useRef(null)
  const headerInView = useInView(headerRef, { once: true, margin: '-50px' })
  const timelineRef = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: timelineRef,
    offset: ['start center', 'end 80%'],
  })

  return (
    <>
      <motion.header
        ref={headerRef}
        className="section__header"
        initial={{ opacity: 0, y: 20 }}
        animate={headerInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.35 }}
      >
        <p className="section__eyebrow">
          <span className="section__eyebrow-icon">&#9670;</span>
          Journey
        </p>
        <h2>From research labs to shipped products</h2>
      </motion.header>

      <div ref={timelineRef} className="timeline">
        <div className="timeline__track" aria-hidden="true">
          <motion.div
            className="timeline__fill"
            style={reduce ? { scaleY: 1 } : { scaleY: scrollYProgress }}
          />
        </div>
        {experiences.map((exp) => (
          <Chapter key={exp.id} exp={exp} />
        ))}
      </div>
    </>
  )
}
