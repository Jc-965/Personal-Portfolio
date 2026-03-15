import { useRef, useEffect } from 'react'
import { motion, useInView } from 'framer-motion'
import { Code, Layers, BarChart3, TerminalSquare, Network } from 'lucide-react'
import CardSwap, { Card } from './CardSwap'
import useIsPhone from '../hooks/useIsPhone'
import { useGyroscope } from '../context/GyroscopeContext'

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
    items: ['Python', 'TypeScript', 'JavaScript', 'C++', 'Dart', 'Java', 'C', 'SQL', 'Assembly'],
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
    items: ['NumPy', 'Pandas', 'scikit-learn', 'Data Pipelines', 'Signal Processing', 'GeoJSON', 'ArcGIS', 'OpenStreetMap'],
  },
  {
    id: 'systems',
    name: 'Systems & Tools',
    icon: <TerminalSquare size={16} />,
    accent: '#ffcc00',
    items: ['Git', 'Unix Shell', 'SSH', 'VS Code', 'GitHub Actions', 'CI/CD', 'Docker', 'Figma'],
  },
  {
    id: 'concepts',
    name: 'Concepts',
    icon: <Network size={16} />,
    accent: '#ff3366',
    items: ['Full-stack Dev', 'System Design', 'Agile Development', 'Technical Writing'],
  },
]

export default function Toolkit() {
  const headerRef = useRef(null)
  const swapRef = useRef<HTMLDivElement>(null)
  const headerInView = useInView(headerRef, { once: true, margin: '-50px' })
  const swapInView = useInView(swapRef, { margin: '-80px 0px' })
  const isPhone = useIsPhone()
  const gyro = useGyroscope()

  // Gyroscope tilt on the entire card stack on mobile
  useEffect(() => {
    const el = swapRef.current
    if (!el || !isPhone || !gyro.permitted) return

    return gyro.subscribe((gx, gy) => {
      el.style.transform = `perspective(800px) rotateX(${gy * -5}deg) rotateY(${gx * 5}deg)`
    })
  }, [isPhone, gyro])

  return (
    <>
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
        <h2>Technologies and tools I work with</h2>
      </motion.header>

      <motion.div
        ref={swapRef}
        className="toolkit__swap-shell"
        initial={{ opacity: 0, y: 24 }}
        animate={headerInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.45, delay: 0.08 }}
      >
        {swapInView ? (
          <CardSwap
            width={isPhone ? 290 : '100%'}
            height={isPhone ? 240 : 300}
            cardDistance={isPhone ? 22 : 50}
            verticalDistance={isPhone ? 14 : 32}
            delay={3000}
            pauseOnHover={!isPhone}
            skewAmount={isPhone ? 2 : 3}
          >
            {groups.map(group => (
              <Card
                key={group.id}
                className="skill-card skill-card--swap"
                data-cursor
                style={{ '--skill-accent': group.accent } as React.CSSProperties}
              >
                <div className="skill-card__terminal-bar">
                  <span className="skill-card__dot" />
                  <span className="skill-card__dot" />
                  <span className="skill-card__dot" />
                  <span className="skill-card__terminal-title">{group.id}.config</span>
                </div>

                <div className="skill-card__header">
                  <div className="skill-card__icon">{group.icon}</div>
                  <h3 className="skill-card__title">{group.name}</h3>
                  <span className="skill-card__count">{group.items.length}</span>
                </div>

                <div className="skill-card__tags">
                  {group.items.map(item => (
                    <span key={item} className="skill-card__tag">
                      {item}
                    </span>
                  ))}
                </div>

                <div className="skill-card__status">
                  <span className="skill-card__status-dot" />
                  <span>Active</span>
                </div>
              </Card>
            ))}
          </CardSwap>
        ) : null}
      </motion.div>
    </>
  )
}
