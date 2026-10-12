import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { ScreenKey, TeardownStory } from '../../content/teardown/types'
import { pageScrollY } from '../../scroll/scrollSignal'
import { buildGlyphAtlas } from '../hero/glyphAtlas'
import { sceneProgress } from '../hero/world'
import { buildCodeTexture } from './codeTexture'
import { COACH_BONES, jointsAt } from './coach'
import { createComposite } from './composite'
import { GLIDE_TIME, glideStep, type Glide } from './glide'
import { CHAPTER_RAMP } from './materials'
import { cardShots, type CardShot } from './labels'
import { createProduct, type PlaneMesh } from './product'
import { ACT_SCREEN, FOCAL, LAUNCH_MS, MAX_DRAG, anchorWorld, coachWorld, poseAt, projectPoint, projectRect, type Interaction, type PlanePose, type Pose, type Vec3 } from './rig'
import { applyLensShift, toThreePosition, verticalFov } from './threeMap'
import { actAt, actCopyRide, actWindows, previewProgress } from './timeline'

export interface TeardownFrame {
  /** Glided chapter progress, the value every visual and the act state follow. */
  progress: number
  /** Stage-relative CSS px per callout anchor, keyed `c:<act>:<callout>`, null when behind the camera. */
  anchors: Map<string, { x: number; y: number } | null>
  /** Each day-act card's label anchor, bounds, depth, develop, and opacity, in story order. */
  cards: CardShot[]
  /** The pose's explode, 0 assembled to 1 fully apart. Teardown holds the glass act's leaders until the stack has separated. */
  explode: number
  /** The phone's projected screen in stage CSS px, null while the screen is hidden. Teardown places the phone's click target on it. */
  phone: { left: number; top: number; width: number; height: number } | null
}

/** Which track the chapter scrolls through: the home page's arrival preview or the full journey. */
export type TeardownView = 'preview' | 'journey'

/** What Teardown can ask of a running canvas. */
export interface TeardownControl {
  /** Plays the launch bump: the camera eases closer and back and the lit body flares, over LAUNCH_MS. */
  pulse(): void
  /**
   * Remeasures the track and lands the glide on the scroll's progress. Teardown calls it in the same frame as a
   * view swap, after setting the scroll, so no frame draws with the old track or glides between the views.
   */
  sync(): void
}

export interface TeardownCanvasProps {
  story: TeardownStory
  /** The chapter track. Progress is measured against it. */
  track: HTMLElement
  onFrame: (frame: TeardownFrame) => void
  /**
   * First frame drawn with the textures its pose shows uploaded. `formMs` is how long the phone and the room take to form
   * from glyphs as the canvas appears, 0 when the scroll has not reached the formation yet.
   */
  onReady: (formMs: number) => void
  /** WebGL2 missing, a shader or framebuffer failed, or the context was lost. */
  onFallback: () => void
  /** Read on every scroll, so a view change maps progress anew without remounting the renderer. */
  view: { current: TeardownView }
  /** Set while the renderer runs and cleared on unmount. */
  control: { current: TeardownControl | null }
}

type Callbacks = Pick<TeardownCanvasProps, 'onFrame' | 'onReady' | 'onFallback'>

/**
 * Glyph cells, about 5.7 by 7.5 CSS px on wide screens and 4.2 by 5.5 on phones. The width is the font's advance.
 * The font is 1.28 times its row, so a lowercase glyph's body fills about 70% of the row and a capital nearly all
 * of it, and neighbouring rows close into a picture. A font the size of its row or smaller leaves a gap between
 * rows that reads as scanlines and collapses the room into stripes. The tallest glyphs (#, %, @) lose a sliver at
 * the top and bottom of their atlas cell, which the picture never shows.
 */
