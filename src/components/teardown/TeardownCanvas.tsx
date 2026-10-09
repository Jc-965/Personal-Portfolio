import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { ScreenKey, TeardownStory } from '../../content/teardown/types'
import { buildGlyphAtlas } from '../hero/glyphAtlas'
import { setCovering } from '../hero/heroCover'
import { sceneProgress } from '../hero/world'
import { buildCodeTexture } from './codeTexture'
import { COACH_BONES, jointsAt } from './coach'
import { createComposite } from './composite'
import { glideStep, type Glide } from './glide'
import { CHAPTER_RAMP } from './materials'
import { createProduct, type PlaneMesh } from './product'
import { FOCAL, MAX_DRAG, anchorWorld, coachWorld, poseAt, projectPoint, type Interaction, type PlanePose, type Pose, type Vec3 } from './rig'
import { applyLensShift, toThreePosition, verticalFov } from './threeMap'
import { actWindows } from './timeline'

export interface TeardownFrame {
  /** Glided chapter progress, the value every visual and the act state follow. */
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

/** Glyph cells, about 3 by 6.5 CSS px on wide screens and 2.7 by 5.5 on phones. The width is the font's advance. */
const CELL = { wide: { fontPx: 5, height: 6.5 }, narrow: { fontPx: 4.5, height: 5.5 } }
const FONT_FAMILY = '"JetBrains Mono", "IBM Plex Mono", monospace'
/** Pixels of the right edge left to the scroll rail. */
const RAIL_GUTTER = 32
/** rAF timestamps jitter by a millisecond or two, so a frame counts as due this much before its interval ends. */
const FRAME_SLACK = 3

type Loaded = { texture: THREE.Texture; ready: boolean; width: number; height: number; aspect: number }

/**
 * The product scene, its render target, and the composite. Throws after
 * disposing whatever it already made, so the caller only has to fall back.
 */
function createStage(renderer: THREE.WebGLRenderer, story: TeardownStory, narrow: boolean) {
  const disposers: (() => void)[] = []
  const dispose = () => disposers.splice(0).reverse().forEach((d) => d())
  try {
    const pmrem = new THREE.PMREMGenerator(renderer)
    const room = new RoomEnvironment()
    const environment = pmrem.fromScene(room, 0.04)
    room.dispose()
    pmrem.dispose()
    disposers.push(() => environment.dispose())

    const scene = new THREE.Scene()
    scene.environment = environment.texture
    // three.js world space: the camera sits on +z and looks along -z, so "front" is +z.
    const key = new THREE.DirectionalLight('#ffe2b8', 2.2)
    key.position.set(-2.2, 2.6, 3)
    const rim = new THREE.DirectionalLight('#ffc27a', 1.6)
    rim.position.set(2.6, 1.2, -3)
    scene.add(key, rim, new THREE.AmbientLight('#ffffff', 0.08))

    const product = createProduct(story, { narrow, environment: environment.texture })
    disposers.push(() => product.dispose())
    scene.add(product.group)

    // Half float keeps lit highlights above 1.0 for the composite's shoulder and glow. Without a renderable
    // half-float format, 8-bit linear still works, with some banding in dark gradients.
    const halfFloat = renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float')
    const target = new THREE.WebGLRenderTarget(1, 1, {
      samples: 4,
      type: halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
      colorSpace: THREE.LinearSRGBColorSpace,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    })
    disposers.push(() => target.dispose())

    const composite = createComposite()
    disposers.push(() => composite.dispose())
    composite.material.uniforms.uProduct.value = target.texture

    const camera = new THREE.PerspectiveCamera(verticalFov(FOCAL), 1, 0.05, 40)
    return { scene, camera, product, target, composite, dispose }
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
    let failed = false
    let stop = () => {}
    let covering = false
    const fail = (reason: unknown) => {
      if (failed) return
      failed = true
      stop()
      console.warn('[teardown] falling back to the DOM stage', reason)
      if (covering) { covering = false; setCovering('teardown', false) }
      callbacks.current.onFallback()
    }

    let renderer: THREE.WebGLRenderer
    let gpu: ReturnType<typeof createStage>
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' })
    } catch (error) {
      fail(error)
      return
    }
    try {
      // The composite writes sRGB itself, and every lit material renders into the linear target.
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace
      renderer.toneMapping = THREE.NoToneMapping
      renderer.setClearColor(0x000000, 0)
      renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
        fail([gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].filter(Boolean).join('\n'))
      }
      gpu = createStage(renderer, story, stage.clientWidth < 768)
    } catch (error) {
      renderer.dispose()
      fail(error)
      return
    }
    const { scene, camera, product, target, composite, dispose: disposeStage } = gpu
    const cu = composite.material.uniforms
    const planes: PlaneMesh[] = [product.screen, ...product.cards]

