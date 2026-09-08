import { useEffect, useRef } from 'react'
import { createProgram, createTexture, uniformsOf } from './gl'
import { buildGlyphAtlas } from './glyphAtlas'
import { NAME_SPREAD, NAME_TEXTURE, inkAnchor, nameSlab } from './nameField'
import { buildNameField } from './nameTexture'
import { PRESS_PUSH, PULL_DEPTH, PULL_RADIUS, createPointerFx, easePull, pressAt } from './pointerFx'
import { GLYPHS, SCENE, VERTEX } from './shaders'
import { GLYPH_RAMP, gridFor, sceneProgress, arrivalProgress, type Grid } from './world'

/**
 * Glyph size and row height of the character grid. Phones get a finer grid:
 * their width caps the lettering's cap height, so legibility needs more rows.
 */
const CELL = { wide: { fontPx: 8, height: 10 }, narrow: { fontPx: 5.5, height: 6.5 } }
/** Clearance between the lettering and the introduction, in CSS pixels. */
const NAME_GAP = 55
const FONT_FAMILY = '"JetBrains Mono", "IBM Plex Mono", monospace'
/** The name carves in from the left after the world has faded up. */
const REVEAL_DELAY = 0.35
const REVEAL_DURATION = 1.4

const smoothstep = (value: number) => {
  const t = Math.min(1, Math.max(0, value))
  return t * t * (3 - 2 * t)
}

interface AsciiWorldProps {
  /** Wordmark lines separated by newlines; rendered as a monument in the scene. */
  title: string
}

