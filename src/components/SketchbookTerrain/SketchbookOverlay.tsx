import { useState, useEffect, useLayoutEffect, useCallback, lazy, Suspense, useRef } from 'react'
import { createPortal } from 'react-dom'
import EntryAnimation from './EntryAnimation'
import ExitAnimation from './ExitAnimation'

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
    document.documentElement.classList.add('sketchbook-mode')
    document.body.style.overflow = 'hidden'
    document.body.style.setProperty('cursor', 'none', 'important')
    document.documentElement.style.setProperty('cursor', 'none', 'important')

    return () => {
      document.documentElement.classList.remove('sketchbook-mode')
      document.body.style.overflow = ''
      document.body.style.removeProperty('cursor')
      document.documentElement.style.removeProperty('cursor')
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
    <div className="sketchbook-overlay">
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
