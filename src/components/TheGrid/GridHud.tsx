import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent } from 'react'
import { CONSTELLATION_COLORS } from '../../utils/constellationIdentity'
import { content, LANDMARKS, STATIONS } from './gridConfig'
import type { GridSelection, SkyState } from './city/interaction'
import type { GridSession, GridSnapshot } from './navigation/session'

export interface GridHudProps {
  session: GridSession
  navigation: GridSnapshot
  reducedMotion: boolean
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

function TouchControls({ session }: { session: GridSession }) {
  const lookStart = useRef({ x: 0, y: 0 })
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    session.joystick.x = Math.max(-1, Math.min(1, (event.clientX - rect.left) / (rect.width / 2) - 1))
    session.joystick.y = Math.max(-1, Math.min(1, (event.clientY - rect.top) / (rect.height / 2) - 1))
  }
  return <div className="grid-touch" aria-hidden="true">
    <div className="grid-touch__joystick" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); move(event) }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event) }} onPointerUp={() => { session.joystick.x = 0; session.joystick.y = 0 }} />
    <div className="grid-touch__look" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); lookStart.current = { x: event.clientX, y: event.clientY } }} onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; session.yaw -= (event.clientX - lookStart.current.x) * 0.006; session.pitch = Math.max(-1.18, Math.min(1.18, session.pitch - (event.clientY - lookStart.current.y) * 0.005)); lookStart.current = { x: event.clientX, y: event.clientY } }} />
  </div>
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
  session,
  navigation,
  reducedMotion,
  station,
  sky,
  showHint,
  selection,
  onSelectProject,
  onSelectRole,
  onClearFocus,
  onExit,
  onPlaceStar,
  onCancelStarPlacement,
  onSetStarColor,
  onSaveStarMessage,
  onOpenConstellation,
}: GridHudProps) {
  const active = station >= 0 ? STATIONS[station] : null
  const selected = LANDMARKS.find(item => item.id === navigation.selected)
  const proximity = LANDMARKS.find(item => item.id === navigation.nearest)
  const districts = LANDMARKS.filter(item => item.kind === 'district')
  const distance = (item: typeof LANDMARKS[number]) => Math.round(Math.hypot(item.position[0] - session.position.x, item.position[2] - session.position.z))
  const closeDialog = () => session.update({ dialog: null })
  const placeStar = () => { if (navigation.selected !== 'sky') { session.travel('sky'); window.setTimeout(onPlaceStar, 520) } else onPlaceStar() }

  return (
    <div className={`grid-hud ${navigation.mode === 'photo' ? 'is-photo' : ''} ${navigation.transition ? 'is-transitioning' : ''}`}>
      <div className="grid-hud__top">
        <button type="button" className="grid-hud__back grid-hud__a11y-exit" onClick={onExit}>
          ← back to portfolio
        </button>
        <nav className="grid-hud__compass" aria-label="District compass">
          {districts.map(item => <button key={item.id} type="button" onClick={() => session.travel(item.id)}><span>{item.label}</span><small>{distance(item)}m</small></button>)}
        </nav>
      </div>

      <p className="sr-only" aria-live="polite">
        {active ? `${String(station).padStart(2, '0')} ${active.label} — ${active.title}` : 'traveling'}
      </p>

      <div className="grid-hud__document sr-only">
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
        <h3>All destinations</h3>
        <ul>{LANDMARKS.map(item => <li key={item.id}><button type="button" onClick={() => { session.travel(item.id); if (item.kind !== 'district') window.setTimeout(() => session.interact(item.id), 0) }}>{item.label}</button>{item.href && <> <a href={item.href}>Open case study</a></>}</li>)}</ul>
        <p><a href={`mailto:${content.profile.email}`}>Email {content.profile.name}</a> <a href={content.profile.github}>GitHub</a> <a href={content.profile.linkedin}>LinkedIn</a></p>
        <button type="button" onClick={placeStar}>Place a star in the sky</button>
        <h3>The sky</h3>
        <p>
          {sky.live
            ? `${sky.count} visitor ${sky.count === 1 ? 'star hangs' : 'stars hang'} over the city.`
            : 'The live uplink is unavailable; the local sky remains interactive.'}
          {sky.ownStar ? ' Your star can be dragged or repositioned in the Grid sky.' : ''}
        </p>
      </div>

      {navigation.dialog === 'role' && (
        <JourneyPanel
          selection={selection}
          onSelectRole={onSelectRole}
          onClearFocus={onClearFocus}
        />
      )}
      {navigation.dialog === 'project' && (
        <ProjectPanel
          selection={selection}
          onSelectProject={onSelectProject}
          onClearFocus={onClearFocus}
        />
      )}
      {navigation.selected === 'sky' && navigation.dialog !== 'map' && (
        <SkyPanel
          sky={sky}
          onPlaceStar={placeStar}
          onCancelStarPlacement={onCancelStarPlacement}
          onSetStarColor={onSetStarColor}
          onSaveStarMessage={onSaveStarMessage}
          onOpenConstellation={onOpenConstellation}
        />
      )}

      {navigation.dialog === 'map' && <section className="grid-hud__panel grid-hud__panel--map" role="dialog" aria-modal="true" aria-label="Metro map"><button type="button" onClick={closeDialog}>close</button><h2>Metro map</h2><p>{reducedMotion ? 'Choose any destination. Motion is replaced by a short fade.' : 'Fast travel uses a short fade. Press T for the guided tram.'}</p><div className="grid-hud__destinations">{LANDMARKS.map(item => <button key={item.id} type="button" onClick={() => session.travel(item.id)}>{item.label}<small>{item.kind}</small></button>)}</div></section>}
      {navigation.dialog && ['contact','market','skill'].includes(navigation.dialog) && selected && <section className="grid-hud__panel grid-hud__panel--context" role="dialog" aria-modal="true"><button type="button" onClick={closeDialog}>close</button><h2>{selected.label}</h2>{navigation.dialog === 'contact' && <p><a href={`mailto:${content.profile.email}`}>{content.profile.email}</a><br /><a href={content.profile.github}>GitHub</a><br /><a href={content.profile.linkedin}>LinkedIn</a></p>}<p>{selected.kind === 'market' ? content.beyond[selected.index ?? 0]?.bullets.join(' ') : selected.kind === 'skill' ? content.toolkit[selected.index ?? 0]?.items.join(' · ') : ''}</p></section>}

      {proximity && session.screenAnchor.visible && !navigation.dialog && navigation.mode !== 'photo' && <button className="grid-hud__proximity" type="button" onClick={() => session.interact(proximity.id)} style={{ '--grid-panel-accent': proximity.accent, left: session.screenAnchor.x, top: session.screenAnchor.y } as CSSProperties}>E · {proximity.label}</button>}
      {!reducedMotion && navigation.mode === 'walk' && <TouchControls session={session} />}

      {showHint && (
        <p className="grid-hud__hint" aria-hidden="true">
          click to look · WASD to walk · shift to move faster · T tour · M map · P photo
        </p>
      )}
    </div>
  )
}
