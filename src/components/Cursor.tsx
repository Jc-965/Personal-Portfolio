import { useEffect, useRef } from 'react'

export default function Cursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pos = useRef({ x: -100, y: -100 })
  const ringPos = useRef({ x: -100, y: -100 })
  const visible = useRef(false)
  const hovering = useRef(false)
  const clicking = useRef(false)
  const rotation = useRef(0)
  const trail = useRef<{ x: number; y: number; alpha: number }[]>([])
  const pulseWaves = useRef<{ x: number; y: number; radius: number; alpha: number }[]>([])

  useEffect(() => {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    if (isTouchDevice) return

    document.documentElement.classList.add('has-custom-cursor')

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = window.innerWidth
    let h = window.innerHeight

    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
    }
    resize()

    let frame: number
    let lastTime = 0

    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 16.67, 3) // normalize to ~60fps
      lastTime = now

      ctx.clearRect(0, 0, w, h)

      if (!visible.current) {
        frame = requestAnimationFrame(tick)
        return
      }

      // Smooth ring follow - closer tracking
      const dx = pos.current.x - ringPos.current.x
      const dy = pos.current.y - ringPos.current.y
      ringPos.current.x += dx * 0.25 * dt
      ringPos.current.y += dy * 0.25 * dt

      const px = pos.current.x
      const py = pos.current.y
      const rx = ringPos.current.x
      const ry = ringPos.current.y
      const isHover = hovering.current
      const isClick = clicking.current

      // Rotation
      rotation.current += (isHover ? 0.04 : 0.02) * dt

      // Update trail
      trail.current.push({ x: px, y: py, alpha: 0.5 })
      if (trail.current.length > 12) trail.current.shift()
      trail.current.forEach(t => { t.alpha *= 0.85 })

      // Update pulse waves
      for (let i = pulseWaves.current.length - 1; i >= 0; i--) {
        const pw = pulseWaves.current[i]
        pw.radius += 3 * dt
        pw.alpha *= 0.94
        if (pw.alpha < 0.01) pulseWaves.current.splice(i, 1)
      }

      // Draw trail
      trail.current.forEach(t => {
        if (t.alpha < 0.02) return
        ctx.fillStyle = `rgba(0, 255, 255, ${t.alpha * 0.15})`
        ctx.beginPath()
        ctx.arc(t.x, t.y, 2, 0, Math.PI * 2)
        ctx.fill()
      })

      // Draw pulse waves from clicks
      pulseWaves.current.forEach(pw => {
        ctx.strokeStyle = `rgba(0, 255, 255, ${pw.alpha})`
        ctx.lineWidth = 1.5 * pw.alpha
        ctx.beginPath()
        ctx.arc(pw.x, pw.y, pw.radius, 0, Math.PI * 2)
        ctx.stroke()

        // Inner ring
        if (pw.radius > 8) {
          ctx.strokeStyle = `rgba(0, 255, 255, ${pw.alpha * 0.5})`
          ctx.lineWidth = 0.8
          ctx.beginPath()
          ctx.arc(pw.x, pw.y, pw.radius * 0.6, 0, Math.PI * 2)
          ctx.stroke()
        }
      })

      // Crosshair lines
      const crossLen = isHover ? 20 : 14
      const crossGap = isHover ? 12 : 8
      const crossAlpha = isHover ? 0.4 : 0.2
      ctx.strokeStyle = `rgba(0, 255, 255, ${crossAlpha})`
      ctx.lineWidth = 0.8

      // Horizontal lines
      ctx.beginPath()
      ctx.moveTo(px - crossLen - crossGap, py)
      ctx.lineTo(px - crossGap, py)
      ctx.moveTo(px + crossGap, py)
      ctx.lineTo(px + crossLen + crossGap, py)
      // Vertical lines
      ctx.moveTo(px, py - crossLen - crossGap)
      ctx.lineTo(px, py - crossGap)
      ctx.moveTo(px, py + crossGap)
      ctx.lineTo(px, py + crossLen + crossGap)
      ctx.stroke()

      // Small corner brackets at crosshair ends
      const bracketSize = 3
      ctx.strokeStyle = `rgba(0, 255, 255, ${crossAlpha * 0.7})`
      ctx.lineWidth = 0.6
      // Top
      ctx.beginPath()
      ctx.moveTo(px - bracketSize, py - crossLen - crossGap)
      ctx.lineTo(px, py - crossLen - crossGap)
      ctx.lineTo(px, py - crossLen - crossGap + bracketSize)
      ctx.stroke()
      // Bottom
      ctx.beginPath()
      ctx.moveTo(px + bracketSize, py + crossLen + crossGap)
      ctx.lineTo(px, py + crossLen + crossGap)
      ctx.lineTo(px, py + crossLen + crossGap - bracketSize)
      ctx.stroke()
      // Left
      ctx.beginPath()
      ctx.moveTo(px - crossLen - crossGap, py - bracketSize)
      ctx.lineTo(px - crossLen - crossGap, py)
      ctx.lineTo(px - crossLen - crossGap + bracketSize, py)
      ctx.stroke()
      // Right
      ctx.beginPath()
      ctx.moveTo(px + crossLen + crossGap, py + bracketSize)
      ctx.lineTo(px + crossLen + crossGap, py)
      ctx.lineTo(px + crossLen + crossGap - bracketSize, py)
      ctx.stroke()

      // Rotating dashed ring
      const ringRadius = isClick ? 12 : isHover ? 24 : 18
      const segments = 8
      const segmentAngle = (Math.PI * 2) / segments
      const gapRatio = 0.35
      ctx.strokeStyle = `rgba(0, 255, 255, ${isHover ? 0.6 : 0.35})`
      ctx.lineWidth = isHover ? 1.8 : 1.2

      for (let i = 0; i < segments; i++) {
        const startAngle = rotation.current + i * segmentAngle
        const endAngle = startAngle + segmentAngle * (1 - gapRatio)
        ctx.beginPath()
        ctx.arc(rx, ry, ringRadius, startAngle, endAngle)
        ctx.stroke()
      }

      // Second ring rotating opposite direction (outer, fainter)
      if (!isClick) {
        const outerRadius = isHover ? 32 : 24
        ctx.strokeStyle = `rgba(0, 255, 255, ${isHover ? 0.2 : 0.1})`
        ctx.lineWidth = 0.6
        const outerSegments = 12
        const outerSegAngle = (Math.PI * 2) / outerSegments

        for (let i = 0; i < outerSegments; i++) {
          const startAngle = -rotation.current * 0.7 + i * outerSegAngle
          const endAngle = startAngle + outerSegAngle * 0.4
          ctx.beginPath()
          ctx.arc(rx, ry, outerRadius, startAngle, endAngle)
          ctx.stroke()
        }
      }

      // Small tick marks on the ring
      const tickRadius = isHover ? 24 : 18
      const tickLength = 3
      ctx.strokeStyle = `rgba(0, 255, 255, ${isHover ? 0.3 : 0.15})`
      ctx.lineWidth = 0.5
      for (let i = 0; i < 4; i++) {
        const angle = rotation.current * 0.5 + (i * Math.PI) / 2
        const innerX = rx + Math.cos(angle) * (tickRadius - tickLength)
        const innerY = ry + Math.sin(angle) * (tickRadius - tickLength)
        const outerX = rx + Math.cos(angle) * (tickRadius + tickLength)
        const outerY = ry + Math.sin(angle) * (tickRadius + tickLength)
        ctx.beginPath()
        ctx.moveTo(innerX, innerY)
        ctx.lineTo(outerX, outerY)
        ctx.stroke()
      }

      // Center dot with glow
      const dotSize = isClick ? 3 : isHover ? 4 : 3
      const dotGlow = ctx.createRadialGradient(px, py, 0, px, py, dotSize * 4)
      dotGlow.addColorStop(0, `rgba(0, 255, 255, ${isHover ? 0.5 : 0.3})`)
      dotGlow.addColorStop(0.5, `rgba(0, 255, 255, ${isHover ? 0.15 : 0.08})`)
      dotGlow.addColorStop(1, 'rgba(0, 255, 255, 0)')
      ctx.fillStyle = dotGlow
      ctx.beginPath()
      ctx.arc(px, py, dotSize * 4, 0, Math.PI * 2)
      ctx.fill()

      // Solid center dot
      ctx.fillStyle = isHover ? '#ffffff' : 'rgba(0, 255, 255, 0.9)'
      ctx.beginPath()
      ctx.arc(px, py, dotSize, 0, Math.PI * 2)
      ctx.fill()

      // Tiny inner dot
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(px, py, 1, 0, Math.PI * 2)
      ctx.fill()

      frame = requestAnimationFrame(tick)
    }

    const onMove = (e: MouseEvent) => {
      pos.current.x = e.clientX
      pos.current.y = e.clientY
      if (!visible.current) {
        visible.current = true
        ringPos.current = { ...pos.current }
      }
    }

    const onLeave = () => {
      visible.current = false
    }

    const onDown = () => {
      clicking.current = true
      // Spawn pulse wave
      pulseWaves.current.push({
        x: pos.current.x, y: pos.current.y,
        radius: 8, alpha: 0.6
      })
    }

    const onUp = () => {
      clicking.current = false
    }

    const onOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const interactive = target.closest('a, button, input, textarea, [data-cursor]')
      if (interactive) hovering.current = true
    }

    const onOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const interactive = target.closest('a, button, input, textarea, [data-cursor]')
      if (interactive) hovering.current = false
    }

    frame = requestAnimationFrame(tick)
    window.addEventListener('resize', resize)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onLeave)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('mouseover', onOver)
    document.addEventListener('mouseout', onOut)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseout', onOut)
      document.documentElement.classList.remove('has-custom-cursor')
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="cursor-canvas"
      aria-hidden="true"
    />
  )
}
