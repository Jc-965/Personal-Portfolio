import { useState, useCallback, lazy, Suspense, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Analytics } from '@vercel/analytics/react'
import Cursor from './components/Cursor'
import Background from './components/Background'
import ErrorBoundary from './components/ErrorBoundary'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import LazySection from './components/LazySection'
import Footer from './components/Footer'
import { GyroscopeProvider } from './context/GyroscopeContext'
import GyroPrompt from './components/GyroPrompt'
import { shouldUseCustomCursor } from './utils/nativeCursor'
import { storageGet, storageSet } from './utils/safeStorage'

const SketchbookOverlay = lazy(() => import('./components/SketchbookTerrain/SketchbookOverlay'))
// Only shown after the loading screen completes — lazy so its gsap dependency
// (vendor-gsap, ~28KB gz) isn't parsed on the critical path before first paint.
const TargetCursor = lazy(() => import('./components/TargetCursor'))
// Site-wide scroll engine (Lenis inertial smooth scroll + scroll signal).
// Lazy so lenis stays off the critical path; it activates a beat after first
// paint, once the main view is up.
const ScrollProvider = lazy(() => import('./scroll/ScrollProvider'))

const Journey = lazy(() => import('./components/Journey'))
const Projects = lazy(() => import('./components/Projects'))
const BeyondBuild = lazy(() => import('./components/BeyondBuild'))
const Toolkit = lazy(() => import('./components/Toolkit'))
const Constellation = lazy(() => import('./components/Constellation'))

const shouldForceSketchbookTutorial = () => {
  if (typeof window === 'undefined') return false
  const tutorialParam = new URLSearchParams(window.location.search).get('sketchTutorial')?.toLowerCase()
  return tutorialParam === '1' || tutorialParam === 'true'
}

// Rendered when a content section crashes: keeps the section (and its anchor
// id, so navbar links still land somewhere) instead of silently vanishing.
const SectionFallback = ({ id, className }: { id: string; className: string }) => (
  <section id={id} className={className}>
    <p className="section-fallback">This section failed to load — refresh to try again.</p>
  </section>
)

