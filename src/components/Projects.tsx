import { useRef, memo } from 'react'
import {
  motion,
  useInView,
  useScroll,
  useTransform,
  useReducedMotion,
  type Variants,
} from 'framer-motion'
import MediaGallery from './MediaGallery'
import useCardTilt from '../hooks/useCardTilt'

interface ProjectImage {
  src: string
  label: string
  alt: string
  aspect: string
}

interface ProjectStat {
  label: string
  value: string
}

interface Project {
  id: string
  name: string
  tag: string
  accent: string
  accentRgb: string
  lead: string
  bullets: string[]
  tech: string[]
  stats: ProjectStat[]
  kind: 'media' | 'code'
  images?: ProjectImage[]
  imageVariant?: 'browser' | 'terminal'
  terminal?: string[]
}

// Interleaved media / code so the rhythm alternates as you scroll.
const projects: Project[] = [
  {
    id: 'agoriai',
    name: 'Agoriai',
    tag: 'Full-stack · Social platform · Tartan Hacks 2026',
    accent: '#4c8bff',
    accentRgb: '76, 139, 255',
    kind: 'media',
    lead: 'An anonymous student career network built in one TartanHacks weekend: a REST API over Drizzle/PostgreSQL with school-email auth, SHA-256-hashed bearer sessions, and a typed React 19 client.',
    bullets: [
      'Safeguarded anonymity with server-enforced 4-tier identity privacy: alias generation, per-request visibility filtering, and evasion-resistant moderation (leetspeak normalization, edit-distance fuzzy matching).',
      'Powered exploration with transactional voting, recursive threaded discussions, and an interactive D3 force-directed student–company graph.',
    ],
    tech: ['React 19', 'TypeScript', 'D3', 'Drizzle', 'PostgreSQL', 'SHA-256'],
    stats: [
      { label: 'EVENT', value: 'TARTANHACKS 2026' },
      { label: 'PRIVACY', value: '4-TIER' },
      { label: 'GRAPH', value: 'D3 FORCE' },
    ],
    imageVariant: 'browser',
    images: [
      { src: '/Agoriai/nexus.jpg', label: 'agoriai.app / nexus', alt: 'Agoriai Nexus relationship graph', aspect: '1600 / 904' },
      { src: '/Agoriai/dashboard.jpg', label: 'agoriai.app / dashboard', alt: 'Agoriai dashboard overview', aspect: '1600 / 904' },
      { src: '/Agoriai/feed.jpg', label: 'agoriai.app / feed', alt: 'Agoriai anonymous Q&A feed', aspect: '1600 / 904' },
      { src: '/Agoriai/connection.jpg', label: 'agoriai.app / profile', alt: 'Agoriai profile and connections', aspect: '1600 / 904' },
    ],
  },
  {
    id: 'levio',
    name: 'Levio',
    tag: 'Mobile health · Cross-platform',
    accent: '#6aa5af',
    accentRgb: '106, 165, 175',
    kind: 'code',
    lead: "An offline-first Flutter care platform for Parkinson's patients: symptom tracking, medication schedules, guided LSVT/PWR! therapy, and a crisis-screening community that stays fully usable through total connectivity loss via versioned snapshot sync.",
    bullets: [
      'Ran production release engineering solo: row-level security on every Supabase/PostgreSQL table, tamper-proof RPC counters, and anonymous-to-OAuth bootstrap.',
      'Shipped signed iOS and Android builds through multi-environment GitHub Actions CI/CD.',
    ],
    tech: ['Flutter', 'Dart', 'Supabase', 'PostgreSQL (RLS)', 'GitHub Actions CI/CD'],
    stats: [
      { label: 'ARCH', value: 'OFFLINE-FIRST' },
      { label: 'SECURITY', value: 'ROW-LEVEL' },
      { label: 'PIPELINE', value: 'CI/CD' },
    ],
    terminal: [
      'flutter build ios --release',
      'supabase ▸ row-level security enforced',
      'snapshot sync ▸ offline cache restored',
      'ci/cd ▸ signed ios + android shipped',
      'levio ▸ ready for care',
    ],
  },
  {
    id: 'tarocchi',
    name: 'Tarocchi',
    tag: 'Interactive web · Creative systems',
    accent: '#9c7fae',
    accentRgb: '156, 127, 174',
    kind: 'media',
    lead: 'An interactive narrative web experience with 24 branching story paths and a replayable, state-driven progression model.',
    bullets: [
      'Route logic and scene transitions in React/TypeScript keep branching flows coherent as narrative complexity grows.',
      'Framer Motion, parallax systems, and synchronized audio deliver a cinematic, high-immersion presentation pipeline.',
    ],
    tech: ['React & Vite', 'TypeScript', 'Tailwind CSS', 'Framer Motion'],
    stats: [
      { label: 'PATHS', value: '24' },
      { label: 'EFFECTS', value: 'PARALLAX' },
      { label: 'AUDIO', value: 'IMMERSIVE' },
    ],
    imageVariant: 'browser',
    images: [
      { src: '/Tarocchi/tarocchi-1.jpg', label: 'tarocchi / oracle', alt: 'Tarocchi pixel-art oracle prompt', aspect: '1600 / 1039' },
      { src: '/Tarocchi/tarocchi-2.jpg', label: 'tarocchi / countryside', alt: 'Tarocchi countryside branch scene', aspect: '1600 / 1039' },
      { src: '/Tarocchi/tarocchi-8.jpg', label: 'tarocchi / spread', alt: 'Tarocchi three-card reading spread', aspect: '1600 / 1039' },
      { src: '/Tarocchi/tarocchi-6.jpg', label: 'tarocchi / city', alt: 'Tarocchi night-city branch scene', aspect: '1600 / 1039' },
    ],
  },
  {
    id: 'mycommunity',
    name: 'MyCommunity',
    tag: 'Android · Civic tech',
    accent: '#b38e5d',
    accentRgb: '179, 142, 93',
    kind: 'code',
    lead: 'A native Java Android platform for live Boy Scouts troop discovery, binding Google Maps markers to real-time Firebase listeners with runtime location permissions and Google Sign-In.',
    bullets: [
      'Validated profile CRUD over Firebase with runtime location permissions and Google Sign-In auth.',
      'Streamed an async NYT API community feed using OkHttp, Gson, and Glide for fast on-device browsing.',
    ],
    tech: ['Java', 'Android', 'Google Maps', 'Firebase', 'OkHttp/Gson/Glide'],
    stats: [
      { label: 'PLATFORM', value: 'ANDROID' },
      { label: 'DATA', value: 'FIREBASE RT' },
      { label: 'MAP', value: 'GEOSPATIAL' },
    ],
    terminal: [
      'gradle assembleRelease',
      'firebase ▸ realtime troop listeners live',
      'maps ▸ markers bound to location',
      'nyt api ▸ feed cached via glide',
      'mycommunity ▸ discover nearby',
    ],
  },
]

const copyContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.08 } },
}
const copyItem: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
}

/* Floating terminal visual for projects without screenshots. */
function CodeStage({ project }: { project: Project }) {
  const { ref, tiltProps } = useCardTilt({ max: 7, perspective: 1300 })

  return (
    <div className="proj__codestage" ref={ref} {...tiltProps}>
      <div
        className="window-frame window-frame--terminal code-frame"
        style={{ '--wf-accent': project.accent } as React.CSSProperties}
      >
        <div className="window-frame__tilt">
          <div className="window-frame__chrome">
            <div className="window-frame__dots" aria-hidden="true">
              <span className="window-frame__dot window-frame__dot--r" />
              <span className="window-frame__dot window-frame__dot--y" />
              <span className="window-frame__dot window-frame__dot--g" />
            </div>
            <div className="window-frame__path">~/{project.id} · zsh</div>
          </div>
          <div className="code-frame__body">
            {(project.terminal ?? []).map((line, i) => (
              <div key={i} className="code-frame__line">
                <span className="code-frame__prompt">$</span>
                <span>{line}</span>
              </div>
            ))}
            <div className="code-frame__line">
              <span className="code-frame__prompt">$</span>
              <span className="code-frame__cursor" aria-hidden="true" />
            </div>
          </div>
          <span className="window-frame__corner window-frame__corner--tl" aria-hidden="true" />
          <span className="window-frame__corner window-frame__corner--tr" aria-hidden="true" />
          <span className="window-frame__corner window-frame__corner--bl" aria-hidden="true" />
          <span className="window-frame__corner window-frame__corner--br" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

const ProjectScene = memo(function ProjectScene({
  project,
  index,
}: {
  project: Project
  index: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-15% 0px -15% 0px' })
  const reduce = useReducedMotion()
  const interactive = !reduce
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })
  const nameY = useTransform(scrollYProgress, [0, 1], ['16%', '-16%'])
  const visualY = useTransform(scrollYProgress, [0, 1], ['9%', '-9%'])
  const side = index % 2 === 0 ? 'left' : 'right'

  return (
    <section
      ref={ref}
      className={`proj proj--${side} proj--${project.kind}`}
      style={{
        '--project-accent': project.accent,
        '--project-accent-rgb': project.accentRgb,
      } as React.CSSProperties}
    >
      <div className="proj__bigname-wrap" aria-hidden="true">
        <motion.span className="proj__bigname" style={interactive ? { y: nameY } : undefined}>
          {project.name}
        </motion.span>
      </div>

      <motion.div className="proj__visual" style={interactive ? { y: visualY } : undefined}>
        <motion.div
          className="proj__visual-inner"
          initial={{ opacity: 0, y: 34, scale: 0.97 }}
          animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          {project.kind === 'media' ? (
            <MediaGallery
              images={project.images ?? []}
              accent={project.accent}
              defaultVariant={project.imageVariant}
              side={side}
            />
          ) : (
            <CodeStage project={project} />
          )}
        </motion.div>
      </motion.div>

      <motion.div
        className="proj__copy"
        variants={copyContainer}
        initial="hidden"
        animate={inView ? 'show' : 'hidden'}
      >
        <motion.p className="proj__eyebrow" variants={copyItem}>
          <span className="proj__dot" />
          {project.tag}
        </motion.p>
        <motion.h3 className="proj__title" variants={copyItem}>{project.name}</motion.h3>
        <motion.p className="proj__lead" variants={copyItem}>{project.lead}</motion.p>
        <motion.ul className="proj__bullets" variants={copyItem}>
          {project.bullets.map((b, i) => (
            <li key={i}>
              <span className="proj__bullet-icon">›</span>
              <span>{b}</span>
            </li>
          ))}
        </motion.ul>
        <motion.div className="proj__meta" variants={copyItem}>
          <div className="proj__stats">
            {project.stats.map((s) => (
              <div key={s.label} className="proj__stat">
                <span className="proj__stat-label">{s.label}</span>
                <span className="proj__stat-value">{s.value}</span>
              </div>
            ))}
          </div>
          <div className="proj__tech">
            {project.tech.map((t) => (
              <span key={t} className="proj__tech-tag">{t}</span>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </section>
  )
})

export default function Projects() {
  const headerRef = useRef(null)
  const headerInView = useInView(headerRef, { once: true, margin: '-50px' })

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
          Projects
        </p>
        <h2>Building software that solves meaningful problems</h2>
      </motion.header>

      <div className="projects__scenes">
        {projects.map((p, i) => (
          <ProjectScene key={p.id} project={p} index={i} />
        ))}
      </div>
    </>
  )
}
