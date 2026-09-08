import { useMemo, type MouseEvent } from 'react'
import Decoded from '../../components/decoded/Decoded'
import { terminalCover } from '../../components/terminalCover'
import { coverOf, type Project } from '../../content/story'
import { projectPath } from '../../router'
import { isPlainLeftClick, navigate } from '../../hooks/useRoute'

/** The close: the next project, held, with its cover still mostly characters. */
export default function NextPanel({ project }: { project: Project }) {
  const cover = coverOf(project)
  const src = useMemo(
    () => cover.src ?? terminalCover(cover.terminal ?? [], project.accent),
    [cover.src, cover.terminal, project.accent],
  )
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainLeftClick(event)) return
    event.preventDefault()
    navigate(projectPath(project.id))
  }
  return (
    <section className="act act--next">
      <a className="next" href={projectPath(project.id)} onClick={onClick}>
        <div className="next__copy">
          <p className="ppage__eyebrow">// NEXT</p>
          <p className="next__cmd">&gt; open ~/projects/{project.id}</p>
          <h2 className="next__name">{project.name}</h2>
          <p className="next__blurb">{project.blurb}</p>
          <span className="next__open" aria-hidden="true">[ continue ]</span>
        </div>
        <div className={`next__cover${cover.portrait ? ' next__cover--phone' : ''}`}>
          <Decoded src={src} alt={cover.alt} aspect={cover.aspect} progress={0.15} accent={project.accent} interactive={false} cell={8} />
        </div>
      </a>
    </section>
  )
}
