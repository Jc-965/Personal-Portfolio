import { useRef, memo, useEffect, useState, useCallback } from 'react'
import { motion, useInView } from 'framer-motion'
import { Terminal, Gamepad2, Map, GraduationCap, FlaskConical, Shield } from 'lucide-react'
import { useGyroscope } from '../context/GyroscopeContext'
import useIsPhone from '../hooks/useIsPhone'

interface ExperienceDetail {
  label: string
  value: string
  bar?: number
}

interface Experience {
  id: string
  pid: string
  icon: React.ReactNode
  title: string
  role: string
  track: string
  period?: string
  location?: string
  status?: string
  summary: string
  stack: string[]
  panelLabel: string
  panelStatus: string
  panelMode: 'metrics' | 'details'
  details: ExperienceDetail[]
  accent: string
}

const revealEase = [0.22, 1, 0.36, 1] as const

const metaVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: (index: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.55,
      delay: index * 0.06,
      ease: revealEase,
    },
  }),
}

const branchVariants = {
  hidden: { opacity: 0, scaleX: 0.85 },
  visible: (index: number) => ({
    opacity: 1,
    scaleX: 1,
    transition: {
      duration: 0.5,
      delay: 0.08 + index * 0.06,
      ease: revealEase,
    },
  }),
}

const markerVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: (index: number) => ({
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.45,
      delay: 0.14 + index * 0.06,
      ease: revealEase,
    },
  }),
}

const cardVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.65,
      delay: 0.12 + index * 0.06,
      ease: revealEase,
    },
  }),
}

interface RailPoint {
  accent: string
  center: number
}

