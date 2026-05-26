import { useState, useEffect } from 'react'
import { ref as dbRef, get, update, increment as fbIncrement } from 'firebase/database'
import { getFirebase } from '../../utils/firebase'

interface SketchCounterProps {
  className?: string
}

export default function SketchCounter({ className = '' }: SketchCounterProps) {
  const [count, setCount] = useState<number | null>(null)

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

  if (count === null) return null

  return (
    <div className={`sketch-counter ${className}`.trim()}>
      <div className="sketch-counter__button" aria-label="Field folio number" role="status">
        <span className="sketch-counter__label">field folio #{count.toLocaleString()}</span>
      </div>
    </div>
  )
}
