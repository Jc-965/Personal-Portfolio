import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion, useMotionValue, useScroll, useSpring, useTransform } from 'framer-motion'
import { ArrowLeft, ArrowUpRight, Boxes, Cpu, Github, Layers3, Linkedin, Mail, Orbit, Sparkles } from 'lucide-react'
import EmailPopup from '../EmailPopup'

interface SketchPortfolioOverlayProps {
  onClose: () => void
}

const sectionLinks = [
  { id: 'signal-hero', label: 'intro' },
  { id: 'signal-builds', label: 'builds' },
  { id: 'signal-path', label: 'path' },
  { id: 'signal-lab', label: 'lab' },
  { id: 'signal-contact', label: 'contact' },
]

const pulseCards = [
  {
    label: 'mobile systems',
    title: 'products that have to earn trust fast',
    note: 'Health, onboarding, and account surfaces where friction becomes product debt immediately.',
    accent: '#84f0d6',
  },
  {
    label: 'spatial data',
    title: 'messy information turned into clean movement',
    note: 'Pipelines, geospatial models, and structure that make interfaces feel precise instead of noisy.',
    accent: '#ffb36b',
  },
  {
    label: 'interactive web',
    title: 'motion used as architecture, not garnish',
    note: 'Interfaces that feel cinematic without dropping the engineering bar.',
    accent: '#ff7c66',
  },
  {
    label: 'build instinct',
    title: 'make it vivid, then make it durable',
    note: 'The best work here lands style and reliability in the same pass.',
    accent: '#f7f38a',
  },
]

const heroStats = [
  { value: '04', label: 'featured builds', note: 'health, social, civic, and narrative systems' },
  { value: '06', label: 'major roles', note: 'from research pipelines to production-facing products' },
  { value: '01', label: 'core bias', note: 'real users before ornamental complexity' },
]

const featuredBuilds = [
  {
    name: 'Levio',
    year: '2025',
    band: 'care systems',
    summary: "A Parkinson's support product combining tracking, medication routines, recovery media, and community touchpoints in one mobile flow.",
    outcome: 'offline-aware care flows with release discipline',
    stack: ['Flutter', 'Firebase', 'release automation'],
    accent: '#84f0d6',
  },
  {
    name: 'Agoriai',
    year: '2026',
    band: 'anonymous networks',
    summary: 'A candid recruiting network built around safer reveal logic, identity controls, and calmer social risk.',
    outcome: 'trust-focused messaging and graph-driven discovery',
    stack: ['TypeScript', 'auth systems', 'graph modeling'],
    accent: '#7ab6ff',
  },
  {
    name: 'MyCommunity',
    year: '2025',
    band: 'civic discovery',
    summary: 'An Android scouting tool that turns nearby troops, local updates, and map-first discovery into one useful field view.',
    outcome: 'location clarity without visual clutter',
    stack: ['Android', 'maps', 'cloud data'],
    accent: '#ffb36b',
  },
  {
    name: 'Tarocchi',
    year: '2025',
    band: 'interactive narrative',
    summary: 'A branching web narrative built around atmosphere, replay, and ritual pacing rather than static page structure.',
    outcome: 'interaction as storytelling grammar',
    stack: ['React', 'motion', 'choice systems'],
    accent: '#ff7c66',
  },
]

const trailMarks = [
  {
    period: 'Summer 2026',
    role: 'Incoming Mobile Software Engineering Intern',
    place: 'Blue Shield of California',
    signal: 'patient-facing systems',
    note: 'Stepping into mobile healthcare work where reliability, clarity, and production constraints all matter at once.',
  },
  {
    period: 'Dec 2025 - Present',
    role: 'Mobile Software Engineering Intern',
    place: 'Sorcea Labs',
    signal: 'consumer health product',
    note: 'Built onboarding, profile, guided tutorial, and skin-analysis flows in Flutter for a live skincare experience.',
  },
  {
    period: 'Sep 2025 - Present',
    role: 'Data & Software Engineer',
    place: 'CMUMaps',
    signal: 'spatial pipelines',
    note: 'Normalized OpenStreetMap building data into cleaner versioned geometry and label-ready JSON systems.',
  },
  {
    period: 'Jun 2025 - Feb 2026',
    role: 'Instructor',
    place: 'Coding Minds Academy',
    signal: 'teaching systems',
    note: 'Translated algorithms and programming concepts into project-based labs that produced working code, not just theory.',
  },
  {
    period: 'Sep 2025 - Dec 2025',
    role: 'Core Developer',
    place: 'Game Creation Society',
    signal: 'physics gameplay',
    note: 'Implemented tether and grapple mechanics in Unreal Engine 5 with physics-based control and multiplayer constraints.',
  },
  {
    period: 'Jun 2023 - Aug 2024',
    role: 'Research Intern',
    place: 'SoftCom Lab',
    signal: 'reproducible analysis',
    note: "Built Python pipelines for a Parkinson's-focused mobile-health study and contributed to peer-reviewed research output.",
  },
]

