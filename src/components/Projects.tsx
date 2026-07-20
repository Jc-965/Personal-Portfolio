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
import portfolio from '../content/portfolio.json'

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
  frame?: 'window' | 'phone'
  terminal?: string[]
}

// Interleaved media / code so the rhythm alternates as you scroll. The same
// source also generates the static case-study pages and sitemap.
const projects = portfolio.projects as unknown as Project[]

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
              frame={project.frame}
              side={side}
              priority={index === 0}
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
