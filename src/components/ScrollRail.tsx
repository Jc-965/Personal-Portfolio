import { useEffect, useRef } from 'react'
import { GLYPH_RAMP } from './hero/world'
import { lenisRef } from '../scroll/lenisRef'

/** Height of one rail cell in CSS pixels; matches the stylesheet. */
const ROW = 11
/** Cells of phosphor tail on each side of the viewport segment. */
const TAIL = 4

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/**
 * The page's scrollbar, drawn in the world's material: a hairline track and
 * a bright segment of ramp glyphs for the viewport, with a phosphor tail that
 * ripples slowly. Grab the segment and drag to scrub, or press anywhere on
 * the track to jump. It appears once the opening scene has been passed.
 * Native scrolling is untouched, so this stays decorative for assistive tech.
 */
export default function ScrollRail() {
  const railRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const column = rail.querySelector<HTMLElement>('.scroll-rail__cells')
    if (!column) return

    let cells: HTMLElement[] = []
    let states: string[] = []
    let maxScroll = 1
    let gate = 0
    let paintFrame = 0
    let dragging = false
    /** Where inside the segment the pointer grabbed it, in pixels from its top. */
    let grip = 0

    const build = () => {
      const count = Math.max(1, Math.floor(rail.clientHeight / ROW))
      if (count === cells.length) return
      column.replaceChildren()
      cells = Array.from({ length: count }, () => {
        const cell = document.createElement('span')
        cell.dataset.s = 'track'
        column.appendChild(cell)
        return cell
      })
      states = cells.map(() => '')
    }

    const segment = () => {
      const viewport = window.innerHeight
      const span = Math.min(cells.length, Math.max(3, Math.round(cells.length * viewport / (maxScroll + viewport))))
      return { span, start: clamp01(window.scrollY / maxScroll) * (cells.length - span) }
    }

    const paint = () => {
      paintFrame = 0
      const count = cells.length
      if (!count) return
      const { span, start } = segment()
      const end = start + span - 1
      for (let i = 0; i < count; i++) {
        const outside = i < start ? start - i : i > end ? i - end : 0
        let glyph = ''
        let state = 'track'
        if (outside < 0.5) {
          glyph = GLYPH_RAMP[GLYPH_RAMP.length - 1]
          state = 'hot'
        } else if (outside <= TAIL) {
          glyph = GLYPH_RAMP[Math.max(1, Math.round(8 - outside * 1.9))]
          state = outside <= 2 ? 'warm' : 'cool'
        }
        const key = `${state}${glyph}`
        if (states[i] === key) continue
        states[i] = key
        cells[i].textContent = glyph
        cells[i].dataset.s = state
        // The ripple runs down the segment: each lit cell lags the one above.
        cells[i].style.setProperty('--i', state === 'hot' ? String(Math.round(i - start)) : '0')
      }
      // The opening keeps its own instrument; the rail appears as Journey arrives.
      rail.classList.toggle('is-shown', window.scrollY + window.innerHeight >= gate + 120)
    }
    const requestPaint = () => { if (!paintFrame) paintFrame = requestAnimationFrame(paint) }

    const measure = () => {
      maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      const journey = document.getElementById('journey')
      gate = journey ? journey.getBoundingClientRect().top + window.scrollY : 0
      build()
      states = states.map(() => '')
      requestPaint()
    }

    // While Lenis runs it must own every move, or its easing overrides native scrolls mid-flight.
    const scrollTo = (top: number) => {
      const lenis = lenisRef.current
      if (lenis) lenis.scrollTo(top, { immediate: true })
      else window.scrollTo({ top, behavior: 'instant' })
    }
    const scrollToPointer = (event: PointerEvent) => {
      const bounds = rail.getBoundingClientRect()
      const span = segment().span * ROW
      const progress = clamp01((event.clientY - bounds.top - grip) / Math.max(1, bounds.height - span))
      scrollTo(progress * maxScroll)
    }
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      event.preventDefault()
      // Capture keeps the drag alive outside the rail; a refusal must not block the jump.
      try { rail.setPointerCapture(event.pointerId) } catch { /* synthetic or stale pointer */ }
      dragging = true
      rail.classList.add('is-dragging')
      // Grabbing the segment keeps it under the finger; pressing the track centres it there.
      const { span, start } = segment()
      const offset = event.clientY - rail.getBoundingClientRect().top - start * ROW
      const onSegment = offset >= 0 && offset <= span * ROW
      grip = onSegment ? offset : (span * ROW) / 2
      if (!onSegment) scrollToPointer(event)
    }
    const onMove = (event: PointerEvent) => { if (dragging) scrollToPointer(event) }
    const onUp = (event: PointerEvent) => {
      if (!dragging) return
      dragging = false
      rail.classList.remove('is-dragging')
      if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId)
    }

    const bodyObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    bodyObserver?.observe(document.body)
    window.addEventListener('scroll', requestPaint, { passive: true })
    window.addEventListener('resize', measure, { passive: true })
    window.addEventListener('pageshow', measure)
    rail.addEventListener('pointerdown', onDown)
    rail.addEventListener('pointermove', onMove)
    rail.addEventListener('pointerup', onUp)
    rail.addEventListener('pointercancel', onUp)
    measure()

    return () => {
      if (paintFrame) cancelAnimationFrame(paintFrame)
      bodyObserver?.disconnect()
      window.removeEventListener('scroll', requestPaint)
      window.removeEventListener('resize', measure)
      window.removeEventListener('pageshow', measure)
      rail.removeEventListener('pointerdown', onDown)
      rail.removeEventListener('pointermove', onMove)
      rail.removeEventListener('pointerup', onUp)
      rail.removeEventListener('pointercancel', onUp)
    }
  }, [])

  return (
    <div ref={railRef} className="scroll-rail" aria-hidden="true" data-target-cursor="off">
      <div className="scroll-rail__cells" />
    </div>
  )
}
