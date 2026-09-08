/**
 * The page background: a drifting grid with a tree-shaped node graph on top.
 *
 * Written against the Canvas2D API alone so the identical code runs on the
 * main thread or inside a worker on an OffscreenCanvas. Everything that needs
 * `window` (device profile, sizing, input) lives in Background.tsx and arrives
 * here as plain values, see protocol.ts.
 */
import { sameProfile, type PerformanceProfile } from './profile.ts'
import type { BackgroundMessage } from './protocol.ts'

export type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** The slice of a canvas the renderer touches: an HTMLCanvasElement or an OffscreenCanvas. */
export interface RendererCanvas {
  width: number
  height: number
  getContext(contextId: '2d', options?: CanvasRenderingContext2DSettings): Canvas2D | null
}

/** Frame scheduling and time source, injectable so tests can step frames by hand. */
export interface FrameClock {
  now(): number
  request(callback: (time: number) => void): number
  cancel(id: number): void
}

export interface RendererOptions {
  reducedMotion: boolean
  clock?: FrameClock
}

export interface Node {
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

export interface BackgroundRenderer {
  resize(width: number, height: number, profile: PerformanceProfile): void
  setPointer(x: number, y: number): void
  pointerLeave(): void
  interact(x: number, y: number): void
  endInteraction(): void
  setGyro(x: number, y: number): void
  setScrollProgress(progress: number): void
  /** While true the simulation keeps running but nothing is painted. */
  setCovered(covered: boolean): void
  setHidden(hidden: boolean): void
  /** Film-grain tile rasterised at `scale` device pixels per CSS pixel. */
  setNoise(tile: CanvasImageSource | null, scale: number): void
  /** Test hook: the live graph. */
  inspect(): { nodes: readonly Node[]; edges: readonly [number, number][] }
  dispose(): void
}

const TAU = Math.PI * 2
/**
 * Halo fades by a constant factor each frame and would never reach zero on
 * its own. Below this it is invisible (under 1/255 of any colour or 0.01px of
 * any radius), so it snaps to exactly zero and the node joins the idle batch.
 */
const HALO_FLOOR = 0.001

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)
const rand = (min: number, max: number) => Math.random() * (max - min) + min

const defaultClock: FrameClock = {
  now: () => performance.now(),
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
}

