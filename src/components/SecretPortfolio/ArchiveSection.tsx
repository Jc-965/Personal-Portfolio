import PaperCard from './PaperCard'
import SketchDivider from './SketchDivider'
import StickyNote from './StickyNote'
import ScrollRevealBlock from './ScrollRevealBlock'
import type { ArchiveEntry } from '../../data/secretPortfolioData'

interface ArchiveSectionProps {
  entries: ArchiveEntry[]
}

const statusLabels: Record<ArchiveEntry['status'], string> = {
  complete: '✓ done',
  'in-progress': '◐ wip',
  idea: '○ idea',
  archived: '▪ archived',
}

const entryTilts = [0.8, -0.5, 1.2, -0.9, 0.3, -1.1]
const directions: ('left' | 'right' | 'up' | 'scale')[] = ['left', 'right', 'up', 'scale']

export default function ArchiveSection({ entries }: ArchiveSectionProps) {
  return (
    <div className="sp-archive">
      <ScrollRevealBlock direction="up" className="sp-archive__header">
        <h2 className="sp-section-title">
          <span className="sp-section-title__marker" aria-hidden="true">§</span>
          Archive & Experiments
        </h2>
        <p className="sp-section-subtitle">Smaller projects, ideas, and rough drafts</p>
        <SketchDivider delay={0.2} />
      </ScrollRevealBlock>

      <ScrollRevealBlock direction="up" delay={0.1} className="sp-archive__intro">
        <p className="sp-archive__intro-text">
          Not everything becomes a featured project. These are the experiments,
          side quests, and learning exercises that shaped how I think about engineering.
        </p>
      </ScrollRevealBlock>

      <div className="sp-archive__grid">
        {entries.map((entry, i) => (
          <ScrollRevealBlock
            key={entry.title}
            direction={directions[i % directions.length]}
            delay={i * 0.06}
          >
            <PaperCard
              variant="worn"
              tilt={entryTilts[i % entryTilts.length]}
              className="sp-archive-card"
              as="article"
              hoverable
            >
              <div className="sp-archive-card__top">
                <span className="sp-archive-card__date">{entry.date}</span>
                <span className={`sp-archive-card__status sp-archive-card__status--${entry.status}`}>
                  {statusLabels[entry.status]}
                </span>
              </div>
              <h3 className="sp-archive-card__title">{entry.title}</h3>
              <p className="sp-archive-card__desc">{entry.description}</p>
              <div className="sp-archive-card__tags">
                {entry.tags.map(tag => (
                  <span key={tag} className="sp-archive-card__tag">{tag}</span>
                ))}
              </div>
            </PaperCard>
          </ScrollRevealBlock>
        ))}
      </div>

      {/* Archive context note */}
      <ScrollRevealBlock direction="scale" delay={0.1} className="sp-archive__note">
        <StickyNote color="blue" tilt={2.1}>
          <p className="sp-archive__note-text">
            Some of these are rough, some are polished, all of them taught me something.
            The best ideas start as messy experiments.
          </p>
        </StickyNote>
      </ScrollRevealBlock>
    </div>
  )
}
