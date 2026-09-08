import { useEffect, useRef, type CSSProperties } from 'react'
import { projects } from '../content/story'
import ProjectBar from './project/ProjectBar'
import Boot from './project/Boot'
import Diff from './project/Diff'
import BuildStep from './project/BuildStep'
import Proof from './project/Proof'
import NextPanel from './project/NextPanel'

const SITE_TITLE = 'Jesse Chen | Software Engineer Portfolio'

/** A project's own page: boot, problem, build, proof, next. */
export default function ProjectPage({ id }: { id: string }) {
  const index = projects.findIndex(p => p.id === id)
  const project = index >= 0 ? projects[index] : undefined
  const next = projects[(Math.max(index, 0) + 1) % projects.length]
  const titleRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = project ? `${project.name} | Jesse Chen` : 'Not found | Jesse Chen'
    titleRef.current?.focus({ preventScroll: true })
    return () => { document.title = SITE_TITLE }
  }, [project])

  if (!project) {
    return (
      <main id="main-content" className="ppage ppage--missing">
        <div className="ppage__missing">
          <p className="ppage__eyebrow">// NOT FOUND</p>
          <h1 ref={titleRef} tabIndex={-1}>zsh: no such project: {id}</h1>
          <a className="ppage__action" href="/projects/">[ back to the index ]</a>
        </div>
      </main>
    )
  }

  return (
    <div className="ppage" style={{ '--project-accent': project.accent, '--project-accent-rgb': project.accentRgb } as CSSProperties}>
      <ProjectBar id={project.id} nextId={next.id} nextName={next.name} />
      <main id="main-content" className="ppage__main">
        <Boot project={project} titleRef={titleRef} />
        <div className="ppage__silence" aria-hidden="true" />
        <Diff project={project} />
        {project.story.build.map((step, i) => <BuildStep key={i} project={project} step={step} />)}
        <Proof project={project} />
        <NextPanel project={next} />
      </main>
    </div>
  )
}
