import { useRef } from 'react'
import { useInView } from 'framer-motion'
import { Suspense, lazy, type LazyExoticComponent, type ComponentType } from 'react'

interface LazySectionProps {
  id: string
  className: string
  load: () => Promise<{ default: ComponentType }>
  fallback?: React.ReactNode
}

const sectionPlaceholder = <div className="section__placeholder" aria-hidden="true" />

export default function LazySection({ id, className, load, fallback }: LazySectionProps) {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '200px 0px' })

  const LazyComponent = lazy(load) as LazyExoticComponent<ComponentType>

  return (
    <section id={id} className={className} ref={ref}>
      {inView ? (
        <Suspense fallback={fallback ?? sectionPlaceholder}>
          <LazyComponent />
        </Suspense>
      ) : (
        sectionPlaceholder
      )}
    </section>
  )
}
