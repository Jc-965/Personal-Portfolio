import { useRef, memo } from 'react'
import { motion, useInView } from 'framer-motion'
import { Terminal, Gamepad2, Map, GraduationCap, FlaskConical } from 'lucide-react'

interface Experience {
  id: string
  pid: string
  icon: React.ReactNode
  title: string
  role: string
  summary: string
  stack: string[]
  metrics: { label: string; value: string; bar?: number }[]
  accent: string
}

const experiences: Experience[] = [
  {
    id: 'sorcea',
    pid: '001',
    icon: <Terminal size={16} />,
    title: 'Sorcea Labs',
    role: 'App Developer Intern',
    summary: 'Drove onboarding UI improvements and visual system refinement in Flutter/Dart, delivering smoother splash-to-landing transitions and responsive layouts. Partnered with the CTO to scope features, conduct code reviews, and align frontend components with backend APIs.',
    stack: ['Flutter', 'Dart', 'UI Engineering', 'API Integration'],
    metrics: [
      { label: 'Components', value: '24', bar: 80 },
      { label: 'Screens', value: '8', bar: 65 },
      { label: 'API Calls', value: '12', bar: 50 },
    ],
    accent: '#00ffff',
  },
  {
    id: 'gcs',
    pid: '002',
    icon: <Gamepad2 size={16} />,
    title: 'Game Creation Society',
    role: 'Core Developer',
    summary: 'Implemented aerial-physics systems and replication logic for an Unreal Engine 5 multiplayer prototype, tuning movement feel and network consistency. Iterated on gameplay balance and optimized Blueprints for responsive playtests.',
    stack: ['Unreal Engine 5', 'Multiplayer systems'],
    metrics: [
      { label: 'Physics Sys', value: '3', bar: 75 },
      { label: 'Net Sync', value: '60hz', bar: 90 },
      { label: 'Players', value: '2', bar: 55 },
    ],
    accent: '#ff00ff',
  },
  {
    id: 'cmumaps',
    pid: '003',
    icon: <Map size={16} />,
    title: 'CMUMaps',
    role: 'Data & Software Engineer',
    summary: 'Built a GeoJSON processing pipeline from OpenStreetMap XML and generated geometry anchors for accurate campus rendering. Automated outline and metadata validation, preparing datasets for deployment to AWS S3.',
    stack: ['Python', 'XML Parsing', 'Geometry Algorithms', 'Data Validation'],
    metrics: [
      { label: 'Buildings', value: '142', bar: 95 },
      { label: 'Paths', value: '1.2k', bar: 85 },
      { label: 'Accuracy', value: '99%', bar: 99 },
    ],
    accent: '#00ff41',
  },
  {
    id: 'coding-minds',
    pid: '004',
    icon: <GraduationCap size={16} />,
    title: 'Coding Minds Academy',
    role: 'Instructor',
    summary: 'Designed and taught curriculum covering core programming paradigms, algorithmic reasoning, and competitive problem solving. Built project-based labs and visualization exercises to translate abstract logic into working code.',
    stack: ['Python', 'C++', 'JavaScript', 'ACSL'],
    metrics: [
      { label: 'Students', value: '50+', bar: 70 },
      { label: 'Courses', value: '6', bar: 60 },
      { label: 'Projects', value: '30+', bar: 80 },
    ],
    accent: '#ffcc00',
  },
  {
    id: 'softcom',
    pid: '005',
    icon: <FlaskConical size={16} />,
    title: 'SoftCom Lab',
    role: 'Research Intern',
    summary: "Built preprocessing and evaluation pipelines for Parkinson's progression datasets using NumPy, Pandas, and scikit-learn. Supported model validation and analysis workflows that contributed to a peer-reviewed publication.",
    stack: ['NumPy', 'Pandas', 'Scikit-learn'],
    metrics: [
      { label: 'Datasets', value: '4', bar: 65 },
      { label: 'Models', value: '7', bar: 75 },
      { label: 'Published', value: '1', bar: 100 },
    ],
    accent: '#ff3366',
  },
]

const ProcessCard = memo(function ProcessCard({ exp, index }: { exp: Experience; index: number }) {
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
      cardRef.current.style.transform = `rotateX(${y * -6}deg) rotateY(${x * 6}deg)`
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
          className="process-card"
          data-cursor
          style={{ '--process-accent': exp.accent } as React.CSSProperties}
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.35, delay: index * 0.06 }}
        >
          {/* Tech overlay pattern */}
          <div className="process-card__overlay" />

          {/* Terminal title bar */}
          <div className="process-card__titlebar">
            <div className="process-card__dots">
              <span className="process-card__dot process-card__dot--red" />
              <span className="process-card__dot process-card__dot--yellow" />
              <span className="process-card__dot process-card__dot--green" />
            </div>
            <div className="process-card__path">
              {exp.icon}
              <span>~/{exp.id}</span>
            </div>
            <div className="process-card__pid">PID:{exp.pid}</div>
          </div>

          {/* Content */}
          <div className="process-card__body">
            <div className="process-card__main">
              <div className="process-card__header">
                <h3>
                  <span className="process-card__prompt">&gt; </span>
                  {exp.title}
                </h3>
                <span className="process-card__role">{exp.role}</span>
              </div>

              <p className="process-card__summary">{exp.summary}</p>

              <div className="process-card__stack">
                {exp.stack.map(s => (
                  <span key={s} className="process-card__tag">{s}</span>
                ))}
              </div>
            </div>

            {/* Visual metrics panel */}
            <div className="process-card__metrics">
              <div className="process-card__metrics-header">
                <span className="process-card__metrics-label">METRICS</span>
                <span className="process-card__metrics-status">● ACTIVE</span>
              </div>
              {exp.metrics.map((m, i) => (
                <div key={i} className="process-card__metric">
                  <div className="process-card__metric-info">
                    <span className="process-card__metric-label">{m.label}</span>
                    <span className="process-card__metric-value">{m.value}</span>
                  </div>
                  {m.bar !== undefined && (
                    <div className="process-card__metric-bar">
                      <motion.div
                        className="process-card__metric-fill"
                        initial={{ width: 0 }}
                        animate={inView ? { width: `${m.bar}%` } : {}}
                        transition={{ duration: 0.8, delay: 0.3 + i * 0.1 }}
                      />
                    </div>
                  )}
                </div>
              ))}
              {/* Data visualization dots (CSS-animated) */}
              <div className="process-card__data-viz">
                {Array.from({ length: 12 }).map((_, i) => (
                  <span key={i} className="process-card__data-dot" />
                ))}
              </div>
            </div>
          </div>

          {/* Corner brackets */}
          <span className="process-card__corner process-card__corner--tl" />
          <span className="process-card__corner process-card__corner--tr" />
          <span className="process-card__corner process-card__corner--bl" />
          <span className="process-card__corner process-card__corner--br" />
        </motion.article>
      </div>
    </div>
  )
})

export default function Journey() {
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
          Journey
        </p>
        <h2>From Human Stories to Working Systems.</h2>
      </motion.header>

      <div className="process-grid">
        {experiences.map((exp, i) => (
          <ProcessCard key={exp.id} exp={exp} index={i} />
        ))}
      </div>
    </>
  )
}
