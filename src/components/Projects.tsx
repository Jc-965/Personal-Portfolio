import { useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { m, useInView, useReducedMotion } from 'framer-motion'
import Decoded from './decoded/Decoded'
import { terminalCover } from './terminalCover'
import { coverOf, projects, type Project } from '../content/story'
import { projectPath } from '../router'
import { isPlainLeftClick, openProject } from '../hooks/useRoute'

/** One row of the ledger: cover, blurb, tags, one stat. The whole row opens the project. */
function LedgerRow({ project }: { project: Project }) {
  const [hover, setHover] = useState(false)
  const reduce = useReducedMotion()
  const cover = coverOf(project)
  const src = useMemo(
    () => cover.src ?? terminalCover(cover.terminal ?? [], project.accent),
    [cover.src, cover.terminal, project.accent],
  )
  const stat = project.stats[0]
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainLeftClick(event)) return
    event.preventDefault()
    openProject(project.id)
  }
  return (
    <li className="ledger__row" style={{ '--project-accent': project.accent, '--project-accent-rgb': project.accentRgb } as CSSProperties}>
      <a
        className="ledger__link"
        href={projectPath(project.id)}
        data-row={project.id}
        onClick={onClick}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
      >
        <div className={`ledger__frame${cover.portrait ? ' ledger__frame--phone' : ''}`}>
          <div className="ledger__chrome" aria-hidden="true">
            <span>~/projects/{project.id}</span>
            <span>[]</span>
          </div>
          <Decoded
            className="ledger__cover"
            src={src}
            alt={cover.alt}
            aspect={cover.aspect}
            progress={hover && !reduce ? 0.25 : 1}
            accent={project.accent}
            interactive={false}
            cell={8}
          />
        </div>
        <div className="ledger__copy">
          <h3 className="ledger__name">{project.name}</h3>
          <p className="ledger__blurb">{project.blurb}</p>
          <ul className="ledger__tags" aria-label="Built with">
            {project.tech.map(t => <li key={t}>{t}</li>)}
          </ul>
          <p className="ledger__readout">
            <span className="ledger__stat">{stat.value}</span>
            <span className="ledger__stat-label">{stat.label}</span>
            <span className="ledger__open" aria-hidden="true">[ open ]</span>
          </p>
        </div>
      </a>
    </li>
  )
}

export default function Projects() {
  const headerRef = useRef(null)
  const headerInView = useInView(headerRef, { once: true, margin: '-50px' })
  return (
    <>
      <m.header
        ref={headerRef}
        className="section__header"
        initial={{ opacity: 0, y: 20 }}
        animate={headerInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.35 }}
      >
        <p className="section__eyebrow">
          <span className="section__eyebrow-icon">&#9670;</span>
          Projects
        </p>
        <h2>Building software that solves meaningful problems</h2>
      </m.header>
      <ol className="ledger">
        {projects.map(p => <LedgerRow key={p.id} project={p} />)}
      </ol>
    </>
  )
}
