import PaperCard from './PaperCard'
import SketchDivider from './SketchDivider'
import StickyNote from './StickyNote'
import ScrollRevealBlock from './ScrollRevealBlock'
import type { ProjectData } from '../../data/secretPortfolioData'

interface ProjectIndexProps {
  projects: ProjectData[]
  onSelectProject: (slug: string) => void
}

const cardTilts = [-1.2, 0.8, -0.5, 1.1]
const revealDirections: ('left' | 'right' | 'up' | 'scale')[] = ['left', 'right', 'left', 'right']

export default function ProjectIndex({ projects, onSelectProject }: ProjectIndexProps) {
  return (
    <div className="sp-projects">
      <ScrollRevealBlock direction="up" className="sp-projects__header">
        <h2 className="sp-section-title">
          <span className="sp-section-title__marker" aria-hidden="true">§</span>
          Project Notes
        </h2>
        <p className="sp-section-subtitle">Featured work — click any card to read the full dossier</p>
        <SketchDivider delay={0.2} />
      </ScrollRevealBlock>

      {/* Intro context */}
      <ScrollRevealBlock direction="up" delay={0.1} className="sp-projects__intro">
        <p className="sp-projects__intro-text">
          These are the projects I'm most proud of — each one taught me something different
          about building software that actually works for real people.
        </p>
      </ScrollRevealBlock>

      <div className="sp-projects__grid">
        {projects.map((project, i) => (
          <ScrollRevealBlock
            key={project.slug}
            direction={revealDirections[i % revealDirections.length]}
            delay={i * 0.08}
          >
            <PaperCard
              variant={project.paperVariant}
              tilt={cardTilts[i % cardTilts.length]}
              onClick={() => onSelectProject(project.slug)}
              hoverable
              as="article"
              className="sp-project-card"
            >
              <div
                className="sp-project-card__accent"
                style={{ backgroundColor: project.accentColor }}
                aria-hidden="true"
              />

              <h3 className="sp-project-card__title">{project.title}</h3>
              <p className="sp-project-card__subtitle">{project.subtitle}</p>
              <p className="sp-project-card__summary">{project.summary}</p>

              {/* Impact snippet */}
              <div className="sp-project-card__impact">
                <span className="sp-project-card__impact-label">impact:</span>
                <span className="sp-project-card__impact-text">{project.impact}</span>
              </div>

              <div className="sp-project-card__stack">
                {project.techStack.slice(0, 4).map(tech => (
                  <span key={tech} className="sp-project-card__tag">{tech}</span>
                ))}
                {project.techStack.length > 4 && (
                  <span className="sp-project-card__tag sp-project-card__tag--more">
                    +{project.techStack.length - 4}
                  </span>
                )}
              </div>

              <div className="sp-project-card__footer">
                <span className="sp-project-card__duration">{project.duration}</span>
                <span className="sp-project-card__role">{project.role}</span>
                <span className="sp-project-card__cta">view notes →</span>
              </div>
            </PaperCard>
          </ScrollRevealBlock>
        ))}
      </div>

      {/* Bottom context sticky note */}
      <ScrollRevealBlock direction="scale" delay={0.2} className="sp-projects__bottom-note">
        <StickyNote color="yellow" tilt={1.8}>
          <p className="sp-projects__bottom-note-text">
            Each project has a full technical dossier with architecture notes,
            challenges, build notes, and outcomes. Click any card above to explore.
          </p>
        </StickyNote>
      </ScrollRevealBlock>
    </div>
  )
}
