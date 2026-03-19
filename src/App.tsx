import { useState, useCallback, lazy, Suspense, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import LoadingScreen from './components/LoadingScreen'
import Cursor from './components/Cursor'
import TargetCursor from './components/TargetCursor'
import Background from './components/Background'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import LazySection from './components/LazySection'
import Footer from './components/Footer'
import { GyroscopeProvider } from './context/GyroscopeContext'
import GyroPrompt from './components/GyroPrompt'

const SketchbookOverlay = lazy(() => import('./components/SketchbookTerrain/SketchbookOverlay'))
const SketchPortfolioOverlay = lazy(() => import('./components/SketchbookTerrain/SketchPortfolioOverlay'))

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const [sketchbookOpen, setSketchbookOpen] = useState(false)
  const [secretPortfolioOpen, setSecretPortfolioOpen] = useState(false)
  const [hasSeenSketchbook, setHasSeenSketchbook] = useState(false)
  const [showSketchbookTutorial, setShowSketchbookTutorial] = useState(false)
  const [isSketchbookReturning, setIsSketchbookReturning] = useState(false)
  const returnTimerRef = useRef<number | null>(null)
  const onLoadingComplete = useCallback(() => setIsLoading(false), [])

  const openSketchbook = useCallback(() => {
    const seen = hasSeenSketchbook || localStorage.getItem('sketchbook-visited') === '1'
    setIsSketchbookReturning(false)
    if (returnTimerRef.current !== null) {
      window.clearTimeout(returnTimerRef.current)
      returnTimerRef.current = null
    }
    setShowSketchbookTutorial(!seen)
    setHasSeenSketchbook(true)
    localStorage.setItem('sketchbook-visited', '1')
    setSketchbookOpen(true)
  }, [hasSeenSketchbook])
  const openSecretPortfolio = useCallback(() => {
    setSecretPortfolioOpen(true)
  }, [])
  const closeSecretPortfolio = useCallback(() => {
    setSecretPortfolioOpen(false)
  }, [])
  const [sketchbookExiting, setSketchbookExiting] = useState(false)
  const closeSketchbook = useCallback(() => {
    setSecretPortfolioOpen(false)
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
      <Cursor />
      {!isLoading && (
        <TargetCursor
          targetSelector="a, button, input, textarea, [data-cursor]"
          spinDuration={2}
          hideDefaultCursor={false}
          parallaxOn
          hoverDuration={0.2}
        />
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
            <Navbar />
            <main>
              <Hero />
              <LazySection id="journey" className="section journey" load={() => import('./components/Journey')} />
              <LazySection id="projects" className="section projects" load={() => import('./components/Projects')} />
              <LazySection id="life" className="section beyond" load={() => import('./components/BeyondBuild')} />
              <LazySection id="skills" className="section toolkit" load={() => import('./components/Toolkit')} />
              <LazySection id="constellation" className="section constellation-section" load={() => import('./components/Constellation')} />
            </main>
            <Footer onOpenSketchbook={openSketchbook} hasSeenSketchbook={hasSeenSketchbook} />
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
            onOpenSecretPortfolio={openSecretPortfolio}
            showTutorialOnStart={showSketchbookTutorial}
          />
        </Suspense>
      )}
      {secretPortfolioOpen && (
        <Suspense fallback={null}>
          <SketchPortfolioOverlay onClose={closeSecretPortfolio} />
        </Suspense>
      )}
    </GyroscopeProvider>
  )
}

export default App
