import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import PaperCard from './PaperCard'
import SketchDivider from './SketchDivider'
import ScrollRevealBlock from './ScrollRevealBlock'
import StickyNote from './StickyNote'
import type { SkillCategory } from '../../data/secretPortfolioData'

interface SkillsSectionProps {
  skills: SkillCategory[]
}

const categoryTilts = [-0.6, 0.4, -0.3, 0.7, -0.5, 0.2]
const revealDirs: ('left' | 'right')[] = ['left', 'right']

// Proficiency mapping (approximate, for visual interest)
const proficiencyMap: Record<string, number> = {
  'Python': 90, 'TypeScript': 88, 'JavaScript': 85, 'C++': 70, 'Dart': 78, 'Java': 72,
  'C': 60, 'SQL': 65, 'React': 92, 'Flutter': 82, 'Firebase': 80, 'Framer Motion': 85,
  'D3.js': 70, 'Git': 90, 'Docker': 55, 'NumPy': 75, 'Pandas': 72, 'scikit-learn': 68,
}

export default function SkillsSection({ skills }: SkillsSectionProps) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="sp-skills">
      <ScrollRevealBlock direction="up" className="sp-skills__header">
        <h2 className="sp-section-title">
          <span className="sp-section-title__marker" aria-hidden="true">§</span>
          Technical Stack
        </h2>
        <p className="sp-section-subtitle">Tools & technologies — click to expand and see proficiency</p>
        <SketchDivider delay={0.2} />
      </ScrollRevealBlock>

      <ScrollRevealBlock direction="up" delay={0.1} className="sp-skills__intro">
        <p className="sp-skills__intro-text">
          I believe in using the right tool for the job — but also in going deep enough
          with each tool to know its limits. Here's what I work with most.
        </p>
      </ScrollRevealBlock>

      <div className="sp-skills__grid">
        {skills.map((category, i) => (
          <ScrollRevealBlock
            key={category.name}
            direction={revealDirs[i % 2]}
            delay={i * 0.06}
          >
            <PaperCard
              variant={i % 2 === 0 ? 'clean' : 'worn'}
              tilt={categoryTilts[i]}
              onClick={() => setExpanded(expanded === category.name ? null : category.name)}
              hoverable
              className={`sp-skill-card ${expanded === category.name ? 'sp-skill-card--expanded' : ''}`}
            >
              <div className="sp-skill-card__header">
                <span className="sp-skill-card__icon" aria-hidden="true">{category.icon}</span>
                <h3 className="sp-skill-card__name">{category.name}</h3>
                <span className="sp-skill-card__count">{category.items.length}</span>
                <span className="sp-skill-card__toggle" aria-hidden="true">
                  {expanded === category.name ? '−' : '+'}
                </span>
              </div>

              <AnimatePresence>
                {expanded === category.name && (
                  <motion.div
                    className="sp-skill-card__items"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                  >
                    <div className="sp-skill-card__items-inner">
                      {category.items.map((item, j) => {
                        const proficiency = proficiencyMap[item]
                        return (
                          <motion.div
                            key={item}
                            className="sp-skill-card__item-row"
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: j * 0.03 }}
                          >
                            <span className="sp-skill-card__item">{item}</span>
                            {proficiency && (
                              <div className="sp-skill-card__bar">
                                <motion.div
                                  className="sp-skill-card__bar-fill"
                                  initial={{ scaleX: 0 }}
                                  animate={{ scaleX: proficiency / 100 }}
                                  transition={{ delay: 0.1 + j * 0.04, duration: 0.5, ease: 'easeOut' }}
                                />
                              </div>
                            )}
                          </motion.div>
                        )
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </PaperCard>
          </ScrollRevealBlock>
        ))}
      </div>

      {/* Summary sticky note */}
      <ScrollRevealBlock direction="scale" delay={0.1} className="sp-skills__summary">
        <StickyNote color="pink" tilt={-1.2}>
          <p className="sp-skills__summary-text">
            <strong>Primary stack:</strong> React + TypeScript on the frontend, Python for data/ML,
            Flutter/Dart for mobile. Always learning, always building.
          </p>
        </StickyNote>
      </ScrollRevealBlock>
    </div>
  )
}
