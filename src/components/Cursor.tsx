import { useEffect, useRef } from 'react'
import { applyNativeCursorSuppression, clearNativeCursorSuppression, shouldUseCustomCursor } from '../utils/nativeCursor'

export default function Cursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pos = useRef({ x: -100, y: -100 })
  const ringPos = useRef({ x: -100, y: -100 })
  const visible = useRef(false)
  const hovering = useRef(false)
  const clicking = useRef(false)
  const clickProgress = useRef(0)
  const clickImpulse = useRef(0)
  const rotation = useRef(0)
  const trailPool = useRef(Array.from({ length: 12 }, () => ({ x: 0, y: 0, alpha: 0 })))
  const trailHead = useRef(0)
  const trailCount = useRef(0)
  const pulseWaves = useRef<{ x: number; y: number; radius: number; alpha: number }[]>([])

  useEffect(() => {
    const isTouchDevice = !shouldUseCustomCursor()
    if (isTouchDevice) return

    applyNativeCursorSuppression()

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

    let frame = 0
    let lastTime = 0

    const hasActiveEffects = () =>
      visible.current ||
      trailCount.current > 0 ||
      pulseWaves.current.length > 0 ||
      clickProgress.current > 0.01 ||
      clickImpulse.current > 0.01

    const requestTick = () => {
      if (!frame) {
        frame = requestAnimationFrame(tick)
      }
    }

    const tick = (now: number) => {
      frame = 0
      const elapsed = lastTime === 0 ? 16.67 : now - lastTime
      const dt = Math.min(elapsed / 16.67, 3)
      lastTime = now

      ctx.clearRect(0, 0, w, h)

      if (!hasActiveEffects()) {
        return
      }

      const dx = pos.current.x - ringPos.current.x
      const dy = pos.current.y - ringPos.current.y
      ringPos.current.x += dx * 0.25 * dt
      ringPos.current.y += dy * 0.25 * dt

      const px = pos.current.x
      const py = pos.current.y
      const rx = ringPos.current.x
      const ry = ringPos.current.y
      const isHover = hovering.current
      const clickTarget = clicking.current ? 1 : 0
      clickProgress.current += (clickTarget - clickProgress.current) * 0.28 * dt
      clickImpulse.current *= Math.pow(0.76, dt)
      const clickVisual = Math.max(clickProgress.current, clickImpulse.current)
      const isClick = clickVisual > 0.02

      rotation.current += ((isHover ? 0.04 : 0.02) + clickVisual * 0.025) * dt

      const pool = trailPool.current
      const entry = pool[trailHead.current]
      entry.x = px; entry.y = py; entry.alpha = 0.5
      trailHead.current = (trailHead.current + 1) % 12
      if (trailCount.current < 12) trailCount.current++
      for (let i = 0; i < trailCount.current; i++) {
        pool[i].alpha *= 0.85
      }

      for (let i = pulseWaves.current.length - 1; i >= 0; i--) {
        const pw = pulseWaves.current[i]
        pw.radius += 3 * dt
        pw.alpha *= 0.94
        if (pw.alpha < 0.01) pulseWaves.current.splice(i, 1)
      }

      for (let i = 0; i < trailCount.current; i++) {
        const t = pool[i]
        if (t.alpha < 0.02) continue
        ctx.fillStyle = `rgba(0, 255, 255, ${t.alpha * 0.15})`
        ctx.beginPath()
        ctx.arc(t.x, t.y, 2, 0, Math.PI * 2)
        ctx.fill()
      }

      pulseWaves.current.forEach(pw => {
        ctx.strokeStyle = `rgba(0, 255, 255, ${pw.alpha})`
        ctx.lineWidth = 1.5 * pw.alpha
        ctx.beginPath()
        ctx.arc(pw.x, pw.y, pw.radius, 0, Math.PI * 2)
        ctx.stroke()

        if (pw.radius > 8) {
          ctx.strokeStyle = `rgba(0, 255, 255, ${pw.alpha * 0.5})`
          ctx.lineWidth = 0.8
          ctx.beginPath()
          ctx.arc(pw.x, pw.y, pw.radius * 0.6, 0, Math.PI * 2)
          ctx.stroke()
        }
      })

      const crossLen = (isHover ? 20 : 14) + clickVisual * 5
      const crossGap = (isHover ? 12 : 8) + clickVisual * 2
      const crossAlpha = (isHover ? 0.4 : 0.2) + clickVisual * 0.15
      ctx.strokeStyle = `rgba(0, 255, 255, ${crossAlpha})`
      ctx.lineWidth = 0.8 + clickVisual * 0.6

      ctx.beginPath()
      ctx.moveTo(px - crossLen - crossGap, py)
      ctx.lineTo(px - crossGap, py)
      ctx.moveTo(px + crossGap, py)
      ctx.lineTo(px + crossLen + crossGap, py)
      ctx.moveTo(px, py - crossLen - crossGap)
      ctx.lineTo(px, py - crossGap)
      ctx.moveTo(px, py + crossGap)
      ctx.lineTo(px, py + crossLen + crossGap)
      ctx.stroke()

      const bracketSize = 3
      ctx.strokeStyle = `rgba(0, 255, 255, ${crossAlpha * 0.7})`
      ctx.lineWidth = 0.6
      ctx.beginPath()
      ctx.moveTo(px - bracketSize, py - crossLen - crossGap)
      ctx.lineTo(px, py - crossLen - crossGap)
      ctx.lineTo(px, py - crossLen - crossGap + bracketSize)
      ctx.moveTo(px + bracketSize, py + crossLen + crossGap)
      ctx.lineTo(px, py + crossLen + crossGap)
      ctx.lineTo(px, py + crossLen + crossGap - bracketSize)
      ctx.moveTo(px - crossLen - crossGap, py - bracketSize)
      ctx.lineTo(px - crossLen - crossGap, py)
      ctx.lineTo(px - crossLen - crossGap + bracketSize, py)
      ctx.moveTo(px + crossLen + crossGap, py + bracketSize)
      ctx.lineTo(px + crossLen + crossGap, py)
      ctx.lineTo(px + crossLen + crossGap - bracketSize, py)
      ctx.stroke()

      const ringRadius = (isHover ? 24 : 18) - clickProgress.current * 7 + clickImpulse.current * 4
      const segments = 8
      const segmentAngle = (Math.PI * 2) / segments
      const gapRatio = 0.35
      ctx.strokeStyle = `rgba(0, 255, 255, ${(isHover ? 0.6 : 0.35) + clickVisual * 0.25})`
      ctx.lineWidth = (isHover ? 1.8 : 1.2) + clickVisual * 0.8

      ctx.beginPath()
      for (let i = 0; i < segments; i++) {
        const startAngle = rotation.current + i * segmentAngle
        const endAngle = startAngle + segmentAngle * (1 - gapRatio)
        ctx.arc(rx, ry, ringRadius, startAngle, endAngle)
        ctx.moveTo(rx + Math.cos(endAngle) * ringRadius, ry + Math.sin(endAngle) * ringRadius)
      }
      ctx.stroke()

      if (!clicking.current) {
        const outerRadius = isHover ? 32 : 24
        ctx.strokeStyle = `rgba(0, 255, 255, ${isHover ? 0.2 : 0.1})`
        ctx.lineWidth = 0.6
        const outerSegments = 12
        const outerSegAngle = (Math.PI * 2) / outerSegments

        ctx.beginPath()
        for (let i = 0; i < outerSegments; i++) {
          const startAngle = -rotation.current * 0.7 + i * outerSegAngle
          const endAngle = startAngle + outerSegAngle * 0.4
          ctx.arc(rx, ry, outerRadius, startAngle, endAngle)
          ctx.moveTo(rx + Math.cos(endAngle) * outerRadius, ry + Math.sin(endAngle) * outerRadius)
        }
        ctx.stroke()
      }

      const tickRadius = (isHover ? 24 : 18) + clickVisual * 2
      const tickLength = 3 + clickVisual * 1.5
      ctx.strokeStyle = `rgba(0, 255, 255, ${(isHover ? 0.3 : 0.15) + clickVisual * 0.12})`
      ctx.lineWidth = 0.5 + clickVisual * 0.35
      ctx.beginPath()
      for (let i = 0; i < 4; i++) {
        const angle = rotation.current * 0.5 + (i * Math.PI) / 2
        const innerX = rx + Math.cos(angle) * (tickRadius - tickLength)
        const innerY = ry + Math.sin(angle) * (tickRadius - tickLength)
        const outerX = rx + Math.cos(angle) * (tickRadius + tickLength)
        const outerY = ry + Math.sin(angle) * (tickRadius + tickLength)
        ctx.moveTo(innerX, innerY)
        ctx.lineTo(outerX, outerY)
      }
      ctx.stroke()

      const dotSize = (isHover ? 4 : 3) + clickVisual * 1.4
      const dotGlow = ctx.createRadialGradient(px, py, 0, px, py, dotSize * 4)
      dotGlow.addColorStop(0, `rgba(0, 255, 255, ${(isHover ? 0.5 : 0.3) + clickVisual * 0.18})`)
      dotGlow.addColorStop(0.5, `rgba(0, 255, 255, ${(isHover ? 0.15 : 0.08) + clickVisual * 0.12})`)
      dotGlow.addColorStop(1, 'rgba(0, 255, 255, 0)')
      ctx.fillStyle = dotGlow
      ctx.beginPath()
      ctx.arc(px, py, dotSize * 4, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = isHover ? '#ffffff' : 'rgba(0, 255, 255, 0.9)'
      ctx.beginPath()
      ctx.arc(px, py, dotSize, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(px, py, 1, 0, Math.PI * 2)
      ctx.fill()

      if (hasActiveEffects()) {
        requestTick()
      }
    }

    const onMove = (e: MouseEvent) => {
      applyNativeCursorSuppression()
      pos.current.x = e.clientX
      pos.current.y = e.clientY
      if (!visible.current) {
        visible.current = true
        ringPos.current.x = pos.current.x
        ringPos.current.y = pos.current.y
      }
      requestTick()
    }

    const onLeave = () => {
      visible.current = false
      requestTick()
    }

    const reinforceCursorSuppression = () => {
      applyNativeCursorSuppression()
    }

    const onDown = () => {
      clicking.current = true
      clickImpulse.current = 1
      pulseWaves.current.push({
        x: pos.current.x, y: pos.current.y,
        radius: 6, alpha: 0.82,
      })
      requestTick()
    }

    const onUp = () => {
      clicking.current = false
      requestTick()
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

    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame)
        frame = 0
      } else {
        lastTime = 0
        if (hasActiveEffects()) {
          requestTick()
        }
      }
    }

    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const debouncedResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(resize, 150)
    }
    window.addEventListener('resize', debouncedResize)
    window.addEventListener('focus', reinforceCursorSuppression, { passive: true })
    window.addEventListener('mouseenter', reinforceCursorSuppression, { passive: true })
    window.addEventListener('pageshow', reinforceCursorSuppression, { passive: true })
    document.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('mouseleave', onLeave, { passive: true })
    document.addEventListener('mousedown', onDown, { passive: true })
    document.addEventListener('mouseup', onUp, { passive: true })
    document.addEventListener('mouseover', onOver, { passive: true })
    document.addEventListener('mouseout', onOut, { passive: true })
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelAnimationFrame(frame)
      frame = 0
      if (resizeTimer) clearTimeout(resizeTimer)
      window.removeEventListener('resize', debouncedResize)
      window.removeEventListener('focus', reinforceCursorSuppression)
      window.removeEventListener('mouseenter', reinforceCursorSuppression)
      window.removeEventListener('pageshow', reinforceCursorSuppression)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseout', onOut)
      document.removeEventListener('visibilitychange', handleVisibility)
      clearNativeCursorSuppression()
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
