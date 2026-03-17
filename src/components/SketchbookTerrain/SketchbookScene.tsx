import { useRef, useCallback, useEffect, useState } from 'react'
import SketchbookCanvas from './SketchbookCanvas'
import SketchCounter from './SketchCounter'

interface SketchbookSceneProps {
  onClose: () => void
}

export default function SketchbookScene({ onClose }: SketchbookSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const [cursorState, setCursorState] = useState<'default' | 'grab' | 'grabbing'>('default')
  const [inkSplats, setInkSplats] = useState<{ id: number; x: number; y: number }[]>([])
  const splatIdRef = useRef(0)

  // Custom cursor tracking
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cursorRef.current) return
    cursorRef.current.style.left = `${e.clientX}px`
    cursorRef.current.style.top = `${e.clientY}px`
    cursorRef.current.style.opacity = '1'
  }, [])

  const onMouseLeave = useCallback(() => {
    if (cursorRef.current) cursorRef.current.style.opacity = '0'
  }, [])

  // Click effect — ink splat
  const onClick = useCallback((e: React.MouseEvent) => {
    // Don't splat on buttons
    if ((e.target as HTMLElement).closest('.sketch-btn, .sketch-back-btn, .sketch-controls')) return
    const id = splatIdRef.current++
    setInkSplats(prev => [...prev, { id, x: e.clientX, y: e.clientY }])
    setTimeout(() => {
      setInkSplats(prev => prev.filter(s => s.id !== id))
    }, 800)
  }, [])

  // Cursor state callback from canvas (for animal hovering)
  const onCursorChange = useCallback((state: 'default' | 'grab' | 'grabbing') => {
    setCursorState(state)
  }, [])

  // Fade in on mount
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  return (
    <div
      ref={containerRef}
      className={`sketchbook-scene ${visible ? 'sketchbook-scene--visible' : ''}`}
      style={{ cursor: 'none' }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      <SketchbookCanvas onCursorChange={onCursorChange} />

      <SketchCounter />

      {/* Bottom left label */}
      <div className="sketchbook-label">
        <span className="sketchbook-label__text">sketchbook</span>
        <span className="sketchbook-label__sub">wasd to move · scroll to zoom · click animals</span>
      </div>

      {/* Back to portfolio button */}
      <button className="sketch-btn sketch-back-btn" onClick={onClose}>
        &larr; back to portfolio
      </button>

      {/* Ink splat effects */}
      {inkSplats.map(s => (
        <div
          key={s.id}
          className="ink-splat"
          style={{ left: s.x, top: s.y }}
        />
      ))}

      {/* Custom geometric cursor */}
      <div
        ref={cursorRef}
        className={`sketch-cursor sketch-cursor--${cursorState}`}
        style={{ opacity: 0 }}
      >
        <div className="sketch-cursor__shape" />
      </div>
    </div>
  )
}
