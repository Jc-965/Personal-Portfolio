/**
 * The Journey section's one renderer. It creates its own canvas in `host`, fixed to the viewport behind the
 * section's content, and removes it on dispose. A canvas whose context was forced lost cannot give a new renderer
 * a context, so a stage that boots again after a release, or after a hot reload, needs a fresh element.
 *
 * On the home page it draws each visible row's island into that row's slot with the viewport and scissor, clear
 * around it, so the page background shows between islands. Slot offsets are measured on resize and the drawn
 * rectangles derive from the scroll, so no frame reads layout. Every world draws through the chapters' composite
 * (teardown/composite.ts), so it can form from glyphs and dissolve into them like a project's centrepiece, and on a
 * journey page the role's room prints around it as coloured glyphs on the site's near-black base.
 *
 * Moves between views pass through glyphs, so a world never cuts or pops between poses. Opening grows the world out
 * of its row's slot. A switch to another role dissolves the open world (leaveJourney) and forms the next one in place.
 * A close half-dissolves the world, then flies it back into its slot while it gathers and resolves into its row
 * pose, as the other rows' worlds form around it.
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
import { createComposite } from '../teardown/composite'
import { buildGlyphAtlas } from '../hero/glyphAtlas'
import { CHAPTER_RAMP } from '../teardown/materials'
import { EXPAND_MS, FORM_MS, LEAVE_MS } from './timing'
import type { IslandFrame, IslandOutput, IslandScene, RoleFacts, RoleStory } from './types'

/** How gathered a closing world stays at its most scattered, 0 to 1, so it still reads as itself in flight. */
const LEAVE_GATHER = 0.7
/** Time constants of the pointer easing, seconds. */
const EASE = { tilt: 0.3, hover: 0.2, drag: 0.2 }
/** Viewport-heights beyond the viewport at which a slot's scene starts loading. */
const LOAD_MARGIN = 1
/** A label hangs this many half heights below its panel's centre, as LABEL_DROP in labels.ts. */
const LABEL_DROP = 1.08
/** Glyph cells, as the chapters': about 5.7 by 7.5 CSS px on wide screens and 4.2 by 5.5 on phones. */
const CELL = { wide: { fontPx: 9.6, height: 7.5 }, narrow: { fontPx: 7, height: 5.5 } }
const FONT_FAMILY = '"JetBrains Mono", "IBM Plex Mono", monospace'
/** The room's glyph coverage, as the chapters' BACKDROP_GAIN, and its lightness range when a story sets none. */
const ROOM_GAIN = 0.9
const ROOM_LEVELS: readonly [number, number] = [0.06, 0.6]
/** An sRGB hex colour in linear light, for a role's accent as the glyph tint. */
const linearOf = (hex: string): [number, number, number] => {
  const c = new THREE.Color(hex)
  return [c.r, c.g, c.b]
}
/** A hidden panel's shot: no anchor, so its label keeps its place and stays off. */
const HIDDEN_SHOT: CardShot = { anchor: null, rect: null, depth: Infinity, develop: 0, opacity: 0 }
/** rAF timestamps jitter by a millisecond or two, so a frame counts as due this much before its interval ends. */
const FRAME_SLACK = 3

const ramp = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / Math.max(1e-9, b - a)))
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
  /**
   * Dissolves the open journey into glyphs over LEAVE_MS, fully before a switch to another role and halfway before
   * a close, and holds it there until openJourney or closeJourney replaces it.
   */
  leaveJourney(kind: 'switch' | 'close'): void
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
  /** True while the island's pointer state eased this frame, so its scene may have moved. */
  stirred: boolean
  /** True once the island's shadow map has been drawn for its current scene. */
  shadowed: boolean
  /** The frame time its world started forming from glyphs, or -1, and whether it has formed. */
  formStart: number
  formed: boolean
  /** Listeners on the slot, removed when the slot changes. */
  detach: (() => void) | null
}