const experiences: Experience[] = [
  {
    id: 'blue-shield',
    pid: '001',
    icon: <Shield size={16} />,
    title: 'Blue Shield of California',
    role: 'Incoming Mobile Software Engineering Intern',
    track: 'Healthcare',
    period: 'Jun 2026 - Aug 2026',
    location: 'Long Beach, CA',
    status: 'Incoming',
    summary: 'Joining Blue Shield of California as an incoming Mobile Software Engineering Intern for Summer 2026, working on mobile healthcare technology.',
    stack: ['Mobile Engineering', 'Healthcare Tech', 'Summer 2026'],
    panelLabel: 'AT A GLANCE',
    panelStatus: 'INCOMING',
    panelMode: 'details',
    details: [
      { label: 'Start', value: 'JUN 2026' },
      { label: 'Track', value: 'MOBILE ENG' },
      { label: 'Domain', value: 'HEALTHCARE' },
    ],
    accent: '#2d7ff9',
  },
  {
    id: 'sorcea',
    pid: '002',
    icon: <Terminal size={16} />,
    title: 'Sorcea Labs',
    role: 'Mobile Software Engineering Intern',
    track: 'Industry',
    period: 'Dec 2025 - May 2026',
    location: 'Remote',
    summary: 'Built skincare discovery features for 10k+ users across 80k+ products and 8M+ reviews. Engineered 15+ Dio-backed flows including a 22-step tutorial engine, animated CustomPainter score gauge, comparison module, and paginated reviews, and parallelized home/profile/feed fetches to cut equal-latency waits by up to 75%.',
    stack: ['Flutter', 'Dart', 'Dio', 'CustomPainter', 'Performance'],
    panelLabel: 'METRICS',
    panelStatus: 'SHIPPED',
    panelMode: 'metrics',
    details: [
      { label: 'Users', value: '10K+', bar: 90 },
      { label: 'Products', value: '80K+', bar: 84 },
      { label: 'Reviews', value: '8M+', bar: 96 },
    ],
    accent: '#00ffff',
  },
  {
    id: 'gcs',
    pid: '005',
    icon: <Gamepad2 size={16} />,
    title: 'Game Creation Society',
    role: 'Core Developer',
    track: 'Game Systems',
    period: 'Sep 2025 - Dec 2025',
    location: 'Pittsburgh, PA',
    summary: 'Built Unreal Engine 5 Blueprint gameplay systems for grappling, tethering, and local multiplayer combat. Synchronized physics-driven interactions, collision feedback, and elimination state in real time to maintain responsive first-person gameplay.',
    stack: ['Unreal Engine 5', 'Blueprints', 'Physics Systems', 'Multiplayer Logic'],
    panelLabel: 'SYSTEMS',
    panelStatus: 'SHIPPED',
    panelMode: 'details',
    details: [
      { label: 'Mechanics', value: 'GRAPPLE + TETHER' },
      { label: 'Mode', value: 'LOCAL MULTIPLAYER' },
      { label: 'Sync', value: 'COLLISIONS + TRAILS' },
    ],
    accent: '#ff00ff',
  },
  {
    id: 'cmumaps',
    pid: '003',
    icon: <Map size={16} />,
    title: 'CMUMaps',
    role: 'Data & Software Engineer',
    track: 'Campus Data',
    period: 'Sep 2025 - Apr 2026',
    location: 'Pittsburgh, PA',
    summary: 'Parsed OpenStreetMap data with Python into normalized JSON artifacts, validating room IDs, geometry, and metadata consistency. Automated serializer and deserializer to version datasets and publish artifacts to AWS S3 for frontend and backend use, and implemented geometry-based anchors for accurate map rendering and label placement across complex map features.',
    stack: ['Python', 'OSM Parsing', 'JSON Pipelines', 'AWS S3', 'Geometry Anchors'],
    panelLabel: 'METRICS',
    panelStatus: 'SHIPPED',
    panelMode: 'metrics',
    details: [
      { label: 'Buildings', value: '142', bar: 92 },
      { label: 'Paths', value: '1.2K', bar: 84 },
      { label: 'Workflows', value: '2', bar: 78 },
    ],
    accent: '#00ff41',
  },
  {
    id: 'coding-minds',
    pid: '004',
    icon: <GraduationCap size={16} />,
    title: 'Coding Minds Academy',
    role: 'Instructor',
    track: 'Teaching',
    period: 'Jun 2025 - Feb 2026',
    location: 'Remote',
    summary: 'Designed and taught project-based Python, C++, and JavaScript curriculum centered on algorithms and competitive problem solving. Built structured labs and code-driven exercises that translated abstract CS concepts into repeatable implementation workflows.',
    stack: ['Python', 'C++', 'JavaScript', 'ACSL'],
    panelLabel: 'TEACHING',
    panelStatus: 'COMPLETE',
    panelMode: 'details',
    details: [
      { label: 'Languages', value: 'PYTHON / C++ / JS' },
      { label: 'Focus', value: 'ALGORITHMS + ACSL' },
      { label: 'Format', value: 'PROJECT LABS' },
    ],
    accent: '#ffcc00',
  },
  {
    id: 'softcom',
    pid: '006',
    icon: <FlaskConical size={16} />,
    title: 'SoftCom Lab',
    role: 'Research Intern',
    track: 'Research',
    period: 'Jun 2023 - Aug 2024',
    location: 'Pomona, CA',
    summary: "Initiated a Parkinson's-focused mobile-health study by assembling speech and movement datasets under faculty mentorship, then developed reproducible Python pipelines using NumPy, Pandas, and scikit-learn for feature extraction and analysis. Contributed methodology and results to a peer-reviewed CCSIT paper advancing healthcare AI/ML digital therapeutics.",
    stack: ['Python', 'NumPy', 'Pandas', 'Scikit-learn', 'Healthcare AI/ML'],
    panelLabel: 'RESEARCH',
    panelStatus: 'PUBLISHED',
    panelMode: 'details',
    details: [
      { label: 'Study', value: "PARKINSON'S M-HEALTH" },
      { label: 'Signals', value: 'SPEECH + MOTION' },
      { label: 'Output', value: 'PEER-REVIEWED PAPER' },
    ],
    accent: '#ff3366',
  },
]

