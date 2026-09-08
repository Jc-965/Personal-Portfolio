/** Paints terminal lines into a 1600x1000 dark image, so code projects get a cover too. */
export function terminalCover(lines: string[], accent: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = 1600
  canvas.height = 1000
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = '#05070c'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.font = '500 44px "JetBrains Mono", "IBM Plex Mono", monospace'
  ctx.textBaseline = 'top'
  lines.forEach((line, i) => {
    const y = 120 + i * 92
    ctx.fillStyle = accent
    ctx.fillText('$', 110, y)
    ctx.fillStyle = '#d9e2ef'
    ctx.fillText(line, 170, y)
  })
  ctx.fillStyle = accent
  ctx.fillRect(170, 120 + lines.length * 92, 26, 48)
  return canvas.toDataURL('image/png')
}
