import { useEffect, useRef } from 'react'

interface SecretPortfolioExitAnimationProps {
  onComplete: () => void
}

const DURATION = 1.18
const PAPER = { r: 240, g: 232, b: 218 }
const INK = { r: 48, g: 38, b: 24 }

type Sweep = {
  y: number
  height: number
  alpha: number
  offset: number
  start: number
}

const seededRandom = (seed: number) => {
  let value = seed >>> 0
  return () => {
    value = (value * 1103515245 + 12345) >>> 0
    return value / 0x100000000
  }
}

export default function SecretPortfolioExitAnimation({ onComplete }: SecretPortfolioExitAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const startRef = useRef<number | null>(null)
  const doneRef = useRef(false)
  const sweepsRef = useRef<Sweep[]>([])

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

      const random = seededRandom(90317)
      sweepsRef.current = Array.from({ length: 16 }, () => ({
        y: vh * random(),
        height: 50 + random() * 160,
        alpha: 0.08 + random() * 0.16,
        offset: (random() - 0.5) * 180,
        start: random() * 0.42,
      }))
    }

    const draw = (elapsed: number) => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const progress = Math.min(elapsed / DURATION, 1)

      ctx.clearRect(0, 0, vw, vh)

      const veilAlpha = Math.min(progress * 1.4, 1)
      ctx.fillStyle = `rgba(${PAPER.r}, ${PAPER.g}, ${PAPER.b}, ${veilAlpha})`
      ctx.fillRect(0, 0, vw, vh)

      sweepsRef.current.forEach(sweep => {
        const t = Math.max(0, (progress - sweep.start) / 0.46)
        if (t <= 0) return
        const localAlpha = Math.min(t, 1) * sweep.alpha
        const width = vw * Math.min(t * 1.5, 1)
        ctx.fillStyle = `rgba(${PAPER.r}, ${PAPER.g}, ${PAPER.b}, ${localAlpha})`
        ctx.fillRect((vw - width) / 2 + sweep.offset * (1 - Math.min(t, 1)), sweep.y, width, sweep.height)
      })

      ctx.strokeStyle = `rgba(${INK.r}, ${INK.g}, ${INK.b}, ${0.12 * (1 - progress * 0.3)})`
      ctx.lineWidth = 1.2
      for (let i = 0; i < 12; i += 1) {
        const y = vh * (i / 11)
        const sway = Math.sin(progress * 8 + i * 0.7) * 40
        ctx.beginPath()
        ctx.moveTo(-40, y + sway * 0.25)
        ctx.bezierCurveTo(vw * 0.25, y + sway, vw * 0.72, y - sway * 0.75, vw + 40, y + sway * 0.18)
        ctx.stroke()
      }

      if (progress > 0.62) {
        const settle = (progress - 0.62) / 0.38
        ctx.fillStyle = `rgba(${PAPER.r}, ${PAPER.g}, ${PAPER.b}, ${Math.min(settle, 1)})`
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

    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [onComplete])

  return <canvas ref={canvasRef} className="sketch-secret-exit-canvas" aria-hidden="true" />
}