const timelineOrder = ['blue-shield', 'sorcea', 'cmumaps', 'coding-minds', 'gcs', 'softcom']

const orderedExperiences = timelineOrder
  .map(id => experiences.find(exp => exp.id === id))
  .filter((exp): exp is Experience => Boolean(exp))

function buildProgressGradient(points: RailPoint[], railHeight: number) {
  if (!points.length || railHeight <= 0) {
    return 'linear-gradient(180deg, rgba(143, 252, 255, 0.92), rgba(0, 255, 255, 0.32))'
  }

  const stops: string[] = [`${points[0].accent} 0%`]

  points.forEach((point, index) => {
    const pointPct = (point.center / railHeight) * 100
    stops.push(`${point.accent} ${pointPct.toFixed(2)}%`)

    if (index === points.length - 1) {
      stops.push(`${point.accent} 100%`)
      return
    }

    const next = points[index + 1]
    const nextPct = (next.center / railHeight) * 100
    const segmentPct = Math.max(0, nextPct - pointPct)
    const transitionStartPct = pointPct + segmentPct * 0.875

    stops.push(`${point.accent} ${transitionStartPct.toFixed(2)}%`)
    stops.push(`${next.accent} ${nextPct.toFixed(2)}%`)
  })

  return `linear-gradient(180deg, ${stops.join(', ')})`
}

