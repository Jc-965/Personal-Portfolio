/**
 * The generic chapter renderer. It owns the WebGL renderer, the product render target, the glyph room composite,
 * the scroll glide and its preview mapping, the pointer (tilt, drag, hover, press), the texture upload queue, the
 * program warm-up, the load-in formation, the launch pulse, and visibility. A scene module (ChapterStory.scene)
 * supplies the three.js scene and its pose for each frame. ParkiWell's TeardownCanvas works the same way with its
 * own phone rig, and both read the same composite.
 */
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { pageScrollY } from '../../scroll/scrollSignal'
import { buildGlyphAtlas } from '../hero/glyphAtlas'
import { sceneProgress } from '../hero/world'
import { createComposite } from '../teardown/composite'
import { entryReveal, isChapter, stageEdges, stageTopAt } from '../teardown/edges'
import { GLIDE_TIME, glideStep, type Glide } from '../teardown/glide'
import type { CardShot } from '../teardown/labels'
import { CHAPTER_RAMP } from '../teardown/materials'
import { LAUNCH_MS, MAX_DRAG, backdropAt, type Interaction } from '../teardown/rig'
import { EDGE_HOLD, actAt, actCopyRide, actWindows, localOf, previewProgress, ramp, totalSpan } from '../teardown/timeline'
import { BITMAP_OPTIONS, bitmapsFlip, createEnvironment, createProductTarget, linked, settleLinks } from './gpu'
import type { ChapterView, StageControl } from './stageHooks'
import type { ChapterScene, ChapterStory, LoadedTexture, SceneFactory, SceneOutput } from './types'

export interface ChapterFrame {
  /** Glided chapter progress. */
  progress: number
  /** Stage-relative CSS px per callout anchor key, null when hidden or behind the camera. */
  anchors: Map<string, { x: number; y: number } | null>
  /** Each panel's label anchor, bounds, depth, develop, and opacity, in panel order. */
  panels: CardShot[]
  /** The centrepiece's projected bounds in stage CSS px, null when it is not clickable. */
  hit: { left: number; top: number; width: number; height: number } | null
  /** The lowest projected point of what the scene shows, stage CSS px from the top, 0 when nothing projects. */
  floor: number
}

export interface ChapterCanvasProps {
  story: ChapterStory
  track: HTMLElement
  onFrame: (frame: ChapterFrame) => void
  /** First frame drawn with the textures its pose shows. `formMs` is the load-in formation's length, 0 when none runs. */
  onReady: (formMs: number) => void
  onFallback: () => void
  view: { current: ChapterView }
  control: { current: StageControl | null }
}

type Callbacks = Pick<ChapterCanvasProps, 'onFrame' | 'onReady' | 'onFallback'>

/** Glyph cells, as in TeardownCanvas: about 5.7 by 7.5 CSS px on wide screens and 4.2 by 5.5 on phones. */
const CELL = { wide: { fontPx: 9.6, height: 7.5 }, narrow: { fontPx: 7, height: 5.5 } }
const FONT_FAMILY = '"JetBrains Mono", "IBM Plex Mono", monospace'
/** Pixels of the right edge left to the scroll rail. */
const RAIL_GUTTER = 32
/** rAF timestamps jitter by a millisecond or two, so a frame counts as due this much before its interval ends. */
const FRAME_SLACK = 3
/** Time constants of the pointer easing, seconds. */
const EASE = { dragYaw: 0.2, tiltX: 0.32, tiltY: 0.32 } as const
/** An interaction this close to its goal, in its own units, lands on it and stops the loop. */
const EASE_REST = 1e-3
/** Progress within this much of either end follows the scroll on END_GLIDE_TIME, so the pose settles before the stage unpins. */
const END_REACH = 0.12
const END_GLIDE_TIME = 0.06
/** Frames the mount waits for parallel program links before it draws regardless. */
const LINK_POLLS = 120
/** Milliseconds a canvas that appears mid-formation takes to form the centrepiece and the room from glyphs. */
const FORM_MS = 1400
/** Viewport-heights a room change eases over, from the start of the act that makes it. */
const ROOM_SWAP_VH = 0.62
/** A label hangs this many half heights below its panel's centre, as LABEL_DROP in labels.ts. */
const LABEL_DROP = 1.08

const smoother = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * x * (x * (x * 6 - 15) + 10)
}

type Loaded = LoadedTexture & { aspect: number }