function App() {
  const analyticsEnabled = !['localhost', '127.0.0.1'].includes(window.location.hostname)
  const [useCustomCursor, setUseCustomCursor] = useState(() => shouldUseCustomCursor())
  const [sketchbookOpen, setSketchbookOpen] = useState(false)
  const [hasSeenSketchbook, setHasSeenSketchbook] = useState(
    () => storageGet('sketchbook-visited') === '1',
  )
  const [showSketchbookTutorial, setShowSketchbookTutorial] = useState(false)
  const [isSketchbookReturning, setIsSketchbookReturning] = useState(false)
  const returnTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    const legacyFinePointer = finePointer as MediaQueryList & {
      addListener?: (listener: (event: MediaQueryListEvent) => void) => void
      removeListener?: (listener: (event: MediaQueryListEvent) => void) => void
    }
    const update = () => setUseCustomCursor(shouldUseCustomCursor())

    update()
    window.addEventListener('resize', update, { passive: true })

    if ('addEventListener' in finePointer) {
      finePointer.addEventListener('change', update)
    } else {
      legacyFinePointer.addListener?.(update)
    }

    return () => {
      window.removeEventListener('resize', update)
      if ('removeEventListener' in finePointer) {
        finePointer.removeEventListener('change', update)
      } else {
        legacyFinePointer.removeListener?.(update)
      }
    }
  }, [])

  const openSketchbook = useCallback(() => {
    const seen = hasSeenSketchbook || storageGet('sketchbook-visited') === '1'
    const forceTutorial = shouldForceSketchbookTutorial()
    setIsSketchbookReturning(false)
    if (returnTimerRef.current !== null) {
      window.clearTimeout(returnTimerRef.current)
      returnTimerRef.current = null
    }
    setShowSketchbookTutorial(forceTutorial || !seen)
    setHasSeenSketchbook(true)
    storageSet('sketchbook-visited', '1')
    setSketchbookOpen(true)
  }, [hasSeenSketchbook])

  const [sketchbookExiting, setSketchbookExiting] = useState(false)
  const closeSketchbook = useCallback(() => {
    setSketchbookExiting(true)
    document.documentElement.classList.add('sketchbook-returning')
  }, [])
  const onExitAnimationDone = useCallback(() => {
    setSketchbookExiting(false)
    setSketchbookOpen(false)
    setIsSketchbookReturning(true)
    if (returnTimerRef.current !== null) {
      window.clearTimeout(returnTimerRef.current)
    }
    returnTimerRef.current = window.setTimeout(() => {
      setIsSketchbookReturning(false)
      returnTimerRef.current = null
    }, 900)
  }, [])

  // Native drag-and-drop (e.g. dragging an image) suppresses mousemove, which
  // freezes the custom cursor mid-drag. Cancelling dragstart keeps the pointer
  // in normal mouse-move mode so the cursor keeps following.
  useEffect(() => {
    const preventDrag = (e: DragEvent) => e.preventDefault()
    document.addEventListener('dragstart', preventDrag)
    return () => document.removeEventListener('dragstart', preventDrag)
  }, [])

  // Hidden easter egg: the Konami code unlocks the secret portfolio. No button.
  useEffect(() => {
    const sequence = [
      'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
      'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a',
    ]
    let progress = 0
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      progress = key === sequence[progress] ? progress + 1 : (key === sequence[0] ? 1 : 0)
      if (progress === sequence.length) {
        progress = 0
        openSketchbook()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openSketchbook])

  useEffect(() => {
    if (hasSeenSketchbook) {
      document.documentElement.classList.add('sketchbook-seen')
    } else {
      document.documentElement.classList.remove('sketchbook-seen')
    }
    return () => document.documentElement.classList.remove('sketchbook-seen')
  }, [hasSeenSketchbook])

  useEffect(() => {
    if (isSketchbookReturning) {
      document.documentElement.classList.add('sketchbook-returning')
    } else {
      document.documentElement.classList.remove('sketchbook-returning')
    }
    return () => {
      document.documentElement.classList.remove('sketchbook-returning')
      if (returnTimerRef.current !== null) {
        window.clearTimeout(returnTimerRef.current)
        returnTimerRef.current = null
      }
    }
  }, [isSketchbookReturning])

  return (
    <GyroscopeProvider>
      {useCustomCursor && <Cursor />}
      {useCustomCursor && (
        <Suspense fallback={null}>
          <TargetCursor
            targetSelector='a:not([data-target-cursor="off"]), button, input, textarea, [data-cursor]'
            spinDuration={2}
            hideDefaultCursor
            parallaxOn
            hoverDuration={0.2}
          />
        </Suspense>
      )}
      <div className="vintage-overlay" />
      <motion.div
        key="main"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35 }}
      >
            <ErrorBoundary label="Background">
              <Background />
            </ErrorBoundary>
            <Suspense fallback={null}>
              <ScrollProvider />
            </Suspense>
            <a href="#main-content" className="skip-link">Skip to content</a>
            <Navbar />
            <main id="main-content">
              <Hero />
              <ErrorBoundary label="Journey" fallback={<SectionFallback id="journey" className="section journey" />}><LazySection id="journey" className="section journey" component={Journey} /></ErrorBoundary>
              <ErrorBoundary label="Projects" fallback={<SectionFallback id="projects" className="section projects section--wide" />}><LazySection id="projects" className="section projects section--wide" component={Projects} /></ErrorBoundary>
              <ErrorBoundary label="BeyondBuild" fallback={<SectionFallback id="life" className="section beyond" />}><LazySection id="life" className="section beyond" component={BeyondBuild} /></ErrorBoundary>
              <ErrorBoundary label="Toolkit" fallback={<SectionFallback id="skills" className="section toolkit" />}><LazySection id="skills" className="section toolkit" component={Toolkit} /></ErrorBoundary>
              <ErrorBoundary label="Constellation" fallback={<SectionFallback id="constellation" className="section constellation-section" />}><LazySection id="constellation" className="section constellation-section" component={Constellation} /></ErrorBoundary>
            </main>
            <Footer />
            <GyroPrompt />
      </motion.div>

      {(sketchbookOpen || sketchbookExiting) && (
        <ErrorBoundary label="Sketchbook" fallback={null}>
          <Suspense fallback={null}>
            <SketchbookOverlay
              onClose={closeSketchbook}
              isExiting={sketchbookExiting}
              onExitAnimationDone={onExitAnimationDone}
              showTutorialOnStart={showSketchbookTutorial}
            />
          </Suspense>
        </ErrorBoundary>
      )}
      {analyticsEnabled && <Analytics />}
    </GyroscopeProvider>
  )
}

export default App
