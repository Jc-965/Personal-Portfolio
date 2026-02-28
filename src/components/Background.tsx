import { useEffect, useRef } from 'react'

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)
const rand = (min: number, max: number) => Math.random() * (max - min) + min

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

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    const isLowEnd = isMobile || navigator.hardwareConcurrency <= 4 || window.innerWidth < 768

    let w = window.innerWidth
    let h = window.innerHeight
    const dpr = isLowEnd ? Math.min(window.devicePixelRatio || 1, 1.5) : Math.min(window.devicePixelRatio || 1, 2)

    const nodes: Node[] = []
    const edges: [number, number][] = []
    let frameId: number
    let bgGradient: CanvasGradient

    const clickDistortion = { x: 0, y: 0, strength: 0 }

    const spawnClickEffect = (cx: number, cy: number) => {
      clickDistortion.x = cx
      clickDistortion.y = cy
      clickDistortion.strength = 0.8

      nodes.forEach(node => {
        const ddx = node.x - cx
        const ddy = node.y - cy
        const dist = Math.hypot(ddx, ddy) || 1
        if (dist < 200) {
          const force = (1 - dist / 200) * 3
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

    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
      buildBgGradient()
      initNodes()
    }

    const initNodes = () => {
      nodes.length = 0
      edges.length = 0
      const branchSet = new Set<string>()
      const treeCount = isLowEnd ? Math.max(3, Math.round(w / 400)) : Math.max(6, Math.round(w / 220))
      const perTree = isLowEnd ? Math.round(clamp(h / 160, 6, 12)) : Math.round(clamp(h / 90, 14, 30))
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
        const baseX = ((t + 0.5) / treeCount) * w + rand(-48, 48)
        const swing = rand(18, 32)
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
            radius: rand(0.8, 1.6),
            halo: 0,
            phase: Math.random() * Math.PI * 2,
            depth: depth + Math.random() * 0.05,
            driftRadius: rand(14, 40) * (0.4 + depth * 0.55),
            driftSpeed: rand(0.1, 0.28),
            swirlSpeed: rand(0.06, 0.2),
            jitter: rand(4, 12),
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

    const animate = (now: number) => {
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

      const spacing = isLowEnd ? clamp(w / 28, 36, 50) : clamp(w / 44, 26, 34)
      const gridDriftX = (time * 1.5) % spacing
      const gridDriftY = (time * 1.3) % spacing
      const parallaxX = p.inViewport && !isLowEnd ? (p.x - w / 2) * 0.1 : 0
      const parallaxY = p.inViewport && !isLowEnd ? (p.y - h / 2) * 0.1 : 0
      const offX = (gridDriftX + parallaxX) % spacing
      const offY = (gridDriftY + parallaxY) % spacing
      const gravR = p.inViewport && !isLowEnd ? 320 + p.velocity * 0.6 : 0
      const clickR = clickDistortion.strength > 0.01 ? 300 * clickDistortion.strength : 0

      ctx.save()
      ctx.globalAlpha = isLowEnd ? 0.7 : 0.9

      for (let x = -spacing; x < w + spacing; x += spacing) {
        const bx = x + offX
        const hue = 180 + (p.inViewport && !isLowEnd ? clamp(1 - Math.abs(p.x - bx) / 420, 0, 1) * 30 : 0)
        let alpha = isLowEnd ? 0.12 : 0.1 + pointerFactor * 0.2 + (p.inViewport ? clamp(1 - Math.abs(p.x - bx) / 360, 0, 1) * 0.2 : 0)

        if (clickR > 0) {
          const distToClick = Math.abs(clickDistortion.x - bx)
          if (distToClick < clickR) {
            alpha += (1 - distToClick / clickR) * clickDistortion.strength * 0.3
          }
        }

        ctx.strokeStyle = `hsla(${hue}, 100%, 50%, ${alpha})`
        ctx.lineWidth = 0.8
        ctx.beginPath()
        const step = isLowEnd ? spacing : spacing / 2
        const steps = Math.ceil((h + spacing * 2) / step)
        for (let s = 0; s <= steps; s++) {
          let drawX = bx
          let drawY = -spacing + s * step + offY

          if (p.inViewport && !isLowEnd) {
            const ddx = p.x - bx
            const ddy = p.y - drawY
            const inf = Math.exp(-(ddx * ddx + ddy * ddy) / Math.max(gravR * gravR, 1))
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
        const hue = 180 + (p.inViewport && !isLowEnd ? clamp(1 - Math.abs(p.y - by) / 360, 0, 1) * 30 : 0)
        let alpha = isLowEnd ? 0.1 : 0.08 + pointerFactor * 0.18 + (p.inViewport ? clamp(1 - Math.abs(p.y - by) / 320, 0, 1) * 0.18 : 0)

        if (clickR > 0) {
          const distToClick = Math.abs(clickDistortion.y - by)
          if (distToClick < clickR) {
            alpha += (1 - distToClick / clickR) * clickDistortion.strength * 0.3
          }
        }

        ctx.strokeStyle = `hsla(${hue}, 100%, 50%, ${alpha})`
        ctx.lineWidth = 0.78
        ctx.beginPath()
        const step = isLowEnd ? spacing : spacing / 2
        const steps = Math.ceil((w + spacing * 2) / step)
        for (let s = 0; s <= steps; s++) {
          let drawX = -spacing + s * step + offX
          let drawY = by

          if (p.inViewport && !isLowEnd) {
            const ddx = p.x - drawX
            const ddy = p.y - by
            const inf = Math.exp(-(ddx * ddx + ddy * ddy) / Math.max(gravR * gravR, 1))
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

        if (p.inViewport && !isLowEnd) {
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
        const highlight = Math.max(from.halo, to.halo) * (isLowEnd ? 0.5 : 0.78)
        const hue = 180 + highlight * 60
        const alpha = isLowEnd ? 0.15 : 0.12 + highlight * 0.35
        ctx.strokeStyle = `hsla(${hue}, 100%, ${50 + highlight * 15}%, ${alpha})`
        ctx.lineWidth = isLowEnd ? 0.5 : 0.4 + highlight * 1.2
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.stroke()
      })

      nodes.forEach(node => {
        const r = node.radius * (0.78 + node.depth * 0.26)

        if (isLowEnd) {
          ctx.fillStyle = `hsla(${180 + node.halo * 60}, 100%, 60%, ${0.6 + node.halo * 0.2})`
          ctx.beginPath()
          ctx.arc(node.x, node.y, r * 1.2, 0, Math.PI * 2)
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

      frameId = requestAnimationFrame(animate)
    }

    const onMove = (e: PointerEvent) => {
      pointer.current.x = e.clientX
      pointer.current.y = e.clientY
      pointer.current.inViewport = true
    }

    const onLeave = () => {
      pointer.current.inViewport = false
    }

    const onClick = (e: PointerEvent) => {
      spawnClickEffect(e.clientX, e.clientY)
    }

    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frameId)
      } else {
        frameId = requestAnimationFrame(animate)
      }
    }

    resize()
    frameId = requestAnimationFrame(animate)
    window.addEventListener('resize', resize)
    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave, { passive: true })
    document.addEventListener('pointerdown', onClick, { passive: true })
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', resize)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('pointerdown', onClick)
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
