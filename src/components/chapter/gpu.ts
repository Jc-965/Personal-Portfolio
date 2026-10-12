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

/** A soft studio environment map for lit materials. The caller disposes the returned render target. */
export function createEnvironment(renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const environment = pmrem.fromScene(room, 0.04)
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
