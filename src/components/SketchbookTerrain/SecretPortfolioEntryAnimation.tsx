import { useEffect, useRef } from 'react'

interface SecretPortfolioEntryAnimationProps {
  onComplete: () => void
}

const DURATION = 1.55
const PAPER = { r: 244, g: 236, b: 222 }
const INK = { r: 52, g: 40, b: 26 }

type Stroke = {
  x: number
  y: number
  length: number
  angle: number
  width: number
  alpha: number
  start: number
}

type Sheet = {
  x: number
  y: number
  w: number
  h: number
  angle: number
  alpha: number
  start: number
}

const seededRandom = (seed: number) => {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 0x100000000
  }
}

export default function SecretPortfolioEntryAnimation({ onComplete }: SecretPortfolioEntryAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const startRef = useRef<number | null>(null)
  const doneRef = useRef(false)
  const strokesRef = useRef<Stroke[]>([])
  const sheetsRef = useRef<Sheet[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const init = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const dpr = window.devicePixelRatio || 1
      canvas.width = vw * dpr
      canvas.height = vh * dpr
      canvas.style.width = `${vw}px`
      canvas.style.height = `${vh}px`
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)

      const random = seededRandom(80421)
      const strokes: Stroke[] = []
      const sheets: Sheet[] = []

      for (let i = 0; i < 54; i += 1) {
        strokes.push({
          x: vw * random(),
          y: vh * random(),
          length: 60 + random() * 220,
          angle: (random() - 0.5) * Math.PI * 0.9,
          width: 0.8 + random() * 2.4,
          alpha: 0.08 + random() * 0.18,
          start: random() * 0.55,
        })
      }

      for (let i = 0; i < 10; i += 1) {
        sheets.push({
          x: vw * (0.08 + random() * 0.84),
          y: vh * (0.08 + random() * 0.82),
          w: 120 + random() * 260,
          h: 80 + random() * 170,
          angle: (random() - 0.5) * 0.3,
          alpha: 0.12 + random() * 0.18,
          start: 0.08 + random() * 0.45,
        })
      }

      strokesRef.current = strokes
      sheetsRef.current = sheets
    }

    const draw = (elapsed: number) => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const progress = Math.min(elapsed / DURATION, 1)

      ctx.clearRect(0, 0, vw, vh)

      const washAlpha = Math.min(progress * 2.8, 1)
      ctx.fillStyle = `rgba(${PAPER.r}, ${PAPER.g}, ${PAPER.b}, ${washAlpha})`
      ctx.fillRect(0, 0, vw, vh)

      ctx.fillStyle = `rgba(255, 255, 255, ${0.22 * washAlpha})`
      ctx.fillRect(0, 0, vw, vh)

      sheetsRef.current.forEach(sheet => {
        const t = Math.max(0, (progress - sheet.start) / 0.34)
        if (t <= 0) return
        const localAlpha = Math.min(t, 1) * sheet.alpha
        ctx.save()
        ctx.translate(sheet.x, sheet.y)
        ctx.rotate(sheet.angle)
        ctx.fillStyle = `rgba(255, 252, 246, ${localAlpha})`
        ctx.strokeStyle = `rgba(${INK.r}, ${INK.g}, ${INK.b}, ${localAlpha * 0.25})`
        ctx.lineWidth = 1
        ctx.fillRect(-sheet.w / 2, -sheet.h / 2, sheet.w, sheet.h)
        ctx.strokeRect(-sheet.w / 2, -sheet.h / 2, sheet.w, sheet.h)
        ctx.restore()
      })

      strokesRef.current.forEach(stroke => {
        const t = Math.max(0, (progress - stroke.start) / 0.28)
        if (t <= 0) return
        const localAlpha = Math.min(t, 1) * stroke.alpha
        const visibleLength = stroke.length * Math.min(t * 1.3, 1)
        ctx.save()
        ctx.translate(stroke.x, stroke.y)
        ctx.rotate(stroke.angle)
        ctx.strokeStyle = `rgba(${INK.r}, ${INK.g}, ${INK.b}, ${localAlpha})`
        ctx.lineWidth = stroke.width
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(-visibleLength / 2, 0)
        ctx.lineTo(visibleLength / 2, 0)
        ctx.stroke()
        ctx.restore()
      })

      if (progress > 0.68) {
        const settle = (progress - 0.68) / 0.32
        const eased = Math.min(settle * settle, 1)
        ctx.fillStyle = `rgba(${PAPER.r}, ${PAPER.g}, ${PAPER.b}, ${eased * 0.94})`
        ctx.fillRect(0, 0, vw, vh)
      }
    }

    const onResize = () => init()
    init()
    window.addEventListener('resize', onResize)

    let raf = 0
    const animate = (timestamp: number) => {
      if (!startRef.current) startRef.current = timestamp
      const elapsed = (timestamp - startRef.current) / 1000
      draw(elapsed)

      if (elapsed >= DURATION && !doneRef.current) {
        doneRef.current = true
        onComplete()
        return
      }

      raf = window.requestAnimationFrame(animate)
    }

    raf = window.requestAnimationFrame(animate)

    const onSkip = () => {
      if (doneRef.current) return
      doneRef.current = true
      window.cancelAnimationFrame(raf)
      onComplete()
    }

    canvas.addEventListener('click', onSkip)

    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      canvas.removeEventListener('click', onSkip)
    }
  }, [onComplete])

  return <canvas ref={canvasRef} className="sketch-secret-entry-canvas" style={{ pointerEvents: 'auto' }} />
}