const CELL = { wide: { fontPx: 9.6, height: 7.5 }, narrow: { fontPx: 7, height: 5.5 } }
const FONT_FAMILY = '"JetBrains Mono", "IBM Plex Mono", monospace'
/** Pixels of the right edge left to the scroll rail. */
const RAIL_GUTTER = 32
/** rAF timestamps jitter by a millisecond or two, so a frame counts as due this much before its interval ends. */
const FRAME_SLACK = 3
/**
 * Time constants of the pointer easing, seconds. The tilt follows the pointer with a soft ease so it answers
 * the hand without snapping, and a drag keeps close to it.
 */
const EASE = { dragYaw: 0.2, tiltX: 0.32, tiltY: 0.32 } as const
/** The key light's resting position in three.js space, and how far it swings with the pointer at the stage's edges. */
const KEY_REST: [number, number, number] = [-2.2, 2.6, 3]
const KEY_SWING: [number, number] = [4, 2.8]
/** An interaction this close to its goal, in its own units, lands on it and stops the loop. */
const EASE_REST = 1e-3
/**
 * Progress within this much of either end of the chapter follows the scroll on the shorter END_GLIDE_TIME, so the
 * pose settles before the stage unpins. At 0.06 s a wheel flick of 2500 px/s leaves the glide about half a frame
 * behind the scroll, so the close dissolve finishes while the stage is still pinned.
 */
const END_REACH = 0.12
const END_GLIDE_TIME = 0.06
/** Milliseconds a canvas that appears mid-formation takes to form the phone and the room from glyphs. */
const FORM_MS = 1400
/** Frames the mount waits for parallel program links before it draws regardless, about 2 s at 60 Hz. */
const LINK_POLLS = 120

type Loaded = { texture: THREE.Texture; ready: boolean; width: number; height: number; aspect: number }

/**
 * Decode options that make an ImageBitmap upload the same bytes as an image element under three's defaults for an
 * sRGB texture: flipY, no premultiplication, and the browser's colour conversion.
 */
const BITMAP_OPTIONS: ImageBitmapOptions = { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'default' }
let flipProbe: Promise<boolean> | null = null

/**
 * Resolves true where createImageBitmap honours BITMAP_OPTIONS' flip. A browser that ignored imageOrientation
 * would draw every screen and room upside down, so where the probe fails the chapter keeps image elements.
 */
function bitmapsFlip(): Promise<boolean> {
  flipProbe ??= (async () => {
    try {
      const source = new OffscreenCanvas(1, 2)
      const paint = source.getContext('2d')
      const read = new OffscreenCanvas(1, 2).getContext('2d')
      if (!paint || !read) return false
      paint.fillStyle = '#f00'
      paint.fillRect(0, 0, 1, 1)
      paint.fillStyle = '#00f'
      paint.fillRect(0, 1, 1, 1)
      const bitmap = await createImageBitmap(source, BITMAP_OPTIONS)
      read.drawImage(bitmap, 0, 0)
      bitmap.close()
      return read.getImageData(0, 0, 1, 1).data[2] > 128
    } catch {
      return false
    }
  })()
  return flipProbe
}

/** True once a program's parallel link has finished. three's WebGLProgram.isReady is missing from its typings. */
const linked = (program: unknown) => (program as { isReady?: () => boolean }).isReady?.() ?? true

/**
 * Waits for every pending program link. Chrome tracks each parallel link
 * with a completion query, and a program deleted while that query is still
 * pending logs "GL_INVALID_VALUE: glGetProgramiv: Program object expected"
 * once per poll. Reading LINK_STATUS makes the client wait for the query
 * first, so this must run before any material of the renderer is disposed.
 */
