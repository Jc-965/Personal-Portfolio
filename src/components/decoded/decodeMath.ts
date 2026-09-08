/** Pure math behind the Decoded surface. Positions are device pixels, origin bottom left. */

/** Width of the soft edge between glyph and image, in progress units. */
export const DITHER_BAND = 0.08
/** Reach of a pointer wound in CSS pixels. */
export const WOUND_RADIUS = 60
/** Seconds until a wound has all but healed. */
export const WOUND_LIFE = 0.9
export const MAX_WOUNDS = 16

export interface Wound { x: number; y: number; at: number }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** How resolved a cell with roll `hash` is at `progress`: 1 image, 0 glyph. */
export function cellResolve(hash: number, progress: number): number {
  return clamp01((progress - hash) / DITHER_BAND + 0.5)
}

export function woundStrength(wound: Wound, now: number): number {
  const age = now - wound.at
  if (age < 0) return 0
  return Math.exp(-age / (WOUND_LIFE / 3))
}

export function addWound(wounds: Wound[], x: number, y: number, now: number): void {
  wounds.push({ x, y, at: now })
  if (wounds.length > MAX_WOUNDS) wounds.splice(0, wounds.length - MAX_WOUNDS)
}

/** Packs wounds for the shader, newest first, four floats each: x, y, radius, strength. Healed wounds are dropped. */
export function packWounds(wounds: Wound[], now: number, out: Float32Array, scale = 1): Float32Array {
  out.fill(0)
  let slot = 0
  for (let i = wounds.length - 1; i >= 0 && slot < MAX_WOUNDS; i--) {
    const strength = woundStrength(wounds[i], now)
    if (strength < 0.02) {
      wounds.splice(0, i + 1)
      break
    }
    out[slot * 4] = wounds[i].x * scale
    out[slot * 4 + 1] = wounds[i].y * scale
    out[slot * 4 + 2] = WOUND_RADIUS * scale
    out[slot * 4 + 3] = strength
    slot++
  }
  return out
}

/** UV scale and offset that crop an image to cover a box, like object-fit: cover. */
export function coverTransform(boxW: number, boxH: number, imageW: number, imageH: number) {
  const box = boxW / boxH
  const image = imageW / imageH
  if (box > image) {
    const sy = image / box
    return { scale: [1, sy] as [number, number], offset: [0, (1 - sy) / 2] as [number, number] }
  }
  const sx = box / image
  return { scale: [sx, 1] as [number, number], offset: [(1 - sx) / 2, 0] as [number, number] }
}

/** A stat value part way through its count: numbers count up, words type out. */
export function readoutAt(value: string, t: number): string {
  const k = clamp01(t)
  const match = value.match(/^([^0-9]*?)(\d+(?:\.\d+)?)(.*)$/)
  if (!match) return value.slice(0, Math.round(value.length * k))
  const [, prefix, number, suffix] = match
  const decimals = number.includes('.') ? number.split('.')[1].length : 0
  const current = (Number(number) * k).toFixed(decimals)
  return `${prefix}${current}${suffix}`
}

/** Cell size for the glyph grid from a CSS pixel width. Cells are taller than wide, like type. */
export function cellsFor(cssPx: number) {
  const cellW = cssPx
  const cellH = Math.round(cssPx * 1.7)
  return { cellW, cellH, fontPx: cellH * 0.95 }
}
