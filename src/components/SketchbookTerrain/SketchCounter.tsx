import { useState, useEffect } from 'react'
import { storageGet, storageSet } from '../../utils/safeStorage'

interface SketchCounterProps {
  className?: string
}

export default function SketchCounter({ className = '' }: SketchCounterProps) {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    const incrementLocal = () => {
      const stored = parseInt(storageGet('sketch-visitors') || '0', 10)
      const next = stored + 1
      storageSet('sketch-visitors', String(next))
      if (active) setCount(next)
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 6000)
    fetch('/api/sketch-visit', { method: 'POST', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('counter_unavailable')
        return response.json() as Promise<{ count?: number }>
      })
      .then(result => {
        if (active) setCount(typeof result.count === 'number' ? result.count : 1)
      })
      .catch(() => {
        if (active) incrementLocal()
      })

    return () => {
      active = false
      window.clearTimeout(timeout)
      controller.abort()
    }
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