function settleLinks(renderer: THREE.WebGLRenderer) {
  const gl = renderer.getContext()
  for (const entry of renderer.info.programs ?? []) {
    if (entry.program) gl.getProgramParameter(entry.program as WebGLProgram, gl.LINK_STATUS)
  }
}

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
    settleLinks(renderer)
    room.dispose()
    pmrem.dispose()
    disposers.push(() => environment.dispose())

    const scene = new THREE.Scene()
    scene.environment = environment.texture
    // three.js world space: the camera sits on +z and looks along -z, so "front" is +z. A soft top light draws
    // the gradient along the frame, the low warm key lights the glass and the lenses, and the faint back-left
    // rim separates the silhouette from the glyph room.
    const sky = new THREE.HemisphereLight('#fff1dc', '#0b0806', 0.5)
    const top = new THREE.DirectionalLight('#fff4e4', 1.5)
    top.position.set(0.4, 5, 2)
    const key = new THREE.DirectionalLight('#ffe2b8', 1)
    key.position.set(...KEY_REST)
    const rim = new THREE.DirectionalLight('#ffd9a8', 0.8)
    rim.position.set(-3, 1.4, -3)
    scene.add(sky, top, key, rim)

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
    // Only the colour is sampled. Without this, three blits the multisampled depth into the resolved target too
    // and leaves the multisampled attachments valid, so every frame stores and copies a depth buffer nothing reads.
    target.resolveDepthBuffer = false
    disposers.push(() => target.dispose())

    const composite = createComposite()
    disposers.push(() => composite.dispose())
    composite.material.uniforms.uProduct.value = target.texture

    const camera = new THREE.PerspectiveCamera(verticalFov(FOCAL), 1, 0.05, 40)
    const lights = [sky, top, key, rim].map((light) => ({ light, base: light.intensity }))
    return { scene, camera, product, target, composite, key, lights, dispose }
  } catch (error) {
    dispose()
    throw error
  }
}

/** The chapter's 3D stage. All hot state stays outside React, as in the hero's AsciiWorld. */
export default function TeardownCanvas({ story, track, onFrame, onReady, onFallback, view, control }: TeardownCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const callbacks = useRef<Callbacks>({ onFrame, onReady, onFallback })
  useEffect(() => { callbacks.current = { onFrame, onReady, onFallback } })

  useEffect(() => {
    const canvas = canvasRef.current
    const stage = canvas?.parentElement
    if (!canvas || !stage) return
    // React's development double mount runs this cleanup right after the first effect. Booting on the next
    // frame keeps that first mount from building a renderer, an environment, and six programs only to delete them.
    let unmount: (() => void) | null = null
    const boot = requestAnimationFrame(() => { unmount = mount(canvas, stage, track, story, callbacks, view, control) })
    return () => {
      cancelAnimationFrame(boot)
      unmount?.()
    }
    // view and control are ref objects that Teardown creates once, so they never remount the renderer.
  }, [story, track, view, control])

  return <canvas ref={canvasRef} className="teardown__canvas" aria-hidden="true" />
}

