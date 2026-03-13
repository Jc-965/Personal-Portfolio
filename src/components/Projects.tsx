import { useRef, memo } from 'react'
import { motion, useInView } from 'framer-motion'

interface Project {
  id: string
  name: string
  tag: string
  accent: string
  accentRgb: string
  bullets: string[]
  tech: string[]
  stats: { label: string; value: string }[]
}

const projects: Project[] = [
  {
    id: 'levio',
    name: 'Levio',
    tag: 'Mobile health · Cross-platform',
    accent: '#6aa5af',
    accentRgb: '106, 165, 175',
    bullets: [
      "Built a Flutter app for Parkinson's care with symptom tracking, medication schedules, recovery media, and moderated community posts.",
      'Led iOS/Android release engineering with GitHub Actions CI/CD for testing and staging.',
      'Integrated Supabase auth/data with local JSON caching for offline sync.',
    ],
    tech: ['Flutter & Dart', 'Supabase', 'GitHub Actions CI/CD', 'Offline Sync'],
    stats: [
      { label: 'PLATFORM', value: 'IOS/ANDROID' },
      { label: 'PIPELINE', value: 'CI/CD' },
      { label: 'BACKEND', value: 'SUPABASE' },
    ],
  },
  {
    id: 'agoriai',
    name: 'Agoriai',
    tag: 'Full-stack · Social platform',
    accent: '#4c8bff',
    accentRgb: '76, 139, 255',
    bullets: [
      'Built an anonymous career network with React 19, TypeScript, Bun/Elysia, PostgreSQL, and Drizzle, with school-email auth, feeds, voting, and threaded discussions.',
      'Designed trust-aware networking with identity controls, moderated direct messaging, and mutual identity reveal.',
      'Implemented SHA-256 session-token auth and discovery features including a D3 force-directed graph, company pages, and internship discovery.',
    ],
    tech: ['React 19', 'TypeScript', 'Bun/Elysia', 'PostgreSQL/Drizzle', 'D3'],
    stats: [
      { label: 'EVENT', value: '2026' },
      { label: 'GRAPH', value: 'D3' },
      { label: 'PRIVACY', value: 'SHA-256' },
    ],
  },
  {
    id: 'mycommunity',
    name: 'MyCommunity',
    tag: 'Android · Civic tech',
    accent: '#b38e5d',
    accentRgb: '179, 142, 93',
    bullets: [
      'Built a native Android app in Java to help Scouts find troops and service opportunities through location-aware search.',
      'Integrated Firebase, Google Maps, and NYT APIs with OkHttp, Gson, and Glide for troop profiles and a dynamic news feed.',
      'Combined geospatial browsing and community discovery into a lightweight scouting platform.',
    ],
    tech: ['Java', 'Firebase', 'Google Maps API', 'OkHttp/Gson/Glide'],
    stats: [
      { label: 'PLATFORM', value: 'ANDROID' },
      { label: 'APIS', value: '3' },
      { label: 'MAP', value: 'GEOSPATIAL' },
    ],
  },
  {
    id: 'tarocchi',
    name: 'Tarocchi',
    tag: 'Interactive web · Creative systems',
    accent: '#9c7fae',
    accentRgb: '156, 127, 174',
    bullets: [
      'Built a tarot-inspired interactive web experience in React and TypeScript.',
      'Implemented branching storytelling through prompt-based choices.',
      'Added parallax visuals and soundscapes for a more immersive experience.',
    ],
    tech: ['React & Vite', 'TypeScript', 'Tailwind CSS', 'Framer Motion'],
    stats: [
      { label: 'PATHS', value: '24' },
      { label: 'EFFECTS', value: 'PARALLAX' },
      { label: 'AUDIO', value: 'IMMERSIVE' },
    ],
  },
]

const ProjectCard = memo(function ProjectCard({ project, index }: { project: Project; index: number }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const cardRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  const handleMouse = (e: React.MouseEvent) => {
    if (!cardRef.current) return
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      if (!cardRef.current) return
      const rect = cardRef.current.getBoundingClientRect()
      const x = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width - 0.5) * 2))
      const y = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height - 0.5) * 2))
      cardRef.current.style.transform = `rotateX(${y * -8}deg) rotateY(${x * 8}deg)`
    })
  }

  const handleMouseLeave = () => {
    cancelAnimationFrame(rafRef.current)
    if (cardRef.current) cardRef.current.style.transform = 'rotateX(0deg) rotateY(0deg)'
  }

  return (
    <div className="card-3d-wrap">
      <div
        ref={cardRef}
        className="card-3d-tilt"
        onMouseMove={handleMouse}
        onMouseLeave={handleMouseLeave}
      >
        <motion.article
          ref={ref}
          className="project-card"
          data-cursor
          style={{
            '--project-accent': project.accent,
            '--project-accent-rgb': project.accentRgb,
          } as React.CSSProperties}
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.35, delay: index * 0.08 }}
        >
          {/* Tech grid overlay */}
          <div className="project-card__grid" />

          {/* Header with status display */}
          <div className="project-card__header">
            <div className="project-card__title-row">
              <h3>{project.name}</h3>
              <span className="project-card__indicator" />
            </div>
            <span className="project-card__tag">{project.tag}</span>
          </div>

          {/* Stats bar - visual data display */}
          <div className="project-card__stats">
            {project.stats.map((stat, i) => (
              <div key={i} className="project-card__stat">
                <span className="project-card__stat-label">{stat.label}</span>
                <span className="project-card__stat-value">{stat.value}</span>
              </div>
            ))}
          </div>

          {/* Bullets */}
          <ul className="project-card__bullets">
            {project.bullets.map((b, i) => (
              <li key={i}>
                <span className="project-card__bullet-icon">›</span>
                {b}
              </li>
            ))}
          </ul>

          {/* Tech with visual connectors */}
          <div className="project-card__tech">
            <div className="project-card__tech-label">STACK</div>
            <div className="project-card__tech-list">
              {project.tech.map((t, i) => (
                <motion.span
                  key={t}
                  className="project-card__tech-tag"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={inView ? { opacity: 1, scale: 1 } : {}}
                  transition={{ duration: 0.3, delay: 0.4 + i * 0.05 }}
                >
                  {t}
                </motion.span>
              ))}
            </div>
          </div>

          {/* Corner brackets */}
          <span className="project-card__corner project-card__corner--tl" />
          <span className="project-card__corner project-card__corner--tr" />
          <span className="project-card__corner project-card__corner--bl" />
          <span className="project-card__corner project-card__corner--br" />

          {/* Animated top line */}
          <div className="project-card__topline" />
        </motion.article>
      </div>
    </div>
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

      <div className="projects__grid">
        {projects.map((p, i) => (
          <ProjectCard key={p.id} project={p} index={i} />
        ))}
      </div>
    </>
  )
}
