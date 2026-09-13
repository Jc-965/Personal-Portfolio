import { Suspense, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'

interface LazySectionProps {
  id: string
  className: string
  component: ComponentType
  fallback?: ReactNode
  margin?: string
  /**
   * Mount immediately for crawler user agents. False keeps the viewport gate
   * for sections with nothing to index, such as the live constellation.
   */
  crawlerEager?: boolean
}

const sectionPlaceholder = <div className="section__placeholder" aria-hidden="true" />

// Search crawlers render the page at a fixed tall viewport without scrolling,
// so a section gated on IntersectionObserver can remain a placeholder in the
// indexed HTML. Crawler user agents mount every section at first render.
const isCrawler =
  typeof navigator !== 'undefined' && /bot|crawl|spider|slurp|bingpreview/i.test(navigator.userAgent)

export default function LazySection({
  id,
  className,
  component: Component,
  fallback,
  margin = '200px 0px',
  crawlerEager = true,
}: LazySectionProps) {
  const ref = useRef<HTMLElement>(null)
  const [inView, setInView] = useState(
    () => (crawlerEager && isCrawler) || typeof IntersectionObserver === 'undefined',
  )

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