export function createRolesStage(host: HTMLElement, entries: RoleEntry[], onFallback: () => void, onIslandFailed: (id: string) => void = () => undefined): RolesStage | null {
  const canvas = document.createElement('canvas')
  canvas.className = 'roles__canvas'
  canvas.setAttribute('aria-hidden', 'true')
  host.appendChild(canvas)
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' })
  } catch (error) {
    console.warn('[roles] the Journey falls back to posters: no WebGL context', error)
    canvas.remove()
    return null
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  // Shadow maps redraw only for a frame that asks (shadowMap.needsUpdate): every journey frame, whose scroll moves
  // the scene, and a home frame whose island moved. A home frame that only scrolled moved the camera, which leaves
  // the light's shadow map as it was.
  renderer.shadowMap.autoUpdate = false
  renderer.setClearColor(0x000000, 0)
  renderer.autoClear = false

  let failed = false
  let disposed = false
  let lost = false
  const fail = (reason: string) => {
    if (failed) return
    console.warn(`[roles] the Journey falls back to posters: ${reason}`)
    failed = true
    cancelAnimationFrame(raf)
    onFallback()
  }
  /** The island whose programs are compiling or drawing, so a shader error fails that island alone. */
  let current: { status: string; entry: RoleEntry } | null = null
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    console.warn('[roles]', [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].filter(Boolean).join('\n'))
    if (current) {
      console.warn(`[roles] ${current.entry.story.id} falls back to its poster`)
      current.status = 'failed'
      onIslandFailed(current.entry.story.id)
    } else fail('a shared shader failed to compile')
  }

  const environment = createEnvironment(renderer)
  const target = createProductTarget(renderer)
  const composite = createComposite()
  const cu = composite.material.uniforms
  cu.uProduct.value = target.texture
  cu.uCoach.value = 0
  cu.uCopyMask.value.set(0, 0, 0, 0)
  cu.uBackMix.value = 0
  cu.uDecode.value = 1
  // The journey hides every other section, so the base is opaque to the stage's edges.
  cu.uEdge.value.set(0, 0, 1)
  cu.uGather.value = 1
  let atlas: THREE.CanvasTexture | null = null
  let atlasKey = ''
  const glyphContext = document.createElement('canvas').getContext('2d')

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
      tiltX: 0, tiltY: 0, hover: 0, goalX: 0, goalY: 0, stirred: false, shadowed: false, formStart: -1, formed: false, detach: null,
    })
  }

  /** Programs whose first use (info logs and uniform table) has run, so no draw waits on it. */
  const warmed = new WeakSet<object>()
  /**
   * Compiles `object`'s programs for `island`'s scene without blocking, and resolves once each new program has linked
   * and had its first use, one per frame. Programs key on the target they draw into, so the compile runs with the
   * product target bound (no tone mapping, linear output). Programs compiled with the canvas bound do not match the
   * draw's and compile again, synchronously, at the world's first draw. A program that fails marks `island` failed and
   * the promise never resolves.
   */
  const compileFor = (island: Island, object: THREE.Object3D): Promise<void> => {
    const scene = island.scene
    if (!scene) return Promise.resolve()
    // compile() creates every program synchronously, including the second program of a material shared by a mesh
    // and an instanced mesh, so the programs new since this call are exactly the ones to warm.
    const before = new Set(renderer.info.programs ?? [])
    renderer.setRenderTarget(target)
    const compiling = renderer.compileAsync(object, scene.camera, scene.scene)
    renderer.setRenderTarget(null)
    const cold = (renderer.info.programs ?? []).filter((program) => !before.has(program) && !warmed.has(program))
    cold.forEach((program) => warmed.add(program))
    return compiling.then(() => new Promise<void>((resolve) => {
      const warm = () => {
        if (disposed || failed || island.status === 'failed') return
        const program = cold.shift()
        if (!program) { resolve(); return }
        current = island
        program.getUniforms()
        current = null
        requestAnimationFrame(warm)
      }
      warm()
    }))
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
          // A scene that changed outside update (an async load, a click) has a stale shadow map.
          invalidate: () => { island.shadowed = false; start() },
          compile: (object) => compileFor(island, object),
          now: () => (born ? (performance.now() - born) / 1000 : 0),
          story: island.entry.story,
          facts: island.entry.facts,
        })
        // The world draws once its programs are ready, so its first frame never waits on a compile.
        compileFor(island, island.scene.scene).then(() => {
          if (island.status !== 'loading') return
          island.status = 'ready'
          start()
        })
      } catch (error) {
        console.warn(`[roles] ${island.entry.story.id} failed to build`, error)
        island.status = 'failed'
        onIslandFailed(island.entry.story.id)
      }
    }, (error) => {
      console.warn(`[roles] ${island.entry.story.id} failed to load`, error)
      island.status = 'failed'
      onIslandFailed(island.entry.story.id)
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
    cu.uRes.value.copy(buffer)
    cu.uPixelRatio.value = pixelRatio
    cu.uCopyNarrow.value = narrow ? 1 : 0
    // Cells are whole device pixels, so every glyph lands on the same pixel phase and stays crisp. The atlas is
    // rebuilt only when the cell metrics change.
    const cell = narrow ? CELL.narrow : CELL.wide
    if (glyphContext) glyphContext.font = `500 ${cell.fontPx}px ${FONT_FAMILY}`
    const advance = glyphContext?.measureText('M').width || cell.fontPx * 0.6
    const cellW = Math.max(2, Math.round(advance * pixelRatio))
    const cellH = Math.max(3, Math.round(cell.height * pixelRatio))
    cu.uCell.value.set(cellW, cellH)
    const key = `${cellW}:${cellH}:${pixelRatio}:${cell.fontPx}`
    if (key !== atlasKey) {
      const glyphs = buildGlyphAtlas(cellW / pixelRatio, cellH / pixelRatio, cell.fontPx, Math.ceil(pixelRatio * 2), CHAPTER_RAMP)
      if (glyphs) {
        atlas?.dispose()
        atlas = new THREE.CanvasTexture(glyphs)
        atlas.flipY = false
        atlas.generateMipmaps = false
        atlas.minFilter = THREE.LinearFilter
        cu.uAtlas.value = atlas
        atlasKey = key
      }
    }
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
  /** The journey's glyph transition: dissolving out before a switch or a close, or forming in after a switch. */
  let glyph: { kind: 'leave-switch' | 'leave-close' | 'form'; start: number } | null = null
  let expand: { start: number; from: { left: number; top: number; width: number; height: number }; closing: boolean; to: { left: number; top: number; width: number; height: number } | null } | null = null
  const start = () => { if (!raf && compiled && !disposed && !failed && !lost && !document.hidden) raf = requestAnimationFrame(draw) }
  const project = new THREE.Vector3()
  const labelAt = new THREE.Vector3()
  const origin = new THREE.Vector3()

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
      if (panel.opacity <= 0) return HIDDEN_SHOT
      const anchor = toView(camera, labelAt.copy(panel.center).addScaledVector(panel.up, -panel.halfH * LABEL_DROP), rect)
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

  /** Whether the last frame drew anything, so a frame with nothing to draw knows the canvas is already clear. */
  let drewLast = true
  let dragYaw = 0
  let dragGoal = 0
  let drag: { id: number; x: number; start: number } | null = null

  /**
   * Draws `island`'s world into `rect` through the glyph composite: the scene into the rectangle's place in the
   * full-size product target (the composite reads it pixel for pixel), then the composite into the same rectangle
   * on the canvas. `decode` and `gather` form the world from glyphs (1 and 1 resolved), `reveal` prints the role's
   * room around it, and `base` is the opacity of the black base under the room.
   */
  const drawWorld = (island: Island, rect: { left: number; top: number; width: number; height: number }, o: { decode: number; gather: number; reveal: number; base: number; room: boolean }) => {
    const scene = island.scene
    if (!scene) return
    const story = island.entry.story
    const room = o.room ? load(story.room.src) : null
    const levels = story.room.levels ?? ROOM_LEVELS
    cu.uBackA.value = room?.ready ? room.texture : null
    cu.uBackB.value = cu.uBackA.value
    cu.uBackAspect.value.set(room?.aspect ?? 16 / 9, room?.aspect ?? 16 / 9)
    cu.uFocus.value.set(story.room.focusX, 0.5, story.room.focusX, 0.5)
    cu.uLevels.value.set(levels[0], levels[1], levels[0], levels[1])
    cu.uMirror.value.set(0, 0)
    cu.uBackGain.value = room?.ready ? ROOM_GAIN : 0
    cu.uGlyphOnly.value = 0
    cu.uTint.value.set(...(story.look?.tint ?? linearOf(island.entry.facts.accent)))
    cu.uGrade.value.set(...(story.look?.grade ?? [1, 1, 1]))
    cu.uPointer.value.set(island.tiltX, -island.tiltY)
    cu.uReveal.value = o.reveal
    cu.uDecode.value = o.decode
    cu.uGather.value = o.gather
    cu.uEdge.value.set(0, 0, o.base)
    const px = renderer.getPixelRatio()
    const centre = toView(scene.camera, origin, rect)
    cu.uRevealAt.value.set(centre ? centre.x * px : buffer.x / 2, centre ? (height - centre.y) * px : buffer.y / 2)
    const x = Math.round(rect.left * px)
    const y = Math.round((height - rect.top - rect.height) * px)
    const w = Math.max(1, Math.round(rect.width * px))
    const h = Math.max(1, Math.round(rect.height * px))
    target.viewport.set(x, y, w, h)
    target.scissor.set(x, y, w, h)
    target.scissorTest = true
    renderer.setRenderTarget(target)
    renderer.setClearColor(0x000000, 0)
    renderer.clear(true, true, false)
    // The composite samples the product's mipmaps only while decoding, so a resolved world skips generating them.
    // The flag is back on outside this render, so the storage three allocates after a resize keeps its mip levels.
    target.texture.generateMipmaps = o.decode < 1
    current = island
    renderer.render(scene.scene, scene.camera)
    current = null
    target.texture.generateMipmaps = true
    target.viewport.set(0, 0, buffer.x, buffer.y)
    target.scissorTest = false
    renderer.setRenderTarget(null)
    setRect(rect)
    renderer.setScissorTest(true)
    renderer.render(composite.scene, composite.camera)
    renderer.setScissorTest(false)
  }

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
    // A home frame with nothing on screen leaves an already clear canvas alone.
    if (journey || drewLast) renderer.clear(true, true, true)
    let drew = !!journey
    const launch = pushStart < 0 ? 1 : Math.min(1, (now - pushStart) / 900)
    if (launch >= 1) pushStart = -1
    const push = launch < 1 ? Math.sin(Math.PI * launch) : 0
    if (push > 0) moving = true

    for (const island of islands.values()) {
      const nextX = approach(island.tiltX, island.goalX, dt, EASE.tilt)
      const nextY = approach(island.tiltY, island.goalY, dt, EASE.tilt)
      const nextHover = approach(island.hover, island.pointer.inside ? 1 : 0, dt, EASE.hover)
      island.stirred = nextX !== island.tiltX || nextY !== island.tiltY || nextHover !== island.hover
      if (island.stirred) moving = true
      island.tiltX = nextX
      island.tiltY = nextY
      island.hover = nextHover
    }
    const nextDrag = approach(dragYaw, dragGoal, dt, EASE.drag)
    if (nextDrag !== dragYaw) moving = true
    dragYaw = nextDrag

    // A close that has finished shrinking hands the island back to its row in this same frame, resolved.
    if (expand?.closing && now - expand.start >= EXPAND_MS) {
      const landed = journey ? islands.get(journey.id) : null
      if (landed) landed.formed = true
      journey = null
      expand = null
      moving = true
    }
    const closingId = journey && expand?.closing ? journey.id : null

    // The rows: every visible slot's world in its own rectangle, forming from glyphs the first time it shows. They
    // draw whenever no journey covers the screen, and under a journey that is shrinking back into its row.
    if (!journey || closingId) {
      for (const island of islands.values()) {
        if (!island.slot || island.status === 'failed' || island.entry.story.id === closingId) continue
        const rect = viewRect(island)
        if (!onScreen(rect, LOAD_MARGIN)) continue
        if (island.status === 'idle') loadScene(island)
        if (island.status !== 'ready' || !island.scene || !onScreen(rect)) continue
        if (!island.formed && island.formStart < 0) island.formStart = now
        const out = island.scene.update(frameFor(island, 'home', rect.width / Math.max(1, rect.height), () => 0, dt, now, 0, 0))
        if (out.busy) moving = true
        let decode = 1
        let gather = 1
        if (island.formStart >= 0) {
          const f = (now - island.formStart) / FORM_MS
          gather = smoother(ramp(f, 0, 0.6))
          decode = smoother(ramp(f, 0.2, 0.95))
          if (f >= 1) {
            island.formStart = -1
            island.formed = true
          } else moving = true
        }
        if (!drew) renderer.clear(true, true, true)
        drew = true
        renderer.shadowMap.needsUpdate = !island.shadowed || island.stirred || out.busy
        island.shadowed = true
        drawWorld(island, rect, { decode, gather, reveal: 0, base: 0, room: false })
      }
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
      // The rectangle grows out of the row's slot or shrinks back into it, and the world passes through glyphs on
      // the way, so the change between its row pose and its journey pose happens while it is scattered.
      const full = { left: 0, top: 0, width, height }
      let rect = full
      let homePose = false
      let decode = 1
      let gather = 1
      let reveal = 1
      let base = 1
      if (expand) {
        const t = Math.min(1, (now - expand.start) / EXPAND_MS)
        const e = smoother(t)
        const from = expand.closing ? full : expand.from
        const to = expand.closing ? expand.to ?? full : full
        rect = {
          left: from.left + (to.left - from.left) * e,
          top: from.top + (to.top - from.top) * e,
          width: from.width + (to.width - from.width) * e,
          height: from.height + (to.height - from.height) * e,
        }
        if (expand.closing) {
          // After the leave phase the world is half scattered glyphs. It gathers as it flies to the slot and
          // resolves into its row pose as it lands.
          homePose = true
          gather = LEAVE_GATHER + (1 - LEAVE_GATHER) * smoother(ramp(t, 0, 0.6))
          decode = smoother(ramp(t, 0.45, 1))
          reveal = 0
          base = 0
        } else {
          const g = Math.sin(Math.PI * t)
          homePose = t < 0.5
          decode = 1 - g
          gather = 1 - (1 - LEAVE_GATHER) * g
          reveal = smoother(ramp(t, 0.25, 1))
          base = reveal
          if (t >= 1) expand = null
        }
        moving = true
      }
      if (glyph) {
        const g = (now - glyph.start) / (glyph.kind === 'form' ? FORM_MS : LEAVE_MS)
        if (glyph.kind === 'form') {
          gather = Math.min(gather, smoother(ramp(g, 0, 0.6)))
          decode = Math.min(decode, smoother(ramp(g, 0.2, 0.95)))
          reveal = Math.min(reveal, smoother(ramp(g, 0, 0.97)))
        } else if (glyph.kind === 'leave-switch') {
          decode = Math.min(decode, 1 - smoother(ramp(g, 0, 0.5)))
          gather = Math.min(gather, 1 - smoother(ramp(g, 0.35, 1)))
          reveal = Math.min(reveal, 1 - smoother(g))
        } else {
          decode = Math.min(decode, 1 - smoother(ramp(g, 0, 0.8)))
          gather = Math.min(gather, 1 - (1 - LEAVE_GATHER) * smoother(ramp(g, 0.2, 1)))
          reveal = Math.min(reveal, 1 - smoother(g))
          base = reveal
        }
        // A leave holds its last state until the swap replaces it. A formation ends.
        if (g < 1) moving = true
        else if (glyph.kind === 'form') glyph = null
      }
      if (open.status === 'idle') loadScene(open)
      const scene = open.scene
      if (scene && open.status === 'ready') {
        const aspect = rect.width / rect.height
        const out = homePose
          ? scene.update(frameFor(open, 'home', aspect, () => 0, dt, now, 0, 0))
          : scene.update(frameFor(open, 'journey', aspect, local, dt, now, push, dragYaw))
        if (out.busy) moving = true
        const room = load(open.entry.story.room.src)
        drew = true
        renderer.shadowMap.needsUpdate = true
        open.shadowed = false
        drawWorld(open, rect, { decode, gather, reveal, base, room: true })
        if (!homePose) reportFrame(open, out, rect, p)
        if (!journey.ready && out.ready && room.ready) {
          journey.ready = true
          journey.onReady()
        }
      } else moving = true
    }
    drewLast = drew
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
    if (disposed) return
    event.preventDefault()
    lost = true
    fail('the WebGL context was lost')
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
      // From a row the world grows out of its slot. Otherwise (a switch, or a direct load) it forms in place.
      expand = options.from ? { start: performance.now(), from: options.from, closing: false, to: null } : null
      glyph = options.from ? null : { kind: 'form', start: performance.now() }
      island.pointer.inside = false
      island.goalX = 0
      island.goalY = 0
      attachJourney(island, options.stage)
      measure()
    },
    leaveJourney(kind) {
      if (!journey) return
      glyph = { kind: kind === 'switch' ? 'leave-switch' : 'leave-close', start: performance.now() }
      start()
    },
    closeJourney(to) {
      detachJourney?.()
      if (!journey) return
      glyph = null
      // The other rows' worlds form as the page returns around them.
      for (const island of islands.values()) {
        if (island.entry.story.id === journey.id) continue
        island.formed = false
        island.formStart = -1
      }
      if (!to) {
        const landed = islands.get(journey.id)
        if (landed) {
          landed.formed = false
          landed.formStart = -1
        }
        journey = null
        expand = null
        measure()
        return
      }
      expand = { start: performance.now(), from: { left: 0, top: 0, width, height }, closing: true, to }
      for (const island of islands.values()) measureSlot(island)
      lastPaint = 0
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
      atlas?.dispose()
      target.dispose()
      environment.dispose()
      renderer.dispose()
      if (!lost) renderer.forceContextLoss()
      canvas.remove()
    },
  }
}
