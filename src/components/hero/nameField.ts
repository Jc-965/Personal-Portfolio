/**
 * Pure helpers for the name monument: a signed distance field of the
 * lettering, and where the slab sits in the world. No DOM here.
 */
// The extension keeps this pure module runnable under Node's test runner.
import { CAMERA, RIG } from './world.ts'

/** Distance field texture size in texels; the slab keeps this aspect. */
export const NAME_TEXTURE = { width: 320, height: 200 } as const

/** Texels of distance encoded on either side of the letter edge. */
export const NAME_SPREAD = 12

/** World-space slab: centre position and width/height. Depth is fixed. */
export interface NameSlab {
  pos: [number, number, number]
  size: [number, number]
}

/** Where the lettering must land, all in the camera's normalized screen space. */
export interface SlabAnchor {
  /** Portrait viewports use the centred gateway rig and may fill the width. */
  narrow: boolean
  /** Viewport width divided by height. */
  aspect: number
  /** Left edge of the introduction copy, from -aspect (left) to aspect (right). */
  left: number
  /** Top edge of the introduction copy, from -1 (bottom) to 1 (top). */
  top: number
  /** Clearance between the lettering and the copy, in the same vertical units. */
  gap: number
  /** Where the ink sits inside the texture, in texels from the top-left corner. */
  ink: { left: number; bottom: number }
}

const SLAB_Z = -6
const MAX_WIDTH = 6.5
const MIN_WIDTH = 2.2
/** How far past centre the lettering may extend, as a fraction of the half-width. */
const RIGHT_EDGE = { wide: 0.05, narrow: 0.9 }

/**
 * Places the name so its ink starts on the copy's left edge and ends just
 * above the copy's top, at a fixed depth in front of the opening camera.
 */
export function nameSlab(anchor: SlabAnchor): NameSlab {
  const rig = anchor.narrow ? RIG.narrow : RIG.wide
  const toWorld = (SLAB_Z - CAMERA.startZ) / CAMERA.focal
  const { width: texW, height: texH } = NAME_TEXTURE
  const inkLeft = anchor.left * toWorld
  const rightLimit = (anchor.narrow ? RIGHT_EDGE.narrow : RIGHT_EDGE.wide) * anchor.aspect * toWorld
  const inkFraction = 1 - anchor.ink.left / texW
  const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, (rightLimit - inkLeft) / inkFraction))
  const height = width * texH / texW
  const inkBottom = CAMERA.y + (anchor.top + anchor.gap - rig.tilt) * toWorld
  return {
    pos: [
      inkLeft + width / 2 - (anchor.ink.left / texW) * width,
      inkBottom - height / 2 + (anchor.ink.bottom / texH) * height,
      SLAB_Z,
    ],
    size: [width, height],
  }
}

/** World position of the ink's bottom-left corner: the point the DOM copy hangs from. */
export function inkAnchor(slab: NameSlab, ink: { left: number; bottom: number }): [number, number, number] {
  const [w, h] = slab.size
  return [
    slab.pos[0] - w / 2 + (ink.left / NAME_TEXTURE.width) * w,
    slab.pos[1] + h / 2 - (ink.bottom / NAME_TEXTURE.height) * h,
    slab.pos[2],
  ]
}

/** Unsigned distance from every texel to the nearest set texel (8SSEDT sweep). */
function distanceToSet(set: Uint8Array, width: number, height: number): Float32Array {
  const far = 1e6
  const dx = new Float64Array(width * height)
  const dy = new Float64Array(width * height)
  for (let i = 0; i < set.length; i++) {
    dx[i] = set[i] ? 0 : far
    dy[i] = set[i] ? 0 : far
  }
  const consider = (i: number, j: number, ox: number, oy: number) => {
    const cx = dx[j] + ox
    const cy = dy[j] + oy
    if (cx * cx + cy * cy < dx[i] * dx[i] + dy[i] * dy[i]) {
      dx[i] = cx
      dy[i] = cy
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (x > 0) consider(i, i - 1, 1, 0)
      if (y > 0) {
        consider(i, i - width, 0, 1)
        if (x > 0) consider(i, i - width - 1, 1, 1)
        if (x < width - 1) consider(i, i - width + 1, -1, 1)
      }
    }
    for (let x = width - 2; x >= 0; x--) consider(y * width + x, y * width + x + 1, -1, 0)
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x
      if (x < width - 1) consider(i, i + 1, -1, 0)
      if (y < height - 1) {
        consider(i, i + width, 0, -1)
        if (x < width - 1) consider(i, i + width + 1, -1, -1)
        if (x > 0) consider(i, i + width - 1, 1, -1)
      }
    }
    for (let x = 1; x < width; x++) consider(y * width + x, y * width + x - 1, 1, 0)
  }
  const out = new Float32Array(width * height)
  for (let i = 0; i < out.length; i++) out[i] = Math.hypot(dx[i], dy[i])
  return out
}

/**
 * Signed distance in texels: negative inside the lettering, positive outside.
 * `mask` holds a non-zero byte for every texel covered by a letter.
 */
export function signedDistanceField(mask: Uint8Array, width: number, height: number): Float32Array {
  const inverse = new Uint8Array(mask.length)
  for (let i = 0; i < mask.length; i++) inverse[i] = mask[i] ? 0 : 1
  const outside = distanceToSet(mask, width, height)
  const inside = distanceToSet(inverse, width, height)
  const field = new Float32Array(mask.length)
  for (let i = 0; i < field.length; i++) field[i] = outside[i] - inside[i]
  return field
}

/** Packs the field into bytes: 128 is the surface, 0 and 255 are `NAME_SPREAD` texels away. */
export function encodeField(field: Float32Array): Uint8Array {
  const bytes = new Uint8Array(field.length)
  for (let i = 0; i < field.length; i++) {
    const unit = Math.min(1, Math.max(0, 0.5 + field[i] / (2 * NAME_SPREAD)))
    bytes[i] = Math.round(unit * 255)
  }
  return bytes
}
