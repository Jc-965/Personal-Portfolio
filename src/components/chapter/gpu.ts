/**
 * GPU plumbing every chapter renderer shares: the ImageBitmap decode probe, program link checks, the studio
 * environment map, and the product render target the composite reads.
 */
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { refreshInterval } from '../../utils/pacing'

/**
 * Decode options that make an ImageBitmap upload the same bytes as an image element under three's defaults for an
 * sRGB texture: flipY, no premultiplication, and the browser's colour conversion.
 */
export const BITMAP_OPTIONS: ImageBitmapOptions = { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'default' }
let flipProbe: Promise<boolean> | null = null

/**
 * Resolves true where createImageBitmap honours BITMAP_OPTIONS' flip. A browser that ignored imageOrientation
 * would draw every screen and room upside down, so where the probe fails a chapter keeps image elements.
 */
export function bitmapsFlip(): Promise<boolean> {
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

/**
 * Viewport heights above and below the viewport within which a stage keeps its product target allocated. The
 * target is about 63 bytes per device pixel, so a stage beyond the band frees it and allocates it again on return.
 */
export const TARGET_BAND = 0.5

/**
 * Records a User Timing measure from `start` (a performance.now() value) to now, which the Performance panel
 * lists under Timings. A browser without the options form of performance.measure records nothing.
 */
export function timed(name: string, start: number) {
  try {
    performance.measure(name, { start, end: performance.now() })
  } catch {
    // The measure is diagnostic only.
  }
}

/** True once a program's parallel link has finished. three's WebGLProgram.isReady is missing from its typings. */
export const linked = (program: unknown) => (program as { isReady?: () => boolean }).isReady?.() ?? true

/** Animation frames untilLinked waits before it resolves regardless. */
const LINK_POLLS = 120

/**
 * Returns a poll that is true once every program submitted to `renderer` before this call can be used without a
 * wait. The caller creates it right after the last compile() of a batch. With KHR_parallel_shader_compile the poll
 * reads each program's completion status. Firefox on macOS lacks the extension, and there a program's first use
 * waits for every link queued ahead of it (220 ms for 24 materials, measured). The poll then reads a fence placed
 * after the links in the command stream, which answers without a wait. The fence is used only without the
 * extension, because fenceSync itself waits for the queue in WebKit.
 */
export function linkGate(renderer: THREE.WebGLRenderer): () => boolean {
  const gl = renderer.getContext() as WebGL2RenderingContext
  if (renderer.extensions.has('KHR_parallel_shader_compile') || typeof gl.fenceSync !== 'function') {
    return () => (renderer.info.programs ?? []).every(linked)
  }
  let fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
  // A fence is not submitted until a flush, and would never signal.
  gl.flush()
  return () => {
    if (!fence) return true
    if (gl.clientWaitSync(fence, 0, 0) === gl.TIMEOUT_EXPIRED) return false
    gl.deleteSync(fence)
    fence = null
    return true
  }
}

/**
 * Resolves once linkGate reports the programs submitted so far ready, polled once per animation frame, or after
 * LINK_POLLS frames. Where the extension exists and the links are complete it resolves without waiting a frame.
 */
export function untilLinked(renderer: THREE.WebGLRenderer): Promise<void> {
  const ready = linkGate(renderer)
  return new Promise((resolve) => {
    let polls = 0
    const poll = () => {
      if (ready() || ++polls >= LINK_POLLS) resolve()
      else requestAnimationFrame(poll)
    }
    poll()
  })
}

/** The layer primePipelines draws on. No scene uses it. */
const PRIME_LAYER = 31
/** The most objects primePipelines draws in one frame, and the frame gap in display intervals that counts as late. */
const PRIME_BATCH = 8
const PRIME_LATE = 1.6
/** Milliseconds after which primePipelines stops, so a slow renderer delays a scene by no more than this. */
const PRIME_BUDGET = 700

/**
 * Draws one visible object for each distinct material of `scene` into `target` over several animation frames, and
 * resolves after the last. A driver builds a program's pipeline state at its first draw. With a cold shader cache
 * (a first visit) that takes about 30 ms per material, and Safari and Firefox hold the page for it when a canvas
 * presents, which measured 95 to 285 ms for a role world drawn whole in Safari. Drawn offscreen and a few per
 * frame, the same work no longer falls on one visible frame. The batch starts at one object, doubles after a frame that
 * arrived on time, and returns to one after a late frame, so a warm cache finishes in a few frames. The run stops
 * after PRIME_BUDGET ms, and the objects it did not reach draw cold. A software renderer never holds the display's
 * rate, so without the budget it would draw one object per frame to the end.
 *
 * `target` must have the format and sample count of the target the scene draws into, because the pipeline state
 * depends on both. A hidden object is skipped, and its first show draws cold as before. After the run the scene's
 * shadow maps hold only the last object drawn, so the caller must redraw them. `alive` returning false ends the
 * run early. A draw that throws ends it too, because priming changes no result.
 */
export function primePipelines(renderer: THREE.WebGLRenderer, scene: THREE.Object3D, camera: THREE.Camera, target: THREE.WebGLRenderTarget, alive: () => boolean): Promise<void> {
  const shown = (object: THREE.Object3D) => {
    for (let at: THREE.Object3D | null = object; at; at = at.parent) if (!at.visible) return false
    return true
  }
  const lights: THREE.Object3D[] = []
  const queue: THREE.Object3D[] = []
  const seen = new Set<string>()
  scene.traverse((object) => {
    if (!shown(object)) return
    if ((object as THREE.Light).isLight) {
      lights.push(object)
      return
    }
    const drawable = object as THREE.Mesh
    if (!drawable.isMesh && !(object as THREE.Points).isPoints && !(object as THREE.Line).isLine && !(object as THREE.Sprite).isSprite) return
    // The object type sets the topology and the instancing, and a shadow caster also draws with a depth material.
    let fresh = false
    for (const material of Array.isArray(drawable.material) ? drawable.material : [drawable.material]) {
      const key = `${material.uuid}:${object.type}:${object.castShadow}`
      if (!seen.has(key)) fresh = true
      seen.add(key)
    }
    if (fresh) queue.push(object)
  })

  /** Draws `object` alone, lit by every light, on a layer no other object is on. */
  const drawOne = (object: THREE.Object3D) => {
    const culled = object.frustumCulled
    const mask = camera.layers.mask
    const bound = renderer.getRenderTarget()
    object.frustumCulled = false
    object.layers.enable(PRIME_LAYER)
    for (const light of lights) light.layers.enable(PRIME_LAYER)
    camera.layers.set(PRIME_LAYER)
    // Every draw renders the shadow maps, with this object as the only caster. A lit program samples them, and a
    // light whose map was never drawn has no depth texture to bind to its shadow sampler.
    if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true
    try {
      renderer.setRenderTarget(target)
      renderer.render(scene, camera)
    } finally {
      renderer.setRenderTarget(bound)
      camera.layers.mask = mask
      for (const light of lights) light.layers.disable(PRIME_LAYER)
      object.layers.disable(PRIME_LAYER)
      object.frustumCulled = culled
    }
  }

  return new Promise((resolve) => {
    let batch = 1
    let first = 0
    let last = 0
    const step = (now: number) => {
      first ||= now
      if (!queue.length || !alive() || now - first > PRIME_BUDGET) { resolve(); return }
      if (last) batch = now - last > refreshInterval() * PRIME_LATE ? 1 : Math.min(PRIME_BATCH, batch * 2)
      last = now
      try {
        for (let drawn = 0; drawn < batch && queue.length; drawn++) drawOne(queue.shift()!)
      } catch {
        resolve()
        return
      }
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
}

/**
 * Waits for every pending program link. Chrome tracks each parallel link with a completion query, and a program
 * deleted while that query is still pending logs "GL_INVALID_VALUE: glGetProgramiv: Program object expected" once
 * per poll. Reading LINK_STATUS makes the client wait for the query first, so this must run before any material
 * of the renderer is disposed.
 */
export function settleLinks(renderer: THREE.WebGLRenderer) {
  const gl = renderer.getContext()
  for (const entry of renderer.info.programs ?? []) {
    if (entry.program) gl.getProgramParameter(entry.program as WebGLProgram, gl.LINK_STATUS)
  }
}

/** A stage's environment map and the call that frees it. */
export interface Environment {
  texture: THREE.Texture
  dispose(): void
}

/** The blur applied to the studio room, the same for every stage. */
const ENVIRONMENT_SIGMA = 0.04

/**
 * The studio environment's prefiltered map as half-float RGBA texels, rows from the bottom, once warmEnvironment
 * has built it. Every stage draws the same room, so one build serves every WebGL context on the page.
 */
let sharedTexels: { data: Uint16Array; width: number; height: number } | null = null
let warming: Promise<void> | null = null

/**
 * Builds the studio environment once, in a context of its own, and keeps its texels for createEnvironment. The
 * room's programs link in parallel before the build draws with them, so the build never waits on a cold shader
 * compile, which takes about 300 ms on the main thread when a stage builds the map itself. The promise resolves
 * when the texels are ready or the build has failed, and never rejects. After a failure each stage builds its own
 * map, as createEnvironment does without this call.
 */
export function warmEnvironment(): Promise<void> {
  warming ??= (async () => {
    const start = performance.now()
    let renderer: THREE.WebGLRenderer | null = null
    try {
      renderer = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: false, alpha: true, depth: false, stencil: false, powerPreference: 'high-performance' })
      // The stage renderers' settings, so the build is the one a stage would make.
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace
      renderer.toneMapping = THREE.NoToneMapping
      renderer.setClearColor(0x000000, 0)
      const pmrem = new THREE.PMREMGenerator(renderer)
      const room = new RoomEnvironment()
      // A program's key depends on whether an offscreen target is bound, so the compile binds one, as the build does.
      const offscreen = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })
      renderer.setRenderTarget(offscreen)
      const compiling = renderer.compileAsync(room, new THREE.PerspectiveCamera(90, 1, 0.1, 100))
      renderer.setRenderTarget(null)
      // compileAsync resolves before the links are done where the parallel compile extension is missing.
      await Promise.all([compiling, untilLinked(renderer)])
      const environment = pmrem.fromScene(room, ENVIRONMENT_SIGMA)
      const { width, height } = environment
      const data = new Uint16Array(width * height * 4)
      await renderer.readRenderTargetPixelsAsync(environment, 0, 0, width, height, data)
      // A browser that cannot read half floats back leaves the buffer at zero, and the lit room is never black.
      if (data.some((value) => value !== 0)) sharedTexels = { data, width, height }
      settleLinks(renderer)
      offscreen.dispose()
      environment.dispose()
      room.dispose()
      pmrem.dispose()
      timed('environment:shared', start)
    } catch {
      // Each stage builds its own map.
    } finally {
      renderer?.dispose()
      renderer?.forceContextLoss()
    }
  })()
  return warming
}