    const windows = actWindows(story.acts)
    const actBackdrops = story.acts.map((a) => a.backdrop)
    // Screens and the code layer turn away from the camera in the exploded fan, and 8x keeps their UI text
    // sharp there. Rooms are sampled only through textureLod, which has no derivatives, so the value does not
    // apply to them.
    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
    const loader = new THREE.TextureLoader()
    const owned: THREE.Texture[] = []
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    const drawingBuffer = new THREE.Vector2(1, 1)
    let atlas: THREE.CanvasTexture | null = null
    let code: THREE.CanvasTexture | null = null
    let narrow = stage.clientWidth < 768
    let width = 1
    let height = 1
    let trackTop = 0
    let trackHeight = 1
    let progress = 0
    let glide: Glide = { value: 0, velocity: 0 }
    let visible = false
    let lost = false
    let disposed = false
    let compiled = false
    let ready = false
    let raf = 0
    let lastPaint = 0
    let frameInterval = 1000 / 60
    const interaction: Interaction = { dragYaw: 0, tiltX: 0, tiltY: 0 }
    const goal: Interaction = { dragYaw: 0, tiltX: 0, tiltY: 0 }
    let drag: { id: number; x: number; start: number } | null = null

    stop = () => { cancelAnimationFrame(raf); raf = 0; lastPaint = 0 }
    const start = () => { if (!raf && visible && compiled && !document.hidden && !lost && !failed && !disposed) raf = requestAnimationFrame(draw) }

    /** Loads an sRGB, mipmapped image texture and uploads it as soon as it arrives, so first use never stalls a frame. */
    const load = (src: string): Loaded => {
      const texture = loader.load(src, () => {
        if (disposed || failed) return
        entry.width = texture.image.naturalWidth
        entry.height = texture.image.naturalHeight
        entry.aspect = entry.width / Math.max(1, entry.height)
        renderer.initTexture(texture)
        entry.ready = true
        start()
      }, undefined, () => undefined)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = anisotropy
      owned.push(texture)
      const entry: Loaded = { texture, ready: false, width: 1, height: 1, aspect: 16 / 9 }
      return entry
    }
    const screens = new Map<ScreenKey, Loaded>(story.screens.map((screen) => [screen.key, load(screen.src)]))
    const rooms: (Loaded | null)[] = story.backdrops.map(() => null)
    const requestRoom = (index: number | null) => {
      if (index === null || index < 0 || index >= rooms.length || rooms[index]) return
      rooms[index] = load(story.backdrops[index].src)
    }
    const uploadCode = () => {
      if (code || disposed || failed) return
      const source = buildCodeTexture(story.code, story.codeSource)
      if (!source) return
      code = new THREE.CanvasTexture(source)
      code.colorSpace = THREE.SRGBColorSpace
      code.anisotropy = anisotropy
      renderer.initTexture(code)
      product.code.material.uniforms.uMap.value = code
      start()
    }

