import { useEffect, useRef } from 'react'
import type { ScreenKey, TeardownStory } from '../../content/teardown/types'
import { createProgram, createTexture, uniformsOf } from '../hero/gl'
import { buildGlyphAtlas } from '../hero/glyphAtlas'
import { setCovering } from '../hero/heroCover'
import { VERTEX } from '../hero/shaders'
import { GLYPH_RAMP, gridFor, sceneProgress, type Grid } from '../hero/world'
import { buildCodeTexture } from './codeTexture'
import { jointsAt } from './coach'
import { MAX_DRAG, PHONE, SCATTER_CELLS, anchorWorld, coachWorld, poseAt, projectPoint, type Interaction, type Vec3 } from './rig'
import { GLYPHS, JOINT_COUNT, SCENE } from './shaders'
import { actWindows } from './timeline'

export interface TeardownFrame {
  progress: number
  /** Stage-relative CSS px per anchor key, null when behind the camera. Keys: `c:<act>:<callout>`, `k:<card>`. */
  anchors: Map<string, { x: number; y: number } | null>
}

export interface TeardownCanvasProps {
  story: TeardownStory
  /** The chapter track. Progress is measured against it. */
  track: HTMLElement
  onFrame: (frame: TeardownFrame) => void
  /** First frame drawn with every screen texture uploaded. */
  onReady: () => void
  /** WebGL2 missing, a shader or framebuffer failed, or the context was lost. */
  onFallback: () => void
}

/** Finer than the hero grid, because the object fills less of the frame and needs more cells per feature. */
const CELL = { wide: { fontPx: 6.5, height: 8 }, narrow: { fontPx: 5, height: 6 } }
const FONT_FAMILY = '"JetBrains Mono", "IBM Plex Mono", monospace'
/** Texture slot order. GLYPHS binds uTex0 to uTex5 in this order. */
const SLOTS: (ScreenKey | 'code')[] = ['welcome', 'home', 'manage', 'recovery', 'community', 'code']
/** Pixels of the right edge left to the scroll rail. */
const RAIL_GUTTER = 32

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image()
  image.decoding = 'async'
  image.onload = () => resolve(image)
  image.onerror = () => reject(new Error(`image failed: ${src}`))
  image.src = src
})

