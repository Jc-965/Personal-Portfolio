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
      'Built in Flutter/Dart with Firebase backend for symptom tracking, medication schedules, and exercise guidance.',
      'Designed structured Firestore schema for seamless logging, retrieval, and synchronization between mobile clients.',
      'Implemented authentication, personalized profiles, and adaptive UI for secure, responsive experience across devices.',
    ],
    tech: ['Flutter & Dart', 'Firebase', 'Signal processing', 'On-device ML'],
    stats: [
      { label: 'SCREENS', value: '12' },
      { label: 'SYNC', value: 'REAL-TIME' },
      { label: 'PLATFORM', value: 'CROSS' },
    ],
  },
  {
    id: 'mycommunity',
    name: 'MyCommunity',
    tag: 'Android · Civic tech',
    accent: '#b38e5d',
    accentRgb: '179, 142, 93',
    bullets: [
      'Created an Android app that helps Scouts find local service projects and connect with troops.',
      'Used Firebase and Google Maps to integrate live community data and events.',
      'Integrated NYT API to provide insight for relevant current events to enable improved troop projects.',
    ],
    tech: ['Java', 'Firebase', 'Google Maps SDK', 'REST APIs'],
    stats: [
      { label: 'APIS', value: '3' },
      { label: 'MAP', value: 'LIVE' },
      { label: 'EVENTS', value: '100+' },
    ],
  },
  {
    id: 'tarocchi',
    name: 'Tarocchi',
    tag: 'Interactive web · Creative systems',
    accent: '#9c7fae',
    accentRgb: '156, 127, 174',
    bullets: [
      'Built using React and TypeScript with a tarot-inspired interactive visual experience.',
      'Implemented branching logic through prompt-based storytelling and interactive choices.',
      'Added parallax visuals and soundscapes for an immersive web experience.',
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