    /** Eases interaction toward its goal. Returns true while anything is still moving. */
    const settle = (dt: number) => {
      const k = 1 - Math.exp(-dt * 8)
      let moving = false
      for (const key of ['dragYaw', 'tiltX', 'tiltY'] as const) {
        const delta = goal[key] - interaction[key]
        if (Math.abs(delta) > 1e-4) { interaction[key] += delta * k; moving = true } else interaction[key] = goal[key]
      }
      return moving
    }

    /** Plane uniforms. A plane whose texture has not arrived stays hidden instead of drawing black. */
    const applyPlane = (mesh: PlaneMesh, plane: PlanePose | undefined) => {
      const u = mesh.material.uniforms
      let opacity = plane?.opacity ?? 0
      if (plane && plane.texture !== 'code') {
        const screen = screens.get(plane.texture)
        if (screen?.ready) {
          u.uMap.value = screen.texture
          u.uTexSize.value.set(screen.width, screen.height)
          u.uDevelop.value = plane.develop
        } else opacity = 0
      } else if (!code) opacity = 0
      u.uOpacity.value = opacity
      mesh.visible = opacity > 0.001
    }

    const applyComposite = (pose: Pose, aspect: number) => {
      const { a, b, mix, gain, glyphOnly, drift } = pose.backdrop
      const roomA = a >= 0 && rooms[a]?.ready ? a : -1
      const roomB = b >= 0 && rooms[b]?.ready ? b : -1
      // Until both rooms of a dissolve have loaded, the one that has stands in for both.
      const first = rooms[roomA >= 0 ? roomA : roomB] ?? null
      const second = rooms[roomB] ?? first
      // Focus points count y from the top of the photo, and texture v counts from the bottom.
      const focus = (index: number): [number, number] => {
        const [x, y] = story.backdrops[index]?.focus ?? [0.5, 0.5]
        return [x, 1 - y]
      }
      cu.uBackA.value = first?.texture ?? null
      cu.uBackB.value = second?.texture ?? null
      cu.uBackAspect.value.set(first?.aspect ?? 16 / 9, second?.aspect ?? 16 / 9)
      cu.uFocus.value.set(...focus(roomA >= 0 ? roomA : roomB), ...focus(roomB >= 0 ? roomB : roomA))
      cu.uBackMix.value = roomA >= 0 && roomB >= 0 ? mix : 0
      cu.uBackGain.value = first ? gain : 0
      cu.uGlyphOnly.value = glyphOnly
      cu.uDrift.value = drift
      cu.uPointer.value.set(interaction.tiltX, -interaction.tiltY)
      cu.uDecode.value = pose.decode
      cu.uGather.value = pose.gather
      cu.uCoach.value = pose.coach.amount
      if (pose.coach.amount <= 0.01) return
      // Skeleton in device px with the origin at the bottom left, as gl_FragCoord counts.
      const toDevice = (point: Vec3): [number, number] => {
        const at = projectPoint(pose, point, aspect)
        return at ? [at.x * drawingBuffer.x, (1 - at.y) * drawingBuffer.y] : [-1e5, -1e5]
      }
      const joints = coachWorld(pose, jointsAt(story.pose, pose.coach.frame)).map(toDevice)
      const bones = cu.uBones.value as Float32Array
      COACH_BONES.forEach(([i, k], n) => bones.set([...joints[i], ...joints[k]], n * 4))
      const centre = projectPoint(pose, pose.coach.pos, aspect)
      const pixelsPerUnit = centre ? (drawingBuffer.y / 2) * FOCAL / centre.depth : 0
      cu.uLimb.value = 0.024 * pose.coach.scale * pixelsPerUnit
      cu.uHead.value.set(joints[0][0], joints[0][1], 0.07 * pose.coach.scale * pixelsPerUnit)
    }

