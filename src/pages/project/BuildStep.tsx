import { useTransform, useReducedMotion } from 'framer-motion'
import Decoded from '../../components/decoded/Decoded'
import { coverOf, type Project, type StoryStep } from '../../content/story'
import { useActProgress } from './useActProgress'

/** One step of the build: copy pinned beside a screenshot that resolves from ASCII as it arrives. */
export default function BuildStep({ project, step }: { project: Project; step: StoryStep }) {
  const reduce = useReducedMotion()
  const { ref, progress } = useActProgress<HTMLElement>()
  const resolve = useTransform(progress, [0.05, 0.3, 0.7, 0.95], [0.05, 1, 1, 0.1])
  const image = step.image !== undefined ? project.images?.[step.image] : undefined
  const cover = coverOf(project)
  return (
    <section ref={ref} className={`act act--build${image ? '' : ' act--build-bare'}`}>
      <div className="act__pin build__grid">
        <div className="build__copy">
          <p className="ppage__eyebrow">// BUILD</p>
          <p className="build__step">{step.step}</p>
        </div>
        {image ? (
          <div className={`build__screen${cover.portrait ? ' build__screen--phone' : ''}`}>
            <Decoded src={image.src} alt={image.alt} aspect={image.aspect} progress={reduce ? 1 : resolve} accent={project.accent} />
            <p className="build__label" aria-hidden="true">{image.label}</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
