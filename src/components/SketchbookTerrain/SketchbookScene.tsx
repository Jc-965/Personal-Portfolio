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
  const [inkSplats, setInkSplats] = useState<{ id: number; x: number; y: number; kind: 'ambient' | 'pick' | 'drop' }[]>([])
  const splatIdRef = useRef(0)
  const [uiHidden, setUiHidden] = useState(false)

  const spawnSplat = useCallback((x: number, y: number, kind: 'ambient' | 'pick' | 'drop') => {
    const id = splatIdRef.current++
    setInkSplats(prev => [...prev, { id, x, y, kind }])
    setTimeout(() => {
      setInkSplats(prev => prev.filter(s => s.id !== id))
    }, 900)
  }, [])

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
    spawnSplat(e.clientX, e.clientY, 'ambient')
  }, [spawnSplat])

  // Cursor state callback from canvas (for animal hovering)
  const onCursorChange = useCallback((state: 'default' | 'grab' | 'grabbing') => {
    setCursorState(state)
  }, [])

  const onInteraction = useCallback((kind: 'pick' | 'drop', x: number, y: number) => {
    spawnSplat(x, y, kind)
  }, [spawnSplat])

  // Fade in on mount
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  // Prevent browser drag/select that causes default cursor to flash
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const prevent = (e: Event) => e.preventDefault()
    el.addEventListener('dragstart', prevent)
    el.addEventListener('selectstart', prevent)
    return () => {
      el.removeEventListener('dragstart', prevent)
      el.removeEventListener('selectstart', prevent)
    }
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
      <SketchbookCanvas onCursorChange={onCursorChange} onInteraction={onInteraction} uiHidden={uiHidden} onToggleUI={() => setUiHidden(h => !h)} />

      <div className={`sketch-ui-layer ${uiHidden ? 'sketch-ui-layer--hidden' : ''}`}>
        <SketchCounter />

        <div className="sketchbook-label">
          <span className="sketchbook-label__text">sketchbook</span>
          <span className="sketchbook-label__sub">wasd to move · scroll to zoom · click animals</span>
        </div>

        <button className="sketch-btn sketch-back-btn" onClick={onClose}>
          &larr; back to portfolio
        </button>
      </div>

      {/* Ink splat effects */}
      {inkSplats.map(s => (
        <div
          key={s.id}
          className={`ink-splat ink-splat--${s.kind}`}
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
