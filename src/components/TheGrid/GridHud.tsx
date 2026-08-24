import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { CONSTELLATION_COLORS } from '../../utils/constellationIdentity'
import { content, STATIONS } from './gridConfig'
import type { GridSelection, SkyState } from './city/interaction'

export interface GridHudProps {
  /** Active station index, or -1 while traveling between stations. */
  station: number
  sky: SkyState
  showHint: boolean
  selection: GridSelection
  onSelectProject: (index: number) => void
  onSelectRole: (index: number | null, options?: { inspect?: boolean }) => void
  onClearFocus: () => void
  onNavigate: (index: number) => void
  onExit: () => void
  onPlaceStar: () => void
  onCancelStarPlacement: () => void
  onSetStarColor: (color: string) => void
  onSaveStarMessage: (message: string) => Promise<boolean>
  onOpenConstellation: () => void
}

interface SelectionPanelProps {
  selection: GridSelection
  onSelectProject: (index: number) => void
  onSelectRole: (index: number | null, options?: { inspect?: boolean }) => void
  onClearFocus: () => void
}

function JourneyPanel({
  selection,
  onSelectRole,
  onClearFocus,
}: Pick<SelectionPanelProps, 'selection' | 'onSelectRole' | 'onClearFocus'>) {
  const roleIndex = selection.role ?? 0
  const role = content.experiences[roleIndex]
  const inspecting = selection.focus === 'role'
  const total = content.experiences.length
  const move = (direction: number, inspect = inspecting) => {
    const next = (roleIndex + direction + total) % total
    onSelectRole(next, { inspect })
  }
  const periodLead = role.period.split(/[·•|]/)[0]?.trim() ?? role.period

  return (
    <div className="grid-hud__journey" style={{ '--grid-panel-accent': role.accent } as CSSProperties}>
      <nav className="grid-hud__timeline" aria-label="Career timeline">
        <p className="grid-hud__timeline-kicker">01 · journey rail</p>
        <ol className="grid-hud__timeline-list">
          {content.experiences.map((experience, index) => (
            <li key={experience.id}>
              <button
                type="button"
                className={[
                  'grid-hud__timeline-node',
                  index === roleIndex ? 'is-active' : '',
                  selection.focus === 'role' && index === roleIndex ? 'is-focused' : '',
                ].filter(Boolean).join(' ')}
                style={{ '--record-accent': experience.accent } as CSSProperties}
                aria-pressed={index === roleIndex}
                aria-current={index === roleIndex ? 'true' : undefined}
                onClick={() => onSelectRole(index, { inspect: false })}
              >
                <span className="grid-hud__timeline-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="grid-hud__timeline-body">
                  <strong>{experience.company}</strong>
                  <small>{experience.role}</small>
                </span>
                <span className="grid-hud__timeline-dot" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
        <p className="grid-hud__timeline-hint" aria-hidden="true">
          select a stop · lock to fly in
        </p>
      </nav>

      <section
        className={`grid-hud__dossier ${inspecting ? 'is-inspecting' : ''}`}
        aria-labelledby="grid-journey-title"
      >
        <div className="grid-hud__dossier-frame" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="grid-hud__panel-scan" aria-hidden="true" />
        <div className="grid-hud__dossier-beam" aria-hidden="true" />
        <header className="grid-hud__dossier-header">
          <div>
            <p className="grid-hud__panel-kicker">
              {role.track} · stop {String(roleIndex + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
            </p>
            <p className="grid-hud__dossier-period">{periodLead}</p>
            <h2 id="grid-journey-title">{role.company}</h2>
            <p className="grid-hud__panel-subtitle">{role.role}</p>
          </div>
          <div className="grid-hud__dossier-badges">
            <span className={`grid-hud__status ${role.status === 'Active' ? 'is-live' : ''}`}>
              {role.status}
            </span>
            <span className={`grid-hud__lock ${inspecting ? 'is-on' : ''}`}>
              {inspecting ? 'camera locked' : 'rail free'}
            </span>
          </div>
        </header>

        <div className="grid-hud__meta">
          <span>{role.period}</span>
          <span>{role.location}</span>
        </div>
        <p className="grid-hud__summary">{role.summary}</p>
        <ul className="grid-hud__chips" aria-label="Role technologies">
          {role.stack.map(item => <li key={item}>{item}</li>)}
        </ul>

        <footer className="grid-hud__panel-actions">
          <button type="button" onClick={() => move(-1)} aria-label="Previous role">←</button>
          {inspecting ? (
            <button type="button" onClick={onClearFocus}>release camera</button>
          ) : (
            <button type="button" onClick={() => onSelectRole(roleIndex, { inspect: true })}>
              fly to stop
            </button>
          )}
          <button type="button" onClick={() => move(1)} aria-label="Next role">→</button>
        </footer>
      </section>

      <div className="grid-hud__orbit" role="group" aria-label="Journey stops">
        {content.experiences.map((experience, index) => (
          <button
            key={experience.id}
            type="button"
            className={[
              'grid-hud__orbit-node',
              index === roleIndex ? 'is-active' : '',
              selection.focus === 'role' && index === roleIndex ? 'is-focused' : '',
            ].filter(Boolean).join(' ')}
            style={{ '--record-accent': experience.accent } as CSSProperties}
            aria-label={`${experience.company}, stop ${index + 1}`}
            aria-pressed={index === roleIndex}
            onClick={() => onSelectRole(index, { inspect: true })}
            title={experience.company}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <small>{experience.company.split(/[\s·]/)[0]}</small>
          </button>
        ))}
      </div>
    </div>
  )
}

function ProjectPanel({
  selection,
  onSelectProject,
  onClearFocus,
}: Pick<SelectionPanelProps, 'selection' | 'onSelectProject' | 'onClearFocus'>) {
  const project = content.projects[selection.project]
  const image = project.images?.[0]
  const move = (direction: number) => {
    const next = (selection.project + direction + content.projects.length) % content.projects.length
    onSelectProject(next)
  }

  return (
    <section
      className="grid-hud__panel grid-hud__panel--project"
      style={{ '--grid-panel-accent': project.accent } as CSSProperties}
      aria-labelledby="grid-project-title"
    >
      <div className="grid-hud__panel-scan" aria-hidden="true" />
      <div className="grid-hud__project-layout">
        {image && (
          <figure className="grid-hud__project-visual">
            <img src={image.src} alt={image.alt} />
            <figcaption>{image.label}</figcaption>
          </figure>
        )}
        <div className="grid-hud__project-copy">
          <header className="grid-hud__panel-header">
            <div>
              <p className="grid-hud__panel-kicker">featured build / {String(selection.project + 1).padStart(2, '0')}</p>
              <h2 id="grid-project-title">{project.name}</h2>
              <p className="grid-hud__panel-subtitle">{project.tag}</p>
            </div>
          </header>
          <div className="grid-hud__stats" aria-label="Project results">
            {project.stats.map(stat => (
              <span key={stat.label}>
                <strong>{stat.value}</strong>
                <small>{stat.label}</small>
              </span>
            ))}
          </div>
          <p className="grid-hud__summary">{project.lead}</p>
          <ul className="grid-hud__chips" aria-label="Project technologies">
            {project.tech.map(item => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>

      <div className="grid-hud__record-strip" role="list" aria-label="Featured projects">
        {content.projects.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={index === selection.project ? 'is-active' : ''}
            style={{ '--record-accent': item.accent } as CSSProperties}
            aria-pressed={index === selection.project}
            onClick={() => onSelectProject(index)}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            {item.name}
          </button>
        ))}
      </div>

      <footer className="grid-hud__panel-actions">
        <button type="button" onClick={() => move(-1)} aria-label="Previous project">← previous</button>
        {selection.focus === 'project' && (
          <button type="button" onClick={onClearFocus}>release camera</button>
        )}
        <a href={`/projects/${project.id}/`} target="_blank" rel="noopener noreferrer">
          open case study ↗
        </a>
        <button type="button" onClick={() => move(1)} aria-label="Next project">next →</button>
      </footer>
    </section>
  )
}

interface SkyPanelProps {
  sky: SkyState
  onPlaceStar: () => void
  onCancelStarPlacement: () => void
  onSetStarColor: (color: string) => void
  onSaveStarMessage: (message: string) => Promise<boolean>
  onOpenConstellation: () => void
}

function SkyPanel({
  sky,
  onPlaceStar,
  onCancelStarPlacement,
  onSetStarColor,
  onSaveStarMessage,
  onOpenConstellation,
}: SkyPanelProps) {
  const [draftMessage, setDraftMessage] = useState(sky.message)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setDraftMessage(sky.message)
  }, [sky.message])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaved(await onSaveStarMessage(draftMessage))
  }

  return (
    <section
      className={`grid-hud__panel grid-hud__panel--sky ${sky.placing ? 'is-placing' : ''}`}
      style={{ '--grid-panel-accent': sky.color } as CSSProperties}
      aria-labelledby="grid-sky-title"
    >
      <div className="grid-hud__panel-scan" aria-hidden="true" />
      <header className="grid-hud__panel-header">
        <div>
          <p className="grid-hud__panel-kicker">shared sky / live uplink</p>
          <h2 id="grid-sky-title">{sky.ownStar ? 'Your star is in orbit' : 'Place your star in the city sky'}</h2>
          <p className="grid-hud__panel-subtitle">
            {sky.placing
              ? 'Choose any open point in the sky. The star will fly to that exact position.'
              : 'Every light is a real visitor. Hover to read transmissions; drag your ringed star to move it.'}
          </p>
        </div>
        <span className={`grid-hud__status ${sky.live ? 'is-live' : 'is-offline'}`}>
          {sky.live ? `${sky.count} live` : 'local sky'}
        </span>
      </header>

      <div className="grid-hud__sky-controls">
        <div>
          <span className="grid-hud__control-label">spectrum</span>
          <div className="grid-hud__star-colors" role="group" aria-label="Star color">
            {CONSTELLATION_COLORS.map(color => (
              <button
                key={color.value}
                type="button"
                className={sky.color.toLowerCase() === color.value ? 'is-active' : ''}
                style={{ '--star-color': color.value } as CSSProperties}
                aria-label={color.label}
                aria-pressed={sky.color.toLowerCase() === color.value}
                onClick={() => onSetStarColor(color.value)}
              />
            ))}
          </div>
        </div>
        <div className="grid-hud__place-actions">
          {sky.placing ? (
            <button type="button" className="grid-hud__primary" onClick={onCancelStarPlacement}>
              cancel placement
            </button>
          ) : (
            <button type="button" className="grid-hud__primary" onClick={onPlaceStar}>
              {sky.ownStar ? 'reposition in sky' : 'choose sky position'}
            </button>
          )}
          <button type="button" className="grid-hud__secondary" onClick={onOpenConstellation}>
            open full constellation editor ↗
          </button>
        </div>
      </div>

      <form className="grid-hud__transmission" onSubmit={submit}>
        <label htmlFor="grid-star-message">transmission attached to your star</label>
        <div>
          <input
            id="grid-star-message"
            type="text"
            maxLength={50}
            value={draftMessage}
            disabled={!sky.ownStar || sky.savingMessage}
            placeholder={sky.ownStar ? 'Add a short message' : 'Place your star first'}
            onChange={event => {
              setDraftMessage(event.target.value)
              setSaved(false)
            }}
          />
          <button type="submit" disabled={!sky.ownStar || sky.savingMessage}>
            {sky.savingMessage ? 'sending…' : 'send'}
          </button>
        </div>
      </form>
      <p className="grid-hud__feedback" role="status">
        {sky.error ?? (saved ? 'Transmission saved to your star.' : '')}
      </p>
    </section>
  )
}

export default function GridHud({
  station,
  sky,
  showHint,
  selection,
  onSelectProject,
  onSelectRole,
  onClearFocus,
  onNavigate,
  onExit,
  onPlaceStar,
  onCancelStarPlacement,
  onSetStarColor,
  onSaveStarMessage,
  onOpenConstellation,
}: GridHudProps) {
  const active = station >= 0 ? STATIONS[station] : null

  return (
    <div className="grid-hud">
      <div className="grid-hud__top">
        <button type="button" className="grid-hud__back" onClick={onExit}>
          ← back to portfolio
        </button>
        <nav className="grid-hud__nav" aria-label="Grid stations">
          {STATIONS.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`grid-hud__nav-btn ${index === station ? 'is-active' : ''}`}
              style={{ '--grid-accent': item.accent } as CSSProperties}
              aria-current={index === station ? 'true' : undefined}
              onClick={() => onNavigate(index)}
            >
              <span className="grid-hud__nav-index">{String(index).padStart(2, '0')}</span>
              <span className="grid-hud__nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <p className="sr-only" aria-live="polite">
        {active ? `${String(station).padStart(2, '0')} ${active.label} — ${active.title}` : 'traveling'}
      </p>

      <div className="sr-only">
        <h2>{content.profile.headline}</h2>
        <p>{content.profile.description}</p>
        <h3>Journey</h3>
        <ul>
          {content.experiences.map(experience => (
            <li key={experience.id}>
              {experience.company} — {experience.role}, {experience.period}. {experience.summary}
            </li>
          ))}
        </ul>
        <h3>Projects</h3>
        <ul>
          {content.projects.map(project => (
            <li key={project.id}>
              {project.name} — {project.tag}. {project.lead}
            </li>
          ))}
        </ul>
        <h3>The sky</h3>
        <p>
          {sky.live
            ? `${sky.count} visitor ${sky.count === 1 ? 'star hangs' : 'stars hang'} over the city.`
            : 'The live uplink is unavailable; the local sky remains interactive.'}
          {sky.ownStar ? ' Your star can be dragged or repositioned in the Grid sky.' : ''}
        </p>
      </div>

      {station === 1 && (
        <JourneyPanel
          selection={selection}
          onSelectRole={onSelectRole}
          onClearFocus={onClearFocus}
        />
      )}
      {station === 2 && (
        <ProjectPanel
          selection={selection}
          onSelectProject={onSelectProject}
          onClearFocus={onClearFocus}
        />
      )}
      {station === 5 && (
        <SkyPanel
          sky={sky}
          onPlaceStar={onPlaceStar}
          onCancelStarPlacement={onCancelStarPlacement}
          onSetStarColor={onSetStarColor}
          onSaveStarMessage={onSaveStarMessage}
          onOpenConstellation={onOpenConstellation}
        />
      )}

      {showHint && (
        <p className="grid-hud__hint" aria-hidden="true">
          scroll to travel <span className="grid-hud__hint-arrow">▾</span>
        </p>
      )}
    </div>
  )
}
