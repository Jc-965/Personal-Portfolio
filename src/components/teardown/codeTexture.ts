import { CODE } from './rig.ts'

const FONT = '"JetBrains Mono", "IBM Plex Mono", monospace'

/**
 * Draws the code excerpt for the code layer: amber monospace on near-black, a
 * dim path header, comments dimmer than code. The canvas matches the code
 * layer's aspect so the texture is never stretched.
 */
export function buildCodeTexture(code: string, source: string, width = 1024): HTMLCanvasElement | null {
  const height = Math.round((width * CODE.hy) / CODE.hx)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#0b0805'
  ctx.fillRect(0, 0, width, height)
  const lines = code.split('\n')
  const pad = Math.round(width * 0.06)
  const longest = Math.max(...lines.map((line) => line.length), 1)
  const fontPx = Math.min(26, Math.floor((width - pad * 2) / (longest * 0.6)))
  const lineH = Math.round(fontPx * 1.55)
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
