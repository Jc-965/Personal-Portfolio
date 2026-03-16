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
  const isActualMobile = isCompact && (isTouch || isMobileUa)
  const isLowPower = (navigator.hardwareConcurrency || 8) <= LOW_POWER_THREADS || (deviceMemory !== undefined && deviceMemory <= 4)
  const useSimpleGrid = isLowPower

  return {
    isTouch,
    isMobile: isTouch || isMobileUa,
    isCompact,
    isActualMobile,
    isLowPower,
    useSimpleGrid,
    dpr: Math.min(window.devicePixelRatio || 1, isLowPower ? 1.15 : isActualMobile ? 1.45 : 2),
    targetFps: isLowPower ? (isCompact ? 42 : 36) : isActualMobile ? 52 : 60,
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
    let stableCompactHeight = h
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
      clickDistortion.strength = profile.isCompact ? 1.04 : 0.8
      const clickRadius = profile.isCompact ? 176 : 200
      const clickForce = profile.isCompact ? 5.8 : 3

      nodes.forEach(node => {
        const ddx = node.x - cx
        const ddy = node.y - cy
        const dist = Math.hypot(ddx, ddy) || 1
        if (dist < clickRadius) {
          const force = (1 - dist / clickRadius) * clickForce
          const pushX = (ddx / dist) * force
          const pushY = (ddy / dist) * force
          node.vx += pushX * (profile.isCompact ? 1.7 : 1)
          node.vy += pushY * (profile.isCompact ? 1.7 : 1)
          if (profile.isCompact) {
            node.x = clamp(node.x + pushX * 2.15, 24, w - 24)
            node.y = clamp(node.y + pushY * 2.15, 24, h - 24)
          }
          node.halo = Math.min(1, node.halo + force * (profile.isCompact ? 0.44 : 0.2))
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
      const nextW = window.innerWidth
      const nextH = window.innerHeight
      const nextProfile = getPerformanceProfile()
      const compactChromeShift =
        nextProfile.isCompact &&
        profile.isCompact &&
        Math.abs(nextW - oldW) < 12 &&
        Math.abs(nextH - stableCompactHeight) < 160

      w = nextW
      if (compactChromeShift) {
        stableCompactHeight = Math.max(stableCompactHeight, nextH)
        h = stableCompactHeight
      } else {
        h = nextH
        stableCompactHeight = nextH
      }
      const profileChanged =
        nextProfile.isTouch !== profile.isTouch ||
        nextProfile.isCompact !== profile.isCompact ||
        nextProfile.isActualMobile !== profile.isActualMobile ||
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

      const connect = (a: number, b: number) => {
        if (a === undefined || b === undefined) return
        const key = a < b ? `${a}-${b}` : `${b}-${a}`
        if (!branchSet.has(key)) {
          branchSet.add(key)
          edges.push([a, b])
        }
      }

      const addNode = (x: number, y: number, depth: number) => {
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
          radius: rand(profile.isCompact ? 1.04 : 0.8, profile.isCompact ? 1.62 : 1.6),
          halo: 0,
          phase: Math.random() * Math.PI * 2,
          depth: depth + Math.random() * 0.05,
          driftRadius: rand(profile.isCompact ? 1.6 : 14, profile.isCompact ? 4.8 : 40) * (0.24 + depth * (profile.isCompact ? 0.22 : 0.55)),
          driftSpeed: rand(profile.isCompact ? 0.08 : 0.1, profile.isCompact ? 0.18 : 0.28),
          swirlSpeed: rand(profile.isCompact ? 0.05 : 0.06, profile.isCompact ? 0.14 : 0.2),
          jitter: rand(profile.isCompact ? 0.08 : 4, profile.isCompact ? 0.32 : 12),
        })

        return id
      }

      if (profile.isCompact) {
        const clusterCount = Math.max(4, Math.min(5, Math.round(w / 150)))
        const trunkSegments = Math.round(clamp(h / 116, 8, 10))
        const clusters: number[][] = []

        for (let c = 0; c < clusterCount; c++) {
          const cluster: number[] = []
          const lane = clusterCount === 1 ? 0.5 : c / (clusterCount - 1)
          const edgeBias = lane < 0.34 ? -1 : lane > 0.66 ? 1 : 0
          const baseX = clamp(
            w * (0.08 + lane * 0.84) + rand(-w * 0.035, w * 0.035),
            30,
            w - 30
          )
          const rootY = h * rand(0.03, 0.09)
          const lateralBias = edgeBias === 0
            ? rand(-0.18, 0.18)
            : rand(0.08, 0.24) * edgeBias
          let x = clamp(baseX, 34, w - 34)
          let y = rootY
          let previousId: number | undefined
          let branchBudget = Math.round(rand(1, 2.3))

          for (let i = 0; i < trunkSegments; i++) {
            const progress = i / Math.max(trunkSegments - 1, 1)
            if (i > 0) {
              x = clamp(
                x + rand(-22, 22) + lateralBias * (18 + progress * 26) + Math.sin(progress * Math.PI * 2 + c) * 8,
                30,
                w - 30
              )
              y = clamp(y + rand(h * 0.075, h * 0.115), 36, h - 40)
            }

            const trunkId = addNode(x, y, 0.12 + progress * 0.82)
            cluster.push(trunkId)
            if (previousId !== undefined) connect(previousId, trunkId)
            if (previousId !== undefined && i > 1 && Math.random() > 0.58) {
              connect(cluster[Math.max(0, cluster.length - 2 - Math.floor(Math.random() * 2))], trunkId)
            }
            previousId = trunkId

            const canBranch = i > 1 && i < trunkSegments - 1 && branchBudget > 0
            if (!canBranch || Math.random() > 0.46) continue

            branchBudget -= 1
            const branchDirection = edgeBias === 0
              ? (Math.random() > 0.5 ? 1 : -1)
              : (Math.random() > 0.2 ? edgeBias : -edgeBias)
            const branchSegments = Math.round(rand(2, 3.2))
            let branchParent = trunkId
            let bx = x
            let by = y

            for (let j = 0; j < branchSegments; j++) {
              bx = clamp(
                bx + branchDirection * rand(14, 24) + lateralBias * 8 + rand(-10, 10),
                28,
                w - 28
              )
              by = clamp(by + rand(h * 0.04, h * 0.075), 36, h - 36)
              const branchDepth = clamp(0.16 + (i + j + 1) / (trunkSegments + branchSegments), 0, 1)
              const branchId = addNode(bx, by, branchDepth)
              cluster.push(branchId)
              connect(branchParent, branchId)
              if (j > 0 && Math.random() > 0.62) connect(trunkId, branchId)
              branchParent = branchId
            }
          }

          clusters.push(cluster)
        }

        for (let i = 0; i < clusters.length - 1; i++) {
          const current = clusters[i]
          const next = clusters[i + 1]
          if (!current || !next) continue

          const bridges = Math.round(rand(1, 2.4))
          for (let b = 0; b < bridges; b++) {
            const from = current[Math.floor(rand(1, Math.max(2, current.length - 2)))]
            if (from === undefined) continue

            let bestTo: number | undefined
            let bestScore = Number.POSITIVE_INFINITY
            for (const candidate of next) {
              const score = Math.abs(nodes[from].y - nodes[candidate].y) + Math.abs(nodes[from].x - nodes[candidate].x) * 0.35
              if (score < bestScore) {
                bestScore = score
                bestTo = candidate
              }
            }

            if (bestTo !== undefined) connect(from, bestTo)
          }
        }

        return
      }

      const treeCount = Math.max(6, Math.round(w / 220))
      const perTree = Math.round(clamp(h / 90, 14, 30))
      const cols: number[][] = []

      for (let t = 0; t < treeCount; t++) {
        const col: number[] = []
        const baseX = ((t + 0.5) / treeCount) * w + rand(profile.isCompact ? -14 : -48, profile.isCompact ? 14 : 48)
        const swing = rand(profile.isCompact ? 8 : 18, profile.isCompact ? 15 : 32)
        const wobble = rand(profile.isCompact ? 0.75 : 0.8, profile.isCompact ? 1.2 : 1.8)

        for (let i = 0; i < perTree; i++) {
          const depth = i / Math.max(perTree - 1, 1)
          const sway = Math.sin(depth * Math.PI * wobble) * swing
          const x = clamp(baseX + sway + rand(profile.isCompact ? -8 : -12, profile.isCompact ? 8 : 12), 32, w - 32)
          const yStart = profile.isCompact ? 0.06 : 0.04
          const yRange = profile.isCompact ? 0.84 : 0.88
          const y = h * (yStart + depth * yRange) + rand(profile.isCompact ? -12 : -18, profile.isCompact ? 12 : 18)
          const id = addNode(x, y, depth)

          col.push(id)
          if (col.length > 1) connect(col[col.length - 2], id)
          if (col.length > 4 && Math.random() > (profile.isCompact ? 0.82 : 0.62)) {
            const span = Math.min(profile.isCompact ? 3 : 4, col.length - 2)
            connect(col[Math.max(0, col.length - 2 - Math.floor(Math.random() * span))], id)
          }
        }

        cols.push(col)
      }

      for (let t = 0; t < cols.length - 1; t++) {
        const cur = cols[t]
        const nxt = cols[t + 1]
        const pairs = Math.min(cur.length, nxt.length)
        const stride = profile.isCompact ? Math.max(3, Math.floor(pairs / 4)) : Math.max(2, Math.floor(pairs / 5))
        for (let i = stride; i < pairs; i += stride) {
          if (profile.isCompact && Math.random() > 0.45) continue
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
        for (let i = 0; i < Math.max(1, Math.floor(pairs / (profile.isCompact ? 12 : 6))); i++) {
          if (Math.random() > (profile.isCompact ? 0.18 : 0.45)) continue
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

      clickDistortion.strength *= profile.isCompact ? 0.79 : 0.95

      const pointerFactor = p.inViewport
        ? clamp(p.velocity / (profile.isCompact ? 260 : 180), profile.isCompact ? 0.03 : 0.08, profile.isCompact ? 0.44 : 0.92)
        : profile.isCompact ? 0.03 : 0.06
      const influenceR = p.inViewport
        ? (profile.isCompact ? 180 : 280) + p.velocity * (profile.isCompact ? 0.22 : 0.8)
        : profile.isCompact ? 118 : 170

      const spacing = profile.isCompact
        ? clamp(w / 22, 18, 22)
        : profile.useSimpleGrid
          ? clamp(w / 34, 22, 30)
          : clamp(w / 44, 26, 34)
      const gridDriftX = (time * (profile.isCompact ? 0.72 : 1.5)) % spacing
      const gridDriftY = (time * (profile.isCompact ? 0.62 : 1.3)) % spacing
      const gx = gyroRef.current.x
      const gy = gyroRef.current.y
      const hasGyro = Math.abs(gx) > 0.001 || Math.abs(gy) > 0.001
      const parallaxX = hasGyro ? gx * w * (profile.isCompact ? 0.04 : 0.08) : (p.inViewport && !profile.isLowPower ? (p.x - w / 2) * (profile.isCompact ? 0.05 : 0.1) : 0)
      const parallaxY = hasGyro ? gy * h * (profile.isCompact ? 0.03 : 0.06) : (p.inViewport && !profile.isLowPower ? (p.y - h / 2) * (profile.isCompact ? 0.05 : 0.1) : 0)
      const offX = (gridDriftX + parallaxX) % spacing
      const offY = (gridDriftY + parallaxY) % spacing
      const gravR = p.inViewport && !profile.isLowPower ? (profile.isCompact ? 150 : 320) + p.velocity * (profile.isCompact ? 0.1 : 0.6) : 0
      const gravRSq = gravR * gravR || 1
      const clickStrengthBase = profile.isCompact ? 0.98 : 0.8
      const clickR = clickDistortion.strength > 0.01 ? (profile.isCompact ? 150 : 300) * clickDistortion.strength : 0
      const clickGridForce = profile.isCompact ? 34 : 30
      const clickAlphaBoost = profile.isCompact ? 0.43 : 0.3
      const detailStep = profile.isActualMobile ? spacing * 0.82 : spacing / 2

      ctx.save()
      ctx.globalAlpha = profile.useSimpleGrid ? (profile.isCompact ? 0.74 : 0.72) : 0.9

      if (profile.useSimpleGrid) {
        const simpleStep = spacing
        const drawSimpleGridLine = (isVertical: boolean, base: number) => {
          const steps = Math.ceil(((isVertical ? h : w) + spacing * 2) / simpleStep)
          for (let s = 0; s <= steps; s++) {
            let drawX = isVertical ? base : -spacing + s * simpleStep + offX
            let drawY = isVertical ? -spacing + s * simpleStep + offY : base

            if (clickR > 0) {
              const cdx = drawX - clickDistortion.x
              const cdy = drawY - clickDistortion.y
              const cdist = Math.hypot(cdx, cdy) || 1
              if (cdist < clickR) {
                const pushForce = (1 - cdist / clickR) * clickDistortion.strength * clickGridForce
                drawX += (cdx / cdist) * pushForce
                drawY += (cdy / cdist) * pushForce
              }
            }

            if (s === 0) ctx.moveTo(drawX, drawY)
            else ctx.lineTo(drawX, drawY)
          }
        }

        ctx.beginPath()
        for (let x = -spacing; x < w + spacing; x += spacing) {
          drawSimpleGridLine(true, x + offX)
        }
        for (let y = -spacing; y < h + spacing; y += spacing) {
          drawSimpleGridLine(false, y + offY)
        }

        ctx.strokeStyle = `hsla(186, 100%, 56%, ${profile.isCompact ? 0.12 : 0.09})`
        ctx.lineWidth = profile.isCompact ? 0.82 : 0.82
        ctx.stroke()

        if (!profile.isCompact) {
          const majorSpacing = spacing * 5
          ctx.beginPath()
          for (let x = -majorSpacing; x < w + majorSpacing; x += majorSpacing) {
            const bx = x + offX
            ctx.moveTo(bx, -majorSpacing + offY)
            ctx.lineTo(bx, h + majorSpacing + offY)
          }
          for (let y = -majorSpacing; y < h + majorSpacing; y += majorSpacing) {
            const by = y + offY
            ctx.moveTo(-majorSpacing + offX, by)
            ctx.lineTo(w + majorSpacing + offX, by)
          }

          ctx.strokeStyle = 'hsla(191, 100%, 72%, 0.12)'
          ctx.lineWidth = 1
          ctx.stroke()
        }

        if (clickR > 0 && !profile.isCompact) {
          const pulseProgress = 1 - clamp(clickDistortion.strength / clickStrengthBase, 0, 1)
          const pulseRadius = (profile.isCompact ? 28 : 44) + pulseProgress * (profile.isCompact ? 132 : 188)
          const pulse = ctx.createRadialGradient(
            clickDistortion.x,
            clickDistortion.y,
            0,
            clickDistortion.x,
            clickDistortion.y,
            pulseRadius
          )
          pulse.addColorStop(0, `hsla(184, 100%, 68%, ${clickDistortion.strength * 0.24})`)
          pulse.addColorStop(0.58, `hsla(212, 100%, 62%, ${clickDistortion.strength * 0.12})`)
          pulse.addColorStop(1, 'rgba(0, 0, 0, 0)')
          ctx.fillStyle = pulse
          ctx.beginPath()
          ctx.arc(clickDistortion.x, clickDistortion.y, pulseRadius, 0, Math.PI * 2)
          ctx.fill()

          ctx.strokeStyle = `hsla(188, 100%, 74%, ${clickDistortion.strength * 0.42})`
          ctx.lineWidth = profile.isCompact ? 1.1 : 1.2
          ctx.beginPath()
          ctx.arc(clickDistortion.x, clickDistortion.y, pulseRadius * 0.82, 0, Math.PI * 2)
          ctx.stroke()
        }
      } else {
        for (let x = -spacing; x < w + spacing; x += spacing) {
          const bx = x + offX
          const hue = 180 + (p.inViewport ? clamp(1 - Math.abs(p.x - bx) / 420, 0, 1) * 30 : 0)
          let alpha = 0.1 + pointerFactor * 0.2 + (p.inViewport ? clamp(1 - Math.abs(p.x - bx) / 360, 0, 1) * 0.2 : 0)

          if (clickR > 0) {
            const distToClick = Math.abs(clickDistortion.x - bx)
            if (distToClick < clickR) {
              alpha += (1 - distToClick / clickR) * clickDistortion.strength * clickAlphaBoost
            }
          }

          ctx.strokeStyle = `hsla(${hue}, 100%, 50%, ${alpha})`
          ctx.lineWidth = 0.8
          ctx.beginPath()
          const step = detailStep
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
                const pushForce = (1 - cdist / clickR) * clickDistortion.strength * clickGridForce
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
              alpha += (1 - distToClick / clickR) * clickDistortion.strength * clickAlphaBoost
            }
          }

          ctx.strokeStyle = `hsla(${hue}, 100%, 50%, ${alpha})`
          ctx.lineWidth = 0.78
          ctx.beginPath()
          const step = detailStep
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
                const pushForce = (1 - cdist / clickR) * clickDistortion.strength * clickGridForce
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

        node.vx += (node.baseX - node.x) * (profile.isCompact ? 0.0105 : 0.016) + Math.sin(time * 1.2 + node.phase) * (profile.isCompact ? 0.018 : 0.45)
        node.vy += (node.baseY - node.y) * (profile.isCompact ? 0.0092 : 0.014) + Math.cos(time * 1 + node.phase) * (profile.isCompact ? 0.018 : 0.45)

        if (p.inViewport && !profile.isLowPower) {
          const ddx = p.x - node.x
          const ddy = p.y - node.y
          const dist = Math.hypot(ddx, ddy) || 0.001
          if (dist < influenceR) {
            const force = (1 - dist / influenceR) * (profile.isCompact ? 0.19 + pointerFactor * 0.34 : 0.7 + pointerFactor * 1.2)
            node.vx -= (ddx / dist) * force
            node.vy -= (ddy / dist) * force
            node.halo = Math.min(1, node.halo + force * (profile.isCompact ? 0.22 : 0.45) + pointerFactor * (profile.isCompact ? 0.1 : 0.32))
          }
        }

        // Gyroscope-driven drift: tilt phone to gently nudge nodes
        if (hasGyro) {
          node.vx += gx * (profile.isCompact ? 0.09 : 0.25)
          node.vy += gy * (profile.isCompact ? 0.07 : 0.18)
        }

        node.vx *= profile.isCompact ? 0.84 : 0.9
        node.vy *= profile.isCompact ? 0.84 : 0.9
        node.x += node.vx
        node.y += node.vy
        node.x = clamp(node.x, 24, w - 24)
        node.y = clamp(node.y, 24, h - 24)
      })

      edges.forEach(([a, b]) => {
        const from = nodes[a]
        const to = nodes[b]
        if (!from || !to) return
        const highlight = Math.max(from.halo, to.halo) * (profile.isLowPower ? 0.6 : profile.isCompact ? 0.56 : 0.82)
        const hue = 180 + highlight * 60
        const alpha = profile.isLowPower ? 0.18 : profile.isCompact ? 0.1 + highlight * 0.22 : 0.14 + highlight * 0.35
        ctx.strokeStyle = `hsla(${hue}, 100%, ${profile.isCompact ? 62 + highlight * 8 : 50 + highlight * 15}%, ${alpha})`
        ctx.lineWidth = profile.isLowPower ? 0.7 : profile.isCompact ? 0.46 + highlight * 0.58 : 0.5 + highlight * 1.2
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.stroke()
      })

      nodes.forEach(node => {
        const r = node.radius * (0.78 + node.depth * 0.26)
        const nodeHue = 180 + node.halo * 60

        if (profile.isLowPower) {
          const glowRadius = r * 2.1
          ctx.fillStyle = `hsla(${nodeHue}, 100%, 58%, ${0.16 + node.halo * 0.14})`
          ctx.beginPath()
          ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2)
          ctx.fill()

          ctx.fillStyle = `hsla(${nodeHue}, 100%, 64%, ${0.72 + node.halo * 0.14})`
          ctx.beginPath()
          ctx.arc(node.x, node.y, r * 1.35, 0, Math.PI * 2)
          ctx.fill()
        } else if (profile.isActualMobile) {
          const glowRadius = r * (2 + node.halo * 1.2)
          ctx.fillStyle = `hsla(${nodeHue}, 100%, 58%, ${0.18 + node.halo * 0.12})`
          ctx.beginPath()
          ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2)
          ctx.fill()

          ctx.fillStyle = `hsla(${nodeHue}, 100%, 68%, ${0.68 + node.halo * 0.12})`
          ctx.beginPath()
          ctx.arc(node.x, node.y, r * 1.05, 0, Math.PI * 2)
          ctx.fill()

          ctx.strokeStyle = `hsla(${nodeHue}, 100%, 78%, ${0.09 + node.halo * 0.08})`
          ctx.lineWidth = 0.34
          ctx.beginPath()
          ctx.arc(node.x, node.y, r + 1 + node.halo * 1.5, 0, Math.PI * 2)
          ctx.stroke()
        } else {
          const gR = r * (profile.isCompact ? 1.7 + node.halo * 1.8 : 1.9 + node.halo * 2.6)
          const g = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, gR)
          g.addColorStop(0, `hsla(${nodeHue}, 100%, 62%, ${profile.isCompact ? 0.24 + node.halo * 0.12 : 0.3 + node.halo * 0.2})`)
          g.addColorStop(0.65, `hsla(${nodeHue}, 100%, 52%, ${profile.isCompact ? 0.16 + node.halo * 0.1 : 0.2 + node.halo * 0.18})`)
          g.addColorStop(1, 'rgba(0,10,20,0)')
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(node.x, node.y, gR, 0, Math.PI * 2)
          ctx.fill()

          ctx.fillStyle = `hsla(${nodeHue}, 100%, ${profile.isCompact ? 70 : 60}%, ${profile.isCompact ? 0.62 + node.halo * 0.14 : 0.6 + node.halo * 0.2})`
          ctx.beginPath()
          ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
          ctx.fill()

          ctx.strokeStyle = `hsla(${nodeHue}, 100%, 76%, ${profile.isCompact ? 0.12 + node.halo * 0.1 : 0.18 + node.halo * 0.25})`
          ctx.lineWidth = profile.isCompact ? 0.38 : 0.45
          ctx.beginPath()
          ctx.arc(node.x, node.y, r + (profile.isCompact ? 1.2 : 1.6) + node.halo * (profile.isCompact ? 1.9 : 3.4), 0, Math.PI * 2)
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
      pointer.current.velocity = Math.max(pointer.current.velocity, profile.isCompact ? 260 : 120)
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
