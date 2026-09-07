import { GLYPH_RAMP } from './world'

/**
 * Draws the glyph ramp into one row of cells, white on transparent, at
 * `scale` times the on-screen cell so the GPU can sample it crisply.
 */
export function buildGlyphAtlas(cellW: number, cellH: number, fontPx: number, scale = 3): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas')
  const w = Math.ceil(cellW * scale)
  const h = Math.ceil(cellH * scale)
  canvas.width = w * GLYPH_RAMP.length
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#ffffff'
  ctx.font = `500 ${fontPx * scale}px "JetBrains Mono", "IBM Plex Mono", monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < GLYPH_RAMP.length; i++) ctx.fillText(GLYPH_RAMP[i], i * w + w / 2, h / 2)
  return canvas
}
