import { useRef, useState, useEffect, useCallback } from 'react'
import { useInView } from 'framer-motion'
import { useScrollTransition } from './useScrollTransition'
import SketchbookCanvas from './SketchbookCanvas'
import SketchCounter from './SketchCounter'

export default function SketchbookTerrain() {
  const sectionRef = useRef<HTMLElement>(null)
  const { progress, progressRef } = useScrollTransition(sectionRef)
  const inView = useInView(sectionRef as React.RefObject<Element>, { margin: '200px 0px' })
  const [hasBeenVisible, setHasBeenVisible] = useState(false)
  const cursorRef = useRef<HTMLDivElement>(null)
  const isActive = progress > 0.3

  useEffect(() => {
    if (inView && !hasBeenVisible) setHasBeenVisible(true)
  }, [inView, hasBeenVisible])

  // Hide navbar + CRT overlay + site cursors when in sketchbook
  useEffect(() => {
    const navbar = document.querySelector('.nav') as HTMLElement | null
    const overlay = document.querySelector('.vintage-overlay') as HTMLElement | null
    const cursor1 = document.querySelector('.cursor-canvas') as HTMLElement | null
    const cursor2 = document.querySelector('.target-cursor') as HTMLElement | null

    if (isActive) {
      navbar?.style.setProperty('opacity', '0', 'important')
      navbar?.style.setProperty('pointer-events', 'none', 'important')
      navbar?.style.setProperty('visibility', 'hidden')
      overlay?.style.setProperty('opacity', '0', 'important')
      cursor1?.style.setProperty('display', 'none', 'important')
      cursor2?.style.setProperty('display', 'none', 'important')
    } else {
      navbar?.style.removeProperty('opacity')
      navbar?.style.removeProperty('pointer-events')
      navbar?.style.removeProperty('visibility')
      overlay?.style.removeProperty('opacity')
      cursor1?.style.removeProperty('display')
      cursor2?.style.removeProperty('display')
    }

    return () => {
      navbar?.style.removeProperty('opacity')
      navbar?.style.removeProperty('pointer-events')
      navbar?.style.removeProperty('visibility')
      overlay?.style.removeProperty('opacity')
      cursor1?.style.removeProperty('display')
      cursor2?.style.removeProperty('display')
    }
  }, [isActive])

  // Lock page scrolling when sketchbook is active (scroll = zoom inside canvas)
  useEffect(() => {
    if (!isActive) return
    const prevent = (e: WheelEvent) => {
      // Only block if we're inside the sketchbook section
      const section = sectionRef.current
      if (section) {
        const rect = section.getBoundingClientRect()
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          e.preventDefault()
        }
      }
    }
    window.addEventListener('wheel', prevent, { passive: false })
    return () => window.removeEventListener('wheel', prevent)
  }, [isActive])

  // Custom cursor tracking
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cursorRef.current || !sectionRef.current) return
    const rect = sectionRef.current.getBoundingClientRect()
    cursorRef.current.style.left = `${e.clientX - rect.left}px`
    cursorRef.current.style.top = `${e.clientY - rect.top}px`
    cursorRef.current.style.opacity = '1'
  }, [])

  const onMouseLeave = useCallback(() => {
    if (cursorRef.current) cursorRef.current.style.opacity = '0'
  }, [])

  const scrollBackUp = useCallback(() => {
    const footer = document.querySelector('.footer')
    if (footer) {
      footer.scrollIntoView({ behavior: 'smooth' })
    } else {
      window.scrollTo({ top: document.body.scrollHeight - window.innerHeight * 2, behavior: 'smooth' })
    }
  }, [])

  const bgColor = `rgb(${Math.round(4 + progress * 228)}, ${Math.round(9 + progress * 221)}, ${Math.round(13 + progress * 203)})`

  return (
    <section
      ref={sectionRef}
      className="sketchbook-terrain"
      style={{ backgroundColor: bgColor, cursor: isActive ? 'none' : undefined }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <div
        className="sketchbook-paper-overlay"
        style={{ opacity: Math.max(0, (progress - 0.2) * 1.25) }}
      />

      {hasBeenVisible && (
        <SketchbookCanvas
          scrollProgressRef={progressRef}
          isVisible={inView}
        />
      )}

      <SketchCounter />

      {/* Bottom left label */}
      <div className="sketchbook-label" style={{ opacity: Math.max(0, progress - 0.4) }}>
        <span className="sketchbook-label__text">sketchbook</span>
        <span className="sketchbook-label__sub">wasd to move · scroll to zoom</span>
      </div>

      {/* Back to portfolio button */}
      <button
        className="sketch-btn sketch-back-btn"
        onClick={scrollBackUp}
        style={{ opacity: Math.max(0, progress - 0.4) }}
      >
        &larr; back to portfolio
      </button>

      {/* Geometric cursor */}
      <div ref={cursorRef} className="sketch-cursor" style={{ opacity: 0 }}>
        <div className="sketch-cursor__pencil" />
      </div>
    </section>
  )
}
