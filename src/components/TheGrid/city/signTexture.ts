import * as THREE from 'three'

export interface SignSpec {
  lines: Array<{ text: string; size?: number; color?: string }>
  accent: string
  /** Canvas width in px; height derives from the line stack. */
  width?: number
  padding?: number
  background?: string | null
}

export interface SignTexture {
  texture: THREE.CanvasTexture
  /** width / height — size the plane with this so glyphs never stretch. */
  aspect: number
}

/**
 * In-world text is drawn to 2D canvases and mapped onto planes. This keeps
 * the neon-signage look without shipping a 3D font pipeline: the page's mono
 * font is already loaded for the HUD, so the canvas can reuse it, and a glow
 * comes free from shadowBlur.
 */
export function makeSignTexture(spec: SignSpec): SignTexture {
  const width = spec.width ?? 512
  const padding = spec.padding ?? 28
  const lineGap = 10

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const lines = spec.lines
  const totalText = lines.reduce((sum, line) => sum + (line.size ?? 64) + lineGap, -lineGap)
  const height = Math.ceil(totalText + padding * 2)
  canvas.width = width
  canvas.height = height

  if (ctx) {
    if (spec.background) {
      ctx.fillStyle = spec.background
      ctx.fillRect(0, 0, width, height)
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    let y = padding
    for (const line of lines) {
      const size = line.size ?? 64
      ctx.font = `700 ${size}px "JetBrains Mono", ui-monospace, monospace`
      ctx.shadowColor = spec.accent
      ctx.shadowBlur = size * 0.35
      ctx.fillStyle = line.color ?? '#eaffff'
      // Double pass thickens the glow without blowing out the glyph core.
      ctx.fillText(line.text, width / 2, y, width - padding * 2)
      ctx.fillText(line.text, width / 2, y, width - padding * 2)
      y += size + lineGap
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return { texture, aspect: width / height }
}

/** Terminal-style billboard for projects with no screenshots (MyCommunity). */
export function makeTerminalTexture(title: string, lines: string[], accent: string): SignTexture {
  const width = 640
  const height = 400
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#04070c'
    ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = accent
    ctx.globalAlpha = 0.55
    ctx.strokeRect(4, 4, width - 8, height - 8)
    ctx.globalAlpha = 1
    ctx.textBaseline = 'top'
    ctx.font = '600 26px "JetBrains Mono", ui-monospace, monospace'
    ctx.fillStyle = accent
    ctx.fillText(`~/${title.toLowerCase()} · zsh`, 28, 26)
    ctx.font = '500 24px "JetBrains Mono", ui-monospace, monospace'
    lines.forEach((line, i) => {
      ctx.fillStyle = i % 2 === 0 ? '#7efcff' : '#9fb6c9'
      ctx.fillText(line, 28, 84 + i * 44)
    })
    ctx.fillStyle = accent
    ctx.fillText('█', 28, 84 + lines.length * 44)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return { texture, aspect: width / height }
}
