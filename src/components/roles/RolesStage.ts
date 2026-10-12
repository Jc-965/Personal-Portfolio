/**
 * The Journey section's one renderer. Its canvas is fixed to the viewport behind the section's content.
 *
 * On the home page it draws each visible row's island into that row's slot with the viewport and scissor, clear
 * around it, so the page background shows between islands. Slot offsets are measured on resize and the drawn
 * rectangles derive from the scroll, so no frame reads layout. On a journey page it draws the open role's island
 * full screen through the sky and tilt-shift composite, after growing it out of its row's slot over EXPAND_MS, and
 * it shrinks it back into the slot when the journey closes.
 *
 * It draws only while something moves: the scroll, the pointer, a press, an easing, or a scene that reports busy.
 * Scenes load when their slot nears the viewport and stay loaded until the section unmounts the stage.
 */
import * as THREE from 'three'
import { sceneProgress } from '../hero/world'
import { GLIDE_TIME, glideStep, type Glide } from '../teardown/glide'
import type { CardShot } from '../teardown/labels'
import { MAX_DRAG } from '../teardown/rig'
import { actWindows, localOf } from '../teardown/timeline'
import { BITMAP_OPTIONS, bitmapsFlip, createEnvironment, createProductTarget, linked, settleLinks } from '../chapter/gpu'
import { createRoleComposite } from './composite'
import type { IslandFrame, IslandOutput, IslandScene, RoleFacts, RoleStory } from './types'

/** Milliseconds a journey takes to grow out of its slot, and to shrink back. */
export const EXPAND_MS = 900
/** Time constants of the pointer easing, seconds. */
const EASE = { tilt: 0.3, hover: 0.2, drag: 0.2 }
/** Viewport-heights beyond the viewport at which a slot's scene starts loading. */
const LOAD_MARGIN = 1
/** A label hangs this many half heights below its panel's centre, as LABEL_DROP in labels.ts. */
const LABEL_DROP = 1.08
/** Mip levels the tilt-shift blurs to at the frame's top and bottom. */
const BLUR = 3.2
/** rAF timestamps jitter by a millisecond or two, so a frame counts as due this much before its interval ends. */
const FRAME_SLACK = 3

const smoother = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * x * (x * (x * 6 - 15) + 10)
}
const approach = (from: number, to: number, dt: number, tc: number) => (Math.abs(to - from) < 1e-4 ? to : from + (to - from) * (1 - Math.exp(-dt / tc)))

export interface RoleEntry {
  story: RoleStory
  facts: RoleFacts
}

export interface StageFrame {
  /** Glided journey progress. */
  progress: number
  /** Viewport CSS px per anchor key, null when hidden or behind the camera. */
  anchors: Map<string, { x: number; y: number } | null>
  panels: CardShot[]
  /** The lowest projected point of what the island shows, viewport px from the top, 0 when nothing projects. */
  floor: number
}

export interface JourneyOptions {
  track: HTMLElement
  stage: HTMLElement
  /** The row slot's rectangle in viewport px when the journey opened from it, or null to appear in place. */
  from: { left: number; top: number; width: number; height: number } | null
  onFrame(frame: StageFrame): void
  /** The first frame drawn with the island ready. */
  onReady(): void
}

export interface RolesStage {
  setSlot(id: string, el: HTMLElement | null): void
  /** Remeasures every slot and the journey track, for a layout change the stage cannot observe. */
  measure(): void
  openJourney(id: string, options: JourneyOptions): void
  /** Shrinks the journey into `to` (the slot's viewport rectangle), or ends it at once with null. */
  closeJourney(to: { left: number; top: number; width: number; height: number } | null): void
  command(name: string, value: string): void
  pulse(): void
  dispose(): void
}

interface Island {
  entry: RoleEntry
  status: 'idle' | 'loading' | 'ready' | 'failed'
  scene: IslandScene | null
  slot: HTMLElement | null
  /** The slot's page offset and size in CSS px. */
  page: { left: number; top: number; width: number; height: number }
  pointer: { x: number; y: number; inside: boolean }
  tiltX: number
  tiltY: number
  hover: number
  goalX: number
  goalY: number
  /** Listeners on the slot, removed when the slot changes. */
  detach: (() => void) | null
}

