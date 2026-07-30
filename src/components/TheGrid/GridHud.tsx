import { content, STATIONS } from './gridConfig'
import type { SkyState, GridSelection } from './city/interaction'

/**
 * The HUD carries every word in the Grid: the canvas is scenery (and
 * aria-hidden), this layer is the document. Real headings, real links —
 * screen readers and search engines never need WebGL. Container ignores the
 * pointer; only interactive elements opt back in, so the scroller below
 * keeps receiving wheel and touch everywhere else.
 */

function HomePanel() {
  return (
    <>
      <p className="grid-hud__eyebrow">{content.profile.eyebrow}</p>
      <h2 className="grid-hud__headline">{content.profile.headline}</h2>
      <p className="grid-hud__body">{content.profile.description}</p>
    </>
  )
}

function JourneyPanel({
  selectedRole,
  onSelectRole,
}: {
  selectedRole: number | null
  onSelectRole: (index: number | null) => void
}) {
  const detail = selectedRole !== null ? content.experiences[selectedRole] : null
  // No list here — the transit stops IN THE WORLD are the list. The panel
  // stays a thin caption until a stop is clicked, then shows that record.
  if (!detail) {
    return (
      <>
        <h2 className="grid-hud__headline grid-hud__headline--small">The transit line</h2>
        <p className="grid-hud__body">
          Every stop on the elevated line is a role, {content.experiences.length} in all —
          hover one to identify it, click it to open the record.
        </p>
      </>
    )
  }
  return (
    <div className="grid-hud__detail" style={{ '--grid-accent': detail.accent } as React.CSSProperties}>
      <p className="grid-hud__detail-title">
        {detail.company} · {detail.location} · {detail.status}
      </p>
      <p className="grid-hud__microcopy">{detail.role} — {detail.period}</p>
      <p className="grid-hud__body">{detail.summary}</p>
      <p className="grid-hud__chips">
        {detail.stack.map(item => (
          <span key={item} className="grid-hud__chip">{item}</span>
        ))}
      </p>
      <button type="button" className="grid-hud__tab" onClick={() => onSelectRole(null)}>
        ✕ close record
      </button>
    </div>
  )
}

