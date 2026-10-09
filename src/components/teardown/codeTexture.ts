import { CODE } from './rig.ts'

const FONT = '"JetBrains Mono", "IBM Plex Mono", monospace'
/** Advance width of the mono font as a fraction of its size. JetBrains Mono and IBM Plex Mono are both 0.6. */
const ADVANCE = 0.6
const LINE_HEIGHT = 1.55
/** Fewest columns a line is wrapped to. Below this the excerpt's indented calls break at nearly every argument. */
const MIN_COLUMNS = 36
/** Largest font as a fraction of the canvas width, so a short excerpt never prints as a few giant lines. */
const MAX_FONT = 0.036

/**
 * Soft-wraps one line at `columns`: breaks at the last space inside the limit, and each continuation is indented
 * two columns past the line's own indent, as a formatter would. A comment's continuation keeps the comment
 * marker, so every drawn line is coloured by its own first characters. A run with no space inside the limit is
 * cut.
 */
function wrap(line: string, columns: number): string[] {
  if (line.length <= columns) return [line]
  const indent = line.match(/^ */)?.[0] ?? ''
  const hang = line.trimStart().startsWith('//') ? `${indent}// ` : `${indent}  `
  const out: string[] = []
  let rest = line
  let prefix = ''
  while (prefix.length + rest.length > columns) {
    const limit = columns - prefix.length
    const first = rest.search(/\S/)
    let cut = rest.lastIndexOf(' ', limit)
    if (cut <= first) cut = limit
    out.push(prefix + rest.slice(0, cut).trimEnd())
    rest = rest.slice(cut).trimStart()
    prefix = hang
  }
  out.push(prefix + rest)
  return out
}

/**
 * Draws the code excerpt for the code layer: amber monospace on near-black, a
 * dim path header, comments dimmer than code. The canvas matches the code
 * layer's aspect so the texture is never stretched. Lines are soft-wrapped at
 * the column count that lets the largest font fill the layer, so the type is
 * as large as the excerpt allows: at the default 2048 px width the excerpt
 * prints at about 70 px, which is 11 px on screen when the proof act fills
 * three quarters of a 900 px frame with the layer.
 */
export function buildCodeTexture(code: string, source: string, width = 2048): HTMLCanvasElement | null {
  const height = Math.round((width * CODE.hy) / CODE.hx)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#0b0805'
  ctx.fillRect(0, 0, width, height)
  const pad = Math.round(width * 0.06)
  const source0 = code.split('\n')
  const longest = Math.max(...source0.map((line) => line.length), 1)
  // The header takes the first row and the second is blank, so the excerpt starts two rows down.
  const fits = (fontPx: number, rows: number) => pad + Math.round(fontPx * LINE_HEIGHT) * (rows + 1) + fontPx <= height - pad
  let lines = source0
  let fontPx = 0
  for (let columns = longest; columns >= MIN_COLUMNS; columns--) {
    const candidate = Math.min(Math.floor(width * MAX_FONT), Math.floor((width - pad * 2) / (columns * ADVANCE)))
    if (candidate <= fontPx) continue
    const wrapped = source0.flatMap((line) => wrap(line, columns))
    if (!fits(candidate, wrapped.length)) break
    lines = wrapped
    fontPx = candidate
  }
  if (fontPx === 0) fontPx = Math.floor((width - pad * 2) / (longest * ADVANCE))
  const lineH = Math.round(fontPx * LINE_HEIGHT)
  ctx.textBaseline = 'top'
  ctx.font = `500 ${fontPx}px ${FONT}`
  ctx.fillStyle = 'rgba(234, 183, 106, .45)'
  ctx.fillText(`// ${source}`, pad, pad)
  ctx.shadowColor = 'rgba(234, 183, 106, .55)'
  ctx.shadowBlur = fontPx * 0.5
  lines.forEach((line, i) => {
    ctx.fillStyle = line.trim().startsWith('//') ? 'rgba(234, 183, 106, .5)' : '#f0bf74'
    ctx.fillText(line, pad, pad + lineH * (i + 2))
  })
  return canvas
}