const labBands = [
  {
    name: 'interface stack',
    note: 'The surfaces where interaction, product sense, and visual clarity have to land together.',
    tags: ['React', 'Flutter', 'Framer Motion', 'TypeScript', 'design systems', 'interaction design'],
  },
  {
    name: 'data stack',
    note: 'The infrastructure for cases where raw information needs shaping before it becomes product.',
    tags: ['Python', 'NumPy', 'Pandas', 'scikit-learn', 'GeoJSON', 'OpenStreetMap'],
  },
  {
    name: 'systems stack',
    note: 'The layer that keeps the interesting stuff stable once a prototype has to survive real use.',
    tags: ['Git', 'CI/CD', 'Docker', 'Firebase', 'automation', 'release tooling'],
  },
]

const principleSignals = [
  'Make motion carry information, not just energy.',
  'Let structure stay legible even when the visuals get dramatic.',
  'Treat production polish as part of the product, not cleanup after the fun part.',
]

const ambientNodes = [
  { top: '10%', left: '8%', size: 6, driftX: 18, driftY: -12, duration: 10, delay: 0.2 },
  { top: '18%', left: '74%', size: 9, driftX: -20, driftY: 16, duration: 12, delay: 0.6 },
  { top: '29%', left: '55%', size: 5, driftX: 14, driftY: 20, duration: 9, delay: 0.1 },
  { top: '44%', left: '16%', size: 8, driftX: 22, driftY: -8, duration: 13, delay: 1.1 },
  { top: '58%', left: '84%', size: 7, driftX: -18, driftY: 14, duration: 11, delay: 0.4 },
  { top: '70%', left: '34%', size: 10, driftX: 16, driftY: -18, duration: 14, delay: 0.8 },
  { top: '82%', left: '64%', size: 4, driftX: -10, driftY: -12, duration: 8, delay: 1.3 },
  { top: '90%', left: '12%', size: 6, driftX: 12, driftY: 10, duration: 10, delay: 0.7 },
]

const riseIn = {
  hidden: { opacity: 0, y: 28 },
  show: (index = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.08 + index * 0.08,
      duration: 0.72,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  }),
}

