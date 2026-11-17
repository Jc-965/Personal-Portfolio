/**
 * GPU plumbing every chapter renderer shares: the ImageBitmap decode probe, program link checks, the studio
 * environment map, and the product render target the composite reads.
 */
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

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
      await renderer.compileAsync(room, new THREE.PerspectiveCamera(90, 1, 0.1, 100))
      renderer.setRenderTarget(null)
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
