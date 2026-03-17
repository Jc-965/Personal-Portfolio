import { useRef, useEffect, useCallback } from 'react'
import { cnoise } from './noiseUtils'

interface EntryAnimationProps {
  onComplete: () => void
}

const DURATION = 3.8 // seconds
const PAPER = { r: 245, g: 240, b: 232 }
const INK = { r: 30, g: 25, b: 18 }

function wobble(x: number, seed: number): number {
  return cnoise(x * 0.02, seed) * 18
}

export default function EntryAnimation({ onComplete }: EntryAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const startRef = useRef(0)
  const doneRef = useRef(false)

  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, elapsed: number) => {
    const progress = Math.min(elapsed / DURATION, 1)

    ctx.clearRect(0, 0, w, h)

    // Stage 1: Paper unfurl (0 - 0.25)
    const paperProgress = Math.min(progress / 0.25, 1)
    if (paperProgress > 0) {
      const eased = 1 - Math.pow(1 - paperProgress, 3)
      const radius = Math.hypot(w, h) * 0.6 * eased
      const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, radius)
      grad.addColorStop(0, `rgba(${PAPER.r}, ${PAPER.g}, ${PAPER.b}, 1)`)
      grad.addColorStop(0.85, `rgba(${PAPER.r}, ${PAPER.g}, ${PAPER.b}, 1)`)
      grad.addColorStop(1, `rgba(${PAPER.r}, ${PAPER.g}, ${PAPER.b}, 0)`)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)

      // Paper grain
      if (eased > 0.3) {
        const grainAlpha = Math.min((eased - 0.3) * 0.06, 0.04)
        for (let gy = 0; gy < h; gy += 3) {
          for (let gx = 0; gx < w; gx += 3) {
            const n = cnoise(gx * 0.5, gy * 0.5)
            if (n > 0.3) {
              ctx.fillStyle = `rgba(${INK.r}, ${INK.g}, ${INK.b}, ${grainAlpha * n})`
              ctx.fillRect(gx, gy, 1, 1)
            }
          }
        }
      }
    }

    // Stage 2: Horizon + hill outlines (0.15 - 0.55)
    const hillStart = 0.15
    const hillEnd = 0.55
    if (progress > hillStart) {
      const hillProgress = Math.min((progress - hillStart) / (hillEnd - hillStart), 1)
      ctx.save()
      ctx.strokeStyle = `rgba(${INK.r}, ${INK.g}, ${INK.b}, 0.7)`
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      // Draw 3 horizon lines at different heights
      const horizons = [
        { y: h * 0.55, amp: 40, freq: 0.8, seed: 1.0 },
        { y: h * 0.48, amp: 55, freq: 0.6, seed: 3.7 },
        { y: h * 0.60, amp: 30, freq: 1.0, seed: 7.2 },
      ]

      for (const hz of horizons) {
        const drawLen = hillProgress * w * 1.2
        ctx.beginPath()
        for (let x = -20; x < drawLen && x < w + 20; x += 2) {
          const y = hz.y + wobble(x * hz.freq, hz.seed) * (hz.amp / 18)
          if (x <= -20) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }

      ctx.restore()
    }

    // Stage 3: Detail strokes — trees, hatching, small shapes (0.35 - 0.75)
    const detailStart = 0.35
    const detailEnd = 0.75
    if (progress > detailStart) {
      const detailProgress = Math.min((progress - detailStart) / (detailEnd - detailStart), 1)
      ctx.save()

      // Tree silhouettes
      const treeCount = Math.floor(detailProgress * 8)
      ctx.strokeStyle = `rgba(${INK.r}, ${INK.g}, ${INK.b}, 0.5)`
      ctx.lineWidth = 1.5
      for (let i = 0; i < treeCount; i++) {
        const tx = w * (0.1 + i * 0.11) + wobble(i * 50, 20) * 2
        const ty = h * 0.55 + wobble(tx * 0.6, 1.0) * (40 / 18)
        drawTree(ctx, tx, ty, 20 + i * 3)
      }

      // Cross-hatching in lower terrain
      if (detailProgress > 0.3) {
        const hatchAlpha = Math.min((detailProgress - 0.3) * 0.5, 0.15)
        ctx.strokeStyle = `rgba(${INK.r}, ${INK.g}, ${INK.b}, ${hatchAlpha})`
        ctx.lineWidth = 0.8
        const hatchCount = Math.floor((detailProgress - 0.3) * 60)
        for (let i = 0; i < hatchCount; i++) {
          const hx = (cnoise(i * 3.7, 99) * 0.5 + 0.5) * w
          const hy = h * 0.56 + (cnoise(i * 2.1, 55) * 0.5 + 0.5) * h * 0.3
          const len = 8 + cnoise(i * 1.3, 33) * 12
          const angle = Math.PI * 0.25 + cnoise(i * 0.8, 77) * 0.3
          ctx.beginPath()
          ctx.moveTo(hx, hy)
          ctx.lineTo(hx + Math.cos(angle) * len, hy + Math.sin(angle) * len)
          ctx.stroke()
        }
      }

      // Small animal shapes
      if (detailProgress > 0.6) {
        const animalAlpha = Math.min((detailProgress - 0.6) * 1.5, 0.5)
        ctx.fillStyle = `rgba(${INK.r}, ${INK.g}, ${INK.b}, ${animalAlpha})`
        const animalPositions = [
          { x: w * 0.3, y: h * 0.62 },
          { x: w * 0.55, y: h * 0.58 },
          { x: w * 0.7, y: h * 0.64 },
          { x: w * 0.85, y: h * 0.60 },
        ]
        const count = Math.floor((detailProgress - 0.6) * 10)
        for (let i = 0; i < Math.min(count, animalPositions.length); i++) {
          const ap = animalPositions[i]
          // Simple blob animal shape
          ctx.beginPath()
          ctx.ellipse(ap.x, ap.y, 6, 4, 0, 0, Math.PI * 2)
          ctx.fill()
          // Head
          ctx.beginPath()
          ctx.arc(ap.x + 5, ap.y - 2, 2.5, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      ctx.restore()
    }

    // Stage 4: Fade out (0.75 - 1.0)
    if (progress > 0.75) {
      const fadeProgress = (progress - 0.75) / 0.25
      const eased = fadeProgress * fadeProgress
      ctx.save()
      ctx.globalAlpha = eased
      ctx.fillStyle = `rgba(${PAPER.r}, ${PAPER.g}, ${PAPER.b}, 1)`
      ctx.fillRect(0, 0, w, h)
      ctx.restore()
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth * window.devicePixelRatio
      canvas.height = window.innerHeight * window.devicePixelRatio
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
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
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [draw, onComplete])

  return (
    <canvas
      ref={canvasRef}
      className="sketchbook-entry-canvas"
    />
  )
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, height: number) {
  // Trunk
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + wobble(y, 42) * 0.2, y - height * 0.4)
  ctx.stroke()

  // Branches
  const branchY = y - height * 0.35
  const branches = 3 + Math.floor(cnoise(x * 0.1, 10) * 2)
  for (let b = 0; b < branches; b++) {
    const frac = 0.3 + b * 0.2
    const by = y - height * frac
    const bLen = height * (0.15 + cnoise(b * 5, x * 0.1) * 0.1)
    const bAngle = (b % 2 === 0 ? -1 : 1) * (0.4 + cnoise(b * 3, 7) * 0.3)
    ctx.beginPath()
    ctx.moveTo(x, by)
    ctx.lineTo(x + Math.sin(bAngle) * bLen, by - Math.cos(bAngle) * bLen)
    ctx.stroke()
  }

  // Foliage dots
  ctx.save()
  ctx.fillStyle = ctx.strokeStyle
  ctx.globalAlpha = 0.3
  for (let f = 0; f < 6; f++) {
    const fx = x + (cnoise(f * 7, x) * 0.5) * height * 0.4
    const fy = branchY - height * 0.1 + (cnoise(f * 3, y) * 0.5) * height * 0.35
    const fr = 2 + cnoise(f * 11, 5) * 3
    ctx.beginPath()
    ctx.arc(fx, fy, Math.abs(fr), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
