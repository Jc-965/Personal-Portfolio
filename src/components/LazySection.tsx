import { Suspense, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'

interface LazySectionProps {
  id: string
  className: string
  component: ComponentType
  fallback?: ReactNode
  margin?: string
}

const sectionPlaceholder = <div className="section__placeholder" aria-hidden="true" />

export default function LazySection({
  id,
  className,
  component: Component,
  fallback,
  margin = '200px 0px',
}: LazySectionProps) {
  const ref = useRef<HTMLElement>(null)
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (inView || !ref.current) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setInView(true)
        observer.disconnect()
      },
      { rootMargin: margin },
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [inView, margin])

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
