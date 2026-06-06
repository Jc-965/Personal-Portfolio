import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Lazy so the heavy Three.js/postprocessing bundle (vendor-3d) does not block
// first paint of the loading screen. The dithered backdrop sits behind the
// terminal content and fades in once the chunk arrives.
const Dither = lazy(() => import('./Dither'))

interface LoadingScreenProps {
  onComplete: () => void
}

export default function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<'init' | 'loading' | 'complete'>('init')
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
    // Mount the Dither backdrop one tick after first paint so the terminal
    // content paints first and three.js loads in the background.
    const ditherTimer = setTimeout(() => setShowDither(true), 80)

    const timer1 = setTimeout(() => setPhase('loading'), 100)

    let logIndex = 0
    const logInterval = setInterval(() => {
      if (logIndex < logMessages.length) {
        setLogs(prev => [...prev, logMessages[logIndex]])
        logIndex++
      }
    }, 160)

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval)
          clearInterval(logInterval)
          if (!skippedRef.current) {
            setPhase('complete')
            setTimeout(onComplete, 250)
          }
          return 100
        }
        const increment = Math.random() * 20 + 8
        return Math.min(100, prev + increment)
      })
    }, 100)

    return () => {
      clearTimeout(ditherTimer)
      clearTimeout(timer1)
      clearInterval(interval)
      clearInterval(logInterval)
    }
  }, [onComplete])

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
                disableAnimation={false}
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
        </motion.div>
      )}
    </AnimatePresence>
  )
}
