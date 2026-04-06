import { useState, useEffect, useRef, useCallback } from 'react'
import { ref as dbRef, get, update, increment as fbIncrement } from 'firebase/database'
import { getFirebase } from '../../utils/firebase'

interface SketchCounterProps {
  className?: string
  onSecretUnlock?: () => void
}

const SECRET_TAP_COUNT = 5
const SECRET_TAP_TIMEOUT = 2000 // reset after 2s of no taps

export default function SketchCounter({ className = '', onSecretUnlock }: SketchCounterProps) {
  const [count, setCount] = useState<number | null>(null)
  const [tapCount, setTapCount] = useState(0)
  const tapTimerRef = useRef<number | null>(null)
  const isUnlocking = tapCount > 0 && tapCount < SECRET_TAP_COUNT

  useEffect(() => {
    const db = getFirebase()
    if (!db) {
      const stored = parseInt(localStorage.getItem('sketch-visitors') || '0', 10)
      const next = stored + 1
      localStorage.setItem('sketch-visitors', String(next))
      setCount(next)
      return
    }

    const counterRef = dbRef(db, 'metadata/sketchVisitors')
    update(dbRef(db, 'metadata'), { sketchVisitors: fbIncrement(1) })
      .then(() => get(counterRef))
      .then(snap => {
        const val = snap.val()
        setCount(typeof val === 'number' ? val : 1)
      })
      .catch(() => {
        const stored = parseInt(localStorage.getItem('sketch-visitors') || '0', 10)
        const next = stored + 1
        localStorage.setItem('sketch-visitors', String(next))
        setCount(next)
      })
  }, [])

  const handleClick = useCallback(() => {
    // Clear existing timeout
    if (tapTimerRef.current !== null) {
      window.clearTimeout(tapTimerRef.current)
    }

    const next = tapCount + 1

    if (next >= SECRET_TAP_COUNT) {
      setTapCount(0)
      onSecretUnlock?.()
      return
    }

    setTapCount(next)

    // Reset tap count after timeout
    tapTimerRef.current = window.setTimeout(() => {
      setTapCount(0)
      tapTimerRef.current = null
    }, SECRET_TAP_TIMEOUT)
  }, [tapCount, onSecretUnlock])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (tapTimerRef.current !== null) {
        window.clearTimeout(tapTimerRef.current)
      }
    }
  }, [])

  if (count === null) return null

  return (
    <div className={`sketch-counter ${isUnlocking ? 'sketch-counter--arming' : ''} ${className}`.trim()}>
      <button
        className="sketch-counter__button"
        aria-label="Field folio number"
        onClick={handleClick}
      >
        <span className="sketch-counter__label">field folio #{count.toLocaleString()}</span>
        {isUnlocking && (
          <span className="sketch-counter__pips" aria-hidden="true">
            {Array.from({ length: SECRET_TAP_COUNT - 1 }, (_, i) => (
              <span
                key={i}
                className={`sketch-counter__pip ${i < tapCount ? 'sketch-counter__pip--active' : ''}`}
              />
            ))}
          </span>
        )}
      </button>
    </div>
  )
}