/** A stationary world, traversed by scroll. All hot state stays outside React. */
export default function AsciiWorld({ title }: AsciiWorldProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    const track = wrap?.closest<HTMLElement>('.hero')
    if (!wrap || !canvas || !track) return
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' })
    const fallback = () => { track.classList.remove('hero--ready', 'hero--world'); track.classList.add('hero--fallback') }
    if (!gl) { fallback(); return }

    let scene: WebGLProgram | undefined
    let glyphs: WebGLProgram | undefined
    let sceneTexture: WebGLTexture | undefined
    let atlasTexture: WebGLTexture | undefined
    let nameTexture: WebGLTexture | undefined
    let framebuffer: WebGLFramebuffer | null = null
    const disposeGL = () => {
      gl.deleteFramebuffer(framebuffer)
      if (sceneTexture) gl.deleteTexture(sceneTexture)
      if (atlasTexture) gl.deleteTexture(atlasTexture)
      if (nameTexture) gl.deleteTexture(nameTexture)
      if (scene) gl.deleteProgram(scene)
      if (glyphs) gl.deleteProgram(glyphs)
    }
    try {
      scene = createProgram(gl, VERTEX, SCENE)
      glyphs = createProgram(gl, VERTEX, GLYPHS)
      sceneTexture = createTexture(gl, gl.NEAREST)
      atlasTexture = createTexture(gl, gl.LINEAR)
      nameTexture = createTexture(gl, gl.LINEAR)
      framebuffer = gl.createFramebuffer()
      if (!framebuffer) throw new Error('Unable to allocate hero framebuffer')
    } catch (error) {
      console.warn('[hero] Falling back to static gateway', error)
      disposeGL()
      fallback()
      return
    }
    const sceneU = uniformsOf(gl, scene, ['uGrid', 'uTime', 'uProgress', 'uLook', 'uAspect', 'uNarrow', 'uName', 'uNamePos', 'uNameSize', 'uNameSpread', 'uNameReveal'] as const)
    const glyphU = uniformsOf(gl, glyphs, ['uScene', 'uAtlas', 'uGrid', 'uCell', 'uOffset', 'uGlyphs', 'uPointer', 'uPull', 'uPullRadius', 'uPullDepth', 'uPress', 'uPressPush'] as const)
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTexture, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    // The world owns the wordmark from here; the DOM copy keeps it for readers.
    track.classList.add('hero--world')

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    let reduced = motionQuery.matches
    let grid: Grid | null = null
    let dpr = 1
    let raf = 0
    let disposed = false
    let lost = false
    let lastPaint = 0
    let sceneTime = 0
    let trackHeight = 1
    let viewportHeight = 1
    let trackTop = 0
    let scrollY = window.scrollY
    let progress = 0
    let visible = true
    let frameInterval = 1000 / 45
    let narrow = false
    let slab: ReturnType<typeof nameSlab> | null = null
    let nameKey = ''
    let nameInk: { left: number; bottom: number } | null = null
    let anchorWorld: [number, number, number] | null = null
    let travel = 0
    const look = { x: 0, y: 0, targetX: 0, targetY: 0 }
    const placed = { x: 0, y: 0 }
    const fx = createPointerFx()
    // Dev-only: lets screenshot tooling confirm the pointer effects are alive.
    if (import.meta.env.DEV) (window as Window & { __heroFx?: unknown }).__heroFx = fx
    const copy = track.querySelector<HTMLElement>('.hero__copy')
    const titleLines = title.split('\n').filter(Boolean)

    const stop = () => { cancelAnimationFrame(raf); raf = 0 }
    // The introduction never moves. It starts fading with the first scrolled
    // pixel and is gone well before the pinned stage lets go.
    const placeCopy = () => {
      const fade = Math.min(1, Math.max(0, travel / .3))
      const opacity = 1 - fade * fade * (3 - 2 * fade)
      placed.x = look.x
      placed.y = look.y
      track.style.setProperty('--hero-copy-opacity', String(opacity))
      track.style.setProperty('--hero-copy-x', '0px')
      track.style.setProperty('--hero-copy-y', '0px')
      track.style.setProperty('--hero-copy-scale', '1')
      // Hidden scene links must not steal focus while reading later sections.
      if (copy) copy.inert = opacity < .05
    }
    const updatePresentation = () => {
      const y = Math.max(0, scrollY - trackTop)
      const stationary = reduced || lost || viewportHeight <= 650
      travel = stationary ? 0 : sceneProgress(y, trackHeight, viewportHeight)
      const arrival = stationary ? 0 : arrivalProgress(y, trackHeight, viewportHeight)
      // Pass through the gate as the next scene arrives, keeping a visible
      // landmark throughout the handoff instead of finishing the flight early.
      progress = travel * .58 + arrival * .42
      track.style.setProperty('--hero-scene-opacity', String(1 - arrival * arrival * (3 - 2 * arrival)))
      placeCopy()
      visible = y < trackHeight && scrollY + viewportHeight > trackTop
    }

    const draw = (now: number) => {
      raf = 0
      if (disposed || lost || !visible || document.hidden || !grid) return
      if (!reduced) raf = requestAnimationFrame(draw)
      if (!reduced && now - lastPaint < frameInterval) return
      const dt = lastPaint ? Math.min(.1, (now - lastPaint) / 1000) : 0
      lastPaint = now
      if (!reduced) sceneTime += dt
      const ease = reduced ? 1 : 1 - Math.exp(-dt * 5)
      look.x += ((reduced ? 0 : look.targetX) - look.x) * ease
      look.y += ((reduced ? 0 : look.targetY) - look.y) * ease
      // Keep the copy glued to the name while the pointer pans the world.
      if (anchorWorld && (Math.abs(look.x - placed.x) > 1e-4 || Math.abs(look.y - placed.y) > 1e-4)) placeCopy()
      const reveal = reduced ? 1 : smoothstep((sceneTime - REVEAL_DELAY) / REVEAL_DURATION)

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
      gl.viewport(0, 0, grid.cols, grid.rows)
      gl.useProgram(scene!)
      gl.uniform2f(sceneU.uGrid, grid.cols, grid.rows)
      gl.uniform1f(sceneU.uTime, reduced ? 0 : sceneTime)
      gl.uniform1f(sceneU.uProgress, progress)
      gl.uniform2f(sceneU.uLook, look.x, look.y)
      gl.uniform1f(sceneU.uAspect, (grid.cols * grid.cellW) / (grid.rows * grid.cellH))
      gl.uniform1f(sceneU.uNarrow, narrow ? 1 : 0)
      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_2D, nameTexture!)
      gl.uniform1i(sceneU.uName, 2)
      if (slab) {
        gl.uniform3f(sceneU.uNamePos, slab.pos[0], slab.pos[1], slab.pos[2])
        gl.uniform2f(sceneU.uNameSize, slab.size[0], slab.size[1])
        gl.uniform1f(sceneU.uNameSpread, 2 * NAME_SPREAD * slab.size[0] / NAME_TEXTURE.width)
      }
      gl.uniform1f(sceneU.uNameReveal, slab ? reveal : -1)
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(glyphs!)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, sceneTexture!)
      gl.uniform1i(glyphU.uScene, 0)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, atlasTexture!)
      gl.uniform1i(glyphU.uAtlas, 1)
      gl.uniform2f(glyphU.uGrid, grid.cols, grid.rows)
      gl.uniform2f(glyphU.uCell, grid.cellW * dpr, grid.cellH * dpr)
      gl.uniform2f(glyphU.uOffset, grid.offsetX * dpr, grid.offsetY * dpr)
      gl.uniform1f(glyphU.uGlyphs, GLYPH_RAMP.length)
      // The pointer draws the field toward itself; a press bumps the glyphs
      // around a click outward.
      easePull(fx, dt)
      const press = reduced ? { x: 0, y: 0, radius: 0, strength: 0 } : pressAt(fx, now / 1000)
      gl.uniform2f(glyphU.uPointer, fx.px * dpr, fx.py * dpr)
      gl.uniform1f(glyphU.uPull, fx.pull)
      gl.uniform1f(glyphU.uPullRadius, PULL_RADIUS * dpr)
      gl.uniform1f(glyphU.uPullDepth, PULL_DEPTH * dpr)
      gl.uniform4f(glyphU.uPress, press.x * dpr, press.y * dpr, press.radius * dpr, press.strength)
      gl.uniform1f(glyphU.uPressPush, PRESS_PUSH * dpr)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      track.classList.add('hero--ready')
    }
    const start = () => {
      if (!raf && visible && !document.hidden && !lost && !disposed) raf = requestAnimationFrame(draw)
    }
    const uploadName = () => {
      // Rebuild only when the lettering or the loaded typeface changes.
      const fontReady = document.fonts?.check('700 12px "JetBrains Mono"') ?? true
      const key = `${title}|${fontReady}`
      if (key === nameKey) return
      const field = buildNameField(titleLines, FONT_FAMILY)
      if (!field) return
      nameKey = key
      nameInk = field.ink
      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_2D, nameTexture!)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, field.width, field.height, 0, gl.RED, gl.UNSIGNED_BYTE, field.bytes)
    }
    const measure = () => {
      if (disposed || lost) return
      const { width, height } = wrap.getBoundingClientRect()
      if (!width || !height) return
      viewportHeight = height
      narrow = width < 768
      const cell = narrow ? CELL.narrow : CELL.wide
      trackHeight = track.offsetHeight
      trackTop = track.getBoundingClientRect().top + window.scrollY
      frameInterval = 1000 / (narrow ? 30 : 45)
      // Phones render their tiny glyphs at native density; desktops cap at 2x.
      dpr = Math.min(narrow ? 3 : 2, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      const ctx = document.createElement('canvas').getContext('2d')
      if (ctx) ctx.font = `500 ${cell.fontPx}px ${FONT_FAMILY}`
      const cellW = ctx?.measureText('M').width || cell.fontPx * .6
      grid = gridFor(width, height, cellW, cell.height)
      uploadName()
      // The plate lands on the introduction's left edge, just above its first line.
      // Offsets ignore the scroll transform, so a resize mid-scroll still measures the rest pose.
      const copyLeft = copy ? copy.offsetLeft : width * .06
      const copyTop = copy ? copy.offsetTop : height * .62
      slab = !nameInk ? null : nameSlab({
        narrow,
        aspect: width / height,
        left: (copyLeft / width * 2 - 1) * (width / height),
        top: 1 - 2 * copyTop / height,
        gap: 2 * NAME_GAP / height,
        ink: nameInk,
      })
      anchorWorld = slab && nameInk ? inkAnchor(slab, nameInk) : null
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, sceneTexture!)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, grid.cols, grid.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      const atlas = buildGlyphAtlas(cellW, cell.height, cell.fontPx, Math.ceil(dpr * 2))
      if (atlas) {
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, atlasTexture!)
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas)
      }
      scrollY = window.scrollY
      updatePresentation()
      lastPaint = 0
      start()
    }
    const onScroll = () => {
      scrollY = window.scrollY
      updatePresentation()
      if (visible) start()
      else stop()
    }
    const onPointer = (event: PointerEvent) => {
      fx.x = event.clientX
      fx.y = viewportHeight - event.clientY
      fx.targetPull = finePointer.matches && visible ? 1 : 0
      if (reduced || !finePointer.matches || !visible) return
      look.targetX = (event.clientX / window.innerWidth - .5) * .065
      look.targetY = -(event.clientY / window.innerHeight - .5) * .045
    }
    const onPointerLeave = () => { fx.targetPull = 0 }
    const onPress = (event: PointerEvent) => {
      if (!visible) return
      fx.press = { x: event.clientX, y: viewportHeight - event.clientY, startedAt: performance.now() / 1000 }
      start()
    }
    const onLost = (event: Event) => {
      event.preventDefault()
      lost = true
      stop()
      fallback()
      updatePresentation()
    }
    const onVisibility = () => { lastPaint = 0; if (document.hidden) stop(); else start() }
    const onMotion = () => { reduced = motionQuery.matches; stop(); measure() }
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(wrap)
    resizeObserver.observe(track)
    const fonts = document.fonts
    if (fonts) {
      Promise.all([fonts.load('500 12px "JetBrains Mono"'), fonts.load('700 12px "JetBrains Mono"')]).then(measure, () => undefined)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('pointerdown', onPress, { passive: true })
    document.addEventListener('pointerleave', onPointerLeave)
    window.addEventListener('pageshow', onScroll)
    document.addEventListener('visibilitychange', onVisibility)
    motionQuery.addEventListener('change', onMotion)
    canvas.addEventListener('webglcontextlost', onLost)
    measure()

    return () => {
      disposed = true
      stop()
      resizeObserver.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('pointerdown', onPress)
      document.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('pageshow', onScroll)
      document.removeEventListener('visibilitychange', onVisibility)
      motionQuery.removeEventListener('change', onMotion)
      canvas.removeEventListener('webglcontextlost', onLost)
      track.classList.remove('hero--ready', 'hero--fallback', 'hero--world')
      if (copy) copy.inert = false
      disposeGL()
    }
  }, [title])

  return (
    <div ref={wrapRef} className="hero__terminal" aria-hidden="true">
      <div className="hero__fallback" />
      <canvas ref={canvasRef} className="hero__plot" />
    </div>
  )
}