/** The chapter's 3D stage. All hot state stays outside React. */
export default function ChapterCanvas({ story, track, onFrame, onReady, onFallback, view, control }: ChapterCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const callbacks = useRef<Callbacks>({ onFrame, onReady, onFallback })
  useEffect(() => { callbacks.current = { onFrame, onReady, onFallback } })

  useEffect(() => {
    const canvas = canvasRef.current
    const stage = canvas?.parentElement
    if (!canvas || !stage) return
    // The scene module loads first, and the renderer boots on the next frame after it, which also keeps React's
    // development double mount from building a renderer only to delete it.
    let cancelled = false
    let unmount: (() => void) | null = null
    let boot = 0
    story.scene().then(({ default: factory }) => {
      if (cancelled) return
      boot = requestAnimationFrame(() => { unmount = mount(canvas, stage, track, story, factory, callbacks, view, control) })
    }, (error) => {
      console.warn('[chapter] the scene module failed to load', error)
      callbacks.current.onFallback()
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(boot)
      unmount?.()
    }
    // view and control are ref objects that Chapter creates once, so they never remount the renderer.
  }, [story, track, view, control])

  return <canvas ref={canvasRef} className="teardown__canvas" aria-hidden="true" />
}

/** Builds the renderer and runs the chapter until the returned function is called. */
function mount(
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  track: HTMLElement,
  story: ChapterStory,
  factory: SceneFactory,
  callbacks: { current: Callbacks },
  view: ChapterCanvasProps['view'],
  control: ChapterCanvasProps['control'],
): () => void {
  let failed = false
  let stop = () => {}
  const fail = (reason: unknown) => {
    if (failed) return
    failed = true
    stop()
    console.warn(`[chapter] ${story.id} falls back to its still`, reason)
    callbacks.current.onFallback()
  }

  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: true, depth: false, stencil: false, powerPreference: 'high-performance' })
  } catch (error) {
    fail(error)
    return () => {}
  }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping
  renderer.setClearColor(0x000000, 0)
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    fail([gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].filter(Boolean).join('\n'))
  }

  const owned: THREE.Texture[] = []
  const disposers: (() => void)[] = []
  let disposed = false
  let compiled = false
  let raf = 0
  let lastPaint = 0
  let visible = false
  let flush = false
  let lost = false
  const images = new THREE.ImageLoader()
  const anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy())
  const start = () => { if (!raf && (visible || flush) && compiled && !document.hidden && !lost && !failed && !disposed) raf = requestAnimationFrame(draw) }
  stop = () => { cancelAnimationFrame(raf); raf = 0; lastPaint = 0 }

  /**
   * Texture uploads waiting to run, oldest first. They start once every program has linked and then run one per
   * frame, so no frame carries two uploads and none waits behind the links in the GPU process.
   */
  const uploads: (() => void)[] = []
  let uploadFrame = 0
  const pumpUploads = () => {
    uploadFrame = 0
    if (disposed || failed || !compiled) return
    uploads.shift()?.()
    if (uploads.length) uploadFrame = requestAnimationFrame(pumpUploads)
  }
  const queueUpload = (job: () => void, urgent: boolean) => {
    if (disposed || failed) return
    if (urgent) uploads.unshift(job)
    else uploads.push(job)
    if (compiled && !uploadFrame) uploadFrame = requestAnimationFrame(pumpUploads)
  }

  /**
   * Loads an sRGB, mipmapped texture and queues its upload, decoding off the main thread into an ImageBitmap where
   * bitmaps flip at decode. A pixelated texture samples its nearest texel and keeps no mipmaps, for pixel art. The
   * bitmap is closed once uploaded, since three uploads a texture again only when its version changes. A second
   * load of the same source and filtering returns the first entry, so a scene's plate and a room share one texture.
   */
  const loaded = new Map<string, Loaded>()
  const load = (src: string, options: { urgent?: boolean; pixelated?: boolean } = {}): Loaded => {
    const cacheKey = `${src}|${options.pixelated ? 'nearest' : 'mip'}`
    const cached = loaded.get(cacheKey)
    if (cached) return cached
    const texture = new THREE.Texture()
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = anisotropy
    if (options.pixelated) {
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.NearestFilter
      texture.generateMipmaps = false
    }
    owned.push(texture)
    const entry: Loaded = { texture, ready: false, width: 1, height: 1, aspect: 16 / 9 }
    loaded.set(cacheKey, entry)
    const upload = (image: ImageBitmap | HTMLImageElement, width: number, height: number) => queueUpload(() => {
      entry.width = width
      entry.height = height
      entry.aspect = width / Math.max(1, height)
      texture.image = image
      texture.needsUpdate = true
      renderer.initTexture(texture)
      if ('close' in image) image.close()
      entry.ready = true
      start()
    }, options.urgent ?? false)
    bitmapsFlip().then((flips) => {
      if (disposed || failed) return
      if (!flips) {
        images.load(src, (image) => upload(image, image.naturalWidth, image.naturalHeight), undefined, () => undefined)
        return
      }
      fetch(src)
        .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(`${response.status} ${src}`))))
        .then((blob) => createImageBitmap(blob, BITMAP_OPTIONS))
        .then((bitmap) => {
          if (disposed || failed) { bitmap.close(); return }
          texture.flipY = false
          upload(bitmap, bitmap.width, bitmap.height)
        })
        .catch(() => undefined)
    })
    return entry
  }

  let environment: THREE.WebGLRenderTarget
  let target: THREE.WebGLRenderTarget
  let composite: ReturnType<typeof createComposite>
  let chapter: ChapterScene
  let narrow = stage.clientWidth < 768
  try {
    environment = createEnvironment(renderer)
    disposers.push(() => environment.dispose())
    target = createProductTarget(renderer)
    disposers.push(() => target.dispose())
    composite = createComposite()
    disposers.push(() => composite.dispose())
    chapter = factory({
      renderer,
      environment: environment.texture,
      narrow,
      anisotropy,
      load: (src, options) => load(src, options),
      invalidate: () => start(),
      now: () => (born ? (performance.now() - born) / 1000 : 0),
      story,
    })
    disposers.push(() => chapter.dispose())
  } catch (error) {
    disposers.splice(0).reverse().forEach((d) => d())
    renderer.dispose()
    fail(error)
    return () => {}
  }
  const cu = composite.material.uniforms
  cu.uProduct.value = target.texture
  cu.uTint.value.set(...story.theme.tint)
  cu.uGrade.value.set(...story.theme.grade)
  cu.uCoach.value = 0

  const windows = actWindows(story.acts)
  const total = totalSpan(story.acts)
  const swap = ROOM_SWAP_VH / total
  const actBackdrops = story.acts.map((a) => a.backdrop)
  const firstKey = story.acts[0].key
  const lastKey = story.acts[story.acts.length - 1].key
  const rooms: (Loaded | null)[] = story.backdrops.map(() => null)
  const requestRoom = (index: number | null) => {
    if (index === null || index < 0 || index >= rooms.length || rooms[index]) return
    rooms[index] = load(story.backdrops[index].src, { urgent: index === actBackdrops[0] })
  }
  // The acts' rooms queue first, in act order, then any room only the scene shows (a hovered scene's).
  actBackdrops.forEach(requestRoom)
  story.backdrops.forEach((_, index) => requestRoom(index))

  const drawingBuffer = new THREE.Vector2(1, 1)
  let atlas: THREE.CanvasTexture | null = null
  let width = 1
  let height = 1
  let trackTop = 0
  let trackHeight = 1
  let scrollY = 0
  /** Whether the stage meets another chapter's stage above and below, measured with the track. */
  let joinTop = false
  let joinBottom = false
  let progress = 0
  let glide: Glide = { value: 0, velocity: 0 }
  let sized = ''
  let verifyTarget = false
  let pulseStart = -1
  let formStart = -1
  let ready = false
  let frameInterval = 1000 / 60
  let lastAct = -1
  let copyDirty = true
  let copyRail: { left: number; right: number; top: number } | null = null
  let copyBlocks: HTMLElement[] = []
  let born = 0
  const inkRange = document.createRange()
  const interaction: Interaction = { dragYaw: 0, tiltX: 0, tiltY: 0 }
  const goal: Interaction = { dragYaw: 0, tiltX: 0, tiltY: 0 }
  const pointer = { x: 0, y: 0, inside: false }
  let drag: { id: number; x: number; start: number } | null = null
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
  const camera = chapter.camera
  const project = new THREE.Vector3()

  const settle = (dt: number) => {
    let moving = false
    for (const key of ['dragYaw', 'tiltX', 'tiltY'] as const) {
      const delta = goal[key] - interaction[key]
      if (Math.abs(delta) > EASE_REST) {
        interaction[key] += delta * (1 - Math.exp(-dt / EASE[key]))
        moving = true
      } else interaction[key] = goal[key]
    }
    return moving
  }

  /** A world point in stage CSS px, or null behind the camera or outside the clip volume's depth. */
  const toStage = (point: THREE.Vector3 | null): { x: number; y: number; depth: number } | null => {
    if (!point) return null
    project.copy(point).applyMatrix4(camera.matrixWorldInverse)
    const depth = -project.z
    if (depth <= camera.near) return null
    project.applyMatrix4(camera.projectionMatrix)
    return { x: (project.x * 0.5 + 0.5) * width, y: (0.5 - project.y * 0.5) * height, depth }
  }
  const boundsOf = (corners: THREE.Vector3[]) => {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity, depth = Infinity
    for (const corner of corners) {
      const at = toStage(corner)
      if (!at) return null
      left = Math.min(left, at.x)
      right = Math.max(right, at.x)
      top = Math.min(top, at.y)
      bottom = Math.max(bottom, at.y)
      depth = Math.min(depth, at.depth)
    }
    return { left, top, right, bottom, depth }
  }

  /** The copy rail's edges and its act blocks, measured on resize and on the frame after each act change. */
  const measureCopy = () => {
    copyDirty = false
    const railEl = stage.querySelector<HTMLElement>('.teardown__rail')
    const rail = railEl?.getBoundingClientRect()
    copyBlocks = railEl ? (Array.from(railEl.children) as HTMLElement[]) : []
    if (!rail || !rail.width || !rail.height) { copyRail = null; return }
    const rect = stage.getBoundingClientRect()
    copyRail = { left: rail.left - rect.left, right: rail.right - rect.left, top: rail.top - rect.top }
  }
  const inkRight = (block: HTMLElement) => {
    const left = block.getBoundingClientRect().left
    let right = 0
    for (const child of Array.from(block.children) as HTMLElement[]) {
      if (child.offsetWidth < block.clientWidth) right = Math.max(right, child.getBoundingClientRect().right - left)
      inkRange.selectNodeContents(child)
      right = Math.max(right, inkRange.getBoundingClientRect().right - left)
    }
    return right
  }
  /** The composite's copy shade for the active act's block, as TeardownCanvas.applyCopyMask. */
  const applyCopyMask = (at: number) => {
    const px = renderer.getPixelRatio()
    cu.uCopyNarrow.value = narrow ? 1 : 0
    if (!copyRail) { cu.uCopyMask.value.set(0, 0, 0, 0); return }
    if (narrow) { cu.uCopyMask.value.set(copyRail.right * px, copyRail.top * px, 0, 1); return }
    const act = actAt(windows, at).index
    const block = copyBlocks[act]
    const ride = actCopyRide(windows, act, at)
    const blockH = block?.offsetHeight ?? 0
    const top = copyRail.top + (block?.offsetTop ?? 0) + ride.y * height
    const right = block && blockH > 0 && ride.opacity > 0 ? copyRail.left + inkRight(block) : copyRail.right
    cu.uCopyMask.value.set(right * px, top * px, (top + blockH) * px, blockH > 0 ? ride.opacity : 0)
  }

  /** The engine's default phases for a progress: ParkiWell's arrival formation and close dissolve, generalised. */
  const baseAt = (p: number) => {
    const first = localOf(windows, firstKey, p)
    const last = localOf(windows, lastKey, p)
    const bd = backdropAt(windows, actBackdrops, p, swap)
    return {
      decode: smoother(ramp(first, 0.1, EDGE_HOLD * 0.95)) * (1 - smoother(ramp(last, 0.69, 0.91))),
      gather: smoother(ramp(first, 0, EDGE_HOLD * 0.77)) * (1 - smoother(ramp(last, 0.72, 0.95))),
      backdrop: { ...bd, reveal: ramp(first, 0, EDGE_HOLD * 0.97) * (1 - ramp(last, 0.66, 0.95)) },
    }
  }

  const applyComposite = (out: SceneOutput, form: number) => {
    const { a, b, mix, gain, glyphOnly } = out.backdrop
    const roomA = a >= 0 && rooms[a]?.ready ? a : -1
    const roomB = b >= 0 && rooms[b]?.ready ? b : -1
    const first = rooms[roomA >= 0 ? roomA : roomB] ?? null
    const second = rooms[roomB] ?? first
    const focus = (index: number): [number, number] => {
      const [x, y] = story.backdrops[index]?.focus ?? [0.5, 0.5]
      return [x, 1 - y]
    }
    const levels = (index: number): [number, number] => {
      const [lo, hi] = story.backdrops[index]?.levels ?? [0, 1]
      return [lo, hi]
    }
    const mirror = (index: number) => (story.backdrops[index]?.mirror ? 1 : 0)
    const slotA = roomA >= 0 ? roomA : roomB
    const slotB = roomB >= 0 ? roomB : roomA
    cu.uBackA.value = first?.texture ?? null
    cu.uBackB.value = second?.texture ?? null
    cu.uBackAspect.value.set(first?.aspect ?? 16 / 9, second?.aspect ?? 16 / 9)
    cu.uFocus.value.set(...focus(slotA), ...focus(slotB))
    cu.uLevels.value.set(...levels(slotA), ...levels(slotB))
    cu.uMirror.value.set(mirror(slotA), mirror(slotB))
    cu.uBackMix.value = roomA >= 0 && roomB >= 0 ? mix : 0
    cu.uBackGain.value = first ? gain : 0
    cu.uGlyphOnly.value = glyphOnly
    cu.uPointer.value.set(interaction.tiltX, -interaction.tiltY)
    const at = toStage(out.revealAt)
    const px = renderer.getPixelRatio()
    const edges = stageEdges(stageTopAt(scrollY, trackTop, trackHeight, height), height, joinTop, joinBottom)
    cu.uEdge.value.set(edges.top, edges.bottom, edges.base)
    const reveal = Math.max(out.backdrop.reveal, entryReveal(edges.approach, localOf(windows, firstKey, glide.value)))
    cu.uReveal.value = Math.min(reveal, form)
    cu.uRevealAt.value.set(at ? at.x * px : drawingBuffer.x / 2, at ? (height - at.y) * px : drawingBuffer.y / 2)
    cu.uDecode.value = Math.min(out.decode, form)
    cu.uGather.value = Math.min(out.gather, form)
  }

  const draw = (now: number) => {
    raf = 0
    if (disposed || failed || lost || (!visible && !flush) || document.hidden || !compiled) return
    if (lastPaint && now - lastPaint < frameInterval - FRAME_SLACK) { raf = requestAnimationFrame(draw); return }
    const dt = lastPaint ? Math.min(0.1, (now - lastPaint) / 1000) : 0
    lastPaint = now
    if (!born) born = now
    if (copyDirty) measureCopy()
    const easing = settle(dt)
    const atEnd = progress > 1 - END_REACH || progress < END_REACH
    glide = glideStep(glide, progress, dt, atEnd ? END_GLIDE_TIME : GLIDE_TIME)
    if (Math.abs(glide.value - progress) < 1e-4 && Math.abs(glide.velocity) < 1e-3) glide = { value: progress, velocity: 0 }
    const act = actAt(windows, glide.value).index
    if (act !== lastAct) { lastAct = act; copyDirty = true }

    const launch = pulseStart < 0 ? 1 : Math.min(1, (now - pulseStart) / LAUNCH_MS)
    if (launch >= 1) pulseStart = -1
    const push = launch < 1 ? Math.sin(Math.PI * launch) : 0
    const form = formStart < 0 ? 1 : Math.min(1, (now - formStart) / FORM_MS)
    if (form >= 1) formStart = -1
    const formed = smoother(form)

    const aspect = width / height
    camera.aspect = aspect
    camera.updateProjectionMatrix()
    const p = glide.value
    const out = chapter.update({
      progress: p,
      local: (key) => localOf(windows, key, p),
      interaction,
      pointer,
      push,
      aspect,
      narrow,
      time: (now - born) / 1000,
      // The first frame after idle has no real interval. A scene easing toward a goal a click just set needs a
      // nonzero step on that frame to move and report busy, or the loop stops before the motion starts.
      dt: dt || 1 / 60,
      base: baseAt(p),
    })
    camera.updateMatrixWorld()
    applyComposite(out, formed)
    applyCopyMask(p)

    renderer.setRenderTarget(target)
    if (verifyTarget) {
      // three raises no error for an incomplete target, and drawing into one leaves the centrepiece invisible. The
      // check blocks until the GPU process has run every queued command, so it runs here, once per resize.
      verifyTarget = false
      const gl = renderer.getContext()
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        renderer.setRenderTarget(null)
        fail('the product render target is incomplete')
        return
      }
    }
    renderer.render(chapter.scene, camera)
    renderer.setRenderTarget(null)
    renderer.render(composite.scene, composite.camera)
    if (failed) return

    const anchors = new Map<string, { x: number; y: number } | null>()
    out.anchors.forEach((point, key) => {
      const at = toStage(point)
      anchors.set(key, at && { x: at.x, y: at.y })
    })
    const panels: CardShot[] = out.panels.map((panel) => {
      const drop = panel.halfH * LABEL_DROP
      const anchor = toStage(new THREE.Vector3().copy(panel.center).addScaledVector(panel.up, -drop))
      const rect = boundsOf(panel.corners)
      return {
        anchor: anchor && { x: anchor.x, y: anchor.y },
        rect: rect && { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        depth: rect?.depth ?? Infinity,
        develop: panel.develop,
        opacity: panel.opacity,
      }
    })
    const hitBounds = out.hit ? boundsOf(out.hit) : null
    const hit = hitBounds ? { left: hitBounds.left, top: hitBounds.top, width: hitBounds.right - hitBounds.left, height: hitBounds.bottom - hitBounds.top } : null
    let floor = 0
    for (const point of out.bounds) {
      const at = toStage(point)
      if (at) floor = Math.max(floor, Math.min(height, at.y))
    }
    callbacks.current.onFrame({ progress: p, anchors, panels, hit, floor })

    const roomShown = (index: number) => index < 0 || !!rooms[index]?.ready
    if (!ready && out.ready && roomShown(out.backdrop.a) && roomShown(out.backdrop.b)) {
      ready = true
      const forming = out.decode > 0.01
      if (forming) formStart = now
      callbacks.current.onReady(forming ? FORM_MS : 0)
    }
    flush = false
    if (visible && (easing || glide.value !== progress || copyDirty || push > 0 || formStart >= 0 || out.busy)) raf = requestAnimationFrame(draw)
    else lastPaint = 0
  }

  const onScroll = () => {
    if (!sized) return
    const y = pageScrollY()
    scrollY = y
    const fraction = sceneProgress(y - trackTop, trackHeight, height)
    progress = view.current === 'preview' ? previewProgress(fraction, story.acts) : fraction
    const wasVisible = visible
    visible = y + window.innerHeight > trackTop && y < trackTop + trackHeight
    if (visible && !wasVisible) glide = { value: progress, velocity: 0 }
    if (wasVisible && !visible) { glide = { value: progress, velocity: 0 }; flush = true }
    if (visible || flush) start()
    else stop()
  }
  const measure = () => {
    if (disposed || lost || failed) return
    const rect = stage.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    width = rect.width
    height = rect.height
    const nextNarrow = width < 768
    if (nextNarrow !== narrow) chapter.setNarrow?.(nextNarrow)
    narrow = nextNarrow
    frameInterval = 1000 / (narrow ? 45 : 60)
    const pixelRatio = Math.min(width > 1800 ? 1.75 : 2, window.devicePixelRatio || 1)
    const size = `${width}x${height}@${pixelRatio}`
    if (size !== sized) {
      sized = size
      renderer.setPixelRatio(pixelRatio)
      renderer.setSize(width, height, false)
      renderer.getDrawingBufferSize(drawingBuffer)
      target.setSize(drawingBuffer.x, drawingBuffer.y)
      cu.uRes.value.copy(drawingBuffer)
      verifyTarget = true
    }
    measureCopy()
    const cell = narrow ? CELL.narrow : CELL.wide
    const ctx = document.createElement('canvas').getContext('2d')
    if (ctx) ctx.font = `500 ${cell.fontPx}px ${FONT_FAMILY}`
    const advance = ctx?.measureText('M').width || cell.fontPx * 0.6
    const cellW = Math.max(2, Math.round(advance * pixelRatio))
    const cellH = Math.max(3, Math.round(cell.height * pixelRatio))
    cu.uCell.value.set(cellW, cellH)
    const glyphs = buildGlyphAtlas(cellW / pixelRatio, cellH / pixelRatio, cell.fontPx, Math.ceil(pixelRatio * 2), CHAPTER_RAMP)
    if (glyphs) {
      atlas?.dispose()
      atlas = new THREE.CanvasTexture(glyphs)
      atlas.flipY = false
      atlas.generateMipmaps = false
      atlas.minFilter = THREE.LinearFilter
      cu.uAtlas.value = atlas
    }
    trackTop = track.getBoundingClientRect().top + window.scrollY
    trackHeight = track.offsetHeight
    joinTop = isChapter(track.previousElementSibling)
    joinBottom = isChapter(track.nextElementSibling)
    lastPaint = 0
    onScroll()
  }

  const toNdc = (event: PointerEvent) => {
    const rect = stage.getBoundingClientRect()
    return { x: ((event.clientX - rect.left) / rect.width) * 2 - 1, y: -(((event.clientY - rect.top) / rect.height) * 2 - 1) }
  }
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || event.clientX > window.innerWidth - RAIL_GUTTER) return
    if ((event.target as Element | null)?.closest('a, button')) return
    if (chapter.press?.(toNdc(event))) { start(); return }
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
      const ndc = toNdc(event)
      pointer.x = ndc.x
      pointer.y = ndc.y
      pointer.inside = true
      start()
    }
  }
  const release = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return
    drag = null
    goal.dragYaw = 0
    start()
  }
  const onLeave = () => { goal.tiltX = 0; goal.tiltY = 0; pointer.inside = false; start() }
  const onLost = () => {
    lost = true
    fail('the WebGL context was lost')
  }
  const onVisibility = () => { lastPaint = 0; if (document.hidden) stop(); else start() }
  control.current = {
    pulse: () => { pulseStart = performance.now(); start() },
    sync: () => {
      measure()
      glide = { value: progress, velocity: 0 }
      start()
    },
    command: (name, value) => {
      chapter.command?.(name, value)
      start()
    },
  }

  // The loop starts once every program link reports complete, and each program's first use (its info logs and
  // uniform table) runs one per frame before the chapter is on screen, as in TeardownCanvas.
  renderer.compile(chapter.scene, camera)
  renderer.compile(composite.scene, composite.camera)
  let polls = 0
  let warming = 0
  const warmed = new Set<unknown>()
  const awaitLinks = () => {
    warming = 0
    if (disposed || failed) return
    const programs = renderer.info.programs ?? []
    if (++polls < LINK_POLLS && !programs.every(linked)) {
      warming = requestAnimationFrame(awaitLinks)
      return
    }
    const cold = programs.find((program) => !warmed.has(program))
    if (cold) {
      warmed.add(cold)
      cold.getUniforms()
      warming = requestAnimationFrame(awaitLinks)
      return
    }
    compiled = true
    if (uploads.length && !uploadFrame) uploadFrame = requestAnimationFrame(pumpUploads)
    start()
  }
  warming = requestAnimationFrame(awaitLinks)

  const resizeObserver = new ResizeObserver(measure)
  const fontsReady = document.fonts ? document.fonts.load('500 12px "JetBrains Mono"') : Promise.resolve([])
  const sizing = requestAnimationFrame(() => {
    resizeObserver.observe(stage)
    resizeObserver.observe(track)
    fontsReady.then(() => measure(), () => undefined)
  })
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })
  stage.addEventListener('pointerdown', onPointerDown)
  stage.addEventListener('pointerleave', onLeave)
  stage.addEventListener('pointermove', onPointerMove, { passive: true })
  stage.addEventListener('pointerup', release)
  stage.addEventListener('pointercancel', release)
  document.addEventListener('visibilitychange', onVisibility)
  canvas.addEventListener('webglcontextlost', onLost)

  return () => {
    disposed = true
    control.current = null
    stop()
    cancelAnimationFrame(warming)
    cancelAnimationFrame(sizing)
    cancelAnimationFrame(uploadFrame)
    resizeObserver.disconnect()
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
    stage.removeEventListener('pointerdown', onPointerDown)
    stage.removeEventListener('pointerleave', onLeave)
    stage.removeEventListener('pointermove', onPointerMove)
    stage.removeEventListener('pointerup', release)
    stage.removeEventListener('pointercancel', release)
    document.removeEventListener('visibilitychange', onVisibility)
    canvas.removeEventListener('webglcontextlost', onLost)
    owned.forEach((texture) => texture.dispose())
    atlas?.dispose()
    if (!lost) {
      settleLinks(renderer)
      const gl = renderer.getContext()
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    }
    disposers.splice(0).reverse().forEach((d) => d())
    renderer.dispose()
    // A released chapter (useNearBoot) returns its context at once, since the browser caps live WebGL contexts and
    // reclaims a detached canvas's only at garbage collection.
    if (!lost) renderer.forceContextLoss()
  }
}