export function createRolesStage(canvas: HTMLCanvasElement, entries: RoleEntry[], onFallback: () => void): RolesStage | null {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' })
  } catch {
    return null
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.setClearColor(0x000000, 0)
  renderer.autoClear = false

  let failed = false
  let disposed = false
  let lost = false
  const fail = () => {
    if (failed) return
    failed = true
    cancelAnimationFrame(raf)
    onFallback()
  }
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    console.warn('[roles]', [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].filter(Boolean).join('\n'))
    fail()
  }

  const environment = createEnvironment(renderer)
  const target = createProductTarget(renderer)
  const composite = createRoleComposite()
  composite.uniforms.uScene.value = target.texture
  const cu = composite.uniforms

  // Textures, memoized by source, decoded off the main thread where bitmaps flip at decode.
  const textures = new Map<string, { texture: THREE.Texture; ready: boolean; aspect: number }>()
  const images = new THREE.ImageLoader()
  const load = (src: string) => {
    const cached = textures.get(src)
    if (cached) return cached
    const texture = new THREE.Texture()
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
    const entry = { texture, ready: false, aspect: 16 / 9 }
    textures.set(src, entry)
    const upload = (image: ImageBitmap | HTMLImageElement, width: number, height: number) => {
      if (disposed) { if ('close' in image) image.close(); return }
      entry.aspect = width / Math.max(1, height)
      texture.image = image
      texture.needsUpdate = true
      renderer.initTexture(texture)
      if ('close' in image) image.close()
      entry.ready = true
      start()
    }
    bitmapsFlip().then((flips) => {
      if (disposed) return
      if (!flips) {
        images.load(src, (image) => upload(image, image.naturalWidth, image.naturalHeight), undefined, () => undefined)
        return
      }
      fetch(src)
        .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(`${response.status} ${src}`))))
        .then((blob) => createImageBitmap(blob, BITMAP_OPTIONS))
        .then((bitmap) => {
          texture.flipY = false
          upload(bitmap, bitmap.width, bitmap.height)
        })
        .catch(() => undefined)
    })
    return entry
  }

  let born = 0
  const islands = new Map<string, Island>()
  for (const entry of entries) {
    islands.set(entry.story.id, {
      entry, status: 'idle', scene: null, slot: null,
      page: { left: 0, top: 0, width: 0, height: 0 },
      pointer: { x: 0, y: 0, inside: false },
      tiltX: 0, tiltY: 0, hover: 0, goalX: 0, goalY: 0, detach: null,
    })
  }

  const loadScene = (island: Island) => {
    if (island.status !== 'idle') return
    island.status = 'loading'
    island.entry.story.scene().then(({ default: factory }) => {
      if (disposed || failed) return
      try {
        island.scene = factory({
          renderer,
          environment: environment.texture,
          load,
          invalidate: () => start(),
          now: () => (born ? (performance.now() - born) / 1000 : 0),
          story: island.entry.story,
          facts: island.entry.facts,
        })
        renderer.compile(island.scene.scene, island.scene.camera)
        island.status = 'ready'
      } catch (error) {
        console.warn(`[roles] ${island.entry.story.id} failed to build`, error)
        island.status = 'failed'
      }
      start()
    }, (error) => {
      console.warn(`[roles] ${island.entry.story.id} failed to load`, error)
      island.status = 'failed'
    })
  }

  // Sizes.
  let width = 1
  let height = 1
  let narrow = false
  let frameInterval = 1000 / 60
  const buffer = new THREE.Vector2()
  const measureSlot = (island: Island) => {
    if (!island.slot) return
    const rect = island.slot.getBoundingClientRect()
    island.page = { left: rect.left, top: rect.top + window.scrollY, width: rect.width, height: rect.height }
  }
  let journey: (JourneyOptions & { id: string; trackTop: number; trackHeight: number; glide: Glide; progress: number; ready: boolean }) | null = null
  const measure = () => {
    if (disposed || failed) return
    width = Math.max(1, window.innerWidth)
    height = Math.max(1, window.innerHeight)
    narrow = width < 768
    frameInterval = 1000 / (narrow ? 45 : 60)
    const pixelRatio = Math.min(width > 1800 ? 1.75 : 2, window.devicePixelRatio || 1)
    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(width, height, false)
    renderer.getDrawingBufferSize(buffer)
    target.setSize(buffer.x, buffer.y)
    cu.uTexel.value.set(1 / buffer.x, 1 / buffer.y)
    for (const island of islands.values()) measureSlot(island)
    if (journey) {
      journey.trackTop = journey.track.getBoundingClientRect().top + window.scrollY
      journey.trackHeight = journey.track.offsetHeight
    }
    lastPaint = 0
    start()
  }

  // The loop.
  let raf = 0
  let lastPaint = 0
  let compiled = false
  let pushStart = -1
  let expand: { start: number; from: { left: number; top: number; width: number; height: number }; closing: boolean; to: { left: number; top: number; width: number; height: number } | null } | null = null
  const start = () => { if (!raf && compiled && !disposed && !failed && !lost && !document.hidden) raf = requestAnimationFrame(draw) }
  const project = new THREE.Vector3()

  const viewRect = (island: Island) => ({ left: island.page.left, top: island.page.top - window.scrollY, width: island.page.width, height: island.page.height })
  const onScreen = (rect: { top: number; height: number }, margin = 0) => rect.top < height * (1 + margin) && rect.top + rect.height > -height * margin

  const frameFor = (island: Island, mode: 'home' | 'journey', aspect: number, local: (key: string) => number, dt: number, now: number, push: number, dragYaw: number): IslandFrame => ({
    mode,
    local,
    pointer: island.pointer,
    tiltX: island.tiltX,
    tiltY: island.tiltY,
    dragYaw,
    hover: island.hover,
    push,
    aspect,
    narrow,
    time: (now - born) / 1000,
    dt,
  })

  /** Draws into the drawing-buffer rectangle for a CSS rect from the viewport's top left. */
  const setRect = (rect: { left: number; top: number; width: number; height: number }) => {
    const px = renderer.getPixelRatio()
    const x = Math.round(rect.left * px)
    const y = Math.round((height - rect.top - rect.height) * px)
    const w = Math.max(1, Math.round(rect.width * px))
    const h = Math.max(1, Math.round(rect.height * px))
    // three takes the viewport in CSS px and multiplies by the pixel ratio itself.
    renderer.setViewport(x / px, y / px, w / px, h / px)
    renderer.setScissor(x / px, y / px, w / px, h / px)
  }

  const toView = (camera: THREE.PerspectiveCamera, point: THREE.Vector3 | null, rect: { left: number; top: number; width: number; height: number }) => {
    if (!point) return null
    project.copy(point).applyMatrix4(camera.matrixWorldInverse)
    const depth = -project.z
    if (depth <= camera.near) return null
    project.applyMatrix4(camera.projectionMatrix)
    return { x: rect.left + (project.x * 0.5 + 0.5) * rect.width, y: rect.top + (0.5 - project.y * 0.5) * rect.height, depth }
  }

  const reportFrame = (island: Island, out: IslandOutput, rect: { left: number; top: number; width: number; height: number }, progress: number) => {
    if (!journey) return
    const camera = island.scene!.camera
    const anchors = new Map<string, { x: number; y: number } | null>()
    out.anchors.forEach((point, key) => {
      const at = toView(camera, point, rect)
      anchors.set(key, at && { x: at.x, y: at.y })
    })
    const panels: CardShot[] = out.panels.map((panel) => {
      const anchor = toView(camera, new THREE.Vector3().copy(panel.center).addScaledVector(panel.up, -panel.halfH * LABEL_DROP), rect)
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity, depth = Infinity
      let whole = true
      for (const corner of panel.corners) {
        const at = toView(camera, corner, rect)
        if (!at) { whole = false; break }
        left = Math.min(left, at.x)
        right = Math.max(right, at.x)
        top = Math.min(top, at.y)
        bottom = Math.max(bottom, at.y)
        depth = Math.min(depth, at.depth)
      }
      return {
        anchor: anchor && { x: anchor.x, y: anchor.y },
        rect: whole ? { left, top, right, bottom } : null,
        depth: whole ? depth : Infinity,
        develop: panel.develop,
        opacity: panel.opacity,
      }
    })
    let floor = 0
    for (const point of out.bounds) {
      const at = toView(camera, point, rect)
      if (at) floor = Math.max(floor, Math.min(height, at.y))
    }
    journey.onFrame({ progress, anchors, panels, floor })
  }

  let dragYaw = 0
  let dragGoal = 0
  let drag: { id: number; x: number; start: number } | null = null

  const draw = (now: number) => {
    raf = 0
    if (disposed || failed || lost || document.hidden || !compiled) return
    if (lastPaint && now - lastPaint < frameInterval - FRAME_SLACK) { raf = requestAnimationFrame(draw); return }
    const dt = lastPaint ? Math.min(0.1, (now - lastPaint) / 1000) : 1 / 60
    lastPaint = now
    if (!born) born = now
    let moving = false
    renderer.setScissorTest(false)
    renderer.setRenderTarget(null)
    renderer.setViewport(0, 0, width, height)
    renderer.clear(true, true, true)
    const launch = pushStart < 0 ? 1 : Math.min(1, (now - pushStart) / 900)
    if (launch >= 1) pushStart = -1
    const push = launch < 1 ? Math.sin(Math.PI * launch) : 0
    if (push > 0) moving = true

    for (const island of islands.values()) {
      const nextX = approach(island.tiltX, island.goalX, dt, EASE.tilt)
      const nextY = approach(island.tiltY, island.goalY, dt, EASE.tilt)
      const nextHover = approach(island.hover, island.pointer.inside ? 1 : 0, dt, EASE.hover)
      if (nextX !== island.tiltX || nextY !== island.tiltY || nextHover !== island.hover) moving = true
      island.tiltX = nextX
      island.tiltY = nextY
      island.hover = nextHover
    }
    const nextDrag = approach(dragYaw, dragGoal, dt, EASE.drag)
    if (nextDrag !== dragYaw) moving = true
    dragYaw = nextDrag

    // A close that has finished shrinking hands the island back to its row in this same frame.
    if (expand?.closing && now - expand.start >= EXPAND_MS) {
      journey = null
      expand = null
      moving = true
    }
    const open = journey ? islands.get(journey.id) ?? null : null
    if (journey && open) {
      // The journey: progress from the track's scroll, glided.
      const fraction = sceneProgress(window.scrollY - journey.trackTop, journey.trackHeight, height)
      journey.progress = fraction
      const atEnd = fraction > 0.88 || fraction < 0.12
      journey.glide = glideStep(journey.glide, fraction, dt, atEnd ? 0.06 : GLIDE_TIME)
      if (Math.abs(journey.glide.value - fraction) < 1e-4 && Math.abs(journey.glide.velocity) < 1e-3) journey.glide = { value: fraction, velocity: 0 }
      else moving = true
      const p = journey.glide.value
      const windows = actWindows(open.entry.story.acts)
      const local = (key: string) => localOf(windows, key, p)
      // The rectangle grows from the slot to the viewport, or shrinks back into the slot.
      const full = { left: 0, top: 0, width, height }
      let rect = full
      let skyAlpha = 1
      if (expand) {
        const t = smoother((now - expand.start) / EXPAND_MS)
        const from = expand.closing ? full : expand.from
        const to = expand.closing ? expand.to ?? full : full
        rect = {
          left: from.left + (to.left - from.left) * t,
          top: from.top + (to.top - from.top) * t,
          width: from.width + (to.width - from.width) * t,
          height: from.height + (to.height - from.height) * t,
        }
        skyAlpha = expand.closing ? 1 - t : t
        moving = true
        if (t >= 1 && !expand.closing) expand = null
      }
      if (open.status === 'idle') loadScene(open)
      const scene = open.scene
      if (scene && open.status === 'ready') {
        const aspect = rect.width / rect.height
        const out = scene.update(frameFor(open, 'journey', aspect, local, dt, now, push, dragYaw))
        if (out.busy) moving = true
        const story = open.entry.story
        const sky = load(story.sky.src)
        cu.uSky.value = sky.texture
        cu.uSkyReady.value = sky.ready ? 1 : 0
        cu.uSkyAspect.value = sky.aspect
        cu.uSkyFocus.value = story.sky.focusX
        cu.uSkyAlpha.value = skyAlpha
        cu.uAspect.value = aspect
        cu.uParallax.value.set(open.tiltX * 0.5, -open.tiltY * 0.5 + (p - 0.5) * 0.4)
        cu.uFocusY.value = out.focusY
        cu.uBlur.value = BLUR * (narrow ? 0.7 : 1)
        // The island renders into the whole target with the rectangle's aspect, and the composite fits it back.
        renderer.setRenderTarget(target)
        renderer.setScissorTest(false)
        renderer.setClearColor(0x000000, 0)
        renderer.clear(true, true, false)
        renderer.render(scene.scene, scene.camera)
        renderer.setRenderTarget(null)
        setRect(rect)
        renderer.setScissorTest(true)
        renderer.render(composite.scene, composite.camera)
        renderer.setScissorTest(false)
        reportFrame(open, out, rect, p)
        if (!journey.ready && out.ready && sky.ready) {
          journey.ready = true
          journey.onReady()
        }
      } else moving = true
    } else {
      // The home page: every visible slot's island in its own rectangle.
      for (const island of islands.values()) {
        if (!island.slot || island.status === 'failed') continue
        const rect = viewRect(island)
        if (!onScreen(rect, LOAD_MARGIN)) continue
        if (island.status === 'idle') loadScene(island)
        if (island.status !== 'ready' || !island.scene || !onScreen(rect)) continue
        const out = island.scene.update(frameFor(island, 'home', rect.width / Math.max(1, rect.height), () => 0, dt, now, 0, 0))
        if (out.busy) moving = true
        setRect(rect)
        renderer.setScissorTest(true)
        renderer.clear(false, true, false)
        renderer.render(island.scene.scene, island.scene.camera)
        renderer.setScissorTest(false)
      }
    }
    if (moving) raf = requestAnimationFrame(draw)
    else lastPaint = 0
  }

  // Programs link in parallel before the first frame, as the chapters do.
  renderer.compile(composite.scene, composite.camera)
  let polls = 0
  let warming = 0
  const awaitLinks = () => {
    warming = 0
    if (disposed || failed) return
    const programs = renderer.info.programs ?? []
    if (++polls < 120 && !programs.every(linked)) {
      warming = requestAnimationFrame(awaitLinks)
      return
    }
    compiled = true
    start()
  }
  warming = requestAnimationFrame(awaitLinks)

  // Home pointers: each slot tilts and lights its own island.
  const attachSlot = (island: Island) => {
    island.detach?.()
    island.detach = null
    const slot = island.slot
    if (!slot) return
    const move = (event: PointerEvent) => {
      const rect = slot.getBoundingClientRect()
      island.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      island.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
      island.pointer.inside = event.pointerType === 'mouse'
      island.goalX = island.pointer.inside ? island.pointer.x : 0
      island.goalY = island.pointer.inside ? -island.pointer.y : 0
      start()
    }
    const leave = () => {
      island.pointer.inside = false
      island.goalX = 0
      island.goalY = 0
      start()
    }
    slot.addEventListener('pointermove', move, { passive: true })
    slot.addEventListener('pointerleave', leave)
    island.detach = () => {
      slot.removeEventListener('pointermove', move)
      slot.removeEventListener('pointerleave', leave)
    }
  }

  // Journey pointers, on the journey's stage element.
  let detachJourney: (() => void) | null = null
  const attachJourney = (island: Island, stage: HTMLElement) => {
    detachJourney?.()
    const toNdc = (event: PointerEvent) => ({ x: (event.clientX / width) * 2 - 1, y: -((event.clientY / height) * 2 - 1) })
    const move = (event: PointerEvent) => {
      if (drag && event.pointerId === drag.id) dragGoal = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, drag.start + (event.clientX - drag.x) * 0.006))
      if (event.pointerType === 'mouse') {
        const ndc = toNdc(event)
        island.pointer.x = ndc.x
        island.pointer.y = ndc.y
        island.pointer.inside = true
        island.goalX = ndc.x
        island.goalY = -ndc.y
      }
      start()
    }
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || (event.target as Element | null)?.closest('a, button')) return
      if (island.scene?.press?.(toNdc(event))) { start(); return }
      drag = { id: event.pointerId, x: event.clientX, start: dragGoal }
      stage.setPointerCapture?.(event.pointerId)
    }
    const release = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return
      drag = null
      dragGoal = 0
      start()
    }
    const leave = () => {
      island.pointer.inside = false
      island.goalX = 0
      island.goalY = 0
      start()
    }
    stage.addEventListener('pointermove', move, { passive: true })
    stage.addEventListener('pointerdown', down)
    stage.addEventListener('pointerup', release)
    stage.addEventListener('pointercancel', release)
    stage.addEventListener('pointerleave', leave)
    detachJourney = () => {
      stage.removeEventListener('pointermove', move)
      stage.removeEventListener('pointerdown', down)
      stage.removeEventListener('pointerup', release)
      stage.removeEventListener('pointercancel', release)
      stage.removeEventListener('pointerleave', leave)
      detachJourney = null
    }
  }

  const onScroll = () => start()
  const onResize = () => measure()
  const onVisibility = () => { lastPaint = 0; if (!document.hidden) start() }
  const onLost = (event: Event) => {
    event.preventDefault()
    lost = true
    fail()
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize, { passive: true })
  document.addEventListener('visibilitychange', onVisibility)
  canvas.addEventListener('webglcontextlost', onLost)
  measure()

  return {
    setSlot(id, el) {
      const island = islands.get(id)
      if (!island || island.slot === el) return
      island.slot = el
      attachSlot(island)
      measureSlot(island)
      start()
    },
    measure,
    openJourney(id, options) {
      const island = islands.get(id)
      if (!island) return
      journey = { ...options, id, trackTop: 0, trackHeight: 1, glide: { value: 0, velocity: 0 }, progress: 0, ready: false }
      expand = options.from ? { start: performance.now(), from: options.from, closing: false, to: null } : null
      island.pointer.inside = false
      island.goalX = 0
      island.goalY = 0
      attachJourney(island, options.stage)
      measure()
    },
    closeJourney(to) {
      detachJourney?.()
      if (!journey) return
      if (!to) {
        journey = null
        expand = null
        measure()
        return
      }
      expand = { start: performance.now(), from: { left: 0, top: 0, width, height }, closing: true, to }
      for (const island of islands.values()) measureSlot(island)
      start()
    },
    command(name, value) {
      const island = journey ? islands.get(journey.id) : null
      island?.scene?.command?.(name, value)
      start()
    },
    pulse() {
      pushStart = performance.now()
      start()
    },
    dispose() {
      disposed = true
      cancelAnimationFrame(raf)
      cancelAnimationFrame(warming)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onLost)
      detachJourney?.()
      for (const island of islands.values()) {
        island.detach?.()
        island.scene?.dispose()
      }
      for (const { texture } of textures.values()) texture.dispose()
      if (!lost) settleLinks(renderer)
      composite.dispose()
      target.dispose()
      environment.dispose()
      renderer.dispose()
      if (!lost) renderer.forceContextLoss()
    },
  }
}
