import { useRef, useEffect, useCallback } from 'react'
import { cnoise } from './noiseUtils'

interface EntryAnimationProps {
  onComplete: () => void
}

const DURATION = 2.2
const PAPER = { r: 239, g: 230, b: 210 }
const INK = { r: 30, g: 25, b: 18 }

type DrawCmd = {
  kind: 'line' | 'rect' | 'circle' | 'triangle' | 'cross' | 'spiral' | 'zigzag' | 'diamond' | 'arc' | 'sketch'
  x: number
  y: number
  size: number
  rotation: number
  width: number
  alpha: number
  startT: number
  points?: { x: number; y: number }[]
}

function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function drawShape(ctx: CanvasRenderingContext2D, cmd: DrawCmd, t: number) {
  const a = cmd.alpha * Math.min(t * 4, 1)
  ctx.strokeStyle = `rgba(${INK.r}, ${INK.g}, ${INK.b}, ${a})`
  ctx.fillStyle = `rgba(${INK.r}, ${INK.g}, ${INK.b}, ${a * 0.15})`
  ctx.lineWidth = cmd.width
  ctx.save()
  ctx.translate(cmd.x, cmd.y)
  ctx.rotate(cmd.rotation)

  const s = cmd.size * Math.min(t * 1.5, 1)

  switch (cmd.kind) {
    case 'rect':
      ctx.strokeRect(-s / 2, -s / 2, s, s * (0.6 + cmd.rotation * 0.3))
      break
    case 'circle':
      ctx.beginPath()
      ctx.arc(0, 0, s / 2, 0, Math.PI * 2 * Math.min(t * 1.8, 1))
      ctx.stroke()
      break
    case 'triangle': {
      const h = s * 0.866
      ctx.beginPath()
      ctx.moveTo(0, -h * 0.6)
      ctx.lineTo(-s / 2, h * 0.4)
      ctx.lineTo(s / 2, h * 0.4)
      ctx.closePath()
      ctx.stroke()
      if (cmd.alpha > 0.2) ctx.fill()
      break
    }
    case 'cross':
      ctx.beginPath()
      ctx.moveTo(-s / 2, 0); ctx.lineTo(s / 2, 0)
      ctx.moveTo(0, -s / 2); ctx.lineTo(0, s / 2)
      ctx.stroke()
      break
    case 'diamond': {
      ctx.beginPath()
      ctx.moveTo(0, -s / 2)
      ctx.lineTo(s / 2, 0)
      ctx.lineTo(0, s / 2)
      ctx.lineTo(-s / 2, 0)
      ctx.closePath()
      ctx.stroke()
      break
    }
    case 'spiral': {
      ctx.beginPath()
      const turns = 2.5
      const pts = Math.floor(30 * Math.min(t * 1.6, 1))
      for (let i = 0; i < pts; i++) {
        const frac = i / 30
        const angle = frac * Math.PI * 2 * turns
        const r = frac * s / 2
        if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r)
        else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r)
      }
      ctx.stroke()
      break
    }
    case 'zigzag': {
      ctx.beginPath()
      const segs = 6
      const drawn = Math.floor(segs * Math.min(t * 1.5, 1))
      for (let i = 0; i <= drawn; i++) {
        const px = -s / 2 + (i / segs) * s
        const py = (i % 2 === 0 ? -1 : 1) * s * 0.25
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
      break
    }
    case 'arc':
      ctx.beginPath()
      ctx.arc(0, 0, s / 2, 0, Math.PI * (0.6 + cmd.rotation))
      ctx.stroke()
      break
    case 'line': {
      const len = s * Math.min(t * 1.5, 1)
      ctx.beginPath()
      ctx.moveTo(-len / 2, 0)
      ctx.lineTo(len / 2, 0)
      ctx.stroke()
      break
    }
    case 'sketch': {
      if (!cmd.points || cmd.points.length < 2) break
      const pts = cmd.points
      const total = pts.length
      const drawn = Math.floor(total * Math.min(t * 1.3, 1))
      if (drawn < 2) break
      ctx.restore()
      ctx.strokeStyle = `rgba(${INK.r}, ${INK.g}, ${INK.b}, ${a})`
      ctx.lineWidth = cmd.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < drawn; i++) {
        const prev = pts[i - 1]
        const cur = pts[i]
        const mx = (prev.x + cur.x) / 2
        const my = (prev.y + cur.y) / 2
        ctx.quadraticCurveTo(prev.x, prev.y, mx, my)
      }
      ctx.stroke()
      return
    }
  }

  ctx.restore()
}

