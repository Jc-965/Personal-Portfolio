import { useEffect, useRef } from 'react'
import { useGyroscope } from '../context/GyroscopeContext'

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)
const rand = (min: number, max: number) => Math.random() * (max - min) + min
const MOBILE_BREAKPOINT = 768
const LOW_POWER_THREADS = 4

const getPerformanceProfile = () => {
  const width = window.innerWidth
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  const isMobileUa = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const isCompact = width < MOBILE_BREAKPOINT
  const isLowPower = (navigator.hardwareConcurrency || 8) <= LOW_POWER_THREADS || (deviceMemory !== undefined && deviceMemory <= 4)
  const useSimpleGrid = isTouch || isCompact || isLowPower

  return {
    isTouch,
    isMobile: isTouch || isMobileUa,
    isCompact,
    isLowPower,
    useSimpleGrid,
    dpr: Math.min(window.devicePixelRatio || 1, isLowPower ? 1.15 : isTouch ? 1.5 : 2),
    targetFps: isLowPower ? 36 : isTouch ? 48 : 60,
  }
}

interface Node {
  id: number
  x: number
  y: number
  baseX: number
  baseY: number
  anchorX: number
  anchorY: number
  vx: number
  vy: number
  radius: number
  halo: number
  phase: number
  depth: number
  driftRadius: number
  driftSpeed: number
  swirlSpeed: number
  jitter: number
}

