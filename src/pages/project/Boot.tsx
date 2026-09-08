import { useEffect, useState, type RefObject } from 'react'
import { useReducedMotion } from 'framer-motion'
import Printed from '../../components/hero/Printed'
import type { Project } from '../../content/story'

const CHAR_MS = 13
const LINE_PAUSE_MS = 90

const bootLines = (project: Project) => [
  `> open ~/projects/${project.id}`,
  `> role: ${project.story.role.toLowerCase()}`,
  `> assets: ${project.images?.length ?? 0} screens ... ok`,
  `> stack: ${project.tech.join(', ').toLowerCase()}`,
]

/** The opening screen: a boot log types itself, then the name burns in. */
export default function Boot({ project, titleRef }: { project: Project; titleRef: RefObject<HTMLHeadingElement | null> }) {
  const reduce = useReducedMotion()
  const lines = bootLines(project)
  const total = lines.reduce((n, line) => n + line.length, 0)
  const [typed, setTyped] = useState(reduce ? total : 0)

  useEffect(() => {
    if (reduce) return
    const ends = new Set<number>()
    bootLines(project).reduce((sum, line) => { ends.add(sum + line.length); return sum + line.length }, 0)
    const last = Math.max(...ends)
    let count = 0
    let timer = 0
    const tick = () => {
      count += 1
      setTyped(count)
      if (count >= last) return
      timer = window.setTimeout(tick, ends.has(count) ? LINE_PAUSE_MS : CHAR_MS)
    }
    timer = window.setTimeout(tick, 300)
    return () => window.clearTimeout(timer)
  }, [project, reduce])

  const done = typed >= total
  // Where each line starts in the typed count, so a line shows only its own share.
  const starts = lines.map((_, i) => lines.slice(0, i).reduce((n, line) => n + line.length, 0))
  return (
    <section className="act act--boot" aria-labelledby="ppage-title">
      <pre className="boot__log" aria-hidden="true">
        {lines.map((line, i) => {
          const shown = Math.max(0, Math.min(line.length, typed - starts[i]))
          return (
            <div key={i} className="boot__line">
              {line.slice(0, shown)}
              {shown > 0 && shown < line.length ? <span className="boot__caret" /> : null}
            </div>
          )
        })}
      </pre>
      <div className={`boot__title${done ? ' is-on' : ''}`}>
        <h1 id="ppage-title" className="boot__name" ref={titleRef} tabIndex={-1}>
          {done ? <Printed text={project.name} delay={0} speed={40} /> : <span className="sr-only">{project.name}</span>}
        </h1>
        <p className="boot__tag">{project.tag}</p>
      </div>
    </section>
  )
}
