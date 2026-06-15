import { useRef, memo } from 'react'
import { motion, useInView } from 'framer-motion'
import { Smartphone, Compass, Music } from 'lucide-react'
import useCardTilt from '../hooks/useCardTilt'

interface LifeStat {
  label: string
  value: string
}

interface LifeItem {
  id: string
  icon: React.ReactNode
  title: string
  subtitle: string
  accent: string
  accentRgb: string
  stats: LifeStat[]
  bullets: string[]
}

const items: LifeItem[] = [
  {
    id: 'arcadia',
    icon: <Smartphone size={18} />,
    title: 'Arcadia App Development',
    subtitle: 'Developer & Treasurer',
    accent: '#3aa39b',
    accentRgb: '58, 163, 155',
    stats: [
      { label: 'STUDENTS', value: '2K+' },
      { label: 'EVENTS', value: '50+' },
    ],
    bullets: [
      'Helped build a digital student-ID system that streamlined check-ins for thousands of students.',
      'Designed features alongside administrators around real student and faculty needs.',
      "Managed finances and outreach, expanding the club's reach and project capacity.",
    ],
  },
  {
    id: 'eagle',
    icon: <Compass size={18} />,
    title: 'Eagle Scout',
    subtitle: 'Boy Scouts of America',
    accent: '#b38e5d',
    accentRgb: '179, 142, 93',
    stats: [
      { label: 'SERVICE HRS', value: '200+' },
      { label: 'VOLUNTEERS', value: '15' },
    ],
    bullets: [
      'Led the planning and construction of wooden signage and a large outdoor banner for a local elementary school.',
      'Organized volunteers and coordinated logistics for safety, accuracy, and meaningful results.',
      'Mentored younger Scouts on leadership, communication, and responsibility.',
    ],
  },
  {
    id: 'clarinet',
    icon: <Music size={18} />,
    title: 'Clarinet Section Leader',
    subtitle: 'Soloist & Performer',
    accent: '#9c7fae',
    accentRgb: '156, 127, 174',
    stats: [
      { label: 'YEARS', value: '4' },
      { label: 'ANNUAL HRS', value: '200+' },
    ],
    bullets: [
      'Dedicated 200+ hours each year to rehearsals, performances, and coordinating with directors and peers.',
      'Led sectionals, coached younger clarinetists, and organized music for marching and concert seasons.',
      'Performed nationally and abroad with the Pasadena Symphony and Pops.',
    ],
  },
]

const poses = [
  { rot: -1.6, dy: 0 },
  { rot: 1.1, dy: 46 },
  { rot: -0.6, dy: 18 },
]

const LifeCard = memo(function LifeCard({ item, index }: { item: LifeItem; index: number }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const { ref: tiltRef, tiltProps } = useCardTilt({ max: 7, perspective: 1100 })
  const pose = poses[index % poses.length]

  return (
    <motion.div
      ref={ref}
      className="life-card-wrap"
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="life-card-pose"
        style={{ '--pose-rot': `${pose.rot}deg`, '--pose-dy': `${pose.dy}px` } as React.CSSProperties}
      >
        <article
          ref={tiltRef}
          {...tiltProps}
          className="life-card"
          data-cursor
          style={{
            '--life-accent': item.accent,
            '--life-accent-rgb': item.accentRgb,
          } as React.CSSProperties}
        >
          <span className="life-card__index" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="life-card__corner life-card__corner--tl" aria-hidden="true" />
          <span className="life-card__corner life-card__corner--tr" aria-hidden="true" />
          <span className="life-card__corner life-card__corner--bl" aria-hidden="true" />
          <span className="life-card__corner life-card__corner--br" aria-hidden="true" />

          <div className="life-card__head">
            <span className="life-card__badge">{item.icon}</span>
            <div>
              <h3 className="life-card__title">{item.title}</h3>
              <span className="life-card__subtitle">{item.subtitle}</span>
            </div>
          </div>

          <div className="life-card__stats">
            {item.stats.map((s) => (
              <div key={s.label} className="life-card__stat">
                <span className="life-card__stat-value">{s.value}</span>
                <span className="life-card__stat-label">{s.label}</span>
              </div>
            ))}
          </div>

          <ul className="life-card__list">
            {item.bullets.map((b, i) => (
              <li key={i}>
                <span className="life-card__bullet">›</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </motion.div>
  )
})

export default function BeyondBuild() {
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
          Beyond the build
        </p>
        <h2>Leadership, craft, and community beyond the code</h2>
        <p className="section__intro">
          The work that shaped how I lead, teach, and show up, from launching a
          student app to mentoring scouts and performing on a national stage.
        </p>
      </motion.header>

      <div className="life-scatter">
        <div className="life-scatter__bg" aria-hidden="true">
          <span className="life-scatter__glow life-scatter__glow--1" />
          <span className="life-scatter__glow life-scatter__glow--2" />
        </div>
        <div className="life-scatter__cards">
          {items.map((item, i) => (
            <LifeCard key={item.id} item={item} index={i} />
          ))}
        </div>
      </div>
    </>
  )
}
