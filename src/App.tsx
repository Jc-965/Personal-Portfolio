import { useState, useCallback, lazy, Suspense, useEffect, useRef } from 'react'
import { LazyMotion, domAnimation, m } from 'framer-motion'
import Cursor from './components/Cursor'
import Background from './components/Background'
import ErrorBoundary from './components/ErrorBoundary'
import ScrollRail from './components/ScrollRail'
import HomePage from './pages/HomePage'
import { GyroscopeProvider } from './context/GyroscopeContext'
import { useRoute } from './hooks/useRoute'
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
const Analytics = lazy(() =>
  import('@vercel/analytics/react').then(({ Analytics: AnalyticsComponent }) => ({
    default: AnalyticsComponent,
  })),
)

// A project's own page. Lazy: the index never pays for it until a row is opened.
const ProjectPage = lazy(() => import('./pages/ProjectPage'))

const shouldForceSketchbookTutorial = () => {
  if (typeof window === 'undefined') return false
  const tutorialParam = new URLSearchParams(window.location.search).get('sketchTutorial')?.toLowerCase()
  return tutorialParam === '1' || tutorialParam === 'true'
}

function App() {
  const route = useRoute()
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

    if ('addEventListener' in finePointer) {
      finePointer.addEventListener('change', update)
    } else {
      legacyFinePointer.addListener?.(update)
    }

    return () => {
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
    <LazyMotion features={domAnimation} strict>
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
      <m.div
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
            <ScrollRail />
            {route.page === 'project' ? (
              <ErrorBoundary
                label="ProjectPage"
                fallback={<main id="main-content" className="ppage ppage--missing"><p className="section-fallback">This page failed to load. Refresh to try again.</p></main>}
              >
                <Suspense fallback={<div className="ppage ppage--loading" aria-hidden="true" />}>
                  <ProjectPage id={route.id} />
                </Suspense>
              </ErrorBoundary>
            ) : (
              <HomePage scrollToProjects={route.page === 'projects'} />
            )}
      </m.div>

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
      {analyticsEnabled && (
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
      )}
      </GyroscopeProvider>
    </LazyMotion>
  )
}

export default App
