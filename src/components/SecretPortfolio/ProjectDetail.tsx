import { motion } from 'framer-motion'
import PaperCard from './PaperCard'
import StickyNote from './StickyNote'
import SketchDivider from './SketchDivider'
import ScrollRevealBlock from './ScrollRevealBlock'
import InkWash from './InkWash'
import MarginNote from './MarginNote'
import type { ProjectData } from '../../data/secretPortfolioData'

interface ProjectDetailProps {
  project: ProjectData
  onBack: () => void
}

export default function ProjectDetail({ project, onBack }: ProjectDetailProps) {
  return (
    <motion.div
      className="sp-detail"
      initial={{ opacity: 0, x: 60 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
    >
      {/* Back button */}
      <motion.button
        className="sp-detail__back"
        onClick={onBack}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
        whileHover={{ x: -3 }}
      >
        ← back to index
      </motion.button>

      {/* ── Main dossier sheet ── */}
      <PaperCard variant="clean" className="sp-detail__main">
        <div
          className="sp-detail__accent-bar"
          style={{ backgroundColor: project.accentColor }}
          aria-hidden="true"
        />
        <div className="sp-detail__header">
          <h2 className="sp-detail__title">{project.title}</h2>
          <p className="sp-detail__subtitle">{project.subtitle}</p>
          <div className="sp-detail__meta">
            <span>{project.role}</span>
            <span className="sp-detail__meta-sep">·</span>
            <span>{project.duration}</span>
          </div>
        </div>
        <SketchDivider />

        {/* Impact */}
        <div className="sp-detail__impact">
          <span className="sp-detail__impact-label">impact</span>
          <p className="sp-detail__impact-text">{project.impact}</p>
        </div>

        {/* Stack */}
        <div className="sp-detail__stack">
          <span className="sp-detail__stack-label">stack:</span>
          <div className="sp-detail__stack-tags">
            {project.techStack.map(tech => (
              <span key={tech} className="sp-detail__stack-tag">{tech}</span>
            ))}
          </div>
        </div>
      </PaperCard>

      <MarginNote text="core details ↑" side="right" rotation={-4} top="20px" type="arrow" />

      <InkWash variant="fold" />

      {/* ── Problem & Solution ── */}
      <div className="sp-detail__two-col">
        <ScrollRevealBlock direction="left">
          <PaperCard variant="worn" tilt={-0.5} className="sp-detail__section-card">
            <h3 className="sp-detail__section-heading">
              <span className="sp-detail__section-icon" aria-hidden="true">?</span>
              Problem
            </h3>
            <p className="sp-detail__section-body">{project.problem}</p>
          </PaperCard>
        </ScrollRevealBlock>

        <ScrollRevealBlock direction="right" delay={0.1}>
          <PaperCard variant="taped" tilt={0.6} className="sp-detail__section-card">
            <h3 className="sp-detail__section-heading">
              <span className="sp-detail__section-icon" aria-hidden="true">→</span>
              Approach
            </h3>
            <p className="sp-detail__section-body">{project.solution}</p>
          </PaperCard>
        </ScrollRevealBlock>
      </div>

      <InkWash variant="bleed" />

      {/* ── Features ── */}
      <ScrollRevealBlock direction="up">
        <PaperCard variant="clean" tilt={0.3} className="sp-detail__features">
          <h3 className="sp-detail__section-heading">Key Features</h3>
          <ul className="sp-detail__feature-list">
            {project.features.map((f, i) => (
              <ScrollRevealBlock key={i} direction="left" delay={i * 0.05} as="li" className="sp-detail__feature-item">
                <span className="sp-detail__feature-bullet" aria-hidden="true">◆</span>
                {f}
              </ScrollRevealBlock>
            ))}
          </ul>
        </PaperCard>
      </ScrollRevealBlock>

      <MarginNote text="key differentiators" side="left" rotation={3} top="0" type="bracket" />

      {/* ── Architecture notes (ASCII art style) ── */}
      <ScrollRevealBlock direction="scale" delay={0.1}>
        <PaperCard variant="worn" tilt={-0.3} className="sp-detail__architecture">
          <h3 className="sp-detail__section-heading">Architecture Overview</h3>
          <pre className="sp-detail__ascii-diagram">{`
  ┌─────────────┐     ┌──────────────┐
  │   Frontend   │────▶│   API Layer   │
  │  ${project.techStack[0]?.padEnd(10) || '          '} │     │              │
  └─────────────┘     └──────┬───────┘
                             │
                     ┌───────▼───────┐
                     │   Data Layer   │
                     │  ${project.techStack.slice(-2).join(', ').padEnd(13) || '             '}│
                     └───────────────┘`}
          </pre>
          <p className="sp-detail__ascii-note">
            simplified system diagram — see build notes for tradeoff details
          </p>
        </PaperCard>
      </ScrollRevealBlock>

      <InkWash variant="tape-strip" />

      {/* ── Challenges ── */}
      <ScrollRevealBlock direction="up">
        <PaperCard variant="worn" tilt={-0.4} className="sp-detail__challenges">
          <h3 className="sp-detail__section-heading">Engineering Challenges</h3>
          <ul className="sp-detail__challenge-list">
            {project.challenges.map((c, i) => (
              <ScrollRevealBlock key={i} direction="right" delay={i * 0.06} as="li" className="sp-detail__challenge-item">
                <span className="sp-detail__challenge-marker" aria-hidden="true">⚡</span>
                {c}
              </ScrollRevealBlock>
            ))}
          </ul>
        </PaperCard>
      </ScrollRevealBlock>

      {/* ── Outcomes ── */}
      <ScrollRevealBlock direction="up" delay={0.1}>
        <PaperCard variant="pinned" tilt={0.5} className="sp-detail__outcomes">
          <h3 className="sp-detail__section-heading">Outcomes</h3>
          <ul className="sp-detail__outcome-list">
            {project.outcomes.map((o, i) => (
              <ScrollRevealBlock key={i} direction="left" delay={i * 0.05} as="li" className="sp-detail__outcome-item">
                <span className="sp-detail__outcome-check" aria-hidden="true">✓</span>
                {o}
              </ScrollRevealBlock>
            ))}
          </ul>
        </PaperCard>
      </ScrollRevealBlock>

      <MarginNote text="results ✓" side="right" rotation={-6} top="0" type="stamp" />

      <InkWash variant="splatter" />

      {/* ── Build Notes ── */}
      <ScrollRevealBlock direction="up">
        <div className="sp-detail__notes-section">
          <h3 className="sp-detail__notes-heading">
            Build Notes
            <span className="sp-detail__notes-aside">— rough internal notes</span>
          </h3>
          <div className="sp-detail__notes-grid">
            {project.notes.map((note, i) => (
              <ScrollRevealBlock key={i} direction="scale" delay={i * 0.08}>
                <StickyNote
                  color={(['yellow', 'blue', 'pink', 'green'] as const)[i % 4]}
                  tilt={[1.2, -0.8, 0.5, -1.5][i % 4]}
                >
                  <p className="sp-detail__note-text">{note}</p>
                </StickyNote>
              </ScrollRevealBlock>
            ))}
          </div>
        </div>
      </ScrollRevealBlock>

      {/* ── Timeline ── */}
      <ScrollRevealBlock direction="up" delay={0.1}>
        <PaperCard variant="clean" tilt={-0.2} className="sp-detail__timeline-card">
          <h3 className="sp-detail__section-heading">Project Timeline</h3>
          <div className="sp-detail__timeline">
            <div className="sp-detail__timeline-line" aria-hidden="true" />
            {['Research & Planning', 'Core Implementation', 'Testing & Polish', 'Launch & Iterate'].map((phase, i) => (
              <ScrollRevealBlock key={phase} direction="left" delay={i * 0.08} className="sp-detail__timeline-item">
                <div className="sp-detail__timeline-dot" aria-hidden="true" />
                <span className="sp-detail__timeline-phase">{phase}</span>
              </ScrollRevealBlock>
            ))}
          </div>
        </PaperCard>
      </ScrollRevealBlock>

      {/* ── Links ── */}
      {project.links.length > 0 && (
        <ScrollRevealBlock direction="up" className="sp-detail__links">
          {project.links.map(link => (
            <a
              key={link.label}
              href={link.url}
              className="sp-detail__link"
              target="_blank"
              rel="noreferrer"
            >
              {link.label} ↗
            </a>
          ))}
        </ScrollRevealBlock>
      )}

      {/* Spacer at bottom */}
      <div className="sp-detail__end-spacer" aria-hidden="true" />
    </motion.div>
  )
}
