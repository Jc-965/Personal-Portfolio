import { lazy, useEffect } from 'react'
import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import LazySection from '../components/LazySection'
import ErrorBoundary from '../components/ErrorBoundary'
import Footer from '../components/Footer'
import GyroPrompt from '../components/GyroPrompt'
import { lenisRef } from '../scroll/lenisRef'
import type { HomeReturn } from '../hooks/useRoute'

const Journey = lazy(() => import('../components/Journey'))
const Projects = lazy(() => import('../components/Projects'))
const BeyondBuild = lazy(() => import('../components/BeyondBuild'))
const Toolkit = lazy(() => import('../components/Toolkit'))
const Constellation = lazy(() => import('../components/Constellation'))

// Rendered when a content section crashes: keeps the section (and its anchor
// id, so navbar links still land somewhere) instead of silently vanishing.
const SectionFallback = ({ id, className }: { id: string; className: string }) => (
  <section id={id} className={className}>
    <p className="section-fallback">This section failed to load. Refresh to try again.</p>
  </section>
)

const scrollTo = (target: HTMLElement | number, offset = 0) => {
  if (lenisRef.current) lenisRef.current.scrollTo(target, { immediate: true, offset })
  else if (typeof target === 'number') window.scrollTo(0, target)
  else window.scrollTo(0, target.getBoundingClientRect().top + window.scrollY + offset)
}

/**
 * The single scrolling page. When it mounts on the way back from a project,
 * it returns the reader to the row they opened, once that row exists again.
 */
export default function HomePage({ scrollToProjects = false }: { scrollToProjects?: boolean }) {
  useEffect(() => {
    if (scrollToProjects) {
      const section = document.getElementById('projects')
      if (section) scrollTo(section, -80)
      return
    }
    const state = window.history.state as Partial<HomeReturn> | null
    if (typeof state?.scrollY !== 'number') return
    scrollTo(state.scrollY)
    if (!state.row) return
    // The projects section loads lazily, so wait for the row to come back.
    let tries = 0
    const timer = window.setInterval(() => {
      const row = document.querySelector<HTMLElement>(`[data-row="${state.row}"]`)
      tries += 1
      if (!row && tries < 25) return
      window.clearInterval(timer)
      if (!row) return
      scrollTo(row, -(window.innerHeight - row.offsetHeight) / 2)
      row.focus({ preventScroll: true })
    }, 80)
    return () => window.clearInterval(timer)
  }, [scrollToProjects])

  return (
    <>
      <Navbar />
      <main id="main-content">
        <Hero />
        <ErrorBoundary label="Journey" fallback={<SectionFallback id="journey" className="section journey" />}><LazySection id="journey" className="section journey" component={Journey} margin="1600px 0px" /></ErrorBoundary>
        <ErrorBoundary label="Projects" fallback={<SectionFallback id="projects" className="section projects section--wide" />}><LazySection id="projects" className="section projects section--wide" component={Projects} margin="80px 0px" /></ErrorBoundary>
        <ErrorBoundary label="BeyondBuild" fallback={<SectionFallback id="life" className="section beyond" />}><LazySection id="life" className="section beyond" component={BeyondBuild} /></ErrorBoundary>
        <ErrorBoundary label="Toolkit" fallback={<SectionFallback id="skills" className="section toolkit" />}><LazySection id="skills" className="section toolkit" component={Toolkit} /></ErrorBoundary>
        <ErrorBoundary label="Constellation" fallback={<SectionFallback id="constellation" className="section constellation-section" />}><LazySection id="constellation" className="section constellation-section" component={Constellation} margin="1200px 0px" /></ErrorBoundary>
      </main>
      <Footer />
      <GyroPrompt />
    </>
  )
}
