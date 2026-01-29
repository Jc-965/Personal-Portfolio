import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Code, Layers, BarChart3, TerminalSquare, Network } from 'lucide-react'

interface SkillGroup {
  id: string
  name: string
  icon: React.ReactNode
  accent: string
  items: string[]
}

const groups: SkillGroup[] = [
  {
    id: 'languages',
    name: 'Languages',
    icon: <Code size={16} />,
    accent: '#00ffff',
    items: ['Python', 'TypeScript', 'JavaScript', 'C++', 'Dart', 'Java', 'C', 'SQL'],
  },
  {
    id: 'frameworks',
    name: 'Frameworks',
    icon: <Layers size={16} />,
    accent: '#00ff41',
    items: ['React', 'Flutter', 'Firebase', 'Framer Motion', 'Tailwind CSS', 'Unreal Engine 5', 'Android SDK'],
  },
  {
    id: 'data',
    name: 'Data & ML',
    icon: <BarChart3 size={16} />,
    accent: '#ff00ff',
    items: ['NumPy', 'Pandas', 'scikit-learn', 'Data Pipelines', 'Signal Processing'],
  },
  {
    id: 'systems',
    name: 'Systems & Tools',
    icon: <TerminalSquare size={16} />,
    accent: '#ffcc00',
    items: ['Git', 'Unix Shell', 'VS Code', 'GitHub Actions', 'Docker', 'Figma'],
  },
  {
    id: 'concepts',
    name: 'Concepts',
    icon: <Network size={16} />,
    accent: '#ff3366',
    items: ['Full-stack Dev', 'System Design', 'HCI Research', 'Technical Writing'],
  },
]

function SkillCard({ group, index }: { group: SkillGroup; index: number }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })

  return (
    <motion.div
      ref={ref}
      className="skill-card"
      style={{ '--skill-accent': group.accent } as React.CSSProperties}
      initial={{ opacity: 0, y: 25 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, delay: index * 0.1 }}
    >
      {/* Terminal header */}
      <div className="skill-card__terminal-bar">
        <span className="skill-card__dot" />
        <span className="skill-card__dot" />
        <span className="skill-card__dot" />
        <span className="skill-card__terminal-title">{group.id}.config</span>
      </div>

      {/* Header */}
      <div className="skill-card__header">
        <div className="skill-card__icon">{group.icon}</div>
        <h3 className="skill-card__title">{group.name}</h3>
        <span className="skill-card__count">{group.items.length}</span>
      </div>

      {/* Skills as tags */}
      <div className="skill-card__tags">
        {group.items.map((item, i) => (
          <motion.span
            key={item}
            className="skill-card__tag"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.2, delay: index * 0.1 + i * 0.03 }}
          >
            {item}
          </motion.span>
        ))}
      </div>

      {/* Status line */}
      <div className="skill-card__status">
        <span className="skill-card__status-dot" />
        <span>Active</span>
      </div>
    </motion.div>
  )
}

export default function Toolkit() {
  const headerRef = useRef(null)
  const headerInView = useInView(headerRef, { once: true, margin: '-50px' })

  return (
    <section className="section toolkit" id="skills">
      <motion.header
        ref={headerRef}
        className="section__header"
        initial={{ opacity: 0, y: 30 }}
        animate={headerInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.4 }}
      >
        <p className="section__eyebrow">
          <span className="section__eyebrow-icon">&#9670;</span>
          Toolkit
        </p>
        <h2>Technologies and tools I work with.</h2>
      </motion.header>

      <div className="skill-grid">
        {groups.map((g, i) => (
          <SkillCard key={g.id} group={g} index={i} />
        ))}
      </div>
    </section>
  )
}
