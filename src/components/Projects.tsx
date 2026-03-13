import { useRef, memo } from 'react'
import { motion, useInView } from 'framer-motion'

interface Project {
  id: string
  name: string
  tag: string
  accent: string
  accentRgb: string
  featured?: boolean
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
    featured: true,
    bullets: [
      "Levio is a mobile care product that brings Parkinson's symptom tracking, medication routines, recovery media, and community support into one experience.",
      'Handled iOS/Android release engineering with automated testing and staged releases.',
      'Combined cloud auth/data services with local JSON caching so core care flows stayed usable offline.',
    ],
    tech: ['Supabase', 'Flutter', 'Dart', 'Offline Sync', 'GitHub Actions CI/CD'],
    stats: [
      { label: 'PLATFORM', value: 'IOS/ANDROID' },
      { label: 'PIPELINE', value: 'CI/CD' },
      { label: 'BACKEND', value: 'SUPABASE' },
    ],
  },
  {
    id: 'agoriai',
    name: 'Agoriai',
    tag: 'Full-stack · Social platform · Tartan Hacks 2026',
    accent: '#4c8bff',
    accentRgb: '76, 139, 255',
    featured: true,
    bullets: [
      'Agoriai is an anonymous career network for candid questions about internships, recruiting, and companies without the usual social risk.',
      'Designed trust-aware networking with identity controls, moderated direct messaging, and mutual identity-reveal workflows.',
      'Implemented hashed-session auth and graph-driven discovery across company pages, relationship maps, and internship search.',
    ],
    tech: ['React 19', 'TypeScript', 'D3', 'Bun/Elysia', 'PostgreSQL/Drizzle', ],
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
      'MyCommunity is a scouting app for finding nearby troops, service opportunities, and local updates in one place.',
      'Connected cloud-backed troop profiles, map-based search, and live news into a single mobile workflow.',
      'Turned geospatial browsing into a practical discovery tool for scouting participation and community engagement.',
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
      'Tarocchi is a tarot-inspired interactive narrative designed to feel exploratory, replayable, and atmospheric.',
      'Structured 24 branching paths through prompt-based choice logic so each route felt distinct without losing coherence.',
      'Synchronized parallax motion and layered soundscapes to reinforce mood and pacing throughout the experience.',
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
  const [lead, ...details] = project.bullets
  const featured = Boolean(project.featured)

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
    <div className={`card-3d-wrap project-slot ${featured ? 'project-slot--featured' : 'project-slot--standard'}`}>
      <div
        ref={cardRef}
        className="card-3d-tilt"
        onMouseMove={handleMouse}
        onMouseLeave={handleMouseLeave}
      >
        <motion.article
          ref={ref}
          className={`project-card ${featured ? 'project-card--featured' : 'project-card--standard'}`}
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

          <div className="project-card__header">
            <div className="project-card__title-row">
              <div className="project-card__title-block">
                <h3>{project.name}</h3>
                <span className="project-card__tag">{project.tag}</span>
              </div>
              <span className="project-card__indicator" />
            </div>
          </div>

          <div className={`project-card__body ${featured ? 'project-card__body--featured' : ''}`}>
            <div className="project-card__content">
              <p className="project-card__lead">{lead}</p>

              <ul className="project-card__bullets">
                {details.map((bullet, bulletIndex) => (
                  <li key={bulletIndex}>
                    <span className="project-card__bullet-icon">›</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>

            {featured && (
              <aside className="project-card__aside">
                <div className="project-card__panel">
                  <div className="project-card__panel-label">AT A GLANCE</div>
                  <div className="project-card__stats project-card__stats--stacked">
                    {project.stats.map((stat, statIndex) => (
                      <div key={statIndex} className="project-card__stat">
                        <span className="project-card__stat-label">{stat.label}</span>
                        <span className="project-card__stat-value">{stat.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="project-card__panel">
                  <div className="project-card__tech">
                    <div className="project-card__tech-label">TECH STACK</div>
                    <div className="project-card__tech-list">
                      {project.tech.map((tech, techIndex) => (
                        <motion.span
                          key={tech}
                          className="project-card__tech-tag"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={inView ? { opacity: 1, scale: 1 } : {}}
                          transition={{ duration: 0.3, delay: 0.4 + techIndex * 0.05 }}
                        >
                          {tech}
                        </motion.span>
                      ))}
                    </div>
                  </div>
                </div>
              </aside>
            )}
          </div>

          {!featured && (
            <>
              <div className="project-card__stats">
                {project.stats.map((stat, statIndex) => (
                  <div key={statIndex} className="project-card__stat">
                    <span className="project-card__stat-label">{stat.label}</span>
                    <span className="project-card__stat-value">{stat.value}</span>
                  </div>
                ))}
              </div>

              <div className="project-card__tech">
                <div className="project-card__tech-label">TECH STACK</div>
                <div className="project-card__tech-list">
                  {project.tech.map((tech, techIndex) => (
                    <motion.span
                      key={tech}
                      className="project-card__tech-tag"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={inView ? { opacity: 1, scale: 1 } : {}}
                      transition={{ duration: 0.3, delay: 0.4 + techIndex * 0.05 }}
                    >
                      {tech}
                    </motion.span>
                  ))}
                </div>
              </div>
            </>
          )}

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
