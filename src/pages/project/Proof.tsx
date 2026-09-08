import { useState } from 'react'
import { useMotionValueEvent, useReducedMotion } from 'framer-motion'
import { readoutAt } from '../../components/decoded/decodeMath'
import type { Project } from '../../content/story'
import { useActProgress } from './useActProgress'

/** The results: stats count up in a readout, outcomes tick in, then the links. */
export default function Proof({ project }: { project: Project }) {
  const reduce = useReducedMotion()
  const { ref, progress } = useActProgress<HTMLElement>(['start 80%', 'end 80%'])
  const [t, setT] = useState(reduce ? 1 : 0)
  useMotionValueEvent(progress, 'change', v => {
    if (!reduce) setT(Math.min(1, v * 1.6))
  })
  const okShown = Math.floor(Math.max(0, t - 0.5) * 2 * (project.story.proof.length + 1))
  const links = project.story.links ?? {}
  return (
    <section ref={ref} className="act act--proof" aria-labelledby="act-proof">
      <div className="act__pin">
        <p className="ppage__eyebrow">// PROOF</p>
        <h2 id="act-proof" className="act__heading">What it does now</h2>
        <dl className="readout">
          {project.stats.map(stat => (
            <div key={stat.label} className="readout__item">
              <dt className="readout__label">{stat.label}</dt>
              <dd className="readout__value">
                <span aria-hidden="true">{readoutAt(stat.value, Math.min(1, t * 2))}</span>
                <span className="sr-only">{stat.value}</span>
              </dd>
            </div>
          ))}
        </dl>
        <ul className="oklist">
          {project.story.proof.map((line, i) => (
            <li key={line} className={`oklist__row${i < okShown ? ' is-on' : ''}`}>
              <span className="oklist__mark" aria-hidden="true">[ok]</span> {line}
            </li>
          ))}
        </ul>
        {(links.live || links.repo) && (
          <p className="proof__links">
            {links.live && <a className="ppage__action" href={links.live} target="_blank" rel="noreferrer">[ live ]</a>}
            {links.repo && <a className="ppage__action" href={links.repo} target="_blank" rel="noreferrer">[ repo ]</a>}
          </p>
        )}
      </div>
    </section>
  )
}
