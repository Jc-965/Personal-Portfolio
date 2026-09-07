import { useEffect, useRef } from 'react'
import { GLYPH_RAMP } from './world'

interface PrintedProps {
  text: string
  /** Milliseconds after mount before the beam reaches the first character. */
  delay: number
  /** Characters written per second. */
  speed?: number
}

/** Characters of phosphor decay trailing the beam. */
const TAIL = 9

/**
 * Text the world's beam writes. Each character flares through the glyph ramp
 * behind the beam, then settles into its ink. Screen readers get the plain
 * text; the animated cells are decorative. The parent element receives
 * `is-done` once the line has settled.
 */
export default function Printed({ text, delay, speed = 60 }: PrintedProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const chars = Array.from(text)

  useEffect(() => {
    const host = ref.current
    const parent = host?.parentElement
    if (!host || !parent) return
    const cells = Array.from(host.children) as HTMLElement[]
    const finals = Array.from(text)
    const settle = () => {
      cells.forEach((cell, i) => { cell.textContent = finals[i]; cell.dataset.s = 'set' })
      parent.classList.add('is-done')
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      settle()
      return () => parent.classList.remove('is-done')
    }
    let raf = 0
    const start = performance.now() + delay
    const tick = (now: number) => {
      const head = ((now - start) / 1000) * speed
      let done = true
      cells.forEach((cell, i) => {
        const behind = head - i
        const final = finals[i]
        if (behind < 0) {
          done = false
          if (cell.dataset.s !== 'pending') cell.dataset.s = 'pending'
          return
        }
        if (behind >= TAIL || final === ' ') {
          if (cell.dataset.s !== 'set') { cell.textContent = final; cell.dataset.s = 'set' }
          return
        }
        done = false
        const level = Math.max(1, Math.round((1 - behind / TAIL) * (GLYPH_RAMP.length - 1)))
        cell.textContent = GLYPH_RAMP[level]
        cell.dataset.s = behind < TAIL * 0.35 ? 'hot' : 'warm'
      })
      if (done) { parent.classList.add('is-done'); return }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); parent.classList.remove('is-done') }
  }, [text, delay, speed])

  return (
    <>
      <span className="sr-only">{text}</span>
      <span ref={ref} className="hero__printed" aria-hidden="true">
        {chars.map((ch, i) => <span key={i} data-s="pending">{ch}</span>)}
      </span>
    </>
  )
}
