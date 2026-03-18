import { useRef, useCallback, useEffect, useState } from 'react'
import SketchbookCanvas, { type SketchbookCanvasCaptureSet, type SketchbookCanvasHandle } from './SketchbookCanvas'
import SketchCounter from './SketchCounter'
import useTouchDevice from '../../hooks/useTouchDevice'

interface SketchbookSceneProps {
  onClose: () => void
  onOpenSecretPortfolio?: () => void
}

type CaptureVariant = keyof SketchbookCanvasCaptureSet

const PHOTO_VARIANTS: { key: CaptureVariant; label: string; note: string; tag: string; tilt: string }[] = [
  {
    key: 'current',
    label: 'your camera',
    note: 'The exact framing from where you are standing.',
    tag: 'field note',
    tilt: '-1.1deg',
  },
  {
    key: 'recommended',
    label: 'recommended angle',
    note: 'A cleaner postcard view picked for the terrain.',
    tag: 'curated',
    tilt: '1.3deg',
  },
]

const dataUrlToBlob = async (dataUrl: string) => {
  const response = await fetch(dataUrl)
  return response.blob()
}

const createCaptureFilename = (variant: CaptureVariant) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `sketchbook-${variant}-${stamp}.png`
}

export default function SketchbookScene({ onClose, onOpenSecretPortfolio }: SketchbookSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<SketchbookCanvasHandle | null>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const [cursorState, setCursorState] = useState<'default' | 'grab' | 'grabbing'>('default')
  const [cursorClicking, setCursorClicking] = useState(false)
  const [inkSplats, setInkSplats] = useState<{ id: number; x: number; y: number; kind: 'ambient' | 'pick' | 'drop' }[]>([])
  const splatIdRef = useRef(0)
  const clickResetRef = useRef<number | null>(null)
  const [uiHidden, setUiHidden] = useState(false)
  const [captureState, setCaptureState] = useState<'idle' | 'capturing' | 'preview'>('idle')
  const [captures, setCaptures] = useState<SketchbookCanvasCaptureSet | null>(null)
  const [captureStillImage, setCaptureStillImage] = useState<string | null>(null)
  const [selectedCapture, setSelectedCapture] = useState<CaptureVariant>('current')
  const [captureNotice, setCaptureNotice] = useState('')
  const isTouchDevice = useTouchDevice()

  const spawnSplat = useCallback((x: number, y: number, kind: 'ambient' | 'pick' | 'drop') => {
    const id = splatIdRef.current++
    setInkSplats(prev => [...prev, { id, x, y, kind }])
    setTimeout(() => {
      setInkSplats(prev => prev.filter(s => s.id !== id))
    }, 900)
  }, [])

  // Custom cursor tracking
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (isTouchDevice || !cursorRef.current) return
    cursorRef.current.style.left = `${e.clientX}px`
    cursorRef.current.style.top = `${e.clientY}px`
    cursorRef.current.style.opacity = '1'
  }, [isTouchDevice])

  const onMouseLeave = useCallback(() => {
    if (isTouchDevice) return
    if (cursorRef.current) cursorRef.current.style.opacity = '0'
  }, [isTouchDevice])

  // Click effect — ink splat
  const onClick = useCallback((e: React.MouseEvent) => {
    if (captureState !== 'idle') return
    // Don't splat on buttons
    if ((e.target as HTMLElement).closest('.sketch-btn, .sketch-back-btn, .sketch-controls, .sketch-photo-sheet, .sketch-counter, .sketch-counter__button')) return
    spawnSplat(e.clientX, e.clientY, 'ambient')
  }, [captureState, spawnSplat])

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

  useEffect(() => {
    if (!captureNotice) return undefined
    const timeout = window.setTimeout(() => setCaptureNotice(''), 2400)
    return () => window.clearTimeout(timeout)
  }, [captureNotice])

  useEffect(() => {
    return () => {
      if (clickResetRef.current) {
        window.clearTimeout(clickResetRef.current)
      }
    }
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

  const closePreview = useCallback(() => {
    setCaptureState('idle')
    setCaptures(null)
    setCaptureStillImage(null)
    setSelectedCapture('current')
  }, [])

  const onCaptureRequest = useCallback(async () => {
    if (!canvasRef.current || captureState !== 'idle') return

    setCaptureNotice('')
    setCaptures(null)
    setCaptureStillImage(null)
    setCaptureState('capturing')

    try {
      const nextCaptures = await canvasRef.current.capturePhotos({
        onCurrentCaptured: current => {
          setCaptureStillImage(current)
        },
      })
      setCaptures(nextCaptures)
      setCaptureStillImage(current => current ?? nextCaptures.current)
      setSelectedCapture('current')
      setCaptureState('preview')
    } catch (error) {
      console.error('Sketch photo capture failed', error)
      setCaptureState('idle')
      setCaptureStillImage(null)
      setCaptureNotice('Photo capture failed. Try again.')
    }
  }, [captureState])

  const saveCapture = useCallback((variant: CaptureVariant) => {
    if (!captures) return

    setSelectedCapture(variant)
    const link = document.createElement('a')
    link.href = captures[variant]
    link.download = createCaptureFilename(variant)
    document.body.appendChild(link)
    link.click()
    link.remove()
    setCaptureNotice(`${PHOTO_VARIANTS.find(photo => photo.key === variant)?.label ?? 'photo'} saved`)
  }, [captures])

  const copyCapture = useCallback(async (variant: CaptureVariant) => {
    if (!captures) return

    setSelectedCapture(variant)

    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('Image clipboard support is unavailable')
      }

      const blob = await dataUrlToBlob(captures[variant])
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type || 'image/png']: blob }),
      ])
      setCaptureNotice(`${PHOTO_VARIANTS.find(photo => photo.key === variant)?.label ?? 'photo'} copied`)
    } catch (error) {
      console.error('Sketch photo copy failed', error)
      setCaptureNotice('Image copy is not available in this browser')
    }
  }, [captures])

  const triggerCursorClick = useCallback(() => {
    if (isTouchDevice) return
    setCursorClicking(true)
    if (clickResetRef.current) {
      window.clearTimeout(clickResetRef.current)
    }
    clickResetRef.current = window.setTimeout(() => {
      setCursorClicking(false)
      clickResetRef.current = null
    }, 220)
  }, [isTouchDevice])

  return (
    <div
      ref={containerRef}
      className={`sketchbook-scene ${visible ? 'sketchbook-scene--visible' : ''}`}
      style={{ cursor: 'none' }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onMouseDown={triggerCursorClick}
      onClick={onClick}
    >
      <SketchbookCanvas
        ref={canvasRef}
        onCursorChange={onCursorChange}
        onInteraction={onInteraction}
        uiHidden={uiHidden}
        onToggleUI={() => setUiHidden(h => !h)}
        onCaptureRequest={onCaptureRequest}
        captureBusy={captureState === 'capturing'}
      />

      <div className={`sketch-ui-layer ${uiHidden ? 'sketch-ui-layer--hidden' : ''}`}>
        <SketchCounter onSecretTrigger={onOpenSecretPortfolio} />

        <div className="sketchbook-label">
          <span className="sketchbook-label__text">sketchbook</span>
          <span className="sketchbook-label__sub">
            {isTouchDevice
              ? 'drag to look or sculpt · pinch to zoom · tap animals'
              : 'wasd to move · scroll to zoom · click animals'}
          </span>
        </div>

        <button className="sketch-btn sketch-back-btn" onClick={onClose}>
          &larr; back to portfolio
        </button>
      </div>

      {captureState !== 'idle' && (
        <div
          className={`sketch-capture-handoff sketch-capture-handoff--${captureState} ${captureStillImage ? 'sketch-capture-handoff--frozen' : 'sketch-capture-handoff--mask'}`}
          aria-hidden="true"
        >
          {captureStillImage && (
            <img
              className="sketch-capture-handoff__still"
              src={captureStillImage}
              alt=""
            />
          )}
          {captureState === 'capturing' && (
            <div className="sketch-capture-flash" />
          )}
        </div>
      )}

      {captureState === 'preview' && captures && (
        <>
          <button
            className="sketch-photo-sheet-backdrop"
            type="button"
            aria-label="Close sketch photos"
            onClick={closePreview}
          />
          <div className="sketch-photo-sheet-shell">
            <div className="sketch-photo-sheet" role="dialog" aria-modal="true" aria-label="Sketch photos">
              <div className="sketch-photo-sheet__header">
                <div className="sketch-photo-sheet__copy">
                  <span className="sketch-photo-sheet__eyebrow">field photos</span>
                  <h2 className="sketch-photo-sheet__title">Choose a frame to save or copy</h2>
                  <p className="sketch-photo-sheet__sub">Both shots are raw sketch renders without the UI overlay.</p>
                </div>
                <button className="sketch-btn" type="button" onClick={closePreview}>close</button>
              </div>

              <div className="sketch-photo-grid">
                {PHOTO_VARIANTS.map(photo => (
                  <article
                    key={photo.key}
                    className={`sketch-photo-card ${selectedCapture === photo.key ? 'sketch-photo-card--selected' : ''}`}
                    style={{ '--card-tilt': photo.tilt } as React.CSSProperties}
                  >
                    <button
                      type="button"
                      className="sketch-photo-card__frame"
                      onClick={() => setSelectedCapture(photo.key)}
                    >
                      <img
                        className="sketch-photo-card__image"
                        src={captures[photo.key]}
                        alt={`${photo.label} sketch capture`}
                      />
                    </button>
                    <div className="sketch-photo-card__meta">
                      <span className="sketch-photo-card__tag">{photo.tag}</span>
                      <h3 className="sketch-photo-card__title">{photo.label}</h3>
                      <p className="sketch-photo-card__note">{photo.note}</p>
                    </div>
                    <div className="sketch-photo-card__actions">
                      <button className="sketch-btn" type="button" onClick={() => saveCapture(photo.key)}>save</button>
                      <button className="sketch-btn" type="button" onClick={() => copyCapture(photo.key)}>copy</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {captureNotice && (
        <div className="sketch-photo-toast" role="status">
          {captureNotice}
        </div>
      )}

      {/* Ink splat effects */}
      {inkSplats.map(s => (
        <div
          key={s.id}
          className={`ink-splat ink-splat--${s.kind}`}
          style={{ left: s.x, top: s.y }}
        />
      ))}

      {/* Custom geometric cursor */}
      {!isTouchDevice && (
        <div
          ref={cursorRef}
          className={`sketch-cursor sketch-cursor--${cursorState} ${cursorClicking ? 'sketch-cursor--clicking' : ''}`}
          style={{ opacity: 0 }}
        >
          <div className="sketch-cursor__shape" />
        </div>
      )}
    </div>
  )
}