    const draw = (now: number) => {
      raf = 0
      if (disposed || failed || lost || !visible || document.hidden || !compiled) return
      if (lastPaint && now - lastPaint < frameInterval - FRAME_SLACK) { raf = requestAnimationFrame(draw); return }
      const dt = lastPaint ? Math.min(0.1, (now - lastPaint) / 1000) : 0
      lastPaint = now
      const easing = settle(dt)
      glide = glideStep(glide, progress, dt)
      // The follow decays toward the target without reaching it, so it lands on the target once it is within
      // 1e-4 progress and moving slower than 1e-3 progress per second.
      if (Math.abs(glide.value - progress) < 1e-4 && Math.abs(glide.velocity) < 1e-3) glide = { value: progress, velocity: 0 }
      const aspect = width / height
      const pose = poseAt({ progress: glide.value, windows, backdrops: actBackdrops, narrow, aspect, interaction, poseFrames: story.pose.frames })
      requestRoom(pose.backdrop.a)
      requestRoom(pose.backdrop.b)
      const nextAct = windows.findIndex((w) => glide.value < w.start)
      if (nextAct >= 0) requestRoom(actBackdrops[nextAct])

      product.update(pose)
      applyPlane(product.screen, pose.screen)
      applyPlane(product.code, pose.code)
      product.cards.forEach((card, i) => applyPlane(card, pose.cards[i]))
      camera.aspect = aspect
      camera.position.fromArray(toThreePosition(pose.camera.pos))
      camera.updateProjectionMatrix()
      camera.projectionMatrix.fromArray(applyLensShift(camera.projectionMatrix.toArray(), pose.camera.shift, aspect))
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
      applyComposite(pose, aspect)

      renderer.setRenderTarget(target)
      renderer.render(scene, camera)
      renderer.setRenderTarget(null)
      renderer.render(composite.scene, composite.camera)
      if (failed) return

      const anchors = new Map<string, { x: number; y: number } | null>()
      const toPx = (point: Vec3) => {
        const at = projectPoint(pose, point, aspect)
        return at ? { x: at.x * width, y: at.y * height } : null
      }
      story.acts.forEach((act, a) => act.callouts.forEach((callout, c) => anchors.set(`c:${a}:${c}`, toPx(anchorWorld(pose, callout.anchor)))))
      pose.cards.forEach((card, k) => anchors.set(`k:${k}`, toPx([card.center[0], card.center[1] - card.halfH * 1.08, card.center[2]])))
      callbacks.current.onFrame({ progress: glide.value, anchors })

      if (!ready && [...screens.values()].every((screen) => screen.ready)) {
        ready = true
        updateCovering()
        callbacks.current.onReady()
      }
      // Scroll, pointer input, and texture loads restart the loop, so it runs on only while the glide or the interaction is still moving.
      if (easing || glide.value !== progress) raf = requestAnimationFrame(draw)
      else lastPaint = 0
    }

