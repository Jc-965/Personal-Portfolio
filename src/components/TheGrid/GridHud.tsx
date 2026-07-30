import { content, STATIONS } from './gridConfig'
import type { SkyState, GridSelection } from './city/interaction'

/**
 * The HUD is now chrome only: the back button, the station rail, and the
 * travel hint. Every word of content lives IN the city (gantry signs, wall
 * marquees, shop fronts, the relay tower) — so the DOM's job is the part
 * WebGL can't do: a complete screen-reader document with the same records,
 * real links, and working selection controls, plus an aria-live announcer.
 */

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

      {/* Station announcer for assistive tech — the canvas is aria-hidden. */}
      <p className="sr-only" aria-live="polite">
        {active ? `${String(station).padStart(2, '0')} ${active.label} — ${active.title}` : 'traveling'}
      </p>

      {/* The whole portfolio as a real document. Buttons drive the same
          selection state as clicking the 3D city. */}
      <div className="sr-only">
        <h2>{content.profile.headline}</h2>
        <p>{content.profile.description}</p>

        <h3>Journey — one elevated stop per role. Use Left and Right arrows at the Journey station, or these buttons.</h3>
        <ul>
          {content.experiences.map((exp, i) => (
            <li key={exp.id}>
              <button
                type="button"
                aria-pressed={selection.role === i}
                onClick={() => onSelectRole(selection.role === i ? null : i)}
              >
                {exp.company} — {exp.role}, {exp.period}
              </button>
              <p>
                {exp.location} · {exp.status}. {exp.summary} Stack: {exp.stack.join(', ')}.
              </p>
            </li>
          ))}
        </ul>

        <h3>Projects — giant street marquees. Use Left and Right arrows at the Projects station, or these buttons.</h3>
        <ul>
          {content.projects.map((project, i) => (
            <li key={project.id}>
              <button
                type="button"
                aria-pressed={selection.project === i}
                onClick={() => onSelectProject(i)}
              >
                {project.name} — {project.tag}
              </button>
              <p>
                {project.lead} Stack: {project.tech.join(', ')}.{' '}
                {project.stats.map(stat => `${stat.value} ${stat.label}`).join(', ')}.
              </p>
              <a href={`/projects/${project.id}/`} target="_blank" rel="noopener noreferrer">
                {project.name} case study
              </a>
            </li>
          ))}
        </ul>
        {selection.focus && (
          <button type="button" onClick={onClearFocus}>
            release camera back to the street
          </button>
        )}

        <h3>Outside the code</h3>
        <ul>
          {content.beyond.map(item => (
            <li key={item.id}>
              {item.title} — {item.subtitle}.{' '}
              {item.stats.map(stat => `${stat.value} ${stat.label}`).join(', ')}.
            </li>
          ))}
        </ul>

        <h3>Toolkit</h3>
        <ul>
          {content.toolkit.map(group => (
            <li key={group.id}>
              {group.name}: {group.items.join(', ')}
            </li>
          ))}
        </ul>

        <h3>The sky</h3>
        <p>
          {sky.live
            ? `${sky.count} visitor ${sky.count === 1 ? 'star hangs' : 'stars hang'} over the city.`
            : 'The constellation uplink is offline — the ambient sky still shines.'}
          {sky.ownStar ? ' Your star is up there — it can be dragged across the 3D sky.' : ''}
        </p>
        <button type="button" onClick={onPlaceStar}>
          {sky.ownStar ? 'edit your star in the constellation' : 'place your star in the constellation'}
        </button>
        <p>
          <a href={`mailto:${content.profile.email}`}>email</a>{' '}
          <a href={content.profile.github} target="_blank" rel="noopener noreferrer">github</a>{' '}
          <a href={content.profile.linkedin} target="_blank" rel="noopener noreferrer">linkedin</a>
        </p>
      </div>

      {showHint && (
        <p className="grid-hud__hint" aria-hidden="true">
          scroll to travel <span className="grid-hud__hint-arrow">▾</span>
        </p>
      )}
    </div>
  )
}