export default function Background() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointer = useRef({ x: 0, y: 0, inViewport: false, velocity: 0 })
  const lastPointer = useRef({ x: 0, y: 0 })
  const gyro = useGyroscope()
  const gyroRef = useRef({ x: 0, y: 0 })

  // Subscribe to gyroscope updates
  useEffect(() => {
    if (!gyro.permitted) return
    return gyro.subscribe((x, y) => {
      gyroRef.current.x = x
      gyroRef.current.y = y
    })
  }, [gyro, gyro.permitted])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return

    let w = window.innerWidth
    let h = window.innerHeight
    let profile = getPerformanceProfile()
    let dpr = profile.dpr

    const nodes: Node[] = []
    const edges: [number, number][] = []
    let frameId: number
    let bgGradient: CanvasGradient

    const clickDistortion = { x: 0, y: 0, strength: 0 }
    const lastInteraction = { x: 0, y: 0, time: 0 }

    const spawnClickEffect = (cx: number, cy: number) => {
      clickDistortion.x = cx
      clickDistortion.y = cy
      clickDistortion.strength = profile.isTouch ? 0.78 : 0.8
      const clickRadius = profile.isTouch ? 220 : 200
      const clickForce = profile.isTouch ? 3.1 : 3

      nodes.forEach(node => {
        const ddx = node.x - cx
        const ddy = node.y - cy
        const dist = Math.hypot(ddx, ddy) || 1
        if (dist < clickRadius) {
          const force = (1 - dist / clickRadius) * clickForce
          node.vx += (ddx / dist) * force
          node.vy += (ddy / dist) * force
          node.halo = Math.min(1, node.halo + force * 0.2)
        }
      })
    }

    const buildBgGradient = () => {
      const grad = ctx.createLinearGradient(0, 0, w, h)
      grad.addColorStop(0, '#000000')
      grad.addColorStop(0.4, '#000508')
      grad.addColorStop(0.75, '#000204')
      grad.addColorStop(1, '#000000')
      bgGradient = grad
    }

    let initialized = false

    const resizeCanvas = () => {
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
      buildBgGradient()
    }

    const resize = () => {
      const oldW = w
      const oldH = h
      w = window.innerWidth
      h = window.innerHeight
      const nextProfile = getPerformanceProfile()
      const profileChanged =
        nextProfile.isTouch !== profile.isTouch ||
        nextProfile.isCompact !== profile.isCompact ||
        nextProfile.isLowPower !== profile.isLowPower ||
        nextProfile.useSimpleGrid !== profile.useSimpleGrid ||
        nextProfile.dpr !== profile.dpr
        || nextProfile.targetFps !== profile.targetFps

      profile = nextProfile
      dpr = profile.dpr
      frameInterval = profile.targetFps >= 60 ? 0 : 1000 / profile.targetFps
      lastFrameTime = 0
      resizeCanvas()

      const areaRatio = oldW > 0 && oldH > 0 ? (w * h) / (oldW * oldH) : 1
      const significantResize =
        Math.abs(w - oldW) > 160 ||
        Math.abs(h - oldH) > 120 ||
        areaRatio < 0.72 ||
        areaRatio > 1.38

      if (!initialized || nodes.length === 0 || profileChanged || significantResize) {
        initNodes()
        initialized = true
        return
      }

      // Proportionally reposition existing nodes instead of rebuilding
      const sx = w / oldW
      const sy = h / oldH
      nodes.forEach(node => {
        node.anchorX = clamp(node.anchorX * sx, 32, w - 32)
        node.anchorY = clamp(node.anchorY * sy, 32, h - 32)
        node.baseX = clamp(node.baseX * sx, 36, w - 36)
        node.baseY = clamp(node.baseY * sy, 36, h - 36)
        node.x = clamp(node.x * sx, 24, w - 24)
        node.y = clamp(node.y * sy, 24, h - 24)
      })
    }

    const initNodes = () => {
      nodes.length = 0
      edges.length = 0
      const branchSet = new Set<string>()
      const treeCount = profile.isTouch
        ? Math.max(profile.isLowPower ? 5 : 6, Math.round(w / (profile.isLowPower ? 88 : 74)))
        : profile.isCompact
          ? Math.max(6, Math.round(w / 140))
          : Math.max(6, Math.round(w / 220))
      const perTree = profile.isTouch
        ? Math.round(clamp(h / (profile.isLowPower ? 92 : 82), profile.isLowPower ? 10 : 12, profile.isLowPower ? 18 : 24))
        : profile.isCompact
          ? Math.round(clamp(h / 88, 12, 20))
          : Math.round(clamp(h / 90, 14, 30))
      const cols: number[][] = []

      const connect = (a: number, b: number) => {
        if (a === undefined || b === undefined) return
        const key = a < b ? `${a}-${b}` : `${b}-${a}`
        if (!branchSet.has(key)) {
          branchSet.add(key)
          edges.push([a, b])
        }
      }

      for (let t = 0; t < treeCount; t++) {
        const col: number[] = []
        const baseX = ((t + 0.5) / treeCount) * w + rand(profile.isTouch ? -26 : -48, profile.isTouch ? 26 : 48)
        const swing = rand(profile.isTouch ? 14 : 18, profile.isTouch ? 26 : 32)
        const wobble = rand(0.8, 1.8)

        for (let i = 0; i < perTree; i++) {
          const depth = i / Math.max(perTree - 1, 1)
          const sway = Math.sin(depth * Math.PI * wobble) * swing
          const x = clamp(baseX + sway + rand(-12, 12), 32, w - 32)
          const y = h * (0.04 + depth * 0.88) + rand(-18, 18)
          const id = nodes.length

          nodes.push({
            id,
            x,
            y,
            baseX: x,
            baseY: y,
            anchorX: x,
            anchorY: y,
            vx: 0,
            vy: 0,
            radius: rand(profile.isTouch ? 1 : 0.8, profile.isTouch ? 1.85 : 1.6),
            halo: 0,
            phase: Math.random() * Math.PI * 2,
            depth: depth + Math.random() * 0.05,
            driftRadius: rand(profile.isTouch ? 12 : 14, profile.isTouch ? 34 : 40) * (0.4 + depth * 0.55),
            driftSpeed: rand(0.1, 0.28),
            swirlSpeed: rand(0.06, 0.2),
            jitter: rand(profile.isTouch ? 3 : 4, profile.isTouch ? 8 : 12),
          })

          col.push(id)
          if (col.length > 1) connect(col[col.length - 2], id)
          if (col.length > 4 && Math.random() > 0.62) {
            const span = Math.min(4, col.length - 2)
            connect(col[Math.max(0, col.length - 2 - Math.floor(Math.random() * span))], id)
          }
        }

        cols.push(col)
      }

      for (let t = 0; t < cols.length - 1; t++) {
        const cur = cols[t]
        const nxt = cols[t + 1]
        const pairs = Math.min(cur.length, nxt.length)
        const stride = Math.max(2, Math.floor(pairs / 5))
        for (let i = stride; i < pairs; i += stride) {
          connect(
            cur[i - Math.floor(Math.random() * Math.min(2, i))],
            nxt[Math.min(nxt.length - 1, i + Math.floor(Math.random() * 3) - 1)]
          )
        }
      }

      for (let t = 0; t < cols.length - 2; t++) {
        const cur = cols[t]
        const far = cols[t + 2]
        if (!cur || !far) continue
        const pairs = Math.min(cur.length, far.length)
        for (let i = 0; i < Math.max(1, Math.floor(pairs / 6)); i++) {
          if (Math.random() > 0.55) continue
          connect(cur[Math.floor(Math.random() * pairs)], far[Math.floor(Math.random() * pairs)])
        }
      }
    }

    let lastFrameTime = 0
    let frameInterval = profile.targetFps >= 60 ? 0 : 1000 / profile.targetFps

    const animate = (now: number) => {
      frameId = requestAnimationFrame(animate)

      if (frameInterval > 0 && now - lastFrameTime < frameInterval) return
      lastFrameTime = now

      ctx.clearRect(0, 0, w, h)

      ctx.fillStyle = bgGradient
      ctx.fillRect(0, 0, w, h)

      const time = now * 0.0012
      const p = pointer.current
      const dx = p.x - lastPointer.current.x
      const dy = p.y - lastPointer.current.y
      p.velocity = 0.18 * Math.hypot(dx, dy) + 0.82 * p.velocity
      lastPointer.current.x = p.x
      lastPointer.current.y = p.y

      clickDistortion.strength *= 0.95

      const pointerFactor = p.inViewport ? clamp(p.velocity / 180, 0.08, 0.92) : 0.06
      const influenceR = p.inViewport ? 280 + p.velocity * 0.8 : 170

      const spacing = profile.isTouch
        ? clamp(w / 28, 12, 18)
        : profile.isCompact
          ? clamp(w / 22, 14, 22)
          : clamp(w / 44, 26, 34)
      const gridDriftX = (time * 1.5) % spacing
      const gridDriftY = (time * 1.3) % spacing
      const gx = gyroRef.current.x
      const gy = gyroRef.current.y
      const hasGyro = Math.abs(gx) > 0.001 || Math.abs(gy) > 0.001
      const parallaxX = hasGyro ? gx * w * 0.08 : (p.inViewport && !profile.isLowPower ? (p.x - w / 2) * 0.1 : 0)
      const parallaxY = hasGyro ? gy * h * 0.06 : (p.inViewport && !profile.isLowPower ? (p.y - h / 2) * 0.1 : 0)
      const offX = (gridDriftX + parallaxX) % spacing
      const offY = (gridDriftY + parallaxY) % spacing
      const gravR = p.inViewport && !profile.isLowPower ? 320 + p.velocity * 0.6 : 0
      const gravRSq = gravR * gravR || 1
      const clickR = clickDistortion.strength > 0.01 ? (profile.isTouch ? 340 : 300) * clickDistortion.strength : 0

      ctx.save()
      ctx.globalAlpha = profile.useSimpleGrid ? 0.82 : 0.9

      if (profile.useSimpleGrid) {
        // Compact/touch viewports keep the grid crisp without the expensive per-point distortion path.
        ctx.beginPath()
        for (let x = -spacing; x < w + spacing; x += spacing) {
          const bx = x + offX
          ctx.moveTo(bx, -spacing + offY)
          ctx.lineTo(bx, h + spacing + offY)
        }
        for (let y = -spacing; y < h + spacing; y += spacing) {
          const by = y + offY
          ctx.moveTo(-spacing + offX, by)
          ctx.lineTo(w + spacing + offX, by)
        }

        ctx.strokeStyle = `hsla(185, 100%, 50%, ${profile.isTouch ? 0.14 : 0.12})`
        ctx.lineWidth = profile.isTouch ? 1.2 : 1
        ctx.stroke()

        ctx.strokeStyle = `hsla(186, 100%, 82%, ${profile.isTouch ? 0.22 : 0.16})`
        ctx.lineWidth = 0.45
        ctx.stroke()
      } else {
        for (let x = -spacing; x < w + spacing; x += spacing) {
          const bx = x + offX
          const hue = 180 + (p.inViewport ? clamp(1 - Math.abs(p.x - bx) / 420, 0, 1) * 30 : 0)
          let alpha = 0.1 + pointerFactor * 0.2 + (p.inViewport ? clamp(1 - Math.abs(p.x - bx) / 360, 0, 1) * 0.2 : 0)

          if (clickR > 0) {
            const distToClick = Math.abs(clickDistortion.x - bx)
            if (distToClick < clickR) {
              alpha += (1 - distToClick / clickR) * clickDistortion.strength * 0.3
            }
          }

          ctx.strokeStyle = `hsla(${hue}, 100%, 50%, ${alpha})`
          ctx.lineWidth = 0.8
          ctx.beginPath()
          const step = spacing / 2
          const steps = Math.ceil((h + spacing * 2) / step)
          for (let s = 0; s <= steps; s++) {
            let drawX = bx
            let drawY = -spacing + s * step + offY

            if (p.inViewport) {
              const ddx = p.x - bx
              const ddy = p.y - drawY
              const inf = Math.exp(-(ddx * ddx + ddy * ddy) / gravRSq)
              drawX += ddx * inf * 0.22
              drawY += ddy * inf * 0.04
            }

            if (clickR > 0) {
              const cdx = drawX - clickDistortion.x
              const cdy = drawY - clickDistortion.y
              const cdist = Math.hypot(cdx, cdy) || 1
              if (cdist < clickR) {
                const pushForce = (1 - cdist / clickR) * clickDistortion.strength * 30
                drawX += (cdx / cdist) * pushForce
                drawY += (cdy / cdist) * pushForce
              }
            }

            if (s === 0) ctx.moveTo(drawX, drawY)
            else ctx.lineTo(drawX, drawY)
          }
          ctx.stroke()
        }

        for (let y = -spacing; y < h + spacing; y += spacing) {
          const by = y + offY
          const hue = 180 + (p.inViewport ? clamp(1 - Math.abs(p.y - by) / 360, 0, 1) * 30 : 0)
          let alpha = 0.08 + pointerFactor * 0.18 + (p.inViewport ? clamp(1 - Math.abs(p.y - by) / 320, 0, 1) * 0.18 : 0)

          if (clickR > 0) {
            const distToClick = Math.abs(clickDistortion.y - by)
            if (distToClick < clickR) {
              alpha += (1 - distToClick / clickR) * clickDistortion.strength * 0.3
            }
          }

          ctx.strokeStyle = `hsla(${hue}, 100%, 50%, ${alpha})`
          ctx.lineWidth = 0.78
          ctx.beginPath()
          const step = spacing / 2
          const steps = Math.ceil((w + spacing * 2) / step)
          for (let s = 0; s <= steps; s++) {
            let drawX = -spacing + s * step + offX
            let drawY = by

            if (p.inViewport) {
              const ddx = p.x - drawX
              const ddy = p.y - by
              const inf = Math.exp(-(ddx * ddx + ddy * ddy) / gravRSq)
              drawY += ddy * inf * 0.22
              drawX += ddx * inf * 0.04
            }

            if (clickR > 0) {
              const cdx = drawX - clickDistortion.x
              const cdy = drawY - clickDistortion.y
              const cdist = Math.hypot(cdx, cdy) || 1
              if (cdist < clickR) {
                const pushForce = (1 - cdist / clickR) * clickDistortion.strength * 30
                drawX += (cdx / cdist) * pushForce
                drawY += (cdy / cdist) * pushForce
              }
            }

            if (s === 0) ctx.moveTo(drawX, drawY)
            else ctx.lineTo(drawX, drawY)
          }
          ctx.stroke()
        }
      }
      ctx.restore()

      ctx.lineCap = 'round'

      nodes.forEach(node => {
        node.halo *= 0.92
        const driftX = Math.sin(time * node.driftSpeed + node.phase) * node.driftRadius
        const driftY = Math.cos(time * node.swirlSpeed + node.phase * 1.2) * node.driftRadius * 0.6
        const jX = Math.sin(time * 0.6 + node.phase * 1.7) * node.jitter
        const jY = Math.cos(time * 0.5 + node.phase * 1.3) * node.jitter
        node.baseX = clamp(node.anchorX + driftX + jX, 36, w - 36)
        node.baseY = clamp(node.anchorY + driftY + jY, 36, h - 36)

        node.vx += (node.baseX - node.x) * 0.016 + Math.sin(time * 1.2 + node.phase) * 0.45
        node.vy += (node.baseY - node.y) * 0.014 + Math.cos(time * 1 + node.phase) * 0.45

        if (p.inViewport && !profile.isLowPower) {
          const ddx = p.x - node.x
          const ddy = p.y - node.y
          const dist = Math.hypot(ddx, ddy) || 0.001
          if (dist < influenceR) {
            const force = (1 - dist / influenceR) * (0.7 + pointerFactor * 1.2)
            node.vx -= (ddx / dist) * force
            node.vy -= (ddy / dist) * force
            node.halo = Math.min(1, node.halo + force * 0.45 + pointerFactor * 0.32)
          }
        }

        // Gyroscope-driven drift: tilt phone to gently nudge nodes
        if (hasGyro) {
          node.vx += gx * 0.25
          node.vy += gy * 0.18
        }

        node.vx *= 0.9
        node.vy *= 0.9
        node.x += node.vx
        node.y += node.vy
        node.x = clamp(node.x, 24, w - 24)
        node.y = clamp(node.y, 24, h - 24)
      })

      edges.forEach(([a, b]) => {
        const from = nodes[a]
        const to = nodes[b]
        if (!from || !to) return
        const highlight = Math.max(from.halo, to.halo) * (profile.isLowPower ? 0.6 : 0.82)
        const hue = 180 + highlight * 60
        const alpha = profile.isLowPower ? 0.18 : 0.14 + highlight * 0.35
        ctx.strokeStyle = `hsla(${hue}, 100%, ${50 + highlight * 15}%, ${alpha})`
        ctx.lineWidth = profile.isLowPower ? 0.7 : 0.5 + highlight * 1.2
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.stroke()
      })

      nodes.forEach(node => {
        const r = node.radius * (0.78 + node.depth * 0.26)

        if (profile.isLowPower) {
          const glowRadius = r * 2.1
          ctx.fillStyle = `hsla(${180 + node.halo * 60}, 100%, 58%, ${0.18 + node.halo * 0.18})`
          ctx.beginPath()
          ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2)
          ctx.fill()

          ctx.fillStyle = `hsla(${180 + node.halo * 60}, 100%, 64%, ${0.72 + node.halo * 0.18})`
          ctx.beginPath()
          ctx.arc(node.x, node.y, r * 1.35, 0, Math.PI * 2)
          ctx.fill()
        } else {
          const gR = r * (1.9 + node.halo * 2.6)
          const g = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, gR)
          g.addColorStop(0, `hsla(${180 + node.halo * 60}, 100%, 60%, ${0.3 + node.halo * 0.2})`)
          g.addColorStop(0.65, `hsla(${180 + node.halo * 60}, 100%, 50%, ${0.2 + node.halo * 0.18})`)
          g.addColorStop(1, 'rgba(0,10,20,0)')
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(node.x, node.y, gR, 0, Math.PI * 2)
          ctx.fill()

          ctx.fillStyle = `hsla(${180 + node.halo * 60}, 100%, 60%, ${0.6 + node.halo * 0.2})`
          ctx.beginPath()
          ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
          ctx.fill()

          ctx.strokeStyle = `hsla(${180 + node.halo * 60}, 100%, 70%, ${0.18 + node.halo * 0.25})`
          ctx.lineWidth = 0.45
          ctx.beginPath()
          ctx.arc(node.x, node.y, r + 1.6 + node.halo * 3.4, 0, Math.PI * 2)
          ctx.stroke()
        }
      })

    }

    const onMove = (e: PointerEvent) => {
      pointer.current.x = e.clientX
      pointer.current.y = e.clientY
      pointer.current.inViewport = true
    }

    const onLeave = () => {
      pointer.current.inViewport = false
    }

    const triggerInteraction = (x: number, y: number) => {
      const now = performance.now()
      if (now - lastInteraction.time < 150 && Math.hypot(x - lastInteraction.x, y - lastInteraction.y) < 18) return

      lastInteraction.x = x
      lastInteraction.y = y
      lastInteraction.time = now
      pointer.current.x = x
      pointer.current.y = y
      pointer.current.inViewport = true
      spawnClickEffect(x, y)
    }

    const onPointerDown = (e: PointerEvent) => {
      triggerInteraction(e.clientX, e.clientY)
    }

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      if (t) triggerInteraction(t.clientX, t.clientY)
    }

    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frameId)
        frameId = 0
      } else {
        lastFrameTime = 0
        if (!frameId) frameId = requestAnimationFrame(animate)
      }
    }

    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const debouncedResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(resize, 250)
    }

    resize()
    frameId = requestAnimationFrame(animate)
    window.addEventListener('resize', debouncedResize)
    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave, { passive: true })
    document.addEventListener('pointerdown', onPointerDown, { passive: true })
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelAnimationFrame(frameId)
      if (resizeTimer) clearTimeout(resizeTimer)
      window.removeEventListener('resize', debouncedResize)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  return (
    <div className="background" aria-hidden="true">
      <canvas ref={canvasRef} className="background__canvas" />
      <div className="background__noise" />
    </div>
  )
}
