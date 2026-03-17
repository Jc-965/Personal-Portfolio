import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import EntryAnimation from './EntryAnimation'

const SketchbookScene = lazy(() => import('./SketchbookScene'))

type Phase = 'entering' | 'active' | 'exiting'

interface SketchbookOverlayProps {
  onClose: () => void
}

export default function SketchbookOverlay({ onClose }: SketchbookOverlayProps) {
  const [phase, setPhase] = useState<Phase>('entering')

  const onAnimationComplete = useCallback(() => {
    setPhase('active')
  }, [])

  const handleClose = useCallback(() => {
    setPhase('exiting')
    setTimeout(onClose, 600)
  }, [onClose])

  // Lock body scroll, add sketchbook-mode class
  useEffect(() => {
    document.documentElement.classList.add('sketchbook-mode')
    document.body.style.overflow = 'hidden'

    return () => {
      document.documentElement.classList.remove('sketchbook-mode')
      document.body.style.overflow = ''
    }
  }, [])

  // Escape key to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase === 'active') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, handleClose])

  const content = (
    <div
      className={`sketchbook-overlay ${phase === 'exiting' ? 'sketchbook-overlay--exiting' : ''}`}
    >
      {/* Paper background */}
      <div className="sketchbook-overlay__paper" />

      {/* Entry animation */}
      {phase === 'entering' && (
        <EntryAnimation onComplete={onAnimationComplete} />
      )}

      {/* 3D scene — only mounts after animation */}
      {(phase === 'active' || phase === 'exiting') && (
        <Suspense fallback={null}>
          <SketchbookScene onClose={handleClose} />
        </Suspense>
      )}
    </div>
  )

  return createPortal(content, document.body)
}
