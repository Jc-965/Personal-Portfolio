import { NAME_SPREAD, NAME_TEXTURE, encodeField, signedDistanceField } from './nameField'

export interface NameField {
  bytes: Uint8Array
  width: number
  height: number
  /** Left edge and last baseline of the lettering, in texels from the top-left. */
  ink: { left: number; bottom: number }
}

/**
 * Draws the title lines as large bold lettering, then converts the coverage
 * into an encoded signed distance field the scene shader can ray-march.
 * Returns null when a 2D context is unavailable.
 */
export function buildNameField(lines: string[], fontFamily: string): NameField | null {
  const { width, height } = NAME_TEXTURE
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx || lines.length === 0) return null
  const pad = NAME_SPREAD - 2
  const lineBox = (height - pad * 2) / lines.length
  const fontFor = (px: number) => `700 ${px}px ${fontFamily}`
  // Cap height is roughly .73em; this leaves about a quarter cap between lines.
  let px = lineBox * 1.08
  ctx.font = fontFor(px)
  const measure = () => Math.max(...lines.map(line => ctx.measureText(line).width))
  let widest = measure()
  const room = width - pad * 2
  if (widest > room) {
    px *= room / widest
    ctx.font = fontFor(px)
    widest = measure()
  }
  ctx.fillStyle = '#ffffff'
  // Both lines share a left edge, which the introduction below also hangs from.
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const cap = ctx.measureText('H').actualBoundingBoxAscent
  const baseline = (i: number) => pad + lineBox * (i + 0.5) + cap / 2
  lines.forEach((line, i) => ctx.fillText(line, pad, baseline(i)))
  const { data } = ctx.getImageData(0, 0, width, height)
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 127 ? 1 : 0
  return { bytes: encodeField(signedDistanceField(mask, width, height)), width, height, ink: { left: pad, bottom: baseline(lines.length - 1) } }
}