    // A collapsed phone toolbar makes the visible viewport taller than the 100svh stage. The strip
    // below the stage then shows the page background, so the stage does not claim to cover.
    const updateCovering = () => {
      const y = window.scrollY
      const visibleHeight = window.visualViewport?.height ?? window.innerHeight
      const next = ready && !lost && !failed && y >= trackTop && y + height <= trackTop + trackHeight + 0.5 && height + 0.01 >= visibleHeight
      if (next !== covering) { covering = next; setCovering('teardown', covering) }
    }
    const onScroll = () => {
      const y = window.scrollY
      progress = sceneProgress(y - trackTop, trackHeight, height)
      const wasVisible = visible
      visible = y + window.innerHeight > trackTop && y < trackTop + trackHeight
      // Arriving from off screen starts at the scroll position instead of gliding through every act in between.
      if (visible && !wasVisible) glide = { value: progress, velocity: 0 }
      updateCovering()
      if (visible) start()
      else stop()
    }
    const measure = () => {
      if (disposed || lost || failed) return
      const rect = stage.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      width = rect.width
      height = rect.height
      const nextNarrow = width < 768
      if (nextNarrow !== narrow) product.setNarrow(nextNarrow)
      narrow = nextNarrow
      frameInterval = 1000 / (narrow ? 45 : 60)
      const pixelRatio = Math.min(width > 1800 ? 1.75 : 2, window.devicePixelRatio || 1)
      renderer.setPixelRatio(pixelRatio)
      renderer.setSize(width, height, false)
      renderer.getDrawingBufferSize(drawingBuffer)
      target.setSize(drawingBuffer.x, drawingBuffer.y)
      // three raises no error for an incomplete target (for example, multisampled RGBA16F unsupported at 4
      // samples), and drawing into one leaves the phone invisible. setRenderTarget rebuilds the framebuffers
      // after a resize and binds the multisampled one, so the check sees the attachments the frame draws into.
      renderer.setRenderTarget(target)
      const gl = renderer.getContext()
      const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
      renderer.setRenderTarget(null)
      if (!complete) { fail('the product render target is incomplete'); return }
      cu.uRes.value.copy(drawingBuffer)

      // Cells are whole device pixels, so every glyph lands on the same pixel phase and stays crisp.
      const cell = narrow ? CELL.narrow : CELL.wide
      const ctx = document.createElement('canvas').getContext('2d')
      if (ctx) ctx.font = `500 ${cell.fontPx}px ${FONT_FAMILY}`
      const advance = ctx?.measureText('M').width || cell.fontPx * 0.6
      const cellW = Math.max(2, Math.round(advance * pixelRatio))
      const cellH = Math.max(3, Math.round(cell.height * pixelRatio))
      cu.uCell.value.set(cellW, cellH)
      planes.forEach((plane) => plane.material.uniforms.uCell.value.set(cellW, cellH))
      const glyphs = buildGlyphAtlas(cellW / pixelRatio, cellH / pixelRatio, cell.fontPx, Math.ceil(pixelRatio * 2), CHAPTER_RAMP)
      if (glyphs) {
        atlas?.dispose()
        atlas = new THREE.CanvasTexture(glyphs)
        atlas.flipY = false
        atlas.generateMipmaps = false
        atlas.minFilter = THREE.LinearFilter
        cu.uAtlas.value = atlas
        planes.forEach((plane) => { plane.material.uniforms.uAtlas.value = atlas })
      }

      trackTop = track.getBoundingClientRect().top + window.scrollY
      trackHeight = track.offsetHeight
      lastPaint = 0
      onScroll()
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.clientX > window.innerWidth - RAIL_GUTTER) return
      if ((event.target as Element | null)?.closest('a, button')) return
      drag = { id: event.pointerId, x: event.clientX, start: goal.dragYaw }
      stage.setPointerCapture?.(event.pointerId)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (drag && event.pointerId === drag.id) {
        goal.dragYaw = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, drag.start + (event.clientX - drag.x) * 0.006))
        start()
      }
      if (finePointer.matches) {
        goal.tiltX = (event.clientX / window.innerWidth - 0.5) * 2
        goal.tiltY = (event.clientY / window.innerHeight - 0.5) * 2
        start()
      }
    }
    const release = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return
      drag = null
      goal.dragYaw = 0
      start()
    }
    const onLeave = () => { goal.tiltX = 0; goal.tiltY = 0; start() }
    const onLost = () => {
      lost = true
      fail('the WebGL context was lost')
    }
    const onVisibility = () => { lastPaint = 0; if (document.hidden) stop(); else start() }

    // compile() prepares a program for every mesh in the scene whether or not it is visible, so the internals
    // and glass programs exist before the glass act first shows them. It only submits the programs, and the
    // driver builds them in the background where KHR_parallel_shader_compile exists. compileAsync is avoided
    // because its polling cannot be cancelled and reads deleted programs after an unmount.
    renderer.compile(scene, camera)
    renderer.compile(composite.scene, composite.camera)
    const firstFrame = requestAnimationFrame(() => {
      compiled = true
      start()
    })

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
      cancelAnimationFrame(firstFrame)
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
      owned.forEach((texture) => texture.dispose())
      atlas?.dispose()
      code?.dispose()
      disposeStage()
      renderer.dispose()
    }
  }, [story, track])

  return <canvas ref={canvasRef} className="teardown__canvas" aria-hidden="true" />
}
