import { useEffect, useRef, type CSSProperties } from 'react'
import { isMotionValue, type MotionValue } from 'framer-motion'
import { createProgram, createTexture, uniformsOf } from '../hero/gl'
import { buildGlyphAtlas } from '../hero/glyphAtlas'
import { VERTEX } from '../hero/shaders'
import { GLYPH_RAMP } from '../hero/world'
import { DECODE_FRAG } from './decodedShaders'
import { DITHER_BAND, MAX_WOUNDS, addWound, cellsFor, coverTransform, packWounds, type Wound } from './decodeMath'

interface DecodedProps {
  src: string
  alt: string
  aspect: string
  /** 0 is all glyphs, 1 is the real image. A MotionValue avoids re-rendering per frame. */
  progress: number | MotionValue<number>
  accent: string
  interactive?: boolean
  /** Glyph cell width in CSS pixels. */
  cell?: number
  className?: string
}

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/**
 * An image drawn as glyphs that resolves into the real picture as `progress`
 * rises. Dragging across it (tapping on touch) re-encodes the cells under the
 * pointer, and they heal. Without WebGL2 the plain image shows.
 */
export default function Decoded({ src, alt, aspect, progress, accent, interactive = true, cell = 7, className = '' }: DecodedProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const progressRef = useRef<number | MotionValue<number>>(progress)
  const wakeRef = useRef<(() => void) | null>(null)

  // Declared before the drawing effect so the ref is current when it mounts.
  useEffect(() => {
    progressRef.current = progress
    wakeRef.current?.()
  }, [progress])

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false })
    if (!gl) return
    let program: WebGLProgram
    try {
      program = createProgram(gl, VERTEX, DECODE_FRAG)
    } catch (error) {
      if (import.meta.env.DEV) console.error('Decoded: falling back to the plain image.', error)
      return
    }
    const u = uniformsOf(gl, program, ['uImage', 'uAtlas', 'uSize', 'uCell', 'uScale', 'uOffset', 'uGlyphs', 'uProgress', 'uBand', 'uTint', 'uWounds'] as const)
    const imageTex = createTexture(gl, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    const atlasTex = createTexture(gl, gl.LINEAR)
    const wounds: Wound[] = []
    const woundBuf = new Float32Array(MAX_WOUNDS * 4)
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const { cellW, cellH, fontPx } = cellsFor(cell)
    const atlas = buildGlyphAtlas(cellW, cellH, fontPx, Math.ceil(dpr * 2))
    if (atlas) {
      gl.bindTexture(gl.TEXTURE_2D, atlasTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas)
    }
    const [r, g, b] = hexToRgb(accent)
    const current = () => {
      const value = progressRef.current
      return isMotionValue(value) ? value.get() : value
    }
    let imageW = 1
    let imageH = 1
    let loaded = false
    let visible = false
    let raf = 0
    let shown = reduced ? 1 : current()

    const draw = (now: number) => {
      raf = 0
      if (!loaded || !visible) return
      const wanted = reduced ? 1 : current()
      shown += (wanted - shown) * 0.18
      if (Math.abs(wanted - shown) < 0.003) shown = wanted
      packWounds(wounds, now / 1000, woundBuf, dpr)
      const cover = coverTransform(canvas.width, canvas.height, imageW, imageH)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.useProgram(program)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, imageTex)
      gl.uniform1i(u.uImage, 0)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, atlasTex)
      gl.uniform1i(u.uAtlas, 1)
      gl.uniform2f(u.uSize, canvas.width, canvas.height)
      gl.uniform2f(u.uCell, cellW * dpr, cellH * dpr)
      gl.uniform2f(u.uScale, cover.scale[0], cover.scale[1])
      gl.uniform2f(u.uOffset, cover.offset[0], cover.offset[1])
      gl.uniform1f(u.uGlyphs, GLYPH_RAMP.length)
      gl.uniform1f(u.uProgress, shown)
      gl.uniform1f(u.uBand, DITHER_BAND)
      gl.uniform3f(u.uTint, r, g, b)
      gl.uniform4fv(u.uWounds, woundBuf)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      if (shown !== wanted || wounds.length > 0) schedule()
    }
    const schedule = () => {
      if (!raf && visible) raf = requestAnimationFrame(draw)
    }
    wakeRef.current = schedule

    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      imageW = image.naturalWidth
      imageH = image.naturalHeight
      gl.bindTexture(gl.TEXTURE_2D, imageTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
      gl.generateMipmap(gl.TEXTURE_2D)
      loaded = true
      root.classList.add('is-live')
      schedule()
    }
    image.src = src

    const resize = () => {
      const rect = root.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      schedule()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(root)
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) schedule()
    })
    io.observe(root)

    const value = progressRef.current
    const unsubscribe = isMotionValue(value) ? value.on('change', schedule) : undefined

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    let dragging = false
    let lastX = 0
    let lastY = 0
    const wound = (event: PointerEvent) => {
      const rect = root.getBoundingClientRect()
      addWound(wounds, event.clientX - rect.left, rect.bottom - event.clientY, performance.now() / 1000)
      schedule()
    }
    const onDown = (event: PointerEvent) => {
      if (!interactive || reduced) return
      wound(event)
      if (!finePointer) return
      dragging = true
      lastX = event.clientX
      lastY = event.clientY
    }
    const onMove = (event: PointerEvent) => {
      if (!dragging) return
      if (Math.hypot(event.clientX - lastX, event.clientY - lastY) < 8) return
      lastX = event.clientX
      lastY = event.clientY
      wound(event)
    }
    const onUp = () => { dragging = false }
    canvas.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    return () => {
      cancelAnimationFrame(raf)
      wakeRef.current = null
      ro.disconnect()
      io.disconnect()
      unsubscribe?.()
      image.onload = null
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      gl.deleteTexture(imageTex)
      gl.deleteTexture(atlasTex)
      gl.deleteProgram(program)
      // No loseContext here: a canvas hands back the same context on remount,
      // and StrictMode remounts, so a lost context would never come back.
      root.classList.remove('is-live')
    }
  }, [src, accent, interactive, cell])

  return (
    <div ref={rootRef} className={`decoded ${className}`} style={{ aspectRatio: aspect, '--decoded-accent': accent } as CSSProperties}>
      <img className="decoded__img" src={src} alt={alt} loading="lazy" decoding="async" />
      <canvas ref={canvasRef} className="decoded__canvas" aria-hidden="true" />
    </div>
  )
}
