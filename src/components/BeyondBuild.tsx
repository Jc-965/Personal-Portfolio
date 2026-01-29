import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Smartphone, Clock, Music } from 'lucide-react'

interface MosaicItem {
  id: string
  icon: React.ReactNode
  title: string
  subtitle: string
  bullets: string[]
  stats: { label: string; value: string }[]
  accent: string
}

const items: MosaicItem[] = [
  {
    id: 'arcadia',
    icon: <Smartphone size={18} />,
    title: 'Arcadia App Development',
    subtitle: 'Developer & Treasurer',
    bullets: [
      'Helped develop a digital student ID system that improved event check-ins for thousands of students.',
      'Worked closely with administrators to design features based on real student and faculty needs.',
      'Managed finances and outreach efforts, expanding the club\'s reach and project capacity.',
    ],
    stats: [
      { label: 'USERS', value: '2K+' },
      { label: 'EVENTS', value: '50+' },
    ],
    accent: '#3a9b95',
  },
  {
    id: 'eagle',
    icon: <Clock size={18} />,
    title: 'Eagle Scout',
    subtitle: 'Boy Scouts of America',
    bullets: [
      'Led the planning and construction of wooden signage and a large outdoor banner for a local elementary school.',
      'Organized volunteers and coordinated logistics to ensure safety, accuracy, and meaningful results.',
      'Mentored younger Scouts on leadership, communication, and responsibility through hands-on activities.',
    ],
    stats: [
      { label: 'HOURS', value: '200+' },
      { label: 'VOLUNTEERS', value: '15' },
    ],
    accent: '#b38e5d',
  },
  {
    id: 'clarinet',
    icon: <Music size={18} />,
    title: 'Clarinet Section Leader',
    subtitle: 'Soloist & Performer',
    bullets: [
      'Dedicated over 200 hours each year to rehearsals, performances, and coordinating with directors and peers.',
      'Led sectionals, coached younger clarinetists, and organized music for both marching and concert seasons.',
      'Performed nationally and abroad with the Pasadena Symphony and Pops, developing focus and composure under pressure.',
    ],
    stats: [
      { label: 'YEARS', value: '6' },
      { label: 'ANNUAL HRS', value: '200+' },
    ],
    accent: '#9c7fae',
  },
]

function MosaicCard({ item, index }: { item: MosaicItem; index: number }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })

  return (
    <motion.article
      ref={ref}
      className="mosaic-card"
      style={{ '--mosaic-accent': item.accent } as React.CSSProperties}
      initial={{ opacity: 0, y: 25 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.3, delay: index * 0.08 }}
    >
      {/* Grid pattern overlay */}
      <div className="mosaic-card__pattern" />

      {/* Header with badge */}
      <div className="mosaic-card__header">
        <div className="mosaic-card__badge">{item.icon}</div>
        <div className="mosaic-card__titles">
          <h3>{item.title}</h3>
          <span className="mosaic-card__subtitle">{item.subtitle}</span>
        </div>
      </div>

      {/* Stats display */}
      <div className="mosaic-card__stats">
        {item.stats.map((stat, i) => (
          <div key={i} className="mosaic-card__stat">
            <span className="mosaic-card__stat-value">{stat.value}</span>
            <span className="mosaic-card__stat-label">{stat.label}</span>
          </div>
        ))}
        <div className="mosaic-card__stat-indicator">
          <motion.span
            className="mosaic-card__pulse"
            animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>
      </div>

      {/* Content list */}
      <ul className="mosaic-card__list">
        {item.bullets.map((b, j) => (
          <motion.li
            key={j}
            initial={{ opacity: 0, x: -10 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.3, delay: 0.2 + j * 0.1 }}
          >
            <span className="mosaic-card__bullet">›</span>
            {b}
          </motion.li>
        ))}
      </ul>

      {/* Corner brackets */}
      <span className="mosaic-card__corner mosaic-card__corner--tl" />
      <span className="mosaic-card__corner mosaic-card__corner--tr" />
      <span className="mosaic-card__corner mosaic-card__corner--bl" />
      <span className="mosaic-card__corner mosaic-card__corner--br" />
    </motion.article>
  )
}

export default function BeyondBuild() {
  const headerRef = useRef(null)
  const headerInView = useInView(headerRef, { once: true, margin: '-50px' })

  return (
    <section className="section beyond" id="life">
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
        <h2>Leadership, collaboration, and community impact.</h2>
      </motion.header>

      <div className="mosaic-grid">
        {items.map((item, i) => (
          <MosaicCard key={item.id} item={item} index={i} />
        ))}
      </div>
    </section>
  )
}
