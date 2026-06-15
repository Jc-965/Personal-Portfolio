import { useState, useCallback, lazy, Suspense, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Analytics } from '@vercel/analytics/react'
import LoadingScreen from './components/LoadingScreen'
import Cursor from './components/Cursor'
import Background from './components/Background'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import LazySection from './components/LazySection'
import Footer from './components/Footer'
import { GyroscopeProvider } from './context/GyroscopeContext'
import GyroPrompt from './components/GyroPrompt'
import { shouldUseCustomCursor } from './utils/nativeCursor'

const SketchbookOverlay = lazy(() => import('./components/SketchbookTerrain/SketchbookOverlay'))
// Only shown after the loading screen completes — lazy so its gsap dependency
// (vendor-gsap, ~28KB gz) isn't parsed on the critical path before first paint.
const TargetCursor = lazy(() => import('./components/TargetCursor'))
// Site-wide scroll engine (Lenis inertial smooth scroll + scroll signal).
// Lazy so lenis stays off the critical path; it activates a beat after first
// paint, once the main view is up.
const ScrollProvider = lazy(() => import('./scroll/ScrollProvider'))

const loadJourney = () => import('./components/Journey')
const loadProjects = () => import('./components/Projects')
const loadBeyondBuild = () => import('./components/BeyondBuild')
const loadToolkit = () => import('./components/Toolkit')
const loadConstellation = () => import('./components/Constellation')

const shouldForceSketchbookTutorial = () => {
  if (typeof window === 'undefined') return false
  const tutorialParam = new URLSearchParams(window.location.search).get('sketchTutorial')?.toLowerCase()
  return tutorialParam === '1' || tutorialParam === 'true'
}

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const [useCustomCursor, setUseCustomCursor] = useState(() => shouldUseCustomCursor())
  const [sketchbookOpen, setSketchbookOpen] = useState(false)
  const [hasSeenSketchbook, setHasSeenSketchbook] = useState(false)
  const [showSketchbookTutorial, setShowSketchbookTutorial] = useState(false)
  const [isSketchbookReturning, setIsSketchbookReturning] = useState(false)
  const returnTimerRef = useRef<number | null>(null)
  const onLoadingComplete = useCallback(() => setIsLoading(false), [])

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
    const seen = hasSeenSketchbook || localStorage.getItem('sketchbook-visited') === '1'
    const forceTutorial = shouldForceSketchbookTutorial()
    setIsSketchbookReturning(false)
    if (returnTimerRef.current !== null) {
      window.clearTimeout(returnTimerRef.current)
      returnTimerRef.current = null
    }
    setShowSketchbookTutorial(forceTutorial || !seen)
    setHasSeenSketchbook(true)
    localStorage.setItem('sketchbook-visited', '1')
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

  useEffect(() => {
    const seen = localStorage.getItem('sketchbook-visited') === '1'
    setHasSeenSketchbook(seen)
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
      {!isLoading && useCustomCursor && (
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
      <AnimatePresence mode="wait">
        {isLoading ? (
          <LoadingScreen key="loading" onComplete={onLoadingComplete} />
        ) : (
          <motion.div
            key="main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <Background />
            <Suspense fallback={null}>
              <ScrollProvider />
            </Suspense>
            <Navbar />
            <main>
              <Hero />
              <LazySection id="journey" className="section journey" load={loadJourney} />
              <LazySection id="projects" className="section projects section--wide" load={loadProjects} />
              <LazySection id="life" className="section beyond" load={loadBeyondBuild} />
              <LazySection id="skills" className="section toolkit" load={loadToolkit} />
              <LazySection id="constellation" className="section constellation-section" load={loadConstellation} />
            </main>
            <Footer />
            <GyroPrompt />
          </motion.div>
        )}
      </AnimatePresence>

      {(sketchbookOpen || sketchbookExiting) && (
        <Suspense fallback={null}>
          <SketchbookOverlay
            onClose={closeSketchbook}
            isExiting={sketchbookExiting}
            onExitAnimationDone={onExitAnimationDone}
            showTutorialOnStart={showSketchbookTutorial}
          />
        </Suspense>
      )}
      <Analytics />
    </GyroscopeProvider>
  )
}

export default App
