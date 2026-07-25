import { useRef, useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence, useInView } from 'framer-motion'
import { storageGet, storageSet } from '../utils/safeStorage'
import { isStarMessageAllowed, saveModeratedStarMessage } from '../utils/starModeration'
import {
  createConstellationStar,
  updateConstellationStar,
  type ConstellationStarPatch,
} from '../utils/constellationApi'
import useIsPhone from '../hooks/useIsPhone'

interface Star {
  x: number
  y: number
  color: string
  message: string
  timestamp: number
  // The raw secret is sent only to protected write endpoints and is never
  // persisted in the world-readable database.
  sessionHash?: string
  key?: string
  visitId?: string
  isMega?: boolean
  mergedCount?: number
}

type EditableStarPatch = Partial<Pick<Star, 'x' | 'y' | 'color' | 'message'>>
type PositionPatch = { x: number; y: number }
type StarMotion = {
  fromX: number
  fromY: number
  toX: number
  toY: number
  startedAt: number
}

const COLORS = [
  { value: '#00ffff', label: 'Cyan' },
  { value: '#ff00ff', label: 'Magenta' },
  { value: '#00ff41', label: 'Green' },
  { value: '#ffcc00', label: 'Yellow' },
  { value: '#ff3366', label: 'Red' },
]

const MERGE_THRESHOLD = 250
const MEGA_STAR_COUNT = 10
const VISIT_STAR_MARGIN = 0.08
const CONNECTION_STALL_TIMEOUT_MS = 8000
const POSITION_SYNC_INTERVAL_MS = 125
const REMOTE_MOVE_DURATION_MS = 220
const CACHE_WRITE_DELAY_MS = 500

function createId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.()
  if (randomId) return randomId
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const PAGE_VISIT_ID = createId('visit')
// Module-level so StrictMode remounts and re-renders never double-place the
// automatic visit star.
let pageVisitStarStarted = false
const CONNECTION_CELL_SIZE = 180

function escapeHtml(text: string): string {
  const el = document.createElement('span')
  el.textContent = text
  return el.innerHTML
}

function getSessionId(): string {
  let id = storageGet('constellation-session')
  if (!id) {
    id = createId('session')
    storageSet('constellation-session', id)
  }
  return id
}

