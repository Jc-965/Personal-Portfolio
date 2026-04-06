import { useState, useEffect, useRef } from 'react'
import { ref as dbRef, get, update, increment as fbIncrement } from 'firebase/database'
import { getFirebase } from '../../utils/firebase'

const SECRET_TRIGGER_CLICKS = 5

interface SketchCounterProps {
  onSecretTrigger?: () => void
  className?: string
}

export default function SketchCounter({ onSecretTrigger, className = '' }: SketchCounterProps) {
  const [count, setCount] = useState<number | null>(null)
  const [secretClicks, setSecretClicks] = useState(0)
  const secretClicksRef = useRef(0)

  useEffect(() => {
    const db = getFirebase()
    if (!db) {
      // Fallback to localStorage
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

  if (count === null) return null

  const registerSecretClick = () => {
    if (!onSecretTrigger) return
    const next = secretClicksRef.current + 1

    if (next >= SECRET_TRIGGER_CLICKS) {
      secretClicksRef.current = 0
      setSecretClicks(0)
      onSecretTrigger()
      return
    }

    secretClicksRef.current = next
    setSecretClicks(next)
  }

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    registerSecretClick()
  }

  return (
    <div className={`sketch-counter ${className}`.trim()}>
      <button
        type="button"
        className="sketch-counter__button"
        onClick={handleClick}
        aria-label="Field folio number"
      >
        <span className="sketch-counter__label">field folio #{count.toLocaleString()}</span>
      </button>
    </div>
  )
}