export default function SketchPortfolioOverlay({ onClose }: SketchPortfolioOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ width: 1, height: 1 })
  const [isClosing, setIsClosing] = useState(false)
  const [showEmail, setShowEmail] = useState(false)
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const { scrollYProgress } = useScroll({ container: overlayRef })

  const progressScale = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.24 })
  const sceneRotateY = useSpring(useTransform(pointerX, [0, Math.max(viewport.width, 1)], [-10, 10]), {
    stiffness: 90,
    damping: 18,
    mass: 0.6,
  })
  const sceneRotateX = useSpring(useTransform(pointerY, [0, Math.max(viewport.height, 1)], [8, -8]), {
    stiffness: 90,
    damping: 18,
    mass: 0.6,
  })
  const driftX = useSpring(useTransform(pointerX, [0, Math.max(viewport.width, 1)], [-36, 36]), {
    stiffness: 60,
    damping: 16,
    mass: 0.8,
  })
  const driftY = useSpring(useTransform(pointerY, [0, Math.max(viewport.height, 1)], [-30, 30]), {
    stiffness: 60,
    damping: 16,
    mass: 0.8,
  })
  const haloX = useSpring(useTransform(pointerX, value => value - 260), {
    stiffness: 120,
    damping: 18,
    mass: 0.5,
  })
  const haloY = useSpring(useTransform(pointerY, value => value - 260), {
    stiffness: 120,
    damping: 18,
    mass: 0.5,
  })
  const inverseDriftX = useTransform(driftX, value => value * -0.58)
  const inverseDriftY = useTransform(driftY, value => value * -0.44)
  const heroLift = useTransform(scrollYProgress, [0, 0.18], [0, -90])
  const heroFade = useTransform(scrollYProgress, [0, 0.22], [1, 0.55])
  const ringRotation = useTransform(scrollYProgress, [0, 1], [0, 120])
  const gridShift = useTransform(scrollYProgress, [0, 1], [0, 220])

  useLayoutEffect(() => {
    const cursorCanvas = document.querySelector('.cursor-canvas') as HTMLElement | null
    const targetCursor = document.querySelector('.target-cursor') as HTMLElement | null
    const vintageOverlay = document.querySelector('.vintage-overlay') as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    const previousCursorCanvasDisplay = cursorCanvas?.style.display ?? ''
    const previousTargetCursorDisplay = targetCursor?.style.display ?? ''
    const previousOverlayOpacity = vintageOverlay?.style.opacity ?? ''

    document.body.style.overflow = 'hidden'
    cursorCanvas?.style.setProperty('display', 'none', 'important')
    targetCursor?.style.setProperty('display', 'none', 'important')
    vintageOverlay?.style.setProperty('opacity', '0', 'important')

    return () => {
      document.body.style.overflow = previousOverflow
      if (cursorCanvas) {
        if (previousCursorCanvasDisplay) {
          cursorCanvas.style.setProperty('display', previousCursorCanvasDisplay)
        } else {
          cursorCanvas.style.removeProperty('display')
        }
      }
      if (targetCursor) {
        if (previousTargetCursorDisplay) {
          targetCursor.style.setProperty('display', previousTargetCursorDisplay)
        } else {
          targetCursor.style.removeProperty('display')
        }
      }
      if (vintageOverlay) {
        if (previousOverlayOpacity) {
          vintageOverlay.style.setProperty('opacity', previousOverlayOpacity)
        } else {
          vintageOverlay.style.removeProperty('opacity')
        }
      }
    }
  }, [])

  useEffect(() => {
    const syncViewport = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      })
      pointerX.set(window.innerWidth * 0.5)
      pointerY.set(window.innerHeight * 0.42)
    }

    syncViewport()
    window.addEventListener('resize', syncViewport)
    return () => window.removeEventListener('resize', syncViewport)
  }, [pointerX, pointerY])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showEmail) {
          setShowEmail(false)
          return
        }
        setIsClosing(true)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showEmail])

  useEffect(() => {
    if (!isClosing) return
    const closeTimer = window.setTimeout(onClose, 680)
    return () => window.clearTimeout(closeTimer)
  }, [isClosing, onClose])

  const handlePointerMove = (event: React.MouseEvent<HTMLDivElement>) => {
    pointerX.set(event.clientX)
    pointerY.set(event.clientY)
  }

  const scrollToSection = (id: string) => {
    if (isClosing) return
    overlayRef.current?.querySelector<HTMLElement>(`#${id}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  const externalLinks = [
    { label: 'GitHub', href: 'https://github.com/Jc-965', icon: Github },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/jessechen2/', icon: Linkedin },
  ]

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      <motion.div
        ref={overlayRef}
        className="signal-vault"
        role="dialog"
        aria-modal="true"
        aria-label="Secret signal page"
        initial={{ opacity: 0, scale: 0.985, filter: 'blur(12px)' }}
        animate={isClosing
          ? { opacity: 0, scale: 0.985, filter: 'blur(14px)' }
          : { opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: isClosing ? 0.5 : 0.75, ease: [0.22, 1, 0.36, 1] }}
        onMouseMove={handlePointerMove}
      >
        <div className="signal-vault__backdrop" aria-hidden="true" />
        <motion.div className="signal-vault__spotlight" aria-hidden="true" style={{ x: haloX, y: haloY }} />
        <motion.div
          className="signal-vault__aurora signal-vault__aurora--one"
          aria-hidden="true"
          style={{ x: driftX, y: driftY }}
          animate={{ scale: [1, 1.12, 0.98, 1], rotate: [0, 24, -18, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="signal-vault__aurora signal-vault__aurora--two"
          aria-hidden="true"
          style={{ x: inverseDriftX, y: inverseDriftY }}
          animate={{ scale: [1.05, 0.95, 1.08, 1.05], rotate: [0, -30, 22, 0] }}
          transition={{ duration: 21, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="signal-vault__aurora signal-vault__aurora--three"
          aria-hidden="true"
          animate={{ scale: [0.95, 1.06, 1], rotate: [0, 14, -12, 0] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div className="signal-vault__grid" aria-hidden="true" style={{ y: gridShift }} />
        <div className="signal-vault__grain" aria-hidden="true" />

        <div className="signal-vault__stars" aria-hidden="true">
          {ambientNodes.map((node, index) => (
            <motion.span
              key={`${node.left}-${node.top}`}
              className="signal-vault__star"
              style={{
                top: node.top,
                left: node.left,
                width: node.size,
                height: node.size,
              }}
              animate={{
                opacity: [0.22, 1, 0.34],
                scale: [1, 1.7, 1],
                x: [0, node.driftX, 0],
                y: [0, node.driftY, 0],
              }}
              transition={{
                duration: node.duration,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: node.delay + index * 0.04,
              }}
            />
          ))}
        </div>

        <header className="signal-vault__masthead">
          <div className="signal-vault__brand">
            <span className="signal-vault__brand-kicker">after hours / signal room</span>
            <strong className="signal-vault__brand-name">Jesse Chen</strong>
          </div>

          <nav className="signal-vault__nav" aria-label="Secret page sections">
            {sectionLinks.map(link => (
              <button
                key={link.id}
                type="button"
                className="signal-vault__nav-button"
                onClick={() => scrollToSection(link.id)}
              >
                {link.label}
              </button>
            ))}
          </nav>

          <div className="signal-vault__masthead-actions">
            <button
              type="button"
              className="signal-vault__button signal-vault__button--ghost"
              onClick={() => setShowEmail(true)}
            >
              <Mail size={15} strokeWidth={2} />
              <span>email</span>
            </button>
            <button
              type="button"
              className="signal-vault__button signal-vault__button--ghost"
              onClick={() => setIsClosing(true)}
            >
              <ArrowLeft size={15} strokeWidth={2} />
              <span>back to sketchbook</span>
            </button>
          </div>

          <motion.span className="signal-vault__progress" aria-hidden="true" style={{ scaleX: progressScale }} />
        </header>

        <main className="signal-vault__content">
          <section className="signal-vault__hero" id="signal-hero">
            <motion.div
              className="signal-vault__hero-copy"
              style={{ y: heroLift, opacity: heroFade }}
              initial="hidden"
              animate="show"
            >
              <motion.span className="signal-vault__eyebrow" variants={riseIn} custom={0}>
                secret release / built as its own world
              </motion.span>
              <motion.h1 className="signal-vault__title" variants={riseIn} custom={1}>
                A motion-heavy page for the work that deserves more depth.
              </motion.h1>
              <motion.p className="signal-vault__lede" variants={riseIn} custom={2}>
                I build across mobile products, spatial pipelines, and interactive web systems. This page stages that work
                like a live chamber of signals, layers, and moving surfaces instead of a static stack of cards.
              </motion.p>

              <motion.div className="signal-vault__hero-actions" variants={riseIn} custom={3}>
                <button
                  type="button"
                  className="signal-vault__button signal-vault__button--primary"
                  onClick={() => scrollToSection('signal-builds')}
                >
                  <Sparkles size={16} strokeWidth={2.2} />
                  <span>open builds</span>
                </button>
                <button
                  type="button"
                  className="signal-vault__button signal-vault__button--ghost"
                  onClick={() => scrollToSection('signal-path')}
                >
                  <Orbit size={16} strokeWidth={2.2} />
                  <span>trace the path</span>
                </button>
              </motion.div>

              <motion.div className="signal-vault__stat-row" variants={riseIn} custom={4}>
                {heroStats.map(stat => (
                  <article key={stat.label} className="signal-vault__stat-card">
                    <span className="signal-vault__stat-value">{stat.value}</span>
                    <div>
                      <strong className="signal-vault__stat-label">{stat.label}</strong>
                      <p className="signal-vault__stat-note">{stat.note}</p>
                    </div>
                  </article>
                ))}
              </motion.div>
            </motion.div>

            <motion.div
              className="signal-vault__hero-scene"
              style={{ rotateX: sceneRotateX, rotateY: sceneRotateY }}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.div
                className="signal-vault__scene-ring signal-vault__scene-ring--outer"
                aria-hidden="true"
                style={{ rotate: ringRotation }}
              />
              <motion.div
                className="signal-vault__scene-ring signal-vault__scene-ring--mid"
                aria-hidden="true"
                animate={{ rotate: [0, -360] }}
                transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
              />
              <motion.div
                className="signal-vault__scene-ring signal-vault__scene-ring--inner"
                aria-hidden="true"
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
              />

              <motion.div
                className="signal-vault__scene-core"
                animate={{ y: [0, -14, 0], rotateZ: [0, 1.4, 0, -1.4, 0] }}
                transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
              >
                <span className="signal-vault__scene-kicker">signal focus</span>
                <strong className="signal-vault__scene-title">Systems with atmosphere.</strong>
                <p className="signal-vault__scene-note">
                  Product-minded engineering shaped for motion, clarity, and real-world use.
                </p>
              </motion.div>

              {pulseCards.map((card, index) => (
                <motion.article
                  key={card.label}
                  className={`signal-vault__pulse-card signal-vault__pulse-card--${index + 1}`}
                  style={{ '--pulse-accent': card.accent } as CSSProperties}
                  animate={{
                    y: [0, -12 - index * 2, 0],
                    rotate: [index % 2 === 0 ? -4 : 4, index % 2 === 0 ? -1 : 1, index % 2 === 0 ? -4 : 4],
                  }}
                  transition={{
                    duration: 7 + index * 1.4,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: index * 0.25,
                  }}
                >
                  <span className="signal-vault__pulse-label">{card.label}</span>
                  <strong className="signal-vault__pulse-title">{card.title}</strong>
                  <p className="signal-vault__pulse-note">{card.note}</p>
                </motion.article>
              ))}
            </motion.div>
          </section>

          <section className="signal-vault__section" id="signal-builds">
            <motion.div
              className="signal-vault__section-head"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="signal-vault__section-tag">build matrix</span>
              <h2 className="signal-vault__section-title">Featured systems, staged like active channels.</h2>
              <p className="signal-vault__section-copy">
                Each card here is treated like a live frequency: what it was for, what made it hard, and what it had to
                become to feel convincing.
              </p>
            </motion.div>

            <div className="signal-vault__build-grid">
              {featuredBuilds.map((build, index) => (
                <motion.article
                  key={build.name}
                  className="signal-vault__build-card"
                  style={{ '--build-accent': build.accent } as CSSProperties}
                  initial={{ opacity: 0, y: 42 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.22 }}
                  transition={{ duration: 0.7, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{ y: -10, rotateX: 4, rotateY: index % 2 === 0 ? -4 : 4 }}
                >
                  <div className="signal-vault__build-topline">
                    <span>{build.band}</span>
                    <strong>{build.year}</strong>
                  </div>
                  <h3 className="signal-vault__build-title">{build.name}</h3>
                  <p className="signal-vault__build-summary">{build.summary}</p>
                  <div className="signal-vault__build-meta">
                    <span className="signal-vault__build-outcome">{build.outcome}</span>
                    <div className="signal-vault__tag-row">
                      {build.stack.map(item => (
                        <span key={item} className="signal-vault__tag">{item}</span>
                      ))}
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>
          </section>

          <section className="signal-vault__section signal-vault__section--path" id="signal-path">
            <motion.div
              className="signal-vault__section-head"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="signal-vault__section-tag">path trace</span>
              <h2 className="signal-vault__section-title">Roles plotted as one continuous acceleration curve.</h2>
              <p className="signal-vault__section-copy">
                The line moves through research, teaching, product engineering, spatial systems, and game mechanics, but
                the through-line stays the same: build things people can actually feel.
              </p>
            </motion.div>

            <div className="signal-vault__trail">
              <div className="signal-vault__trail-line" aria-hidden="true" />
              {trailMarks.map((mark, index) => (
                <motion.article
                  key={`${mark.place}-${mark.period}`}
                  className="signal-vault__trail-card"
                  initial={{ opacity: 0, x: index % 2 === 0 ? -36 : 36, y: 28 }}
                  whileInView={{ opacity: 1, x: 0, y: 0 }}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{ duration: 0.7, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span className="signal-vault__trail-period">{mark.period}</span>
                  <strong className="signal-vault__trail-role">{mark.role}</strong>
                  <span className="signal-vault__trail-place">{mark.place}</span>
                  <span className="signal-vault__trail-signal">{mark.signal}</span>
                  <p className="signal-vault__trail-note">{mark.note}</p>
                </motion.article>
              ))}
            </div>
          </section>

          <section className="signal-vault__section signal-vault__section--lab" id="signal-lab">
            <motion.div
              className="signal-vault__section-head"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="signal-vault__section-tag">lab stack</span>
              <h2 className="signal-vault__section-title">The capability map behind the visuals.</h2>
              <p className="signal-vault__section-copy">
                This is the part that keeps the page honest. Dramatic surfaces only work if the underlying systems,
                tooling, and interface judgment are strong enough to support them.
              </p>
            </motion.div>

            <div className="signal-vault__lab-grid">
              {labBands.map((band, index) => (
                <motion.article
                  key={band.name}
                  className="signal-vault__lab-card"
                  initial={{ opacity: 0, y: 28 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.22 }}
                  transition={{ duration: 0.7, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="signal-vault__lab-card-head">
                    {index === 0 && <Layers3 size={18} strokeWidth={2.1} />}
                    {index === 1 && <Boxes size={18} strokeWidth={2.1} />}
                    {index === 2 && <Cpu size={18} strokeWidth={2.1} />}
                    <strong>{band.name}</strong>
                  </div>
                  <p className="signal-vault__lab-note">{band.note}</p>
                  <div className="signal-vault__tag-row">
                    {band.tags.map(tag => (
                      <span key={tag} className="signal-vault__tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </motion.article>
              ))}

              <motion.article
                className="signal-vault__principles-card"
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.22 }}
                transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
              >
                <span className="signal-vault__principles-tag">operating principles</span>
                <ul className="signal-vault__principles-list">
                  {principleSignals.map(signal => (
                    <li key={signal}>{signal}</li>
                  ))}
                </ul>
              </motion.article>
            </div>
          </section>

          <section className="signal-vault__section signal-vault__section--contact" id="signal-contact">
            <motion.div
              className="signal-vault__dispatch"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="signal-vault__dispatch-copy">
                <span className="signal-vault__section-tag">dispatch</span>
                <h2 className="signal-vault__section-title">Keep the line open.</h2>
                <p className="signal-vault__section-copy">
                  If the page worked, it should already be obvious what I care about: systems with intent, motion with
                  purpose, and software that feels alive without losing control.
                </p>
              </div>

              <div className="signal-vault__dispatch-actions">
                {externalLinks.map(link => {
                  const Icon = link.icon
                  return (
                    <a
                      key={link.label}
                      className="signal-vault__button signal-vault__button--primary"
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Icon size={16} strokeWidth={2} />
                      <span>{link.label}</span>
                      <ArrowUpRight size={14} strokeWidth={2} />
                    </a>
                  )
                })}
                <button
                  type="button"
                  className="signal-vault__button signal-vault__button--ghost"
                  onClick={() => setShowEmail(true)}
                >
                  <Mail size={16} strokeWidth={2} />
                  <span>email</span>
                </button>
                <button
                  type="button"
                  className="signal-vault__button signal-vault__button--ghost"
                  onClick={() => scrollToSection('signal-hero')}
                >
                  <Orbit size={16} strokeWidth={2} />
                  <span>back to top</span>
                </button>
              </div>
            </motion.div>
          </section>
        </main>
      </motion.div>

      <AnimatePresence>
        {showEmail && <EmailPopup onClose={() => setShowEmail(false)} />}
      </AnimatePresence>
    </>,
    document.body,
  )
}
