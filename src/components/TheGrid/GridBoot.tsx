import { useEffect, useRef, useState } from 'react'

/**
 * Terminal boot for the Grid. Reuses the site's `.loading-screen` ruleset
 * (styles/constellation-loading.css). The bar tracks the real scene chunk:
 * it parks at 86% until the lazy import resolves, so the log never lies
 * about being ready.
 */

const BOOT_LOGS = [
  '> init grid_runtime v2.0',
  '> auth visitor ........ ok',
  '> loading district geometry',
  '> compiling neon shaders',
  '> linking constellation uplink',
  '> mapping route: 6 stations',
  '> grid online — scroll to travel',
]

const LOG_INTERVAL_MS = 210
const MIN_BOOT_MS = 1400

export default function GridBoot({
  chunkReady,
  reducedMotion,
  onDone,
  failed = false,
}: {
  chunkReady: boolean
  reducedMotion: boolean
  onDone: () => void
  /** Scene chunk failed to load — surface it instead of parking at 86%. */
  failed?: boolean
}) {
  const [visibleLogs, setVisibleLogs] = useState(reducedMotion ? BOOT_LOGS.length : 1)
  const [percent, setPercent] = useState(0)
  const doneRef = useRef(false)
  const startRef = useRef(0)
  const pctRef = useRef(0)

  useEffect(() => {
    if (reducedMotion) return undefined
    const id = window.setInterval(() => {
      setVisibleLogs(count => {
        if (count >= BOOT_LOGS.length) {
          window.clearInterval(id)
          return count
        }
        return count + 1
      })
    }, LOG_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [reducedMotion])

  useEffect(() => {
    if (startRef.current === 0) startRef.current = performance.now()
    let frame = 0
    const minBoot = reducedMotion ? 350 : MIN_BOOT_MS

    const tick = () => {
      const cap = chunkReady ? 100 : 86
      // pct lives in a ref so progress survives the effect restart when
      // chunkReady flips — the bar must never jump backward.
      const pct = Math.min(cap, pctRef.current + (cap - pctRef.current) * 0.035 + 0.35)
      pctRef.current = pct
      setPercent(Math.floor(pct))

      const elapsed = performance.now() - startRef.current
      if (pct >= 99.5 && chunkReady && elapsed >= minBoot) {
        if (!doneRef.current) {
          doneRef.current = true
          setPercent(100)
          window.setTimeout(onDone, 220)
        }
        return
      }
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [chunkReady, reducedMotion, onDone])

  return (
    <div className="loading-screen grid-boot" role="status" aria-label="Loading the Grid">
      <div className="loading-screen__grid" />
      <div className="loading-screen__content">
        <div className="loading-screen__terminal">
          <div className="loading-screen__terminal-bar">
            <span className="loading-screen__terminal-dot" />
            <span className="loading-screen__terminal-dot" />
            <span className="loading-screen__terminal-dot" />
            <span className="loading-screen__terminal-title">visitor@the-grid: ~/boot</span>
          </div>
          <div className="loading-screen__terminal-body">
            {BOOT_LOGS.slice(0, visibleLogs).map(line => (
              <div key={line} className="loading-screen__log">{line}</div>
            ))}
            {failed && (
              <div className="loading-screen__log grid-boot__error">
                ! grid failed to load — press ESC to return
              </div>
            )}
            <span className="loading-screen__cursor">█</span>
          </div>
        </div>
        <div className="loading-screen__progress-section">
          <div className="loading-screen__label">
            <span>ENTERING THE GRID</span>
            <span className="loading-screen__percent">{percent}%</span>
          </div>
          <div className="loading-screen__bar">
            <div className="loading-screen__bar-fill" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}
