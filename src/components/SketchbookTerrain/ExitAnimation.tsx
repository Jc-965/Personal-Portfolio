import { useRef, useEffect, useCallback } from 'react'

interface ExitAnimationProps {
  onComplete: () => void
}

const DURATION = 1.8
const BG = { r: 10, g: 10, b: 14 }
const CYAN = { r: 0, g: 255, b: 255 }

function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

interface GlitchBar {
  y: number
  h: number
  speed: number
  offsetX: number
  alpha: number
  startT: number
}

interface GridLine {
  pos: number
  vertical: boolean
  alpha: number
  delay: number
}

export default function ExitAnimation({ onComplete }: ExitAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const startRef = useRef<number | null>(null)
  const doneRef = useRef(false)
  const glitchBars = useRef<GlitchBar[]>([])
  const gridLines = useRef<GridLine[]>([])

  const init = useCallback((vw: number, vh: number) => {
    const rand = seededRandom(Date.now())

    const bars: GlitchBar[] = []
    for (let i = 0; i < 18; i++) {
      bars.push({
        y: rand() * vh,
        h: 1 + rand() * 4,
        speed: (rand() - 0.5) * vw * 1.5,
        offsetX: (rand() - 0.5) * vw * 0.3,
        alpha: 0.3 + rand() * 0.5,
        startT: rand() * 0.6,
      })
    }
    glitchBars.current = bars

    const lines: GridLine[] = []
    const spacing = 40 + rand() * 20
    for (let x = 0; x < vw; x += spacing) {
      lines.push({ pos: x, vertical: true, alpha: 0.08 + rand() * 0.12, delay: rand() * 0.4 })
    }
    for (let y = 0; y < vh; y += spacing) {
      lines.push({ pos: y, vertical: false, alpha: 0.08 + rand() * 0.12, delay: rand() * 0.4 })
    }
    gridLines.current = lines
  }, [])

  const draw = useCallback((ctx: CanvasRenderingContext2D, vw: number, vh: number, t: number) => {
    const p = Math.min(t / DURATION, 1)

    // Phase progress helpers
    const scanP = Math.min(p / 0.25, 1)
    const glitchP = Math.min(Math.max((p - 0.05) / 0.5, 0), 1)
    const gridP = Math.min(Math.max((p - 0.2) / 0.4, 0), 1)
    const crtP = Math.min(Math.max((p - 0.55) / 0.3, 0), 1)
    const fadeP = Math.min(Math.max((p - 0.75) / 0.25, 0), 1)

    ctx.clearRect(0, 0, vw, vh)

    // Dark overlay fading in
    const bgAlpha = 0.15 + p * 0.85
    ctx.fillStyle = `rgba(${BG.r}, ${BG.g}, ${BG.b}, ${bgAlpha})`
    ctx.fillRect(0, 0, vw, vh)

    // Scanlines
    if (scanP > 0) {
      const lineAlpha = scanP * 0.15 * (1 - fadeP * 0.5)
      ctx.fillStyle = `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, ${lineAlpha})`
      for (let y = 0; y < vh; y += 3) {
        ctx.fillRect(0, y, vw, 1)
      }
    }

    // Glitch bars
    if (glitchP > 0 && glitchP < 1) {
      for (const bar of glitchBars.current) {
        const bt = Math.max(0, glitchP - bar.startT) / (1 - bar.startT)
        if (bt <= 0) continue
        const barAlpha = bar.alpha * Math.sin(bt * Math.PI) * (1 - crtP)
        ctx.fillStyle = `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, ${barAlpha * 0.4})`
        const x = bar.offsetX + bar.speed * bt
        ctx.fillRect(x, bar.y, vw * 0.3, bar.h)
        // Chromatic offset
        ctx.fillStyle = `rgba(255, 50, 100, ${barAlpha * 0.2})`
        ctx.fillRect(x + 3, bar.y + 1, vw * 0.15, bar.h * 0.6)
      }
    }

    // Grid lines emerging
    if (gridP > 0) {
      for (const line of gridLines.current) {
        const lt = Math.max(0, gridP - line.delay) / (1 - line.delay)
        if (lt <= 0) continue
        const la = line.alpha * Math.min(lt * 3, 1) * (1 - fadeP)
        ctx.strokeStyle = `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, ${la})`
        ctx.lineWidth = 0.5
        ctx.beginPath()
        if (line.vertical) {
          const drawn = vh * Math.min(lt * 2, 1)
          ctx.moveTo(line.pos, (vh - drawn) / 2)
          ctx.lineTo(line.pos, (vh + drawn) / 2)
        } else {
          const drawn = vw * Math.min(lt * 2, 1)
          ctx.moveTo((vw - drawn) / 2, line.pos)
          ctx.lineTo((vw + drawn) / 2, line.pos)
        }
        ctx.stroke()
      }
    }

    // Digital noise
    if (glitchP > 0.2 && crtP < 0.8) {
      const noiseAlpha = 0.06 * (1 - crtP)
      const rand = seededRandom(Math.floor(t * 60))
      for (let i = 0; i < 120; i++) {
        const nx = rand() * vw
        const ny = rand() * vh
        const ns = 1 + rand() * 3
        ctx.fillStyle = `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, ${noiseAlpha + rand() * 0.04})`
        ctx.fillRect(nx, ny, ns, ns)
      }
    }

    // Data text fragments
    if (gridP > 0.3 && crtP < 0.9) {
      const textAlpha = 0.25 * (1 - fadeP)
      ctx.font = '10px monospace'
      ctx.fillStyle = `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, ${textAlpha})`
      const fragments = ['0x4F', 'SYS', 'RET', '>>>', 'EOF', '0b1', 'ACK', 'RST', '\\n']
      const rand2 = seededRandom(42 + Math.floor(t * 8))
      for (let i = 0; i < 12; i++) {
        const fx = rand2() * vw
        const fy = rand2() * vh
        ctx.fillText(fragments[Math.floor(rand2() * fragments.length)], fx, fy)
      }
    }

    // CRT shutdown — horizontal bright line compressing
    if (crtP > 0) {
      const lineH = Math.max(1, vh * (1 - crtP * crtP) * 0.02)
      const cy = vh / 2
      const glow = ctx.createLinearGradient(0, cy - lineH * 4, 0, cy + lineH * 4)
      glow.addColorStop(0, `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, 0)`)
      glow.addColorStop(0.3, `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, ${0.15 * (1 - fadeP)})`)
      glow.addColorStop(0.5, `rgba(255, 255, 255, ${0.7 * (1 - fadeP)})`)
      glow.addColorStop(0.7, `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, ${0.15 * (1 - fadeP)})`)
      glow.addColorStop(1, `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, 0)`)
      ctx.fillStyle = glow
      ctx.fillRect(0, cy - lineH * 4, vw, lineH * 8)

      // Bright core
      ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * (1 - fadeP * fadeP)})`
      ctx.fillRect(0, cy - lineH / 2, vw, lineH)
    }

    // Vignette
    const vigAlpha = 0.3 + p * 0.4
    const vig = ctx.createRadialGradient(vw / 2, vh / 2, vw * 0.2, vw / 2, vh / 2, vw * 0.8)
    vig.addColorStop(0, 'rgba(0,0,0,0)')
    vig.addColorStop(1, `rgba(0,0,0,${vigAlpha})`)
    ctx.fillStyle = vig
    ctx.fillRect(0, 0, vw, vh)

    // Final fade to portfolio dark
    if (fadeP > 0) {
      ctx.fillStyle = `rgba(${BG.r}, ${BG.g}, ${BG.b}, ${fadeP})`
      ctx.fillRect(0, 0, vw, vh)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const dpr = window.devicePixelRatio || 1
      canvas.width = vw * dpr
      canvas.height = vh * dpr
      canvas.style.width = `${vw}px`
      canvas.style.height = `${vh}px`
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
      init(vw, vh)
    }
    resize()
    window.addEventListener('resize', resize)

    let raf: number
    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts
      const elapsed = (ts - startRef.current) / 1000

      draw(ctx, window.innerWidth, window.innerHeight, elapsed)

      if (elapsed >= DURATION && !doneRef.current) {
        doneRef.current = true
        onComplete()
      }

      if (!doneRef.current) {
        raf = requestAnimationFrame(animate)
      }
    }

    raf = requestAnimationFrame(animate)

    const handleClick = () => {
      if (doneRef.current) return
      doneRef.current = true
      cancelAnimationFrame(raf)
      onComplete()
    }
    canvas.addEventListener('click', handleClick)

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('click', handleClick)
      window.removeEventListener('resize', resize)
    }
  }, [draw, init, onComplete])

  return (
    <canvas
      ref={canvasRef}
      className="sketchbook-exit-canvas"
      style={{ pointerEvents: 'auto' }}
    />
  )
}
