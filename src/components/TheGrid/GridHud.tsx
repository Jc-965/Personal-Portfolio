import { content, STATIONS } from './gridConfig'
import type { SkyState, GridSelection } from './city/interaction'

/**
 * The HUD carries every word in the Grid: the canvas is scenery (and
 * aria-hidden), this layer is the document. Real headings, real links —
 * screen readers and search engines never need WebGL. Container ignores the
 * pointer; only interactive elements opt back in, so the scroller below
 * keeps receiving wheel and touch everywhere else.
 */

function HomePanel({ onNavigate }: { onNavigate: (index: number) => void }) {
  return (
    <>
      <p className="grid-hud__eyebrow">{content.profile.eyebrow}</p>
      <h2 className="grid-hud__headline">{content.profile.headline}</h2>
      <p className="grid-hud__body">{content.profile.description}</p>
      {/* The two districts visitors come for, one click from arrival. */}
      <div className="grid-hud__tabs">
        <button type="button" className="grid-hud__tab" onClick={() => onNavigate(1)}>
          ▸ ride the journey line
        </button>
        <button
          type="button"
          className="grid-hud__tab"
          style={{ '--grid-accent': '#4c8bff' } as React.CSSProperties}
          onClick={() => onNavigate(2)}
        >
          ▸ walk the project towers
        </button>
      </div>
    </>
  )
}

function JourneyPanel({
  selectedRole,
  focused,
  onSelectRole,
  onClearFocus,
}: {
  selectedRole: number | null
  focused: boolean
  onSelectRole: (index: number | null) => void
  onClearFocus: () => void
}) {
  const detail = selectedRole !== null ? content.experiences[selectedRole] : null
  return (
    <>
      {/* The transit stops in the world are the primary list; these chips are
          the same list for keyboards and screen readers — picking either
          flies the camera to that stop. */}
      <div className="grid-hud__tabs" role="tablist" aria-label="Roles">
        {content.experiences.map((exp, i) => (
          <button
            key={exp.id}
            type="button"
            role="tab"
            aria-selected={i === selectedRole}
            className={`grid-hud__tab ${i === selectedRole ? 'is-active' : ''}`}
            style={{ '--grid-accent': exp.accent } as React.CSSProperties}
            onClick={() => onSelectRole(i === selectedRole ? null : i)}
          >
            {exp.company}
          </button>
        ))}
      </div>
      {!detail && (
        <p className="grid-hud__microcopy">
          {content.experiences.length} stops on the elevated line, one per role — pick one
          (or use ←/→) and the tram meets you there.
        </p>
      )}
      {detail && (
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
          <p className="grid-hud__tabs">
            <button type="button" className="grid-hud__tab" onClick={() => onSelectRole(null)}>
              ✕ close record
            </button>
            {focused && (
              <button type="button" className="grid-hud__tab" onClick={onClearFocus}>
                ⟲ back to the line
              </button>
            )}
          </p>
        </div>
      )}
    </>
  )
}

function ProjectsPanel({
  selected,
  focused,
  onSelect,
  onClearFocus,
}: {
  selected: number
  focused: boolean
  onSelect: (index: number) => void
  onClearFocus: () => void
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
        {focused && (
          <button type="button" className="grid-hud__tab" onClick={onClearFocus}>
            ⟲ street view
          </button>
        )}
      </div>
      <p className="grid-hud__microcopy">
        picking a tower (tabs, ←/→, or a click) flies you to it — click empty street to pull back
      </p>
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
  onClearFocus: () => void
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
  onClearFocus,
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
            {active.id === 'home' && <HomePanel onNavigate={onNavigate} />}
            {active.id === 'journey' && (
              <JourneyPanel
                selectedRole={selection.role}
                focused={selection.focus === 'role'}
                onSelectRole={onSelectRole}
                onClearFocus={onClearFocus}
              />
            )}
            {active.id === 'projects' && (
              <ProjectsPanel
                selected={selection.project}
                focused={selection.focus === 'project'}
                onSelect={onSelectProject}
                onClearFocus={onClearFocus}
              />
            )}
            {active.id === 'beyond' && <BeyondPanel />}
            {active.id === 'skills' && <SkillsPanel />}
            {active.id === 'sky' && <SkyPanel sky={sky} onPlaceStar={onPlaceStar} />}
          </>
        )}
      </div>

      {showHint && (
        <p className="grid-hud__hint" aria-hidden="true">
          scroll to travel <span className="grid-hud__hint-arrow">▾</span>
        </p>
      )}
    </div>
  )
}
