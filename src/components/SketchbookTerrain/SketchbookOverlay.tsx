import { useState, useEffect, useLayoutEffect, useCallback, lazy, Suspense, useRef } from 'react'
import { createPortal } from 'react-dom'
import EntryAnimation from './EntryAnimation'
import ExitAnimation from './ExitAnimation'
import '../../styles/sketchbook.css'
import '../../styles/sketchbook-overrides.css'

const SketchbookScene = lazy(() => import('./SketchbookScene'))

type Phase = 'entering' | 'active' | 'exiting'

interface SketchbookOverlayProps {
  onClose: () => void
  isExiting?: boolean
  onExitAnimationDone?: () => void
  showTutorialOnStart?: boolean
}

export default function SketchbookOverlay({
  onClose,
  isExiting,
  onExitAnimationDone,
  showTutorialOnStart = false,
}: SketchbookOverlayProps) {
  const [phase, setPhase] = useState<Phase>('entering')
  const hasTriggeredExit = useRef(false)

  const onEntryComplete = useCallback(() => {
    setPhase('active')
  }, [])

  const onExitComplete = useCallback(() => {
    onExitAnimationDone?.()
  }, [onExitAnimationDone])

  useLayoutEffect(() => {
    const appRoot = document.getElementById('root')
    const previousOverflow = document.body.style.overflow
    const previousBodyCursor = document.body.style.cursor
    const previousRootCursor = document.documentElement.style.cursor
    document.documentElement.classList.add('sketchbook-mode')
    appRoot?.setAttribute('inert', '')
    document.body.style.overflow = 'hidden'
    document.body.style.setProperty('cursor', 'none', 'important')
    document.documentElement.style.setProperty('cursor', 'none', 'important')

    return () => {
      document.documentElement.classList.remove('sketchbook-mode')
      appRoot?.removeAttribute('inert')
      document.body.style.overflow = previousOverflow
      document.body.style.cursor = previousBodyCursor
      document.documentElement.style.cursor = previousRootCursor
    }
  }, [])

  useEffect(() => {
    if (isExiting && !hasTriggeredExit.current) {
      hasTriggeredExit.current = true
      setPhase('exiting')
    }
  }, [isExiting])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase === 'active' && !isExiting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, onClose, isExiting])

  const content = (
    <div className="sketchbook-overlay" role="dialog" aria-modal="true" aria-label="Interactive sketchbook">
      <div className="sketchbook-overlay__paper" />

      {phase === 'entering' && (
        <EntryAnimation onComplete={onEntryComplete} />
      )}

      {(phase === 'active' || phase === 'exiting') && (
        <Suspense fallback={null}>
          <SketchbookScene
            onClose={onClose}
            showTutorialOnStart={showTutorialOnStart}
          />
        </Suspense>
      )}

      {phase === 'exiting' && (
        <ExitAnimation onComplete={onExitComplete} />
      )}
    </div>
  )

  return createPortal(content, document.body)
}
