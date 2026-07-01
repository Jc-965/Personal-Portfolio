import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Same-session revisits (e.g. a refresh) skip straight to the site — the boot
// sequence is a first-impression moment, not a toll booth. sessionStorage can
// throw in lockdown/private modes; treat that as "not seen".
const INTRO_SEEN_KEY = 'intro-played'
const introAlreadyPlayed = () => {
  try {
    return sessionStorage.getItem(INTRO_SEEN_KEY) === '1'
  } catch {
    return false
  }
}
const markIntroPlayed = () => {
  try {
    sessionStorage.setItem(INTRO_SEEN_KEY, '1')
  } catch {
    // best-effort
  }
}

// Lazy so the heavy Three.js/postprocessing bundle (vendor-3d) does not block
// first paint of the loading screen. The dithered backdrop sits behind the
// terminal content and fades in once the chunk arrives.
const Dither = lazy(() => import('./Dither'))

interface LoadingScreenProps {
  onComplete: () => void
}

export default function LoadingScreen({ onComplete }: LoadingScreenProps) {
  // Captured once on mount, before we mark it played. Starting in 'complete'
  // means a skipped intro never paints at all — no flash on refresh.
  const skipIntroRef = useRef(introAlreadyPlayed())
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<'init' | 'loading' | 'complete'>(
    skipIntroRef.current ? 'complete' : 'init'
  )
  const [logs, setLogs] = useState<string[]>([])
  // Defer mounting the WebGL Dither backdrop until AFTER the loading-screen
  // text has painted. Otherwise the dynamic import() of the 764KB three.js
  // bundle fires on first render and its parse janks the main thread right
  // when First Contentful Paint should happen, delaying FCP by ~1.4s.
  const [showDither, setShowDither] = useState(false)
  const skippedRef = useRef(false)

  const logMessages = [
    '> Initializing system...',
    '> Loading modules...',
    '> Establishing connections...',
    '> Compiling assets...',
    '> Verifying integrity...',
    '> System ready.',
  ]

  const skip = useCallback(() => {
    if (skippedRef.current) return
    skippedRef.current = true
    setPhase('complete')
    setTimeout(onComplete, 100)
  }, [onComplete])

  useEffect(() => {
    // Refresh mid-session? The screen never rendered (phase starts 'complete');
    // just hand off to the site.
    if (skipIntroRef.current) {
      skippedRef.current = true
      const handoff = setTimeout(onComplete, 50)
      return () => clearTimeout(handoff)
    }
    markIntroPlayed()
    // Mount the Dither backdrop one tick after first paint so the terminal
    // content paints first and three.js loads in the background.
    const ditherTimer = setTimeout(() => setShowDither(true), 80)

    const timer1 = setTimeout(() => setPhase('loading'), 100)

    // Pacing: logs finish typing at ~1.6s, the bar lands around ~2.4s, then a
    // short beat before the fade — a deliberate boot sequence, not a flash.
    let logIndex = 0
    const logInterval = setInterval(() => {
      if (logIndex < logMessages.length) {
        setLogs(prev => [...prev, logMessages[logIndex]])
        logIndex++
      }
    }, 260)

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval)
          clearInterval(logInterval)
          if (!skippedRef.current) {
            setPhase('complete')
            setTimeout(onComplete, 350)
          }
          return 100
        }
        const increment = Math.random() * 6 + 3
        return Math.min(100, prev + increment)
      })
    }, 140)

    return () => {
      clearTimeout(ditherTimer)
      clearTimeout(timer1)
      clearInterval(interval)
      clearInterval(logInterval)
    }
  }, [onComplete, skip])

  return (
    <AnimatePresence>
      {phase !== 'complete' && (
        <motion.div
          className="loading-screen"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          onClick={skip}
        >
          <div className="loading-screen__dither" aria-hidden="true">
            {showDither && (
            <Suspense fallback={null}>
              <Dither
                waveColor={[0.06, 0.24, 0.34]}
                disableAnimation={window.matchMedia('(prefers-reduced-motion: reduce)').matches}
                enableMouseInteraction
                mouseRadius={0.10}
                colorNum={5}
                pixelSize={1.35}
                waveAmplitude={0.58}
                waveFrequency={3.8}
                waveSpeed={0.03}
              />
            </Suspense>
            )}
          </div>

          {/* Subtle grid background */}
          <div className="loading-screen__grid" />

          <div className="loading-screen__content">
            {/* Terminal-style header */}
            <motion.div
              className="loading-screen__terminal"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className="loading-screen__terminal-bar">
                <span className="loading-screen__terminal-dot" />
                <span className="loading-screen__terminal-dot" />
                <span className="loading-screen__terminal-dot" />
                <span className="loading-screen__terminal-title">system_init</span>
              </div>
              <div className="loading-screen__terminal-body">
                {logs.map((log, i) => (
                  <motion.div
                    key={i}
                    className="loading-screen__log"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {log}
                  </motion.div>
                ))}
                <span className="loading-screen__cursor">_</span>
              </div>
            </motion.div>

            {/* Progress section */}
            <motion.div
              className="loading-screen__progress-section"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <div className="loading-screen__label">
                <span>LOADING</span>
                <span className="loading-screen__percent">{Math.round(progress)}%</span>
              </div>
              <div className="loading-screen__bar">
                <motion.div
                  className="loading-screen__bar-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
            </motion.div>
          </div>

          <motion.span
            className="loading-screen__skip-hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            aria-hidden="true"
          >
            click anywhere to skip
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