export function createBackgroundRenderer(canvas: RendererCanvas, options: RendererOptions): BackgroundRenderer | null {
  // Every frame paints the full viewport with an opaque gradient, so an
  // alpha channel only adds compositing work without affecting the result.
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return null
  const clock = options.clock ?? defaultClock

  let w = 0
  let h = 0
  let profile: PerformanceProfile | null = null
  let dpr = 1
  let bgGradient: CanvasGradient | string = '#000000'
  let noisePattern: CanvasPattern | null = null
  const nodes: Node[] = []
  const edges: [number, number][] = []

  const buildBgGradient = () => {
    const grad = ctx.createLinearGradient(0, 0, w, h)
    grad.addColorStop(0, '#000000')
    grad.addColorStop(0.4, '#000508')
    grad.addColorStop(0.75, '#000204')
    grad.addColorStop(1, '#000000')
    bgGradient = grad
  }

  const resizeCanvas = () => {
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    buildBgGradient()
  }

  const installNoise = (tile: CanvasImageSource | null, scale: number) => {
    noisePattern = tile ? ctx.createPattern(tile, 'repeat') : null
    // The tile holds `scale` device pixels per CSS pixel; undo that so it
    // repeats every 256 CSS pixels, exactly like the CSS layer it replaces.
    noisePattern?.setTransform({ a: 1 / scale, b: 0, c: 0, d: 1 / scale, e: 0, f: 0 })
  }

  // The old CSS layer blended the grain over the canvas with `overlay` at the
  // profile's opacity. Same blend, same alpha, now as the frame's last stroke.
  const paintNoise = () => {
    if (!noisePattern || !profile) return
    ctx.save()
    ctx.globalCompositeOperation = 'overlay'
    ctx.globalAlpha = profile.noiseAlpha
    ctx.fillStyle = noisePattern
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }

  const inspect = () => ({ nodes, edges })

  if (options.reducedMotion) {
    // Reduced motion never animated: an opaque black canvas under the grain.
    const paintStatic = () => {
      if (!profile) return
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, w, h)
      paintNoise()
    }
    const noop = () => {}
    return {
      resize(width, height, next) {
        w = width
        h = height
        profile = next
        dpr = next.dpr
        resizeCanvas()
        paintStatic()
      },
      setNoise(tile, scale) {
        installNoise(tile, scale)
        paintStatic()
      },
      setPointer: noop,
      pointerLeave: noop,
      interact: noop,
      endInteraction: noop,
      setGyro: noop,
      setScrollProgress: noop,
      setCovered: noop,
      setHidden: noop,
      inspect,
      dispose: noop,
    }
  }

  let frameId = 0
  let covered = false
  let hidden = false
  let disposed = false
  let initialized = false
  let scrollProgress = 0
  const gyro = { x: 0, y: 0 }
  const pointer = { x: 0, y: 0, inViewport: false, velocity: 0, boostUntil: 0 }
  const lastPointer = { x: 0, y: 0 }
  const clickDistortion = { x: 0, y: 0, strength: 0 }
  const lastInteraction = { x: 0, y: 0, time: 0 }
  let interactionBurstEnd = 0
  let lastFrameTime = 0
  let lastDecayTime = 0
  let frameInterval = 0
  // Per-frame scratch, reused so the hot loop allocates nothing.
  let expRows = new Float64Array(0)
  let expCols = new Float64Array(0)
  const farLines: number[] = []
  const idleNodes: Node[] = []
  const litNodes: Node[] = []
  const pt = { x: 0, y: 0 }

  const spawnClickEffect = (cx: number, cy: number) => {
    if (!profile) return
    clickDistortion.x = cx
    clickDistortion.y = cy
    clickDistortion.strength = profile.isCompact ? 1.04 : 0.8
    const clickRadius = profile.isCompact ? 176 : 200
    const clickForce = profile.isCompact ? 5.8 : 3
    const touchedNodeIds = new Set<number>()
    const compact = profile.isCompact

    const applyImpulseToNode = (node: Node, strength: number, ddx: number, ddy: number, dist: number) => {
      let unitX = ddx / dist
      let unitY = ddy / dist

      if (Math.abs(ddx) + Math.abs(ddy) < 0.5) {
        const angle = Math.random() * Math.PI * 2
        unitX = Math.cos(angle)
        unitY = Math.sin(angle)
      }

      node.vx += unitX * strength * (compact ? 1.7 : 1)
      node.vy += unitY * strength * (compact ? 1.7 : 1)
      if (compact) {
        node.x = clamp(node.x + unitX * strength * 2.15, 24, w - 24)
        node.y = clamp(node.y + unitY * strength * 2.15, 24, h - 24)
      }
      node.halo = Math.min(1, node.halo + strength * (compact ? 0.44 : 0.2))
      touchedNodeIds.add(node.id)
    }

    nodes.forEach(node => {
      const ddx = node.x - cx
      const ddy = node.y - cy
      const dist = Math.hypot(ddx, ddy) || 1
      if (dist < clickRadius) {
        const force = (1 - dist / clickRadius) * clickForce
        applyImpulseToNode(node, force, ddx, ddy, dist)
      }
    })

    if (profile.isActualMobile && touchedNodeIds.size < 7) {
      const fallbackRadius = clickRadius * 1.9
      const nearestNodes = nodes
        .map(node => {
          const ddx = node.x - cx
          const ddy = node.y - cy
          return { node, ddx, ddy, dist: Math.hypot(ddx, ddy) || 1 }
        })
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 8)

      nearestNodes.forEach(({ node, ddx, ddy, dist }) => {
        if (touchedNodeIds.has(node.id) || dist > fallbackRadius) return
        const force = Math.max(0.55, (1 - dist / fallbackRadius) * clickForce * 0.88)
        applyImpulseToNode(node, force, ddx, ddy, dist)
      })
    }
  }

  const initNodes = () => {
    if (!profile) return
    const p = profile
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
        radius: rand(p.isCompact ? 1.04 : 0.8, p.isCompact ? 1.62 : 1.6),
        halo: 0,
        phase: Math.random() * Math.PI * 2,
        depth: depth + Math.random() * 0.05,
        driftRadius: rand(p.isActualMobile ? 28 : p.isCompact ? 1.6 : 14, p.isActualMobile ? 64 : p.isCompact ? 4.8 : 40) * (0.24 + depth * (p.isCompact ? 0.42 : 0.55)),
        driftSpeed: rand(p.isActualMobile ? 0.28 : p.isCompact ? 0.08 : 0.1, p.isActualMobile ? 0.54 : p.isCompact ? 0.18 : 0.28),
        swirlSpeed: rand(p.isActualMobile ? 0.22 : p.isCompact ? 0.05 : 0.06, p.isActualMobile ? 0.46 : p.isCompact ? 0.14 : 0.2),
        jitter: rand(p.isActualMobile ? 3.5 : p.isCompact ? 0.08 : 4, p.isActualMobile ? 9 : p.isCompact ? 0.32 : 12),
      })

      return id
    }

    if (p.isCompact) {
      const clusterCount = p.isActualMobile ? 4 : Math.max(4, Math.min(5, Math.round(w / 150)))
      const trunkSegments = p.isActualMobile
        ? Math.round(clamp(h / 124, 9, 11))
        : Math.round(clamp(h / 116, 8, 10))
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
        const rootY = h * rand(0.03, p.isActualMobile ? 0.07 : 0.09)
        const lateralBias = edgeBias === 0
          ? rand(-0.18, 0.18)
          : rand(0.08, 0.24) * edgeBias
        let x = clamp(baseX, 34, w - 34)
        let y = rootY
        let previousId: number | undefined
        let branchBudget = Math.round(rand(1, p.isActualMobile ? 1.8 : 2.3))

        for (let i = 0; i < trunkSegments; i++) {
          const progress = i / Math.max(trunkSegments - 1, 1)
          if (i > 0) {
            x = clamp(
              x + rand(p.isActualMobile ? -34 : -22, p.isActualMobile ? 34 : 22) + lateralBias * (18 + progress * 26) + Math.sin(progress * Math.PI * 2 + c) * (p.isActualMobile ? 14 : 8),
              30,
              w - 30
            )
            y = clamp(
              y + rand(
                h * (p.isActualMobile ? 0.082 : 0.075),
                h * (p.isActualMobile ? 0.12 : 0.115)
              ) + rand(p.isActualMobile ? -8 : 0, p.isActualMobile ? 8 : 0),
              36,
              h - 40
            )
          }

          const trunkId = addNode(x, y, 0.12 + progress * 0.82)
          cluster.push(trunkId)
          if (previousId !== undefined) connect(previousId, trunkId)
          if (previousId !== undefined && i > 1 && Math.random() > 0.58) {
            connect(cluster[Math.max(0, cluster.length - 2 - Math.floor(Math.random() * 2))], trunkId)
          }
          previousId = trunkId

          const canBranch = i > 1 && i < trunkSegments - 1 && branchBudget > 0
          if (!canBranch || Math.random() > (p.isActualMobile ? 0.58 : 0.46)) continue

          branchBudget -= 1
          const branchDirection = edgeBias === 0
            ? (Math.random() > 0.5 ? 1 : -1)
            : (Math.random() > 0.2 ? edgeBias : -edgeBias)
          const branchSegments = Math.round(rand(2, p.isActualMobile ? 2.8 : 3.2))
          let branchParent = trunkId
          let bx = x
          let by = y

          for (let j = 0; j < branchSegments; j++) {
            bx = clamp(
              bx + branchDirection * rand(14, 24) + lateralBias * 8 + rand(-10, 10),
              28,
              w - 28
            )
            by = clamp(
              by + rand(
                h * (p.isActualMobile ? 0.045 : 0.04),
                h * (p.isActualMobile ? 0.082 : 0.075)
              ),
              36,
              h - 36
            )
            const branchDepth = clamp(0.16 + (i + j + 1) / (trunkSegments + branchSegments), 0, 1)
            const branchId = addNode(bx, by, branchDepth)
            cluster.push(branchId)
            connect(branchParent, branchId)
            if (j > 0 && Math.random() > 0.62) connect(trunkId, branchId)
            branchParent = branchId
          }
        }

        if (p.isActualMobile && previousId !== undefined && y < h * 0.86) {
          let tailParent = previousId
          let tailX = x
          let tailY = y

          while (tailY < h * 0.9) {
            tailX = clamp(tailX + rand(-16, 16) + lateralBias * 14, 30, w - 30)
            tailY = clamp(tailY + rand(h * 0.08, h * 0.115), 36, h - 34)
            const tailDepth = clamp(0.72 + (tailY / h) * 0.3, 0, 1)
            const tailId = addNode(tailX, tailY, tailDepth)
            cluster.push(tailId)
            connect(tailParent, tailId)
            if (Math.random() > 0.58) {
              connect(cluster[Math.max(0, cluster.length - 3)], tailId)
            }
            tailParent = tailId
          }
        }

        clusters.push(cluster)
      }

      for (let i = 0; i < clusters.length - 1; i++) {
        const current = clusters[i]
        const next = clusters[i + 1]
        if (!current || !next) continue

        const bridges = Math.round(rand(1, p.isActualMobile ? 1.6 : 2.4))
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
      const baseX = ((t + 0.5) / treeCount) * w + rand(p.isCompact ? -14 : -48, p.isCompact ? 14 : 48)
      const swing = rand(p.isCompact ? 8 : 18, p.isCompact ? 15 : 32)
      const wobble = rand(p.isCompact ? 0.75 : 0.8, p.isCompact ? 1.2 : 1.8)

      for (let i = 0; i < perTree; i++) {
        const depth = i / Math.max(perTree - 1, 1)
        const sway = Math.sin(depth * Math.PI * wobble) * swing
        const x = clamp(baseX + sway + rand(p.isCompact ? -8 : -12, p.isCompact ? 8 : 12), 32, w - 32)
        const yStart = p.isCompact ? 0.06 : 0.04
        const yRange = p.isCompact ? 0.84 : 0.88
        const y = h * (yStart + depth * yRange) + rand(p.isCompact ? -12 : -18, p.isCompact ? 12 : 18)
        const id = addNode(x, y, depth)

        col.push(id)
        if (col.length > 1) connect(col[col.length - 2], id)
        if (col.length > 4 && Math.random() > (p.isCompact ? 0.82 : 0.62)) {
          const span = Math.min(p.isCompact ? 3 : 4, col.length - 2)
          connect(col[Math.max(0, col.length - 2 - Math.floor(Math.random() * span))], id)
        }
      }

      cols.push(col)
    }

    for (let t = 0; t < cols.length - 1; t++) {
      const cur = cols[t]
      const nxt = cols[t + 1]
      const pairs = Math.min(cur.length, nxt.length)
      const stride = p.isCompact ? Math.max(3, Math.floor(pairs / 4)) : Math.max(2, Math.floor(pairs / 5))
      for (let i = stride; i < pairs; i += stride) {
        if (p.isCompact && Math.random() > 0.45) continue
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
      for (let i = 0; i < Math.max(1, Math.floor(pairs / (p.isCompact ? 12 : 6))); i++) {
        if (Math.random() > (p.isCompact ? 0.18 : 0.45)) continue
        connect(cur[Math.floor(Math.random() * pairs)], far[Math.floor(Math.random() * pairs)])
      }
    }
  }

  const nodeRadius = (node: Node) => node.radius * (0.78 + node.depth * 0.26)

  const drawFrame = (now: number) => {
    if (!profile) return
    const time = now * 0.0012
    // Scroll-linked hue drift: the whole field shifts cyan → magenta as you
    // travel down the page, tying the sections together.
    const hueShift = scrollProgress * 150
    const p = pointer
    const boostRemaining = Math.max(0, p.boostUntil - now)
    const boostProgress = boostRemaining > 0 ? clamp(boostRemaining / 220, 0, 1) : 0
    const pointerEngaged = p.inViewport || boostRemaining > 0
    const dx = p.x - lastPointer.x
    const dy = p.y - lastPointer.y
    p.velocity = 0.18 * Math.hypot(dx, dy) + 0.82 * p.velocity
    lastPointer.x = p.x
    lastPointer.y = p.y

    // Decay factors are tuned for 60fps frames; on throttled profiles (low
    // power / low-perf devices) frames are skipped, so normalize by elapsed
    // time or click ripples and halos linger far longer than intended.
    const decayDt = lastDecayTime === 0 ? 1 : clamp((now - lastDecayTime) / 16.67, 0.25, 4)
    lastDecayTime = now

    clickDistortion.strength *= Math.pow(profile.isCompact ? 0.87 : 0.95, decayDt)

    const pointerFactor = pointerEngaged
      ? clamp(
          p.velocity / (profile.isCompact ? 260 : 180) + boostProgress * (profile.isActualMobile ? 0.38 : 0),
          profile.isCompact ? 0.03 : 0.08,
          profile.isCompact ? 0.44 : 0.92
        )
      : profile.isCompact ? 0.03 : 0.06
    const influenceR = pointerEngaged
      ? (profile.isCompact ? 180 : 280) + p.velocity * (profile.isCompact ? 0.22 : 0.8) + boostProgress * (profile.isActualMobile ? 28 : 0)
      : profile.isCompact ? 118 : 170
    const gx = gyro.x
    const gy = gyro.y
    const hasGyro = Math.abs(gx) > 0.001 || Math.abs(gy) > 0.001

    // ---- Simulation. Runs every frame, painted or not, so the graph is in
    // exactly the state it would have reached when the canvas is uncovered.
    const haloDecay = Math.pow(0.92, decayDt)
    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
      const node = nodes[nodeIndex]
      node.halo *= haloDecay
      if (node.halo < HALO_FLOOR) node.halo = 0
      const driftX = Math.sin(time * node.driftSpeed + node.phase) * node.driftRadius
      const driftY = Math.cos(time * node.swirlSpeed + node.phase * 1.2) * node.driftRadius * 0.6
      const jX = Math.sin(time * 0.6 + node.phase * 1.7) * node.jitter
      const jY = Math.cos(time * 0.5 + node.phase * 1.3) * node.jitter
      node.baseX = clamp(node.anchorX + driftX + jX, 36, w - 36)
      node.baseY = clamp(node.anchorY + driftY + jY, 36, h - 36)

      node.vx += (node.baseX - node.x) * (profile.isCompact ? 0.019 : 0.016) + Math.sin(time * 1.2 + node.phase) * (profile.isActualMobile ? 0.22 : profile.isCompact ? 0.018 : 0.45)
      node.vy += (node.baseY - node.y) * (profile.isCompact ? 0.016 : 0.014) + Math.cos(time * 1 + node.phase) * (profile.isActualMobile ? 0.22 : profile.isCompact ? 0.018 : 0.45)

      if (pointerEngaged && !profile.isLowPower) {
        const ddx = p.x - node.x
        const ddy = p.y - node.y
        const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 0.001
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

      node.vx *= profile.isCompact ? 0.89 : 0.9
      node.vy *= profile.isCompact ? 0.89 : 0.9
      node.x += node.vx
      node.y += node.vy
      node.x = clamp(node.x, 24, w - 24)
      node.y = clamp(node.y, 24, h - 24)
    }

    if (covered) return

    // ---- Paint.
    ctx.fillStyle = bgGradient
    ctx.fillRect(0, 0, w, h)

    const spacing = profile.isCompact
      ? clamp(w / 22, 18, 22)
      : profile.useSimpleGrid
        ? clamp(w / 34, 22, 30)
        : clamp(w / 44, 26, 34)
    const gridDriftX = (time * (profile.isCompact ? 0.72 : 1.5)) % spacing
    const gridDriftY = (time * (profile.isCompact ? 0.62 : 1.3)) % spacing
    const parallaxX = hasGyro ? gx * w * (profile.isCompact ? 0.04 : 0.08) : (pointerEngaged && !profile.isLowPower ? (p.x - w / 2) * (profile.isCompact ? 0.05 : 0.1) : 0)
    const parallaxY = hasGyro ? gy * h * (profile.isCompact ? 0.03 : 0.06) : (pointerEngaged && !profile.isLowPower ? (p.y - h / 2) * (profile.isCompact ? 0.05 : 0.1) : 0)
    const offX = (gridDriftX + parallaxX) % spacing
    const offY = (gridDriftY + parallaxY) % spacing
    const gravR = pointerEngaged && !profile.isLowPower ? (profile.isCompact ? 150 : 320) + p.velocity * (profile.isCompact ? 0.1 : 0.6) : 0
    const gravRSq = gravR * gravR || 1
    const clickStrengthBase = profile.isCompact ? 0.98 : 0.8
    const clickR = clickDistortion.strength > 0.01 ? (profile.isCompact ? 210 : 300) * clickDistortion.strength : 0
    const clickGridForce = profile.isCompact ? 34 : 30
    const clickAlphaBoost = profile.isCompact ? 0.43 : 0.3
    const detailStep = profile.isActualMobile ? spacing * 0.82 : spacing / 2

    // Push a grid vertex out of the click ripple. Anything outside the
    // ripple's bounding square is outside the ripple, so most vertices skip
    // the square root entirely.
    const pushFromClick = (x: number, y: number) => {
      pt.x = x
      pt.y = y
      const cdx = x - clickDistortion.x
      const cdy = y - clickDistortion.y
      if (cdx >= clickR || cdx <= -clickR || cdy >= clickR || cdy <= -clickR) return
      const cdist = Math.sqrt(cdx * cdx + cdy * cdy) || 1
      if (cdist < clickR) {
        const pushForce = (1 - cdist / clickR) * clickDistortion.strength * clickGridForce
        pt.x += (cdx / cdist) * pushForce
        pt.y += (cdy / cdist) * pushForce
      }
    }

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
            pushFromClick(drawX, drawY)
            drawX = pt.x
            drawY = pt.y
          }

          if (s === 0) ctx.moveTo(drawX, drawY)
          else ctx.lineTo(drawX, drawY)
        }
      }

      const hasClick = clickR > 0 && profile.isCompact

      if (hasClick) {
        for (let x = -spacing; x < w + spacing; x += spacing) {
          const bx = x + offX
          let alpha = 0.12
          let hue = 186 + hueShift
          let lw = 0.82
          const distToClick = Math.abs(clickDistortion.x - bx)
          if (distToClick < clickR) {
            const proximity = 1 - distToClick / clickR
            alpha += proximity * clickDistortion.strength * 0.5
            hue = 186 + proximity * clickDistortion.strength * 50
            lw += proximity * clickDistortion.strength * 0.4
          }
          ctx.beginPath()
          drawSimpleGridLine(true, bx)
          ctx.strokeStyle = `hsla(${hue}, 100%, 56%, ${alpha})`
          ctx.lineWidth = lw
          ctx.stroke()
        }
        for (let y = -spacing; y < h + spacing; y += spacing) {
          const by = y + offY
          let alpha = 0.12
          let hue = 186 + hueShift
          let lw = 0.82
          const distToClick = Math.abs(clickDistortion.y - by)
          if (distToClick < clickR) {
            const proximity = 1 - distToClick / clickR
            alpha += proximity * clickDistortion.strength * 0.5
            hue = 186 + proximity * clickDistortion.strength * 50
            lw += proximity * clickDistortion.strength * 0.4
          }
          ctx.beginPath()
          drawSimpleGridLine(false, by)
          ctx.strokeStyle = `hsla(${hue}, 100%, 56%, ${alpha})`
          ctx.lineWidth = lw
          ctx.stroke()
        }
      } else {
        ctx.beginPath()
        for (let x = -spacing; x < w + spacing; x += spacing) {
          drawSimpleGridLine(true, x + offX)
        }
        for (let y = -spacing; y < h + spacing; y += spacing) {
          drawSimpleGridLine(false, y + offY)
        }
        ctx.strokeStyle = `hsla(${186 + hueShift}, 100%, 56%, ${profile.isCompact ? 0.12 : 0.09})`
        ctx.lineWidth = 0.82
        ctx.stroke()
      }

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
        const pulseRadius = 44 + pulseProgress * 188
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
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.arc(clickDistortion.x, clickDistortion.y, pulseRadius * 0.82, 0, Math.PI * 2)
        ctx.stroke()
      }
    } else {
      // Lines the pointer does not tint share one colour, and while nothing
      // bends them they are straight, so they are traced into a single path
      // and stroked once. Parallel lines never cross, so one stroke composites
      // exactly like one stroke per line. Lines near the pointer or a click
      // keep their own colour and their own stroke.
      const baseHueV = 180 + hueShift
      const baseAlphaV = 0.1 + pointerFactor * 0.2
      const baseHueH = 180 + hueShift
      const baseAlphaH = 0.08 + pointerFactor * 0.18
      const straight = !pointerEngaged && clickR <= 0
      const vSteps = Math.ceil((h + spacing * 2) / detailStep)
      const hSteps = Math.ceil((w + spacing * 2) / detailStep)

      if (pointerEngaged) {
        // The pull is a Gaussian of the distance to the pointer, and
        // exp(-(dx² + dy²) / r²) = exp(-dx² / r²) · exp(-dy² / r²). Every
        // vertical line shares the same rows and every horizontal line the
        // same columns, so each factor is evaluated once per row or column
        // instead of once per vertex.
        if (expRows.length < vSteps + 1) expRows = new Float64Array(vSteps + 1)
        if (expCols.length < hSteps + 1) expCols = new Float64Array(hSteps + 1)
        for (let s = 0; s <= vSteps; s++) {
          const ddy = p.y - (-spacing + s * detailStep + offY)
          expRows[s] = Math.exp(-(ddy * ddy) / gravRSq)
        }
        for (let s = 0; s <= hSteps; s++) {
          const ddx = p.x - (-spacing + s * detailStep + offX)
          expCols[s] = Math.exp(-(ddx * ddx) / gravRSq)
        }
      }

      const traceVertical = (bx: number) => {
        if (straight) {
          ctx.moveTo(bx, -spacing + offY)
          ctx.lineTo(bx, -spacing + vSteps * detailStep + offY)
          return
        }
        const ddx = p.x - bx
        const expX = pointerEngaged ? Math.exp(-(ddx * ddx) / gravRSq) : 0
        for (let s = 0; s <= vSteps; s++) {
          let drawX = bx
          let drawY = -spacing + s * detailStep + offY

          if (pointerEngaged) {
            const ddy = p.y - drawY
            const inf = expX * expRows[s]
            drawX += ddx * inf * 0.22
            drawY += ddy * inf * 0.04
          }

          if (clickR > 0) {
            pushFromClick(drawX, drawY)
            drawX = pt.x
            drawY = pt.y
          }

          if (s === 0) ctx.moveTo(drawX, drawY)
          else ctx.lineTo(drawX, drawY)
        }
      }

      const traceHorizontal = (by: number) => {
        if (straight) {
          ctx.moveTo(-spacing + offX, by)
          ctx.lineTo(-spacing + hSteps * detailStep + offX, by)
          return
        }
        const ddy = p.y - by
        const expY = pointerEngaged ? Math.exp(-(ddy * ddy) / gravRSq) : 0
        for (let s = 0; s <= hSteps; s++) {
          let drawX = -spacing + s * detailStep + offX
          let drawY = by

          if (pointerEngaged) {
            const ddx = p.x - drawX
            const inf = expCols[s] * expY
            drawY += ddy * inf * 0.22
            drawX += ddx * inf * 0.04
          }

          if (clickR > 0) {
            pushFromClick(drawX, drawY)
            drawX = pt.x
            drawY = pt.y
          }

          if (s === 0) ctx.moveTo(drawX, drawY)
          else ctx.lineTo(drawX, drawY)
        }
      }

      farLines.length = 0
      for (let x = -spacing; x < w + spacing; x += spacing) {
        const bx = x + offX
        const hue = 180 + hueShift + (p.inViewport ? clamp(1 - Math.abs(p.x - bx) / 420, 0, 1) * 30 : 0)
        let alpha = 0.1 + pointerFactor * 0.2 + (p.inViewport ? clamp(1 - Math.abs(p.x - bx) / 360, 0, 1) * 0.2 : 0)

        if (clickR > 0) {
          const distToClick = Math.abs(clickDistortion.x - bx)
          if (distToClick < clickR) {
            alpha += (1 - distToClick / clickR) * clickDistortion.strength * clickAlphaBoost
          }
        }

        if (hue === baseHueV && alpha === baseAlphaV) {
          farLines.push(bx)
          continue
        }

        ctx.strokeStyle = `hsla(${hue}, 100%, 50%, ${alpha})`
        ctx.lineWidth = 0.8
        ctx.beginPath()
        traceVertical(bx)
        ctx.stroke()
      }
      if (farLines.length > 0) {
        ctx.strokeStyle = `hsla(${baseHueV}, 100%, 50%, ${baseAlphaV})`
        ctx.lineWidth = 0.8
        ctx.beginPath()
        for (let i = 0; i < farLines.length; i++) traceVertical(farLines[i])
        ctx.stroke()
      }

      farLines.length = 0
      for (let y = -spacing; y < h + spacing; y += spacing) {
        const by = y + offY
        const hue = 180 + hueShift + (p.inViewport ? clamp(1 - Math.abs(p.y - by) / 360, 0, 1) * 30 : 0)
        let alpha = 0.08 + pointerFactor * 0.18 + (p.inViewport ? clamp(1 - Math.abs(p.y - by) / 320, 0, 1) * 0.18 : 0)

        if (clickR > 0) {
          const distToClick = Math.abs(clickDistortion.y - by)
          if (distToClick < clickR) {
            alpha += (1 - distToClick / clickR) * clickDistortion.strength * clickAlphaBoost
          }
        }

        if (hue === baseHueH && alpha === baseAlphaH) {
          farLines.push(by)
          continue
        }

        ctx.strokeStyle = `hsla(${hue}, 100%, 50%, ${alpha})`
        ctx.lineWidth = 0.78
        ctx.beginPath()
        traceHorizontal(by)
        ctx.stroke()
      }
      if (farLines.length > 0) {
        ctx.strokeStyle = `hsla(${baseHueH}, 100%, 50%, ${baseAlphaH})`
        ctx.lineWidth = 0.78
        ctx.beginPath()
        for (let i = 0; i < farLines.length; i++) traceHorizontal(farLines[i])
        ctx.stroke()
      }
    }
    ctx.restore()

    ctx.lineCap = 'round'

    // Edges stay one stroke each (their round caps overlap at shared nodes,
    // and stacking those is part of the look), but the colour is only
    // re-parsed when it actually changes: every idle edge shares one string.
    let lastStroke = ''
    let lastWidth = -1
    for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
      const [a, b] = edges[edgeIndex]
      const from = nodes[a]
      const to = nodes[b]
      if (!from || !to) continue
      const highlight = Math.max(from.halo, to.halo) * (profile.isLowPower ? 0.6 : profile.isCompact ? 0.56 : 0.82)
      const hue = 180 + hueShift + highlight * 60
      const alpha = profile.isLowPower ? 0.18 : profile.isCompact ? 0.1 + highlight * 0.22 : 0.14 + highlight * 0.35
      const style = `hsla(${hue}, 100%, ${profile.isCompact ? 62 + highlight * 8 : 50 + highlight * 15}%, ${alpha})`
      const width = profile.isLowPower ? 0.7 : profile.isCompact ? 0.46 + highlight * 0.58 : 0.5 + highlight * 1.2
      if (style !== lastStroke) {
        ctx.strokeStyle = style
        lastStroke = style
      }
      if (width !== lastWidth) {
        ctx.lineWidth = width
        lastWidth = width
      }
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()
    }

    // Nodes whose halo has fully faded all share one colour, so their glows,
    // cores and rings are drawn as three batched passes. Lit nodes follow one
    // by one with their own colours, exactly as before.
    idleNodes.length = 0
    litNodes.length = 0
    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
      const node = nodes[nodeIndex]
      if (node.halo === 0) idleNodes.push(node)
      else litNodes.push(node)
    }
    const idleHue = 180 + hueShift

    if (profile.isLowPower) {
      if (idleNodes.length > 0) {
        ctx.fillStyle = `hsla(${idleHue}, 100%, 58%, ${0.16})`
        ctx.beginPath()
        for (let i = 0; i < idleNodes.length; i++) {
          const node = idleNodes[i]
          const glowRadius = nodeRadius(node) * 2.1
          ctx.moveTo(node.x + glowRadius, node.y)
          ctx.arc(node.x, node.y, glowRadius, 0, TAU)
        }
        ctx.fill()

        ctx.fillStyle = `hsla(${idleHue}, 100%, 64%, ${0.72})`
        ctx.beginPath()
        for (let i = 0; i < idleNodes.length; i++) {
          const node = idleNodes[i]
          const coreRadius = nodeRadius(node) * 1.35
          ctx.moveTo(node.x + coreRadius, node.y)
          ctx.arc(node.x, node.y, coreRadius, 0, TAU)
        }
        ctx.fill()
      }
      for (let i = 0; i < litNodes.length; i++) {
        const node = litNodes[i]
        const r = nodeRadius(node)
        const nodeHue = 180 + hueShift + node.halo * 60
        const glowRadius = r * 2.1
        ctx.fillStyle = `hsla(${nodeHue}, 100%, 58%, ${0.16 + node.halo * 0.14})`
        ctx.beginPath()
        ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = `hsla(${nodeHue}, 100%, 64%, ${0.72 + node.halo * 0.14})`
        ctx.beginPath()
        ctx.arc(node.x, node.y, r * 1.35, 0, Math.PI * 2)
        ctx.fill()
      }
    } else if (profile.isActualMobile) {
      if (idleNodes.length > 0) {
        ctx.fillStyle = `hsla(${idleHue}, 100%, 58%, ${0.18})`
        ctx.beginPath()
        for (let i = 0; i < idleNodes.length; i++) {
          const node = idleNodes[i]
          const glowRadius = nodeRadius(node) * 2
          ctx.moveTo(node.x + glowRadius, node.y)
          ctx.arc(node.x, node.y, glowRadius, 0, TAU)
        }
        ctx.fill()

        ctx.fillStyle = `hsla(${idleHue}, 100%, 68%, ${0.68})`
        ctx.beginPath()
        for (let i = 0; i < idleNodes.length; i++) {
          const node = idleNodes[i]
          const coreRadius = nodeRadius(node) * 1.05
          ctx.moveTo(node.x + coreRadius, node.y)
          ctx.arc(node.x, node.y, coreRadius, 0, TAU)
        }
        ctx.fill()

        ctx.strokeStyle = `hsla(${idleHue}, 100%, 78%, ${0.09})`
        ctx.lineWidth = 0.34
        ctx.beginPath()
        for (let i = 0; i < idleNodes.length; i++) {
          const node = idleNodes[i]
          const ringRadius = nodeRadius(node) + 1
          ctx.moveTo(node.x + ringRadius, node.y)
          ctx.arc(node.x, node.y, ringRadius, 0, TAU)
        }
        ctx.stroke()
      }
      for (let i = 0; i < litNodes.length; i++) {
        const node = litNodes[i]
        const r = nodeRadius(node)
        const nodeHue = 180 + hueShift + node.halo * 60
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
      }
    } else {
      const compact = profile.isCompact
      if (idleNodes.length > 0) {
        // One glow gradient in unit space serves every idle node: the canvas
        // transform scales it to each node's radius, so the shader is built
        // once per frame instead of once per node.
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
        glow.addColorStop(0, `hsla(${idleHue}, 100%, 62%, ${compact ? 0.24 : 0.3})`)
        glow.addColorStop(0.65, `hsla(${idleHue}, 100%, 52%, ${compact ? 0.16 : 0.2})`)
        glow.addColorStop(1, 'rgba(0,10,20,0)')
        ctx.fillStyle = glow
        for (let i = 0; i < idleNodes.length; i++) {
          const node = idleNodes[i]
          const gR = nodeRadius(node) * (compact ? 1.7 : 1.9)
          ctx.setTransform(dpr * gR, 0, 0, dpr * gR, dpr * node.x, dpr * node.y)
          ctx.beginPath()
          ctx.arc(0, 0, 1, 0, TAU)
          ctx.fill()
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

        ctx.fillStyle = `hsla(${idleHue}, 100%, ${compact ? 70 : 60}%, ${compact ? 0.62 : 0.6})`
        ctx.beginPath()
        for (let i = 0; i < idleNodes.length; i++) {
          const node = idleNodes[i]
          const r = nodeRadius(node)
          ctx.moveTo(node.x + r, node.y)
          ctx.arc(node.x, node.y, r, 0, TAU)
        }
        ctx.fill()

        ctx.strokeStyle = `hsla(${idleHue}, 100%, 76%, ${compact ? 0.12 : 0.18})`
        ctx.lineWidth = compact ? 0.38 : 0.45
        ctx.beginPath()
        for (let i = 0; i < idleNodes.length; i++) {
          const node = idleNodes[i]
          const ringRadius = nodeRadius(node) + (compact ? 1.2 : 1.6)
          ctx.moveTo(node.x + ringRadius, node.y)
          ctx.arc(node.x, node.y, ringRadius, 0, TAU)
        }
        ctx.stroke()
      }
      for (let i = 0; i < litNodes.length; i++) {
        const node = litNodes[i]
        const r = nodeRadius(node)
        const nodeHue = 180 + hueShift + node.halo * 60
        const gR = r * (compact ? 1.7 + node.halo * 1.8 : 1.9 + node.halo * 2.6)
        const g = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, gR)
        g.addColorStop(0, `hsla(${nodeHue}, 100%, 62%, ${compact ? 0.24 + node.halo * 0.12 : 0.3 + node.halo * 0.2})`)
        g.addColorStop(0.65, `hsla(${nodeHue}, 100%, 52%, ${compact ? 0.16 + node.halo * 0.1 : 0.2 + node.halo * 0.18})`)
        g.addColorStop(1, 'rgba(0,10,20,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(node.x, node.y, gR, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = `hsla(${nodeHue}, 100%, ${compact ? 70 : 60}%, ${compact ? 0.62 + node.halo * 0.14 : 0.6 + node.halo * 0.2})`
        ctx.beginPath()
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
        ctx.fill()

        ctx.strokeStyle = `hsla(${nodeHue}, 100%, 76%, ${compact ? 0.12 + node.halo * 0.1 : 0.18 + node.halo * 0.25})`
        ctx.lineWidth = compact ? 0.38 : 0.45
        ctx.beginPath()
        ctx.arc(node.x, node.y, r + (compact ? 1.2 : 1.6) + node.halo * (compact ? 1.9 : 3.4), 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    paintNoise()
  }

  const animate = (now: number) => {
    frameId = clock.request(animate)

    if (frameInterval > 0 && now > interactionBurstEnd && now - lastFrameTime < frameInterval) return
    lastFrameTime = now
    drawFrame(now)
  }

  const start = () => {
    if (!frameId && !hidden && !disposed && initialized) frameId = clock.request(animate)
  }

  const stop = () => {
    if (frameId) clock.cancel(frameId)
    frameId = 0
  }

  return {
    resize(width, height, next) {
      const oldW = w
      const oldH = h
      const profileChanged = profile !== null && !sameProfile(profile, next)

      w = width
      h = height
      profile = next
      dpr = next.dpr
      frameInterval = next.targetFps >= 60 ? 0 : 1000 / next.targetFps
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
      } else {
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
      start()
    },
    setPointer(x, y) {
      pointer.x = x
      pointer.y = y
      pointer.inViewport = true
    },
    pointerLeave() {
      pointer.inViewport = false
    },
    interact(x, y) {
      if (!profile || !initialized) return
      const now = clock.now()
      const repeatWindow = profile.isActualMobile ? 90 : 150
      if (now - lastInteraction.time < repeatWindow && Math.hypot(x - lastInteraction.x, y - lastInteraction.y) < 18) return

      lastInteraction.x = x
      lastInteraction.y = y
      lastInteraction.time = now
      pointer.x = x
      pointer.y = y
      pointer.inViewport = !profile.isActualMobile
      pointer.boostUntil = profile.isActualMobile ? now + 220 : 0
      pointer.velocity = Math.max(pointer.velocity, profile.isActualMobile ? 320 : profile.isCompact ? 260 : 120)
      spawnClickEffect(x, y)
      interactionBurstEnd = now + 400
      lastFrameTime = 0
      drawFrame(now)
    },
    endInteraction() {
      if (!profile?.isActualMobile) return
      pointer.inViewport = false
    },
    setGyro(x, y) {
      gyro.x = x
      gyro.y = y
    },
    setScrollProgress(progress) {
      scrollProgress = progress
    },
    setCovered(next) {
      covered = next
    },
    setHidden(next) {
      hidden = next
      if (hidden) {
        stop()
      } else {
        lastFrameTime = 0
        start()
      }
    },
    setNoise(tile, scale) {
      installNoise(tile, scale)
    },
    inspect,
    dispose() {
      disposed = true
      stop()
    },
  }
}

/** Route one protocol message onto a renderer. Shared by the worker and the inline fallback. */
export function applyMessage(renderer: BackgroundRenderer, message: BackgroundMessage) {
  switch (message.type) {
    case 'resize':
      renderer.resize(message.width, message.height, message.profile)
      break
    case 'pointer':
      renderer.setPointer(message.x, message.y)
      break
    case 'leave':
      renderer.pointerLeave()
      break
    case 'interact':
      renderer.interact(message.x, message.y)
      break
    case 'end':
      renderer.endInteraction()
      break
    case 'gyro':
      renderer.setGyro(message.x, message.y)
      break
    case 'scroll':
      renderer.setScrollProgress(message.progress)
      break
    case 'covered':
      renderer.setCovered(message.covered)
      break
    case 'hidden':
      renderer.setHidden(message.hidden)
      break
    case 'noise':
      renderer.setNoise(message.tile, message.scale)
      break
  }
}
