import { useRef } from 'react'
import { useInView } from 'framer-motion'
import { Suspense, type ComponentType } from 'react'

interface LazySectionProps {
  id: string
  className: string
  component: ComponentType
  fallback?: React.ReactNode
}

const sectionPlaceholder = <div className="section__placeholder" aria-hidden="true" />

export default function LazySection({ id, className, component: Component, fallback }: LazySectionProps) {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '200px 0px' })

  return (
    <section id={id} className={className} ref={ref}>
      {inView ? (
        <Suspense fallback={fallback ?? sectionPlaceholder}>
          <Component />
        </Suspense>
      ) : (
        sectionPlaceholder
      )}
    </section>
  )
}