/** Creates every GL object, or throws after deleting whatever it already made. */
function createResources(gl: WebGL2RenderingContext, backdropCount: number) {
  const textures: WebGLTexture[] = []
  const programs: WebGLProgram[] = []
  let framebuffer: WebGLFramebuffer | null = null
  const dispose = () => {
    gl.deleteFramebuffer(framebuffer)
    textures.forEach((t) => gl.deleteTexture(t))
    programs.forEach((p) => gl.deleteProgram(p))
  }
  // A 1x1 black level keeps unloaded textures complete, so sampling them reads black without driver warnings.
  const mipmapped = () => {
    const t = createTexture(gl, gl.LINEAR)
    textures.push(t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
    return t
  }
  try {
    const scene = createProgram(gl, VERTEX, SCENE); programs.push(scene)
    const glyphs = createProgram(gl, VERTEX, GLYPHS); programs.push(glyphs)
    const sceneTex = createTexture(gl, gl.NEAREST); textures.push(sceneTex)
    const depthTex = createTexture(gl, gl.NEAREST); textures.push(depthTex)
    const atlasTex = createTexture(gl, gl.LINEAR); textures.push(atlasTex)
    const slotTex = SLOTS.map(mipmapped)
    const backTex = Array.from({ length: backdropCount }, mipmapped)
    framebuffer = gl.createFramebuffer()
    if (!framebuffer) throw new Error('framebuffer allocation failed')
    return { scene, glyphs, sceneTex, depthTex, atlasTex, slotTex, backTex, framebuffer, dispose }
  } catch (error) {
    dispose()
    throw error
  }
}

/** The chapter's 3D stage. All hot state stays outside React, as in the hero's AsciiWorld. */
export default function TeardownCanvas({ story, track, onFrame, onReady, onFallback }: TeardownCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const callbacks = useRef({ onFrame, onReady, onFallback })
  useEffect(() => { callbacks.current = { onFrame, onReady, onFallback } })

  useEffect(() => {
    const canvas = canvasRef.current
    const stage = canvas?.parentElement
    if (!canvas || !stage) return
    const fail = () => callbacks.current.onFallback()
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false, powerPreference: 'high-performance' })
    if (!gl) { fail(); return }
    const res = (() => {
      try { return createResources(gl, story.backdrops.length) } catch (error) { console.warn('[teardown] falling back to the DOM stage', error); return null }
    })()
    if (!res) { fail(); return }
    const { scene, glyphs, sceneTex, depthTex, atlasTex, slotTex, backTex, framebuffer } = res

    const sceneU = uniformsOf(gl, scene, ['uGrid', 'uAspect', 'uCamPos', 'uShift', 'uPhonePos', 'uPhoneRight', 'uPhoneUp', 'uPhoneNormal', 'uPhoneBound', 'uInternals', 'uGlassCenter', 'uGlass', 'uBackA', 'uBackB', 'uBack', 'uBackAspect', 'uBackLod', 'uBackDrift', 'uJoints', 'uCoachBound', 'uCoach'] as const)
    const glyphU = uniformsOf(gl, glyphs, ['uScene', 'uDepth', 'uAtlas', 'uTex0', 'uTex1', 'uTex2', 'uTex3', 'uTex4', 'uTex5', 'uGrid', 'uCell', 'uOffset', 'uGlyphs', 'uAspect', 'uCanvasH', 'uCamPos', 'uShift', 'uGather', 'uScatter', 'uPC', 'uPR', 'uPU', 'uPS', 'uPState'] as const)
    const slotUniforms = [glyphU.uTex0, glyphU.uTex1, glyphU.uTex2, glyphU.uTex3, glyphU.uTex4, glyphU.uTex5]

    const windows = actWindows(story.acts)
    const actBackdrops = story.acts.map((a) => a.backdrop)
    const slotHeight = SLOTS.map(() => 1)
    const slotReady = SLOTS.map(() => false)
    const backReady = story.backdrops.map(() => false)
    const backAspect = story.backdrops.map(() => 16 / 9)
    const backRequested = new Set<number>()
    const jointData = new Float32Array(JOINT_COUNT * 3)
    const planeData = { c: new Float32Array(18), r: new Float32Array(18), u: new Float32Array(18), s: new Float32Array(18), st: new Float32Array(24) }
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    let grid: Grid | null = null
    let dpr = 1
    let narrow = false
    let width = 1
    let height = 1
    let trackTop = 0
    let trackHeight = 1
    let progress = 0
    let visible = false
    let lost = false
    let disposed = false
    let ready = false
    let raf = 0
    let lastPaint = 0
    let frameInterval = 1000 / 45
    let covering = false
    const interaction: Interaction = { dragYaw: 0, tiltX: 0, tiltY: 0 }
    const target: Interaction = { dragYaw: 0, tiltX: 0, tiltY: 0 }
    let drag: { id: number; x: number; start: number } | null = null

    const stop = () => { cancelAnimationFrame(raf); raf = 0 }
    const start = () => { if (!raf && visible && !document.hidden && !lost && !disposed) raf = requestAnimationFrame(draw) }
    const upload = (texture: WebGLTexture, source: TexImageSource) => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
      gl.generateMipmap(gl.TEXTURE_2D)
    }
    const requestBackdrop = (index: number | null) => {
      if (index === null || index < 0 || index >= story.backdrops.length || backRequested.has(index)) return
      backRequested.add(index)
      loadImage(story.backdrops[index].src).then((image) => {
        if (disposed || lost) return
        upload(backTex[index], image)
        backAspect[index] = image.naturalWidth / image.naturalHeight
        backReady[index] = true
        start()
      }, () => undefined)
    }
    story.screens.forEach((screen) => {
      const i = SLOTS.indexOf(screen.key)
      loadImage(screen.src).then((image) => {
        if (disposed || lost) return
        upload(slotTex[i], image)
        slotHeight[i] = image.naturalHeight
        slotReady[i] = true
        start()
      }, () => undefined)
    })
    const uploadCode = () => {
      const code = buildCodeTexture(story.code, story.codeSource)
      if (!code || disposed || lost) return
      const i = SLOTS.indexOf('code')
      upload(slotTex[i], code)
      slotHeight[i] = code.height
      slotReady[i] = true
      start()
    }
    /** Eases interaction toward its target. Returns true while anything is still moving. */
    const settle = (dt: number) => {
      const k = 1 - Math.exp(-dt * 8)
      let moving = false
      for (const key of ['dragYaw', 'tiltX', 'tiltY'] as const) {
        const delta = target[key] - interaction[key]
        if (Math.abs(delta) > 1e-4) { interaction[key] += delta * k; moving = true } else interaction[key] = target[key]
      }
      return moving
    }

    const draw = (now: number) => {
      raf = 0
      if (disposed || lost || !visible || document.hidden || !grid) return
      if (lastPaint && now - lastPaint < frameInterval) { raf = requestAnimationFrame(draw); return }
      const dt = lastPaint ? Math.min(0.1, (now - lastPaint) / 1000) : 0
      lastPaint = now
      const easing = settle(dt)
      const pose = poseAt({ progress, windows, backdrops: actBackdrops, narrow, aspect: width / height, interaction, poseFrames: story.pose.frames })
      requestBackdrop(pose.backdrop.a)
      requestBackdrop(pose.backdrop.b)
      const nextAct = windows.findIndex((w) => progress < w.start)
      if (nextAct >= 0) requestBackdrop(actBackdrops[nextAct])

      const aspect = (grid.cols * grid.cellW) / (grid.rows * grid.cellH)
      jointData.fill(0)
      if (pose.coach.amount > 0.01) coachWorld(pose, jointsAt(story.pose, pose.coach.frame)).forEach((j, i) => jointData.set(j, i * 3))
      const backA = pose.backdrop.a >= 0 && backReady[pose.backdrop.a] ? pose.backdrop.a : -1
      const backB = pose.backdrop.b >= 0 && backReady[pose.backdrop.b] ? pose.backdrop.b : backA

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1])
      gl.viewport(0, 0, grid.cols, grid.rows)
      gl.useProgram(scene)
      gl.uniform2f(sceneU.uGrid, grid.cols, grid.rows)
      gl.uniform1f(sceneU.uAspect, aspect)
      gl.uniform3fv(sceneU.uCamPos, pose.camera.pos)
      gl.uniform2fv(sceneU.uShift, pose.camera.shift)
      gl.uniform3fv(sceneU.uPhonePos, pose.phone.pos)
      gl.uniform3fv(sceneU.uPhoneRight, pose.phone.right)
      gl.uniform3fv(sceneU.uPhoneUp, pose.phone.up)
      gl.uniform3fv(sceneU.uPhoneNormal, pose.phone.normal)
      gl.uniform4f(sceneU.uPhoneBound, pose.phone.pos[0], pose.phone.pos[1], pose.phone.pos[2], Math.hypot(PHONE.hx, PHONE.hy) + 0.08)
      gl.uniform1f(sceneU.uInternals, pose.internals)
      gl.uniform3fv(sceneU.uGlassCenter, pose.glass.center)
      gl.uniform3f(sceneU.uGlass, pose.glass.light, pose.glass.sweep, pose.glass.band)
      gl.activeTexture(gl.TEXTURE3)
      gl.bindTexture(gl.TEXTURE_2D, backTex[Math.max(0, backA)])
      gl.uniform1i(sceneU.uBackA, 3)
      gl.activeTexture(gl.TEXTURE4)
      gl.bindTexture(gl.TEXTURE_2D, backTex[Math.max(0, backB)])
      gl.uniform1i(sceneU.uBackB, 4)
      gl.uniform4f(sceneU.uBack, backB === backA ? 1 : pose.backdrop.mix, backA >= 0 ? pose.backdrop.gain : 0, 0, 0)
      gl.uniform2f(sceneU.uBackAspect, backAspect[Math.max(0, backA)], backAspect[Math.max(0, backB)])
      gl.uniform1f(sceneU.uBackLod, Math.max(0, Math.log2(1600 / grid.cols)))
      gl.uniform1f(sceneU.uBackDrift, pose.backdrop.drift)
      gl.uniform3fv(sceneU.uJoints, jointData)
      // Bound covers the arm-raise extents (x ±0.69, y -0.39 to 0.64 in pose units) at the coach scale.
      gl.uniform4f(sceneU.uCoachBound, pose.coach.pos[0], pose.coach.pos[1] + 0.12 * pose.coach.scale, pose.coach.pos[2], 0.95 * pose.coach.scale)
      gl.uniform2f(sceneU.uCoach, pose.coach.amount, pose.coach.scale)
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.useProgram(glyphs)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneTex); gl.uniform1i(glyphU.uScene, 0)
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, depthTex); gl.uniform1i(glyphU.uDepth, 1)
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, atlasTex); gl.uniform1i(glyphU.uAtlas, 2)
      slotTex.forEach((t, i) => { gl.activeTexture(gl.TEXTURE5 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(slotUniforms[i], 5 + i) })
      gl.uniform2f(glyphU.uGrid, grid.cols, grid.rows)
      gl.uniform2f(glyphU.uCell, grid.cellW * dpr, grid.cellH * dpr)
      gl.uniform2f(glyphU.uOffset, grid.offsetX * dpr, grid.offsetY * dpr)
      gl.uniform1f(glyphU.uGlyphs, GLYPH_RAMP.length)
      gl.uniform1f(glyphU.uAspect, aspect)
      gl.uniform1f(glyphU.uCanvasH, canvas.height)
      gl.uniform3fv(glyphU.uCamPos, pose.camera.pos)
      gl.uniform2fv(glyphU.uShift, pose.camera.shift)
      gl.uniform1f(glyphU.uGather, pose.gather)
      gl.uniform1f(glyphU.uScatter, SCATTER_CELLS)
      ;[pose.screen, pose.code, ...pose.cards].forEach((plane, i) => {
        const s = SLOTS.indexOf(plane.texture)
        planeData.c.set(plane.center, i * 3)
        planeData.r.set(plane.right, i * 3)
        planeData.u.set(plane.up, i * 3)
        planeData.s.set([plane.halfW, plane.halfH, plane.radius], i * 3)
        planeData.st.set([plane.develop, slotReady[s] ? plane.opacity : 0, s, slotHeight[s]], i * 4)
      })
      gl.uniform3fv(glyphU.uPC, planeData.c)
      gl.uniform3fv(glyphU.uPR, planeData.r)
      gl.uniform3fv(glyphU.uPU, planeData.u)
      gl.uniform3fv(glyphU.uPS, planeData.s)
      gl.uniform4fv(glyphU.uPState, planeData.st)
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      const anchors = new Map<string, { x: number; y: number } | null>()
      const toPx = (point: Vec3) => {
        const at = projectPoint(pose, point, width / height)
        return at ? { x: at.x * width, y: at.y * height } : null
      }
      story.acts.forEach((act, a) => act.callouts.forEach((callout, c) => anchors.set(`c:${a}:${c}`, toPx(anchorWorld(pose, callout.anchor)))))
      pose.cards.forEach((card, k) => anchors.set(`k:${k}`, toPx([card.center[0], card.center[1] - card.halfH * 1.08, card.center[2]])))
      callbacks.current.onFrame({ progress, anchors })

      if (!ready && story.screens.every((screen) => slotReady[SLOTS.indexOf(screen.key)])) {
        ready = true
        updateCovering()
        callbacks.current.onReady()
      }
      // Scroll and image loads restart the loop, so it runs on only while the drag or tilt is still easing.
      if (easing) raf = requestAnimationFrame(draw)
    }

    // A collapsed phone toolbar makes the visible viewport taller than the 100svh stage. The strip
    // below the stage then shows the page background, so the stage does not claim to cover.
    const updateCovering = () => {
      const y = window.scrollY
      const visibleHeight = window.visualViewport?.height ?? window.innerHeight
      const next = ready && !lost && y >= trackTop && y + height <= trackTop + trackHeight + 0.5 && height + 0.01 >= visibleHeight
      if (next !== covering) { covering = next; setCovering('teardown', covering) }
    }
    const onScroll = () => {
      const y = window.scrollY
      progress = sceneProgress(y - trackTop, trackHeight, height)
      visible = y + window.innerHeight > trackTop && y < trackTop + trackHeight
      updateCovering()
      if (visible) start()
      else stop()
    }
    const measure = () => {
      if (disposed || lost) return
      const rect = stage.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      width = rect.width
      height = rect.height
      narrow = width < 768
      const cell = narrow ? CELL.narrow : CELL.wide
      frameInterval = 1000 / (narrow ? 30 : 45)
      dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      const ctx = document.createElement('canvas').getContext('2d')
      if (ctx) ctx.font = `500 ${cell.fontPx}px ${FONT_FAMILY}`
      const cellW = ctx?.measureText('M').width || cell.fontPx * 0.6
      grid = gridFor(width, height, cellW, cell.height)
      trackTop = track.getBoundingClientRect().top + window.scrollY
      trackHeight = track.offsetHeight
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
      for (const [texture, attachment] of [[sceneTex, gl.COLOR_ATTACHMENT0], [depthTex, gl.COLOR_ATTACHMENT1]] as const) {
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, grid.cols, grid.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, texture, 0)
      }
      const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      if (!complete) { lost = true; stop(); fail(); return }
      const atlas = buildGlyphAtlas(cellW, cell.height, cell.fontPx, Math.ceil(dpr * 2))
      if (atlas) {
        gl.bindTexture(gl.TEXTURE_2D, atlasTex)
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas)
      }
      lastPaint = 0
      onScroll()
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.clientX > window.innerWidth - RAIL_GUTTER) return
      if ((event.target as Element | null)?.closest('a, button')) return
      drag = { id: event.pointerId, x: event.clientX, start: target.dragYaw }
      stage.setPointerCapture?.(event.pointerId)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (drag && event.pointerId === drag.id) {
        target.dragYaw = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, drag.start + (event.clientX - drag.x) * 0.006))
        start()
      }
      if (finePointer.matches) {
        target.tiltX = (event.clientX / window.innerWidth - 0.5) * 2
        target.tiltY = (event.clientY / window.innerHeight - 0.5) * 2
        start()
      }
    }
    const release = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return
      drag = null
      target.dragYaw = 0
      start()
    }
    const onLeave = () => { target.tiltX = 0; target.tiltY = 0; start() }
    const onLost = (event: Event) => {
      event.preventDefault()
      lost = true
      stop()
      if (covering) { covering = false; setCovering('teardown', false) }
      fail()
    }
    const onVisibility = () => { lastPaint = 0; if (document.hidden) stop(); else start() }

    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(stage)
    resizeObserver.observe(track)
    const fontsReady = document.fonts ? document.fonts.load('500 12px "JetBrains Mono"') : Promise.resolve([])
    fontsReady.then(() => { uploadCode(); measure() }, uploadCode)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    stage.addEventListener('pointerdown', onPointerDown)
    stage.addEventListener('pointermove', onPointerMove, { passive: true })
    stage.addEventListener('pointerup', release)
    stage.addEventListener('pointercancel', release)
    stage.addEventListener('pointerleave', onLeave)
    document.addEventListener('visibilitychange', onVisibility)
    canvas.addEventListener('webglcontextlost', onLost)
    measure()

    return () => {
      disposed = true
      stop()
      resizeObserver.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      stage.removeEventListener('pointerdown', onPointerDown)
      stage.removeEventListener('pointermove', onPointerMove)
      stage.removeEventListener('pointerup', release)
      stage.removeEventListener('pointercancel', release)
      stage.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onLost)
      if (covering) setCovering('teardown', false)
      res.dispose()
    }
  }, [story, track])

  return <canvas ref={canvasRef} className="teardown__canvas" aria-hidden="true" />
}