/**
 * A soft studio environment map for lit materials. With the shared texels (warmEnvironment) it is a data texture
 * holding the same prefiltered map a build in this context gives, texel for texel. Without them the map is built
 * here, which blocks on its programs. The caller disposes it.
 */
export function createEnvironment(renderer: THREE.WebGLRenderer): Environment {
  if (sharedTexels) {
    const texture = new THREE.DataTexture(sharedTexels.data, sharedTexels.width, sharedTexels.height, THREE.RGBAFormat, THREE.HalfFloatType)
    // The settings PMREMGenerator gives its own target's texture.
    texture.name = 'PMREM.cubeUv'
    texture.mapping = THREE.CubeUVReflectionMapping
    texture.colorSpace = THREE.LinearSRGBColorSpace
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearFilter
    texture.generateMipmaps = false
    texture.needsUpdate = true
    return { texture, dispose: () => texture.dispose() }
  }
  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const environment = pmrem.fromScene(room, ENVIRONMENT_SIGMA)
  settleLinks(renderer)
  room.dispose()
  pmrem.dispose()
  return environment
}

/**
 * The product layer's render target: 4x multisampled, half float where renderable so lit highlights keep values
 * above 1.0 for the composite's shoulder, linear, and mipmapped for the composite's glyph decode. Only the colour
 * is sampled, so the multisampled depth is never resolved.
 */
export function createProductTarget(renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
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
  target.resolveDepthBuffer = false
  return target
}
