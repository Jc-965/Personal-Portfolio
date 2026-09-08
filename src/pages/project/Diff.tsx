import { useState } from 'react'
import { useMotionValueEvent, useReducedMotion } from 'framer-motion'
import type { Project } from '../../content/story'
import { useActProgress } from './useActProgress'

/** The problem, read as a diff: what was, then what had to be true. Lines land with scroll. */
export default function Diff({ project }: { project: Project }) {
  const reduce = useReducedMotion()
  const { ref, progress } = useActProgress<HTMLElement>(['start 85%', 'end 70%'])
  const rows = [
    ...project.story.problem.was.map(text => ({ sign: '-', text })),
    ...project.story.problem.needed.map(text => ({ sign: '+', text })),
  ]
  const [shown, setShown] = useState(reduce ? rows.length : 0)
  useMotionValueEvent(progress, 'change', v => {
    if (!reduce) setShown(Math.min(rows.length, Math.floor(v * (rows.length + 1))))
  })
  return (
    <section ref={ref} className="act act--problem" aria-labelledby="act-problem">
      <div className="act__pin">
        <p className="ppage__eyebrow">// PROBLEM</p>
        <h2 id="act-problem" className="act__heading">What had to change</h2>
        <pre className="diff">
          {rows.map((row, i) => (
            <div key={i} className={`diff__row diff__row--${row.sign === '-' ? 'was' : 'needed'}${i < shown ? ' is-on' : ''}`}>
              <span className="diff__sign">{row.sign}</span>{row.text}
            </div>
          ))}
        </pre>
      </div>
    </section>
  )
}