const ProcessCard = memo(function ProcessCard({
  exp,
  index,
  onReveal,
  registerMarker,
}: {
  exp: Experience
  index: number
  onReveal: (index: number) => void
  registerMarker: (id: string, marker: HTMLSpanElement | null) => void
}) {
  const ref = useRef(null)
  const inView = useInView(ref, {
    once: true,
    amount: 0.34,
    margin: '0px 0px -10% 0px',
  })
  const cardRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const gyro = useGyroscope()
  const isPhone = useIsPhone()

  // Gyroscope tilt on mobile only
  useEffect(() => {
    const el = cardRef.current
    if (!el || !isPhone || !gyro.permitted) return

    return gyro.subscribe((gx, gy) => {
      el.style.transform = `perspective(800px) rotateX(${gy * -8}deg) rotateY(${gx * 8}deg) translate(${gx * 6}px, ${gy * 4}px)`
    })
  }, [gyro, isPhone])

  const handleMouse = (e: React.MouseEvent) => {
    if (isPhone || !cardRef.current) return
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

  useEffect(() => {
    if (!inView) return
    onReveal(index)
  }, [inView, index, onReveal])

  return (
    <motion.div
      ref={ref}
      className="timeline-entry"
      style={{ '--process-accent': exp.accent } as React.CSSProperties}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
    >
      <motion.div className="timeline-entry__meta" variants={metaVariants} custom={index}>
        <div className="timeline-entry__meta-top">
          <span className="timeline-entry__track">{exp.track}</span>
          {exp.status && <span className="timeline-entry__status">{exp.status}</span>}
        </div>
        {exp.period && <div className="timeline-entry__date">{exp.period}</div>}
        {exp.location && <div className="timeline-entry__location">{exp.location}</div>}
      </motion.div>

      <div className="timeline-entry__marker" aria-hidden="true">
        <motion.span className="timeline-entry__branch" variants={branchVariants} custom={index} />
        <motion.span
          ref={node => registerMarker(exp.id, node)}
          className="timeline-entry__dot"
          variants={markerVariants}
          custom={index}
        />
      </div>

      <motion.div className="card-3d-wrap timeline-entry__card" variants={cardVariants} custom={index}>
        <div
          ref={cardRef}
          className="card-3d-tilt"
          onMouseMove={handleMouse}
          onMouseLeave={handleMouseLeave}
        >
          <article className="process-card" data-cursor>
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
            <div className={`process-card__body ${exp.panelMode === 'details' ? 'process-card__body--details' : ''}`}>
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

              {/* Sidebar panel */}
              <div className={`process-card__metrics ${exp.panelMode === 'details' ? 'process-card__metrics--details' : ''}`}>
                <div className="process-card__metrics-header">
                  <span className="process-card__metrics-label">{exp.panelLabel}</span>
                  <span className="process-card__metrics-status">● {exp.panelStatus}</span>
                </div>
                {exp.details.map((m, i) => (
                  <div key={i} className="process-card__metric">
                    <div className="process-card__metric-info">
                      <span className="process-card__metric-label">{m.label}</span>
                      <span className="process-card__metric-value">{m.value}</span>
                    </div>
                    {exp.panelMode === 'metrics' && m.bar !== undefined && (
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
          </article>
        </div>
      </motion.div>
    </motion.div>
  )
})

export default function Journey() {
  const headerRef = useRef(null)
  const headerInView = useInView(headerRef, { once: true, margin: '-50px' })
  const railRef = useRef<HTMLDivElement>(null)
  const markerRefs = useRef<Record<string, HTMLSpanElement | null>>({})
  const [revealedIndex, setRevealedIndex] = useState(-1)
  const [railHeightPx, setRailHeightPx] = useState(0)
  const [progressHeightPx, setProgressHeightPx] = useState(0)
  const [progressGradient, setProgressGradient] = useState(
    'linear-gradient(180deg, rgba(143, 252, 255, 0.92), rgba(0, 255, 255, 0.32))'
  )

  const registerMarker = useCallback((id: string, marker: HTMLSpanElement | null) => {
    markerRefs.current[id] = marker
  }, [])

  const handleReveal = useCallback((index: number) => {
    setRevealedIndex(current => Math.max(current, index))
  }, [])

  const updateRailVisuals = useCallback(() => {
    if (!railRef.current) return

    const railRect = railRef.current.getBoundingClientRect()
    const railHeight = railRect.height

    if (railHeight <= 0) return

    setRailHeightPx(railHeight)

    const points = orderedExperiences
      .map(exp => {
        const marker = markerRefs.current[exp.id]
        if (!marker) return null

        const markerRect = marker.getBoundingClientRect()
        return {
          accent: exp.accent,
          center: Math.max(0, Math.min(railHeight, markerRect.top - railRect.top + markerRect.height / 2)),
        }
      })
      .filter((point): point is RailPoint => Boolean(point))

    if (!points.length) return

    setProgressGradient(buildProgressGradient(points, railHeight))

    if (revealedIndex < 0) {
      setProgressHeightPx(0)
      return
    }

    const clampedIndex = Math.min(revealedIndex, points.length - 1)
    const target = clampedIndex === points.length - 1
      ? railHeight
      : Math.max(points[clampedIndex].center, 8)

    setProgressHeightPx(Math.max(0, Math.min(railHeight, target)))
  }, [revealedIndex])

  useEffect(() => {
    const frame = requestAnimationFrame(updateRailVisuals)
    const onResize = () => updateRailVisuals()

    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
    }
  }, [updateRailVisuals])

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
        <h2>From Research Labs to Shipped Products</h2>
      </motion.header>

      <div className="process-grid">
        <div ref={railRef} className="process-grid__rail">
          <motion.div
            className="process-grid__progress-viewport"
            initial={false}
            animate={{ height: progressHeightPx, opacity: progressHeightPx > 0 ? 1 : 0 }}
            transition={{ duration: 0.8, ease: revealEase }}
          >
            <div
              className="process-grid__progress"
              style={{
                background: progressGradient,
                height: railHeightPx > 0 ? `${railHeightPx}px` : '100%',
              }}
            />
          </motion.div>
        </div>
        {orderedExperiences.map((exp, i) => (
          <ProcessCard
            key={exp.id}
            exp={exp}
            index={i}
            onReveal={handleReveal}
            registerMarker={registerMarker}
          />
        ))}
      </div>
    </>
  )
}