export default function EntryAnimation({ onComplete }: EntryAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const startRef = useRef(0)
  const doneRef = useRef(false)
  const cmdsRef = useRef<DrawCmd[]>([])

  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, elapsed: number) => {
    const progress = Math.min(elapsed / DURATION, 1)
    ctx.clearRect(0, 0, w, h)

    ctx.fillStyle = `rgb(${PAPER.r}, ${PAPER.g}, ${PAPER.b})`
    ctx.fillRect(0, 0, w, h)

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const cmd of cmdsRef.current) {
      const t = Math.max(0, (progress - cmd.startT) / (0.4 + cmd.startT * 0.3))
      if (t <= 0) continue
      drawShape(ctx, cmd, Math.min(t, 1))
    }

    if (progress > 0.8) {
      const fadeProgress = (progress - 0.8) / 0.2
      const eased = fadeProgress * fadeProgress
      ctx.save()
      ctx.globalAlpha = eased
      ctx.fillStyle = `rgb(${PAPER.r}, ${PAPER.g}, ${PAPER.b})`
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
      const random = seededRandom(82917)
      const cmds: DrawCmd[] = []
      const vw = window.innerWidth
      const vh = window.innerHeight

      const kinds: DrawCmd['kind'][] = ['rect', 'circle', 'triangle', 'cross', 'diamond', 'spiral', 'zigzag', 'arc', 'line']

      const margin = 0.02
      for (let i = 0; i < 90; i++) {
        const kind = kinds[Math.floor(random() * kinds.length)]
        cmds.push({
          kind,
          x: vw * (margin + random() * (1 - 2 * margin)),
          y: vh * (margin + random() * (1 - 2 * margin)),
          size: 8 + random() * 40,
          rotation: (random() - 0.5) * Math.PI,
          width: 0.5 + random() * 1.8,
          alpha: 0.08 + random() * 0.28,
          startT: random() * 0.55,
        })
      }

      for (let i = 0; i < 25; i++) {
        cmds.push({
          kind: 'line',
          x: vw * random(),
          y: vh * random(),
          size: 30 + random() * 120,
          rotation: random() * Math.PI,
          width: 0.4 + random() * 1.2,
          alpha: 0.06 + random() * 0.16,
          startT: random() * 0.4,
        })
      }

      for (let i = 0; i < 12; i++) {
        const cx = vw * (0.05 + random() * 0.9)
        const cy = vh * (0.05 + random() * 0.9)
        const clusterSize = 3 + Math.floor(random() * 5)
        for (let j = 0; j < clusterSize; j++) {
          const kind = kinds[Math.floor(random() * kinds.length)]
          cmds.push({
            kind,
            x: cx + (random() - 0.5) * 60,
            y: cy + (random() - 0.5) * 60,
            size: 5 + random() * 20,
            rotation: random() * Math.PI * 2,
            width: 0.4 + random() * 1.0,
            alpha: 0.1 + random() * 0.2,
            startT: 0.15 + random() * 0.35,
          })
        }
      }

      for (let i = 0; i < 6; i++) {
        cmds.push({
          kind: random() > 0.5 ? 'circle' : 'rect',
          x: vw * (0.1 + random() * 0.8),
          y: vh * (0.1 + random() * 0.8),
          size: 50 + random() * 80,
          rotation: (random() - 0.5) * 0.4,
          width: 1.2 + random() * 1.5,
          alpha: 0.12 + random() * 0.15,
          startT: 0.05 + random() * 0.2,
        })
      }

      for (let i = 0; i < 30; i++) {
        const pts: { x: number; y: number }[] = []
        let px = vw * random()
        let py = vh * random()
        const angle = random() * Math.PI * 2
        const segLen = 3 + random() * 6
        const numPts = 15 + Math.floor(random() * 40)
        let dir = angle
        for (let j = 0; j < numPts; j++) {
          pts.push({ x: px, y: py })
          dir += (cnoise(px * 0.01 + i, py * 0.01) * 0.5 + (random() - 0.5) * 0.4)
          px += Math.cos(dir) * segLen
          py += Math.sin(dir) * segLen
        }
        cmds.push({
          kind: 'sketch',
          x: 0,
          y: 0,
          size: 0,
          rotation: 0,
          width: 0.6 + random() * 1.6,
          alpha: 0.1 + random() * 0.25,
          startT: random() * 0.45,
          points: pts,
        })
      }

      for (let i = 0; i < 12; i++) {
        const pts: { x: number; y: number }[] = []
        let px = vw * (0.1 + random() * 0.8)
        let py = vh * (0.1 + random() * 0.8)
        const numPts = 30 + Math.floor(random() * 30)
        let dir = random() * Math.PI * 2
        for (let j = 0; j < numPts; j++) {
          pts.push({ x: px, y: py })
          dir += cnoise(j * 0.15 + i * 7, 100) * 0.3
          px += Math.cos(dir) * (4 + random() * 3)
          py += Math.sin(dir) * (4 + random() * 3)
        }
        cmds.push({
          kind: 'sketch',
          x: 0,
          y: 0,
          size: 0,
          rotation: 0,
          width: 1.0 + random() * 2.0,
          alpha: 0.06 + random() * 0.14,
          startT: 0.05 + random() * 0.3,
          points: pts,
        })
      }

      cmdsRef.current = cmds

      canvas.width = window.innerWidth * window.devicePixelRatio
      canvas.height = window.innerHeight * window.devicePixelRatio
      ctx.setTransform(1, 0, 0, 1, 0, 0)
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
  }, [draw, onComplete])

  return (
    <canvas
      ref={canvasRef}
      className="sketchbook-entry-canvas"
      style={{ pointerEvents: 'auto' }}
    />
  )
}