function randomStarCoordinate(): number {
  return VISIT_STAR_MARGIN + Math.random() * (1 - VISIT_STAR_MARGIN * 2)
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function isVisitStar(star: Star, visitStar: Star | null): boolean {
  if (!visitStar) return false
  if (visitStar.key != null && star.key != null) return star.key === visitStar.key
  return star === visitStar
}

function getVisitStar(stars: Star[], visitStarHint: Star | null = null): Star | null {
  if (visitStarHint?.key) {
    const byKey = stars.find(star => star.key === visitStarHint.key)
    if (byKey) return byKey
  }
  if (visitStarHint && stars.includes(visitStarHint)) return visitStarHint

  const visitMatches = stars.filter(star => star.visitId === PAGE_VISIT_ID)
  if (visitMatches.length === 0) return null
  return visitMatches.reduce((latest, star) =>
    star.timestamp >= latest.timestamp ? star : latest
  )
}

function getDerivedStarStats(stars: Star[]) {
  let regularCount = 0
  let totalCount = 0

  stars.forEach(star => {
    if (star.isMega) {
      totalCount += star.mergedCount || 1
    } else {
      regularCount++
      totalCount++
    }
  })

  const mergeCount = stars.some(star => star.isMega)
    ? Math.max(1, Math.floor(totalCount / MERGE_THRESHOLD))
    : 0

  return {
    regularCount,
    totalCount,
    mergeCount,
  }
}

function parseFiniteNumber(value: unknown): number | null {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function getDisplayedTotal(derivedTotal: number, metadataTotal: number | null): number {
  return metadataTotal == null ? derivedTotal : Math.max(metadataTotal, derivedTotal)
}

function getMotionPosition(motion: StarMotion, now: number) {
  const progress = Math.min(1, Math.max(0, (now - motion.startedAt) / REMOTE_MOVE_DURATION_MS))
  // Smoothstep prevents abrupt starts and stops when remote drag updates land.
  const eased = progress * progress * (3 - 2 * progress)
  return {
    x: motion.fromX + (motion.toX - motion.fromX) * eased,
    y: motion.fromY + (motion.toY - motion.fromY) * eased,
    active: progress < 1,
  }
}

export default function Constellation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const starsRef = useRef<Star[]>([])
  const currentVisitStarRef = useRef<Star | null>(null)
  const hoveredRef = useRef<Star | null>(null)
  const tooltipTimeout = useRef<number | null>(null)
  const isDraggingVisitStarRef = useRef(false)
  const positionSaveTimeout = useRef<number | null>(null)
  const latestPositionPatchRef = useRef<PositionPatch | null>(null)
  const positionSyncInFlightRef = useRef(false)
  const positionSyncLastSentAtRef = useRef(0)
  const positionSyncDrainRef = useRef<() => void>(() => undefined)
  const pendingVisitPatchRef = useRef<EditableStarPatch>({})
  const starMotionsRef = useRef(new Map<string, StarMotion>())
  const drawRequestRef = useRef<number | null>(null)
  const cacheWriteTimeoutRef = useRef<number | null>(null)
  const pendingCacheRef = useRef<{ stars: Star[]; total: number } | null>(null)
  const [selectedColor, setSelectedColor] = useState('#00ffff')
  const [message, setMessage] = useState('')
  const [messageSubmitted, setMessageSubmitted] = useState(false)
  const [totalStarsEver, setTotalStarsEver] = useState(0)
  const [starsSinceMerge, setStarsSinceMerge] = useState(0)
  const [mergeCount, setMergeCount] = useState(0)
  const [isDraggingVisitStar, setIsDraggingVisitStar] = useState(false)
  const [filterError, setFilterError] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [isModeratingMessage, setIsModeratingMessage] = useState(false)
  const [hasVisitStar, setHasVisitStar] = useState(false)
  const [accessibleMessages, setAccessibleMessages] = useState<string[]>([])
  const [connectionStatus, setConnectionStatus] = useState<'syncing' | 'live' | 'offline'>('syncing')
  const metaReceivedRef = useRef(false)
  const metadataTotalRef = useRef<number | null>(null)
  const derivedTotalRef = useRef(0)
  const metadataUnavailableRef = useRef(false)
  const localFallbackRef = useRef(false)
  const sessionSecret = useRef(getSessionId())
  const isPhone = useIsPhone()

  const sectionRef = useRef(null)
  const inView = useInView(sectionRef, { once: true, margin: '-50px' })
  // The sky wrap watches itself: gating it on the header's observer can
  // permanently hide the canvas when lazy-mounted sections shift the layout
  // (e.g. deep links to #constellation) and the header never crosses the
  // threshold.
  const skyInView = useInView(containerRef, { once: true })

  const syncAccessibleMessages = useCallback((stars: Star[]) => {
    const nextMessages = stars
      .filter(star => star.message?.trim())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 40)
      .map(star => star.isMega
        ? `${star.message} (${star.mergedCount || 0} merged stars)`
        : star.message.trim())

    setAccessibleMessages(current => (
      current.length === nextMessages.length &&
      current.every((item, index) => item === nextMessages[index])
        ? current
        : nextMessages
    ))
  }, [])

  const syncTooltip = useCallback((star: Star | null) => {
    const tooltip = tooltipRef.current
    const container = containerRef.current
    if (!tooltip || !container || !star || (!star.message && !star.isMega)) {
      tooltip?.classList.remove('is-visible')
      return
    }

    if (star.isMega) {
      tooltip.innerHTML = `${star.message ? `"${escapeHtml(star.message)}" ` : ''}<span class="constellation__tooltip-count">(${Number(star.mergedCount) || 0} stars)</span>`
    } else {
      tooltip.textContent = star.message
    }

    const rect = container.getBoundingClientRect()
    const motion = star.key ? starMotionsRef.current.get(star.key) : null
    const point = motion
      ? getMotionPosition(motion, performance.now())
      : { x: star.x, y: star.y }
    tooltip.style.left = `${point.x * rect.width}px`
    tooltip.style.top = `${point.y * rect.height - 45}px`
    tooltip.classList.add('is-visible')
  }, [])

  const drawStars = useCallback((now = performance.now()) => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return false
    const ctx = canvas.getContext('2d')
    if (!ctx) return false
    const rect = container.getBoundingClientRect()
    const w = rect.width, h = rect.height
    ctx.clearRect(0, 0, w, h)

    // Grid - subtle
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.04)'
    ctx.lineWidth = 0.5
    for (let x = 0; x < w; x += 50) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
    }
    for (let y = 0; y < h; y += 50) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
    }

    const stars = starsRef.current

    let hasActiveMotion = false
    const starPoints = stars.map((star, index) => {
      const motion = star.key ? starMotionsRef.current.get(star.key) : null
      const point = motion
        ? getMotionPosition(motion, now)
        : { x: star.x, y: star.y, active: false }

      if (motion && point.active) {
        hasActiveMotion = true
      } else if (motion && star.key) {
        starMotionsRef.current.delete(star.key)
      }

      return {
        star,
        index,
        x: point.x * w,
        y: point.y * h,
      }
    })
    const connectionGrid = new Map<string, typeof starPoints>()

    starPoints.forEach(point => {
      const gx = Math.floor(point.x / CONNECTION_CELL_SIZE)
      const gy = Math.floor(point.y / CONNECTION_CELL_SIZE)
      const key = `${gx},${gy}`
      const cell = connectionGrid.get(key)
      if (cell) {
        cell.push(point)
      } else {
        connectionGrid.set(key, [point])
      }
    })

    // Draw connections - same distance rules, spatially binned to avoid scanning
    // every pair as the constellation fills up.
    starPoints.forEach(point => {
      const gx = Math.floor(point.x / CONNECTION_CELL_SIZE)
      const gy = Math.floor(point.y / CONNECTION_CELL_SIZE)

      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const cell = connectionGrid.get(`${gx + ox},${gy + oy}`)
          if (!cell) continue

          cell.forEach(otherPoint => {
            if (otherPoint.index <= point.index) return

            const d = Math.hypot(point.x - otherPoint.x, point.y - otherPoint.y)
            const maxDist = point.star.isMega || otherPoint.star.isMega ? 180 : 80
            if (d < maxDist) {
              ctx.beginPath(); ctx.moveTo(point.x, point.y); ctx.lineTo(otherPoint.x, otherPoint.y)
              const alpha = (point.star.isMega || otherPoint.star.isMega) ? 0.12 : 0.08
              ctx.strokeStyle = `rgba(255,255,255,${alpha * (1 - d / maxDist)})`
              ctx.lineWidth = point.star.isMega || otherPoint.star.isMega ? 1 : 0.5
              ctx.stroke()
            }
          })
        }
      }
    })

    // Draw stars
    starPoints.forEach(({ star, x, y }) => {
      const isHovered = hoveredRef.current === star
      const isCurrentVisitStar = isVisitStar(star, currentVisitStarRef.current)
      const isMega = star.isMega

      // Size: mega stars only slightly bigger
      const baseSize = isMega ? 5 : 3
      const size = isHovered ? baseSize + 2 : baseSize
      const glowSize = isMega ? (isHovered ? 35 : 25) : (isHovered ? 25 : 15)

      const g = ctx.createRadialGradient(x, y, 0, x, y, glowSize)
      g.addColorStop(0, star.color)
      g.addColorStop(0.3, star.color + '50')
      g.addColorStop(1, 'transparent')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(x, y, glowSize, 0, Math.PI * 2); ctx.fill()

      ctx.fillStyle = star.color
      ctx.shadowColor = star.color
      ctx.shadowBlur = isMega ? 20 : 12
      ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur = 0

      // Bright core for mega stars
      if (isMega) {
        ctx.fillStyle = '#ffffff'
        ctx.beginPath(); ctx.arc(x, y, size * 0.35, 0, Math.PI * 2); ctx.fill()
      }

      if (isHovered) {
        ctx.strokeStyle = star.color + '80'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y)
        ctx.moveTo(x, y - 10); ctx.lineTo(x, y + 10)
        ctx.stroke()
      }

      if (isCurrentVisitStar && !isMega) {
        ctx.strokeStyle = star.color + '38'
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.arc(x, y, 12, 0, Math.PI * 2)
        ctx.stroke()

        ctx.strokeStyle = star.color + 'd0'
        ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.arc(x, y, 10, 0, Math.PI * 2)
        ctx.stroke()
      }
    })

    const hoveredPoint = starPoints.find(point => point.star === hoveredRef.current)
    if (hoveredPoint && tooltipRef.current?.classList.contains('is-visible')) {
      tooltipRef.current.style.left = `${hoveredPoint.x}px`
      tooltipRef.current.style.top = `${hoveredPoint.y - 45}px`
    }

    return hasActiveMotion
  }, [])

  // Coalesce pointer, resize, and realtime updates into one canvas paint per
  // frame. Dragging used to redraw repeatedly inside the same frame.
  const requestDraw = useCallback(() => {
    if (drawRequestRef.current !== null) return
    const paint = (timestamp: number) => {
      drawRequestRef.current = null
      if (drawStars(timestamp)) {
        drawRequestRef.current = window.requestAnimationFrame(paint)
      }
    }
    drawRequestRef.current = window.requestAnimationFrame(paint)
  }, [drawStars])

  const flushCachedSnapshot = useCallback(() => {
    cacheWriteTimeoutRef.current = null
    const pending = pendingCacheRef.current
    pendingCacheRef.current = null
    if (!pending) return
    storageSet('constellation-stars', JSON.stringify(pending.stars))
    storageSet('constellation-totalStarsEver', String(pending.total))
  }, [])

  const scheduleCachedSnapshot = useCallback((stars: Star[], total: number) => {
    pendingCacheRef.current = { stars, total }
    if (cacheWriteTimeoutRef.current !== null) return
    cacheWriteTimeoutRef.current = window.setTimeout(flushCachedSnapshot, CACHE_WRITE_DELAY_MS)
  }, [flushCachedSnapshot])

  const updateDisplayedTotal = useCallback((derivedTotal: number) => {
    derivedTotalRef.current = derivedTotal
    setTotalStarsEver(getDisplayedTotal(derivedTotal, metadataTotalRef.current))
  }, [])

  const loadLocalState = useCallback(() => {
    const saved = storageGet('constellation-stars')
    let stars: Star[] = []
    if (saved) {
      try { stars = JSON.parse(saved) } catch { stars = [] }
    }
    // Keep this page's optimistic visit star — it exists only in memory when
    // the Firebase write never settled (stalled connection).
    const pendingVisitStar = currentVisitStarRef.current
    if (pendingVisitStar && !getVisitStar(stars, pendingVisitStar)) {
      stars = [...stars, pendingVisitStar]
    }
    starsRef.current = stars
    currentVisitStarRef.current = getVisitStar(stars, currentVisitStarRef.current)
    setHasVisitStar(Boolean(currentVisitStarRef.current))
    syncAccessibleMessages(stars)

    const derivedStats = getDerivedStarStats(stars)
    derivedTotalRef.current = derivedStats.totalCount
    setStarsSinceMerge(derivedStats.regularCount)

    const savedTotal = storageGet('constellation-totalStarsEver')
    const savedTotalNumber = savedTotal == null ? null : parseFiniteNumber(savedTotal)
    const displayTotal = getDisplayedTotal(derivedStats.totalCount, savedTotalNumber)
    if (savedTotalNumber != null) {
      setTotalStarsEver(displayTotal)
      if (displayTotal > savedTotalNumber) {
        storageSet('constellation-totalStarsEver', String(displayTotal))
      }
    } else {
      setTotalStarsEver(displayTotal)
      storageSet('constellation-totalStarsEver', String(displayTotal))
    }

    const savedMergeCount = storageGet('constellation-mergeCount')
    setMergeCount(savedMergeCount != null ? (parseFiniteNumber(savedMergeCount) ?? derivedStats.mergeCount) : derivedStats.mergeCount)

    requestDraw()
  }, [requestDraw, syncAccessibleMessages])

  const activateLocalFallback = useCallback(() => {
    if (localFallbackRef.current) return
    localFallbackRef.current = true
    setConnectionStatus('offline')
    loadLocalState()
    storageSet('constellation-stars', JSON.stringify(starsRef.current))
  }, [loadLocalState])

  // A failed write endpoint doesn't mean the sky is offline — reads may still
  // be live. Keep the view live and let the visitor's star ride along in
  // memory; the snapshot handler preserves it via its visitId.
  const addPendingVisitStar = useCallback((star: Star) => {
    const existingStar = getVisitStar(starsRef.current, currentVisitStarRef.current)
    if (existingStar) {
      currentVisitStarRef.current = existingStar
      setHasVisitStar(true)
      return
    }

    currentVisitStarRef.current = star
    starsRef.current = [...starsRef.current, star]
    setHasVisitStar(true)
    const derivedStats = getDerivedStarStats(starsRef.current)
    setStarsSinceMerge(derivedStats.regularCount)
    updateDisplayedTotal(derivedStats.totalCount)
    requestDraw()
  }, [requestDraw, updateDisplayedTotal])

  const applyVisitStarPatchLocally = useCallback((patch: EditableStarPatch) => {
    const targetStar = currentVisitStarRef.current ?? getVisitStar(starsRef.current, currentVisitStarRef.current)
    if (!targetStar) return null

    pendingVisitPatchRef.current = {
      ...pendingVisitPatchRef.current,
      ...patch,
    }

    let updatedStar: Star | null = null
    let foundStar = false

    starsRef.current = starsRef.current.map(star => {
      const isTarget = isVisitStar(star, targetStar)
      if (!isTarget) return star

      foundStar = true
      updatedStar = { ...star, ...patch }
      return updatedStar
    })

    if (!foundStar) {
      updatedStar = { ...targetStar, ...patch }
      starsRef.current = [...starsRef.current, updatedStar]
    }

    currentVisitStarRef.current = updatedStar
    if (!foundStar) setHasVisitStar(true)
    if (localFallbackRef.current) {
      storageSet('constellation-stars', JSON.stringify(starsRef.current))
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'message')) {
      syncAccessibleMessages(starsRef.current)
    }
    requestDraw()
    return updatedStar
  }, [requestDraw, syncAccessibleMessages])

  const persistVisitStarPatch = useCallback((patch: ConstellationStarPatch) => {
    const targetStar = currentVisitStarRef.current ?? getVisitStar(starsRef.current, currentVisitStarRef.current)
    if (!targetStar) return

    if (targetStar.key && !localFallbackRef.current) {
      // Callers apply the patch optimistically before persisting, so a failed
      // write just leaves the server a step behind — it never means the read
      // connection is down, so don't flip the whole sky into offline view.
      void updateConstellationStar({
        starKey: targetStar.key,
        sessionSecret: sessionSecret.current,
        patch,
      })
    } else {
      applyVisitStarPatchLocally(patch)
    }
  }, [applyVisitStarPatchLocally])

  // Paint cached stars first, then hydrate the live sky behind an async module
  // boundary. Firebase no longer blocks the constellation shell from rendering.
  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | null = null

    loadLocalState()

    // A blocked or unreachable connection can retry silently forever. The
    // cached sky remains interactive while this timer decides whether to label
    // the view offline.
    const stallTimeout = window.setTimeout(
      activateLocalFallback,
      CONNECTION_STALL_TIMEOUT_MS,
    )

    const handleMetadataFailure = () => {
      metadataUnavailableRef.current = true
      if (!metaReceivedRef.current) {
        const derivedStats = getDerivedStarStats(starsRef.current)
        updateDisplayedTotal(derivedStats.totalCount)
        setMergeCount(derivedStats.mergeCount)
      }
    }

    const connect = async () => {
      try {
        const { subscribeToConstellation } = await import('../utils/constellationRealtime')
        if (disposed) return

        unsubscribe = subscribeToConstellation({
          onStars: value => {
            if (disposed) return
            window.clearTimeout(stallTimeout)
            localFallbackRef.current = false
            setConnectionStatus('live')

            const data = value as Record<string, Star> | null
            let snapshotStars: Star[] = data
              ? Object.entries(data).map(([key, star]) => ({ ...star, key }))
              : []

            let visitStar = getVisitStar(snapshotStars, currentVisitStarRef.current)
            if (visitStar) {
              const pendingPatch = pendingVisitPatchRef.current
              const unresolvedPatch: EditableStarPatch = {}
              const reconciledVisitStar = { ...visitStar }

              if (pendingPatch.x !== undefined && pendingPatch.x !== visitStar.x) {
                unresolvedPatch.x = pendingPatch.x
                reconciledVisitStar.x = pendingPatch.x
              }
              if (pendingPatch.y !== undefined && pendingPatch.y !== visitStar.y) {
                unresolvedPatch.y = pendingPatch.y
                reconciledVisitStar.y = pendingPatch.y
              }
              if (pendingPatch.color !== undefined && pendingPatch.color !== visitStar.color) {
                unresolvedPatch.color = pendingPatch.color
                reconciledVisitStar.color = pendingPatch.color
              }
              if (pendingPatch.message !== undefined && pendingPatch.message !== visitStar.message) {
                unresolvedPatch.message = pendingPatch.message
                reconciledVisitStar.message = pendingPatch.message
              }

              pendingVisitPatchRef.current = unresolvedPatch
              if (Object.keys(unresolvedPatch).length > 0) {
                snapshotStars = snapshotStars.map(star =>
                  star.key === visitStar?.key ? reconciledVisitStar : star
                )
                visitStar = reconciledVisitStar
              }
            }

            const pendingVisitStar = currentVisitStarRef.current
            const shouldKeepPendingVisitStar =
              !visitStar &&
              !pendingVisitStar?.key &&
              pendingVisitStar?.visitId === PAGE_VISIT_ID &&
              !snapshotStars.some(star => isVisitStar(star, pendingVisitStar))
            const starsList = shouldKeepPendingVisitStar
              ? [...snapshotStars, pendingVisitStar]
              : snapshotStars

            const previousByKey = new Map(
              starsRef.current
                .filter(star => star.key)
                .map(star => [star.key as string, star]),
            )
            const nextKeys = new Set<string>()
            const motionStartedAt = performance.now()

            starsList.forEach(star => {
              if (!star.key) return
              nextKeys.add(star.key)
              const previous = previousByKey.get(star.key)
              const isCurrentStar = visitStar?.key === star.key
              if (!previous || isCurrentStar || (previous.x === star.x && previous.y === star.y)) {
                return
              }

              const activeMotion = starMotionsRef.current.get(star.key)
              const from = activeMotion
                ? getMotionPosition(activeMotion, motionStartedAt)
                : { x: previous.x, y: previous.y }
              starMotionsRef.current.set(star.key, {
                fromX: from.x,
                fromY: from.y,
                toX: star.x,
                toY: star.y,
                startedAt: motionStartedAt,
              })
            })
            for (const key of starMotionsRef.current.keys()) {
              if (!nextKeys.has(key)) starMotionsRef.current.delete(key)
            }

            starsRef.current = starsList
            if (visitStar) {
              currentVisitStarRef.current = visitStar
            } else if (!shouldKeepPendingVisitStar) {
              currentVisitStarRef.current = null
              pendingVisitPatchRef.current = {}
            }
            setHasVisitStar(Boolean(visitStar || shouldKeepPendingVisitStar))
            syncAccessibleMessages(starsList)

            const derivedStats = getDerivedStarStats(starsList)
            setStarsSinceMerge(derivedStats.regularCount)
            updateDisplayedTotal(derivedStats.totalCount)
            scheduleCachedSnapshot(
              starsList,
              getDisplayedTotal(derivedStats.totalCount, metadataTotalRef.current),
            )

            if (!metaReceivedRef.current && metadataUnavailableRef.current) {
              setMergeCount(derivedStats.mergeCount)
              storageSet('constellation-mergeCount', String(derivedStats.mergeCount))
            }

            const hoveredKey = hoveredRef.current?.key
            const nextHovered = hoveredKey
              ? starsList.find(star => star.key === hoveredKey) ?? null
              : null
            hoveredRef.current = nextHovered
            syncTooltip(nextHovered)
            positionSyncDrainRef.current()
            requestDraw()
          },
          onMetadata: value => {
            if (disposed) return
            const data = value as Record<string, unknown> | null
            metadataUnavailableRef.current = false
            if (!data) return

            const metadataTotal = parseFiniteNumber(data.totalStarsEver)
            if (metadataTotal != null) {
              metaReceivedRef.current = true
              metadataTotalRef.current = metadataTotal
              updateDisplayedTotal(derivedTotalRef.current)
              storageSet('constellation-totalStarsEver', String(
                getDisplayedTotal(derivedTotalRef.current, metadataTotal),
              ))
            }
            const nextMergeCount = parseFiniteNumber(data.mergeCount)
            if (nextMergeCount != null) {
              setMergeCount(nextMergeCount)
              storageSet('constellation-mergeCount', String(nextMergeCount))
            }
          },
          onStarsError: activateLocalFallback,
          onMetadataError: handleMetadataFailure,
        })

        if (!unsubscribe) {
          window.clearTimeout(stallTimeout)
          activateLocalFallback()
        }
      } catch {
        window.clearTimeout(stallTimeout)
        activateLocalFallback()
      }
    }

    void connect()

    return () => {
      disposed = true
      window.clearTimeout(stallTimeout)
      unsubscribe?.()
    }
  }, [
    activateLocalFallback,
    loadLocalState,
    requestDraw,
    scheduleCachedSnapshot,
    syncAccessibleMessages,
    syncTooltip,
    updateDisplayedTotal,
  ])

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const resize = () => {
      const rect = container.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      const ctx = canvas.getContext('2d')
      if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr) }
      requestDraw()
    }
    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [requestDraw])

  const createVisitStar = useCallback(() => {
    const existingStar = currentVisitStarRef.current ?? getVisitStar(starsRef.current, currentVisitStarRef.current)
    if (existingStar) {
      currentVisitStarRef.current = existingStar
      setHasVisitStar(true)
      return
    }

    const newStar: Star = {
      x: randomStarCoordinate(),
      y: randomStarCoordinate(),
      color: selectedColor,
      message: '',
      timestamp: Date.now(),
      visitId: PAGE_VISIT_ID,
    }

    setSaveError(false)
    // Place the star before starting any network work. Visitors can drag,
    // recolor, and caption it immediately even on a slow connection.
    addPendingVisitStar(newStar)

    void createConstellationStar({
      sessionSecret: sessionSecret.current,
      visitId: PAGE_VISIT_ID,
      x: newStar.x,
      y: newStar.y,
      color: newStar.color,
    }).then(created => {
      if (!created) {
        if (localFallbackRef.current) {
          storageSet('constellation-stars', JSON.stringify(starsRef.current))
        }
        return
      }

      const pendingPatch = pendingVisitPatchRef.current
      const liveStar: Star = {
        ...created.star,
        ...pendingPatch,
        key: created.key,
      }
      const currentStar = currentVisitStarRef.current
      starsRef.current = [
        ...starsRef.current.filter(star =>
          star.visitId !== PAGE_VISIT_ID &&
          !isVisitStar(star, currentStar) &&
          star.key !== liveStar.key
        ),
        liveStar,
      ]
      currentVisitStarRef.current = liveStar
      const derivedStats = getDerivedStarStats(starsRef.current)
      setStarsSinceMerge(derivedStats.regularCount)
      updateDisplayedTotal(derivedStats.totalCount)
      if (localFallbackRef.current) {
        storageSet('constellation-stars', JSON.stringify(starsRef.current))
      }

      if (pendingPatch.color !== undefined && pendingPatch.color !== created.star.color) {
        persistVisitStarPatch({ color: pendingPatch.color })
      }
      if (pendingPatch.message !== undefined && pendingPatch.message !== created.star.message) {
        void saveModeratedStarMessage({
          starKey: created.key,
          sessionSecret: sessionSecret.current,
          message: pendingPatch.message,
        }).then(result => {
          if (result !== 'saved') setSaveError(true)
        })
      }
      positionSyncDrainRef.current()
      requestDraw()
    })
  }, [
    addPendingVisitStar,
    persistVisitStarPatch,
    requestDraw,
    selectedColor,
    updateDisplayedTotal,
  ])

  // One star is placed automatically per page visit — no button involved.
  useEffect(() => {
    if (pageVisitStarStarted) return
    pageVisitStarStarted = true
    createVisitStar()
  }, [createVisitStar])

  const getCanvasPoint = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    }
  }, [])

  const drainPositionSync = useCallback(() => {
    if (
      positionSyncInFlightRef.current ||
      positionSaveTimeout.current !== null ||
      !latestPositionPatchRef.current
    ) {
      return
    }

    const targetStar = currentVisitStarRef.current ??
      getVisitStar(starsRef.current, currentVisitStarRef.current)
    if (!targetStar?.key || localFallbackRef.current) return

    const elapsed = performance.now() - positionSyncLastSentAtRef.current
    const delay = Math.max(0, POSITION_SYNC_INTERVAL_MS - elapsed)
    positionSaveTimeout.current = window.setTimeout(() => {
      positionSaveTimeout.current = null
      const nextPatch = latestPositionPatchRef.current
      const latestTarget = currentVisitStarRef.current ??
        getVisitStar(starsRef.current, currentVisitStarRef.current)
      if (!nextPatch || !latestTarget?.key || localFallbackRef.current) return

      latestPositionPatchRef.current = null
      positionSyncInFlightRef.current = true
      positionSyncLastSentAtRef.current = performance.now()

      void updateConstellationStar({
        starKey: latestTarget.key,
        sessionSecret: sessionSecret.current,
        patch: nextPatch,
      }).finally(() => {
        positionSyncInFlightRef.current = false
        if (latestPositionPatchRef.current) {
          positionSyncDrainRef.current()
        }
      })
    }, delay)
  }, [])

  useEffect(() => {
    positionSyncDrainRef.current = drainPositionSync
  }, [drainPositionSync])

  const schedulePositionSave = useCallback((patch: PositionPatch) => {
    latestPositionPatchRef.current = patch
    positionSyncDrainRef.current()
  }, [])

  const flushPositionSave = useCallback(() => {
    if (positionSaveTimeout.current !== null) {
      window.clearTimeout(positionSaveTimeout.current)
      positionSaveTimeout.current = null
    }
    positionSyncLastSentAtRef.current = 0
    positionSyncDrainRef.current()
  }, [])

  const moveVisitStar = useCallback((clientX: number, clientY: number) => {
    const point = getCanvasPoint(clientX, clientY)
    const visitStar = currentVisitStarRef.current ?? getVisitStar(starsRef.current, currentVisitStarRef.current)
    if (!point || !visitStar) return

    const patch = { x: point.x, y: point.y }
    applyVisitStarPatchLocally(patch)
    schedulePositionSave(patch)
  }, [applyVisitStarPatchLocally, getCanvasPoint, schedulePositionSave])

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || !currentVisitStarRef.current) return
    e.preventDefault()
    isDraggingVisitStarRef.current = true
    setIsDraggingVisitStar(true)
    e.currentTarget.setPointerCapture(e.pointerId)
    moveVisitStar(e.clientX, e.clientY)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingVisitStarRef.current) return
    e.preventDefault()
    moveVisitStar(e.clientX, e.clientY)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingVisitStarRef.current) return
    isDraggingVisitStarRef.current = false
    setIsDraggingVisitStar(false)
    flushPositionSave()
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const handleColorSelect = useCallback((color: string) => {
    setSelectedColor(color)
    if (!currentVisitStarRef.current) return
    const patch = { color }
    applyVisitStarPatchLocally(patch)
    persistVisitStarPatch(patch)
  }, [applyVisitStarPatchLocally, persistVisitStarPatch])

  const handleCanvasKeyDown = useCallback((event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const star = currentVisitStarRef.current
    if (!star) return
    const step = event.shiftKey ? 0.05 : 0.015
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const direction = directions[event.key]
    if (!direction) return
    event.preventDefault()
    const patch = {
      x: clamp01(star.x + direction[0]),
      y: clamp01(star.y + direction[1]),
    }
    applyVisitStarPatchLocally(patch)
    persistVisitStarPatch(patch)
  }, [applyVisitStarPatchLocally, persistVisitStarPatch])

  const saveMessage = useCallback(async (nextMessage: string): Promise<boolean> => {
    const msg = nextMessage.trim()
    const targetStar = currentVisitStarRef.current ?? getVisitStar(starsRef.current, currentVisitStarRef.current)
    if (!targetStar) return false

    if (targetStar.key && !localFallbackRef.current) {
      const result = await saveModeratedStarMessage({
        starKey: targetStar.key,
        sessionSecret: sessionSecret.current,
        message: msg,
      })

      if (result === 'flagged') {
        setFilterError(true)
        setSaveError(false)
        return false
      }

      if (result === 'unavailable') {
        setFilterError(false)
        setSaveError(true)
        return false
      }

      setFilterError(false)
      setSaveError(false)
      applyVisitStarPatchLocally({ message: msg })
      return true
    }

    if (msg && !(await isStarMessageAllowed(msg))) {
      setFilterError(true)
      return false
    }

    setFilterError(false)
    applyVisitStarPatchLocally({ message: msg })
    return true
  }, [applyVisitStarPatchLocally])

  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value)
    setFilterError(false)
    setSaveError(false)
  }

  const submitMessage = useCallback(async () => {
    if (isModeratingMessage) return

    setIsModeratingMessage(true)
    try {
      const saved = await saveMessage(message)
      if (saved) {
        setMessageSubmitted(true)
      }
    } finally {
      setIsModeratingMessage(false)
    }
  }, [isModeratingMessage, message, saveMessage])

  const startEditing = useCallback(() => {
    setMessageSubmitted(false)
  }, [])

  useEffect(() => {
    return () => {
      if (positionSaveTimeout.current !== null) {
        window.clearTimeout(positionSaveTimeout.current)
        positionSaveTimeout.current = null
      }
      if (cacheWriteTimeoutRef.current !== null) {
        window.clearTimeout(cacheWriteTimeoutRef.current)
        flushCachedSnapshot()
      }
      if (drawRequestRef.current !== null) {
        window.cancelAnimationFrame(drawRequestRef.current)
        drawRequestRef.current = null
      }
    }
  }, [flushCachedSnapshot])

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left) / rect.width
    const my = (e.clientY - rect.top) / rect.height

    if (tooltipTimeout.current) {
      clearTimeout(tooltipTimeout.current)
      tooltipTimeout.current = null
    }

    let found: Star | null = null

    for (const star of starsRef.current) {
      const motion = star.key ? starMotionsRef.current.get(star.key) : null
      const point = motion
        ? getMotionPosition(motion, performance.now())
        : { x: star.x, y: star.y }
      const dx = (point.x - mx) * rect.width
      const dy = (point.y - my) * rect.height
      const hitRadius = star.isMega ? 28 : 18
      if (Math.hypot(dx, dy) < hitRadius) {
        found = star
        break
      }
    }

    if (found !== hoveredRef.current) {
      hoveredRef.current = found
      syncTooltip(found)
      requestDraw()
    }
  }

  return (
    <>
      <motion.header
        ref={sectionRef}
        className="section__header"
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.35 }}
      >
        <p className="section__eyebrow">
          <span className="section__eyebrow-icon">&#9670;</span>
          Collaborative
        </p>
        <h2>Leave Your Mark in the Constellation</h2>
      </motion.header>

      <div className="constellation__stats">
        <span className="constellation__stat">
          <span className="constellation__stat-value">{starsSinceMerge}</span>
          <span className="constellation__stat-label">since last merge</span>
        </span>
        <span className="constellation__stat-divider">/</span>
        <span className="constellation__stat">
          <span className="constellation__stat-value">{totalStarsEver}</span>
          <span className="constellation__stat-label">total stars</span>
        </span>
        <span className="constellation__stat-divider">/</span>
        <span className="constellation__stat">
          <span className="constellation__stat-value">{mergeCount}</span>
          <span className="constellation__stat-label">merges</span>
        </span>
        {connectionStatus === 'syncing' && (
          <span className="constellation__syncing" role="status">
            <span className="constellation__syncing-dot" aria-hidden="true" />
            syncing live sky
          </span>
        )}
        {connectionStatus === 'offline' && (
          <span className="constellation__offline" role="status">
            <span className="constellation__offline-dot" aria-hidden="true" />
            offline view — live stars unavailable
          </span>
        )}
      </div>

      <p className="constellation__intro">
        One star is added automatically for each visit. Your current star has a ring around it and stays editable from this browser.
        {' '}At {MERGE_THRESHOLD} regular stars, they merge into {MEGA_STAR_COUNT} mega stars at the densest areas.
      </p>

      <motion.div
        className={`constellation is-${connectionStatus} ${isDraggingVisitStar ? 'is-dragging' : ''}`}
        ref={containerRef}
        initial={{ opacity: 0 }}
        animate={skyInView ? { opacity: 1 } : {}}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <canvas
          ref={canvasRef}
          className="constellation__canvas"
          aria-label={hasVisitStar
            ? 'Constellation sky. Drag your star, or use the arrow keys to move it. Hold Shift for larger keyboard steps.'
            : 'Constellation sky. Your star is being placed automatically.'}
          tabIndex={0}
          data-cursor-drag
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onContextMenu={e => e.preventDefault()}
          onKeyDown={handleCanvasKeyDown}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => {
            tooltipTimeout.current = window.setTimeout(() => {
              hoveredRef.current = null
              tooltipRef.current?.classList.remove('is-visible')
              requestDraw()
            }, 600)
          }}
        />
        <div ref={tooltipRef} className="constellation__tooltip" />
      </motion.div>

      <section className="sr-only" aria-label="Recent constellation messages">
        <h3>Recent constellation messages</h3>
        {accessibleMessages.length > 0 ? (
          <ul>{accessibleMessages.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
        ) : (
          <p>No visitor messages have been added yet.</p>
        )}
      </section>

      <div className="constellation__editor">
        <div className="constellation__editor-header">
          <span className="constellation__editor-kicker">Your star</span>
          <span className="constellation__editor-hint">
            {isPhone
              ? 'Tap or drag the sky to reposition it.'
              : 'Drag the sky or use arrow keys to reposition it.'}
          </span>
        </div>

        <div className="constellation__controls" role="group" aria-label="Edit your star">
          <div
            className={`constellation__color-picker ${messageSubmitted ? 'is-submitted' : ''}`}
            aria-label="Choose your star color"
          >
            {COLORS.map(c => (
              <button
                key={c.value}
                type="button"
                className={selectedColor === c.value ? 'active' : ''}
                style={{ '--btn-color': c.value } as React.CSSProperties}
                onClick={() => handleColorSelect(c.value)}
                disabled={messageSubmitted}
                aria-label={c.label}
              />
            ))}
          </div>
          <div className="constellation__input-wrap">
            <div className="constellation__message-row">
              <input
                type="text"
                className={`constellation__message ${filterError || saveError ? 'is-error' : ''} ${messageSubmitted || isModeratingMessage ? 'is-submitted' : ''}`}
                placeholder="Add a message to your star"
                aria-label="Message for your star"
                maxLength={50}
                value={message}
                disabled={!hasVisitStar || messageSubmitted || isModeratingMessage}
                onChange={handleMessageChange}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !messageSubmitted && !isModeratingMessage) {
                    e.preventDefault()
                    void submitMessage()
                  }
                }}
              />
              <motion.button
                type="button"
                className={`constellation__msg-btn ${messageSubmitted ? 'constellation__msg-btn--edit' : 'constellation__msg-btn--submit'}`}
                onClick={messageSubmitted ? startEditing : () => { void submitMessage() }}
                disabled={!hasVisitStar || isModeratingMessage}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                aria-label={isModeratingMessage ? 'Checking message' : messageSubmitted ? 'Edit your message' : 'Submit your message'}
                aria-busy={isModeratingMessage}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={messageSubmitted ? 'edit' : 'submit'}
                    className="constellation__msg-btn-label"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {messageSubmitted ? 'Edit' : 'Submit'}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
            </div>
            {/* role=status makes save/error feedback audible to screen readers */}
            <div role="status" aria-live="polite">
              <AnimatePresence>
                {messageSubmitted && !filterError && (
                  <motion.span
                    className="constellation__saved"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.25 }}
                  >
                    &#10003; saved to your star
                  </motion.span>
                )}
              </AnimatePresence>
              {filterError && (
                <span className="constellation__filter-error">Please keep messages appropriate</span>
              )}
              {!filterError && saveError && (
                <span className="constellation__filter-error">Couldn&apos;t save right now &mdash; try again in a moment</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