/** Builds the renderer and runs the chapter until the returned function is called. */
function mount(
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  track: HTMLElement,
  story: TeardownStory,
  callbacks: { current: Callbacks },
  view: TeardownCanvasProps['view'],
  control: TeardownCanvasProps['control'],
): () => void {
  let failed = false
  let stop = () => {}
  const fail = (reason: unknown) => {
    if (failed) return
    failed = true
    stop()
    console.warn('[teardown] falling back to the DOM stage', reason)
    callbacks.current.onFallback()
  }

  let renderer: THREE.WebGLRenderer
  let gpu: ReturnType<typeof createStage>
  try {
    // The canvas is transparent over the page background, and the composite writes premultiplied colour, which
    // is what premultipliedAlpha tells the browser to expect. The chapter never claims the page background's
    // cover signal (heroCover.ts), since the page must keep painting under the glyphs.
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: true, depth: false, stencil: false, powerPreference: 'high-performance' })
  } catch (error) {
    fail(error)
    return () => {}
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
    return () => {}
  }
  const { scene, camera, product, target, composite, key, lights, dispose: disposeStage } = gpu
  const cu = composite.material.uniforms
  const planes: PlaneMesh[] = [product.screen, ...product.cards]

  const windows = actWindows(story.acts)
  const actBackdrops = story.acts.map((a) => a.backdrop)
  // Screens and the code layer turn away from the camera in the exploded fan, and up to 16x keeps their UI text
  // sharp there. Rooms are sampled only through textureLod, which has no derivatives, so the value does not
  // apply to them.
  const anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy())
  const images = new THREE.ImageLoader()
  const owned: THREE.Texture[] = []
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
  /** Set when the track leaves the viewport: the next draw runs once at the final progress even though the track is off screen. */
  let flush = false
  let lost = false
  let disposed = false
  let compiled = false
  /** The CSS size and pixel ratio the canvas and the render target were last sized for, empty before the first measure. */
  let sized = ''
  /** Set when the render target was resized, so the next draw checks it before drawing into it. */
  let verifyTarget = false
  /** performance.now() of the launch click, -1 when no launch bump is playing. */
  let pulseStart = -1
  /** performance.now() the canvas first appeared mid-formation, -1 once the load-in has finished or never ran. */
  let formStart = -1
  let ready = false
  let raf = 0
  let lastPaint = 0
  let frameInterval = 1000 / 60
  let lastAct = -1
  let copyDirty = true
  let copyRail: { left: number; right: number; top: number } | null = null
  let copyBlocks: HTMLElement[] = []
  const inkRange = document.createRange()
  const interaction: Interaction = { dragYaw: 0, tiltX: 0, tiltY: 0 }
  const goal: Interaction = { dragYaw: 0, tiltX: 0, tiltY: 0 }
  let drag: { id: number; x: number; start: number } | null = null
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')

  stop = () => { cancelAnimationFrame(raf); raf = 0; lastPaint = 0 }

  /**
   * Texture uploads waiting to run, oldest first. They start once every program has linked and then run one per
   * frame, so no frame carries two uploads and none waits behind the links in the GPU process. A screen's upload
   * blocks the main thread for about 20 to 25 ms in the live page.
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
  const start = () => { if (!raf && (visible || flush) && compiled && !document.hidden && !lost && !failed && !disposed) raf = requestAnimationFrame(draw) }

  /**
   * Loads an sRGB, mipmapped image texture and queues its upload (queueUpload), so first use never stalls a frame.
   * Where bitmaps flip at decode, the image decodes off the main thread into an ImageBitmap. An image element
   * decodes inside texImage2D on the main thread instead, about 15 ms of a 1320x2868 screen's upload. The bitmap
   * is closed once uploaded, since three uploads a texture again only when its version changes, and nothing here
   * bumps it after the first upload. A failed load leaves the texture unready.
   */
  const load = (src: string, urgent = false): Loaded => {
    const texture = new THREE.Texture()
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = anisotropy
    owned.push(texture)
    const entry: Loaded = { texture, ready: false, width: 1, height: 1, aspect: 16 / 9 }
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
    }, urgent)
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
          texture.flipY = false
          upload(bitmap, bitmap.width, bitmap.height)
        })
        .catch(() => undefined)
    })
    return entry
  }
  // The arrival's screen and room upload first, since the canvas appears as soon as the pose it shows is ready.
  const screens = new Map<ScreenKey, Loaded>(story.screens.map((screen) => [screen.key, load(screen.src, screen.key === ACT_SCREEN.arrival)]))
  const rooms: (Loaded | null)[] = story.backdrops.map(() => null)
  const requestRoom = (index: number | null) => {
    if (index === null || index < 0 || index >= rooms.length || rooms[index]) return
    rooms[index] = load(story.backdrops[index].src, index === actBackdrops[0])
  }
  // Every room is queued at mount, in the order the acts reach them, so their uploads run before the chapter is on
  // screen. Requested on first use, the arrival's rooms uploaded in the frames the chapter scrolled in.
  actBackdrops.forEach(requestRoom)
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

  /** Eases each interaction toward its goal with its own time constant. Returns true while anything is still moving. */
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

  /**
   * The rail's left and right edges and its top in stage CSS px, and its act blocks in act order. The rail's rect is
   * independent of the active act, since the acts ride inside it on --copy-y. It is measured on resize and again
   * on the frame after each act change, so a layout change that coincides with an act boundary is picked up
   * without waiting for a resize.
   */
  const measureCopy = () => {
    copyDirty = false
    const railEl = stage.querySelector<HTMLElement>('.teardown__rail')
    const rail = railEl?.getBoundingClientRect()
    copyBlocks = railEl ? (Array.from(railEl.children) as HTMLElement[]) : []
    if (!rail || !rail.width || !rail.height) { copyRail = null; return }
    const rect = stage.getBoundingClientRect()
    copyRail = { left: rail.left - rect.left, right: rail.right - rect.left, top: rail.top - rect.top }
  }

  /**
   * Right edge of a copy block's ink, CSS px from the block's left edge. A line is a block box as wide as the rail,
   * so a child counts its contents (a line's text runs, a list's item boxes) and, when it is narrower than the
   * block, its own border box, which takes in the readout panel's padding. The ride moves a block only vertically,
   * so differences of client x are exact.
   */
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

  /**
   * The copy mask for one frame, in device px. Phones shade from the rail's top down. Wide stages shade the
   * active act's block where Teardown rides it this frame (actCopyRide), out to the block's own ink (inkRight)
   * and not the rail's right edge, so the room right of a short act's copy keeps its glyphs, and fade the
   * shade with the block's opacity, so an act with no copy shades nothing. The block's offsetTop and offsetHeight
   * exclude the ride's transform, and the proof readout grows as it types, so the block is read every frame. The
   * draw runs before Teardown's writes for the frame, so the reads find layout clean.
   */
  const applyCopyMask = (progress: number) => {
    const px = renderer.getPixelRatio()
    cu.uCopyNarrow.value = narrow ? 1 : 0
    if (!copyRail) { cu.uCopyMask.value.set(0, 0, 0, 0); return }
    if (narrow) { cu.uCopyMask.value.set(copyRail.right * px, copyRail.top * px, 0, 1); return }
    const act = actAt(windows, progress).index
    const block = copyBlocks[act]
    const ride = actCopyRide(windows, act, progress)
    const blockH = block?.offsetHeight ?? 0
    const top = copyRail.top + (block?.offsetTop ?? 0) + ride.y * height
    const right = block && blockH > 0 && ride.opacity > 0 ? copyRail.left + inkRight(block) : copyRail.right
    cu.uCopyMask.value.set(right * px, top * px, (top + blockH) * px, blockH > 0 ? ride.opacity : 0)
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
    const { a, b, mix, gain, glyphOnly } = pose.backdrop
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
    const levels = (index: number): [number, number] => story.backdrops[index]?.levels ?? [0, 1]
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
    // The room prints in from, and dissolves back into, the product's place, in device px from the bottom left.
    const at = projectPoint(pose, pose.phone.pos, aspect)
    cu.uReveal.value = pose.backdrop.reveal
    cu.uRevealAt.value.set(at ? at.x * drawingBuffer.x : drawingBuffer.x / 2, at ? (1 - at.y) * drawingBuffer.y : drawingBuffer.y / 2)
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
    if (disposed || failed || lost || (!visible && !flush) || document.hidden || !compiled) return
    if (lastPaint && now - lastPaint < frameInterval - FRAME_SLACK) { raf = requestAnimationFrame(draw); return }
    const dt = lastPaint ? Math.min(0.1, (now - lastPaint) / 1000) : 0
    lastPaint = now
    if (copyDirty) measureCopy()
    const easing = settle(dt)
    const atEnd = progress > 1 - END_REACH || progress < END_REACH
    glide = glideStep(glide, progress, dt, atEnd ? END_GLIDE_TIME : GLIDE_TIME)
    // The follow decays toward the target without reaching it, so it lands on the target once it is within
    // 1e-4 progress and moving slower than 1e-3 progress per second.
    if (Math.abs(glide.value - progress) < 1e-4 && Math.abs(glide.velocity) < 1e-3) glide = { value: progress, velocity: 0 }
    const aspect = width / height
    // The launch bump is a sine over LAUNCH_MS from the click, so it starts and ends at rest.
    const launch = pulseStart < 0 ? 1 : Math.min(1, (now - pulseStart) / LAUNCH_MS)
    if (launch >= 1) pulseStart = -1
    const push = launch < 1 ? Math.sin(Math.PI * launch) : 0
    const pose = poseAt({ progress: glide.value, windows, backdrops: actBackdrops, narrow, aspect, interaction, poseFrames: story.pose.frames, push })
    requestRoom(pose.backdrop.a)
    requestRoom(pose.backdrop.b)
    const nextAct = windows.findIndex((w) => glide.value < w.start)
    if (nextAct >= 0) requestRoom(actBackdrops[nextAct])
    const act = actAt(windows, glide.value).index
    if (act !== lastAct) { lastAct = act; copyDirty = true }

    product.update(pose)
    for (const { light, base } of lights) light.intensity = base * pose.bodyLight
    scene.environmentIntensity = pose.bodyLight
    // The warm key light swings with the pointer, so the frame's edges and the glass catch it as the hand moves.
    key.position.set(KEY_REST[0] + interaction.tiltX * KEY_SWING[0], KEY_REST[1] - interaction.tiltY * KEY_SWING[1], KEY_REST[2])
    applyPlane(product.screen, pose.screen)
    applyPlane(product.code, pose.code)
    product.cards.forEach((card, i) => applyPlane(card, pose.cards[i]))
    camera.aspect = aspect
    camera.position.fromArray(toThreePosition(pose.camera.pos))
    camera.updateProjectionMatrix()
    camera.projectionMatrix.fromArray(applyLensShift(camera.projectionMatrix.toArray(), pose.camera.shift, aspect))
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
    // A canvas that first appears after the scroll has passed the start of the formation forms the phone and the
    // room from glyphs over FORM_MS anyway, so they load in as characters instead of cutting in finished.
    const form = formStart < 0 ? 1 : Math.min(1, (now - formStart) / FORM_MS)
    if (form >= 1) formStart = -1
    const formed = form * form * form * (form * (form * 6 - 15) + 10)
    applyComposite(form < 1 ? { ...pose, decode: Math.min(pose.decode, formed), gather: Math.min(pose.gather, formed), backdrop: { ...pose.backdrop, reveal: Math.min(pose.backdrop.reveal, formed) } } : pose, aspect)
    applyCopyMask(glide.value)

    renderer.setRenderTarget(target)
    if (verifyTarget) {
      // three raises no error for an incomplete target (for example, multisampled RGBA16F unsupported at 4
      // samples), and drawing into one leaves the phone invisible. setRenderTarget rebuilds the framebuffers
      // after a resize and binds the multisampled one, so the check sees the attachments this frame draws into.
      // The check blocks until the GPU process has run every queued command, so it runs here, after the mount's
      // environment render and program links have finished, and not in measure.
      verifyTarget = false
      const gl = renderer.getContext()
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        renderer.setRenderTarget(null)
        fail('the product render target is incomplete')
        return
      }
    }
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
    const screenRect = pose.screen.opacity > 0.05 ? projectRect(pose, pose.screen, aspect) : null
    const phone = screenRect
      ? { left: screenRect.left * width, top: screenRect.top * height, width: (screenRect.right - screenRect.left) * width, height: (screenRect.bottom - screenRect.top) * height }
      : null
    callbacks.current.onFrame({ progress: glide.value, anchors, cards: cardShots(pose, aspect, width, height), explode: pose.explode, phone })

    // The canvas appears once the textures this pose shows are uploaded. The rest keep uploading one per frame,
    // and a plane or a room whose texture has not arrived stays hidden until it does.
    const roomShown = (index: number) => index < 0 || !!rooms[index]?.ready
    const screenShown = pose.screen.texture === 'code' || !!screens.get(pose.screen.texture)?.ready
    if (!ready && screenShown && roomShown(pose.backdrop.a) && roomShown(pose.backdrop.b)) {
      ready = true
      // This frame drew under the canvas's zero opacity, so the load-in starts from nothing on the next one.
      const forming = pose.decode > 0.01
      if (forming) formStart = now
      callbacks.current.onReady(forming ? FORM_MS : 0)
    }
    // Scroll, pointer input, and texture loads restart the loop, so it runs on only while the track is visible and
    // the glide or an interaction is still moving, or an act change has left the copy mask to measure.
    flush = false
    if (visible && (easing || glide.value !== progress || copyDirty || push > 0 || formStart >= 0)) raf = requestAnimationFrame(draw)
    else lastPaint = 0
  }

  const onScroll = () => {
    if (!sized) return
    const y = pageScrollY()
    const fraction = sceneProgress(y - trackTop, trackHeight, height)
    progress = view.current === 'preview' ? previewProgress(fraction, story.acts) : fraction
    const wasVisible = visible
    visible = y + window.innerHeight > trackTop && y < trackTop + trackHeight
    // Arriving from off screen starts at the scroll position instead of gliding through every act in between.
    if (visible && !wasVisible) glide = { value: progress, velocity: 0 }
    // Leaving lands the glide on the final progress and draws that frame once, so data-act and the copy settle on
    // the end state instead of wherever the glide was when the track left the viewport.
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
    if (nextNarrow !== narrow) product.setNarrow(nextNarrow)
    narrow = nextNarrow
    frameInterval = 1000 / (narrow ? 45 : 60)
    const pixelRatio = Math.min(width > 1800 ? 1.75 : 2, window.devicePixelRatio || 1)
    // Setting the canvas size reallocates its drawing buffer even when the size is unchanged, and measure runs
    // again for every observed resize and for the font load, so the canvas and the target resize only on change.
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
  control.current = {
    pulse: () => { pulseStart = performance.now(); start() },
    sync: () => {
      measure()
      glide = { value: progress, velocity: 0 }
      start()
    },
  }

  // compile() prepares a program for every mesh in the scene whether or not it is visible, so the internals
  // and glass programs exist before the glass act first shows them. It only submits the programs, and the
  // driver builds them in the background where KHR_parallel_shader_compile exists. compileAsync is avoided
  // because its polling cannot be cancelled and reads deleted programs after an unmount. The loop starts once
  // every link reports complete, polled once a frame, so the first draw never blocks on a link. After
  // LINK_POLLS frames it starts anyway, and a link that is still pending blocks that one draw. A program's
  // first use reads its info logs and its uniform table, about 100 ms across the chapter's programs, so each
  // program is then put through that first use (getUniforms) one per frame, before the chapter is on screen,
  // and not all in the frame of the first draw.
  renderer.compile(scene, camera)
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

  // The code layer first shows in the glass act, so its canvas build and upload wait for an idle period instead
  // of joining the mount.
  const whenIdle = (run: () => void) => {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 2000 })
    else setTimeout(run, 1)
  }
  const resizeObserver = new ResizeObserver(measure)
  const fontsReady = document.fonts ? document.fonts.load('500 12px "JetBrains Mono"') : Promise.resolve([])
  // The first measure sizes the canvas and allocates the render target. It runs on the next frame, through the
  // observer's first callback, so that allocation and the environment render above never share one long frame.
  const sizing = requestAnimationFrame(() => {
    resizeObserver.observe(stage)
    resizeObserver.observe(track)
    fontsReady.then(() => { measure(); whenIdle(uploadCode) }, () => whenIdle(uploadCode))
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
    code?.dispose()
    if (!lost) {
      settleLinks(renderer)
      // A hot reload remounts on the same canvas, whose context keeps the unpack flags the last texture upload
      // set. The next renderer allocates its default 3D textures first, and texImage3D rejects both flags.
      const gl = renderer.getContext()
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    }
    disposeStage()
    renderer.dispose()
  }
}