function ProjectsPanel({
  selected,
  onSelect,
}: {
  selected: number
  onSelect: (index: number) => void
}) {
  const project = content.projects[selected]
  return (
    <>
      <div className="grid-hud__tabs" role="tablist" aria-label="Projects">
        {content.projects.map((p, i) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={i === selected}
            className={`grid-hud__tab ${i === selected ? 'is-active' : ''}`}
            style={{ '--grid-accent': p.accent } as React.CSSProperties}
            onClick={() => onSelect(i)}
          >
            {p.name}
          </button>
        ))}
      </div>
      <p className="grid-hud__microcopy">or click a tower — its screen cycles that project's shots</p>
      <h2 className="grid-hud__headline grid-hud__headline--small">{project.name}</h2>
      <p className="grid-hud__tag">{project.tag}</p>
      <p className="grid-hud__body">{project.lead}</p>
      <dl className="grid-hud__stats">
        {project.stats.map(stat => (
          <div key={stat.label} className="grid-hud__stat">
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
      <p className="grid-hud__chips">
        {project.tech.map(t => (
          <span key={t} className="grid-hud__chip">{t}</span>
        ))}
      </p>
      <p className="grid-hud__links">
        <a href={`/projects/${project.id}/`} target="_blank" rel="noopener noreferrer">
          case study ↗
        </a>
      </p>
    </>
  )
}

function BeyondPanel() {
  return (
    <>
      <h2 className="grid-hud__headline grid-hud__headline--small">Outside the code</h2>
      <ul className="grid-hud__list">
        {content.beyond.map(item => (
          <li key={item.id} className="grid-hud__row grid-hud__row--tall">
            <span className="grid-hud__row-dot" style={{ background: item.accent }} />
            <span className="grid-hud__row-title">{item.title}</span>
            <span className="grid-hud__row-sub">{item.subtitle}</span>
            <span className="grid-hud__row-detail">
              {item.stats.map(s => `${s.value} ${s.label.toLowerCase()}`).join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

function SkillsPanel() {
  return (
    <>
      <h2 className="grid-hud__headline grid-hud__headline--small">The relay tower</h2>
      {[...content.toolkit].reverse().map(group => (
        <div key={group.id} className="grid-hud__skill-group">
          <p className="grid-hud__skill-name" style={{ color: group.accent }}>
            {group.name}
          </p>
          <p className="grid-hud__chips">
            {group.items.map(item => (
              <span key={item} className="grid-hud__chip">{item}</span>
            ))}
          </p>
        </div>
      ))}
    </>
  )
}

function SkyPanel({ sky, onPlaceStar }: { sky: SkyState; onPlaceStar: () => void }) {
  return (
    <>
      <h2 className="grid-hud__headline grid-hud__headline--small">The sky deck</h2>
      <p className="grid-hud__body">
        {sky.live
          ? `${sky.count} visitor ${sky.count === 1 ? 'star hangs' : 'stars hang'} over the city — hover one to read its message.`
          : 'The constellation uplink is offline — the ambient sky still shines.'}
      </p>
      {sky.ownStar && (
        <p className="grid-hud__body grid-hud__body--accent">
          The ringed star is yours — grab and drag it anywhere in the sky.
        </p>
      )}
      <p className="grid-hud__links">
        <button type="button" className="grid-hud__cta" onClick={onPlaceStar}>
          {sky.ownStar ? '✦ edit your star' : '✦ place your star'}
        </button>
      </p>
      <p className="grid-hud__contact">
        <a href={`mailto:${content.profile.email}`}>email</a>
        <a href={content.profile.github} target="_blank" rel="noopener noreferrer">github</a>
        <a href={content.profile.linkedin} target="_blank" rel="noopener noreferrer">linkedin</a>
      </p>
    </>
  )
}

export interface GridHudProps {
  /** Active station index, or -1 while traveling between stations. */
  station: number
  sky: SkyState
  showHint: boolean
  selection: GridSelection
  onSelectProject: (index: number) => void
  onSelectRole: (index: number | null) => void
  onNavigate: (index: number) => void
  onExit: () => void
  onPlaceStar: () => void
}

export default function GridHud({
  station,
  sky,
  showHint,
  selection,
  onSelectProject,
  onSelectRole,
  onNavigate,
  onExit,
  onPlaceStar,
}: GridHudProps) {
  const active = station >= 0 ? STATIONS[station] : null

  return (
    <div className="grid-hud">
      <div className="grid-hud__top">
        <button type="button" className="grid-hud__back" onClick={onExit}>
          ← back to portfolio
        </button>
        <nav className="grid-hud__nav" aria-label="Grid stations">
          {STATIONS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`grid-hud__nav-btn ${i === station ? 'is-active' : ''}`}
              style={{ '--grid-accent': s.accent } as React.CSSProperties}
              aria-current={i === station ? 'true' : undefined}
              onClick={() => onNavigate(i)}
            >
              <span className="grid-hud__nav-index">{String(i).padStart(2, '0')}</span>
              <span className="grid-hud__nav-label">{s.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div
        className={`grid-hud__panel ${active ? 'is-visible' : ''}`}
        style={{ '--grid-accent': active?.accent ?? '#00ffff' } as React.CSSProperties}
        aria-live="polite"
      >
        {active && (
          <>
            <p className="grid-hud__station-id">
              {String(station).padStart(2, '0')} // {active.label}
            </p>
            {active.id === 'home' && <HomePanel />}
            {active.id === 'journey' && (
              <JourneyPanel selectedRole={selection.role} onSelectRole={onSelectRole} />
            )}
            {active.id === 'projects' && (
              <ProjectsPanel selected={selection.project} onSelect={onSelectProject} />
            )}
            {active.id === 'beyond' && <BeyondPanel />}
            {active.id === 'skills' && <SkillsPanel />}
            {active.id === 'sky' && <SkyPanel sky={sky} onPlaceStar={onPlaceStar} />}
          </>
        )}
      </div>

      <p className="grid-hud__identity">
        <span className="grid-hud__identity-name">{content.profile.name}</span>
        <span className="grid-hud__identity-sub">// CMU SCS</span>
      </p>

      {showHint && (
        <p className="grid-hud__hint" aria-hidden="true">
          scroll to travel <span className="grid-hud__hint-arrow">▾</span>
        </p>
      )}
    </div>
  )
}
