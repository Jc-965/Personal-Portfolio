import { useRef, useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence, useInView } from 'framer-motion'
import { ref as dbRef, push, set, onValue, update, increment as fbIncrement, get, runTransaction } from 'firebase/database'
import { getFirebase } from '../utils/firebase'
import { storageGet, storageSet } from '../utils/safeStorage'
import useIsPhone from '../hooks/useIsPhone'

interface Star {
  x: number
  y: number
  color: string
  message: string
  timestamp: number
  sessionId: string
  key?: string
  visitId?: string
  isMega?: boolean
  mergedCount?: number
}

type EditableStarPatch = Partial<Pick<Star, 'x' | 'y' | 'color' | 'message'>>

const COLORS = [
  { value: '#00ffff', label: 'Cyan' },
  { value: '#ff00ff', label: 'Magenta' },
  { value: '#00ff41', label: 'Green' },
  { value: '#ffcc00', label: 'Yellow' },
  { value: '#ff3366', label: 'Red' },
]

const MERGE_THRESHOLD = 250
const MAX_STARS = 300
const MEGA_STAR_COUNT = 10
const MIN_MEGA_DISTANCE = 0.12
const MERGE_LOCK_TIMEOUT_MS = 30000
const VISIT_STAR_MARGIN = 0.08

function createId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.()
  if (randomId) return randomId
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const PAGE_VISIT_ID = createId('visit')
let pageVisitStarStarted = false

const BLOCKED_WORDS = [
  'fuck','shit','bitch','damn','dick','cock','pussy','whore','slut',
  'fag','nigger','nigga','retard','stfu','gtfo','ass','cunt',
]

function isClean(text: string): boolean {
  if (!text) return true
  // Match whole words only — substring checks reject innocent messages
  // ("class", "password" both contain "ass"). Also check the fully-collapsed
  // string against multi-word slurs to catch spaced-out evasion ("f u c k"),
  // but only for words long enough not to appear inside common words.
  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  if (words.some(w => BLOCKED_WORDS.includes(w))) return false
  const collapsed = text.toLowerCase().replace(/[^a-z]/g, '')
  return !BLOCKED_WORDS.some(w => w.length >= 5 && collapsed.includes(w))
}

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

function getVisitStar(stars: Star[]): Star | null {
  return stars.find(star => star.visitId === PAGE_VISIT_ID) ?? null
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

// Calculate mega stars from all stars (mega stars weighted by mergedCount)
function calculateMegaStarsFromBatch(stars: Star[]): Star[] {
  if (stars.length < MEGA_STAR_COUNT) return []

  const gridSize = 15
  const density: Map<string, Star[]> = new Map()

  stars.forEach(star => {
    const gx = Math.floor(star.x * gridSize)
    const gy = Math.floor(star.y * gridSize)
    const key = `${gx},${gy}`
    if (!density.has(key)) density.set(key, [])
    density.get(key)!.push(star)
  })

  const getWeight = (s: Star) => s.isMega ? (s.mergedCount || 1) : 1

  const cellData = Array.from(density.entries())
    .map(([key, cellStars]) => {
      const [gx, gy] = key.split(',').map(Number)
      const weightedCount = cellStars.reduce((sum, s) => sum + getWeight(s), 0)
      return {
        key,
        x: (gx + 0.5) / gridSize,
        y: (gy + 0.5) / gridSize,
        stars: cellStars,
        count: weightedCount,
      }
    })
    .sort((a, b) => b.count - a.count)

  const megaStars: Star[] = []
  const selectedCellKeys = new Set<string>()
  const sessionId = getSessionId()

  for (const cell of cellData) {
    if (megaStars.length >= MEGA_STAR_COUNT) break

    const tooClose = megaStars.some(
      ms => Math.hypot(ms.x - cell.x, ms.y - cell.y) < MIN_MEGA_DISTANCE
    )
    if (tooClose) continue

    selectedCellKeys.add(cell.key)

    // Find most common message (excluding empty), weighted by star count
    const messageCounts: Map<string, number> = new Map()
    cell.stars.forEach(s => {
      if (s.message && s.message.trim()) {
        const msg = s.message.trim()
        messageCounts.set(msg, (messageCounts.get(msg) || 0) + getWeight(s))
      }
    })

    let topMessage = ''
    let maxCount = 0
    messageCounts.forEach((count, msg) => {
      if (count > maxCount) {
        maxCount = count
        topMessage = msg
      }
    })

    // Find most common color, weighted by star count
    const colorCounts: Map<string, number> = new Map()
    cell.stars.forEach(s => {
      colorCounts.set(s.color, (colorCounts.get(s.color) || 0) + getWeight(s))
    })
    let topColor = '#00ffff'
    let maxColorCount = 0
    colorCounts.forEach((count, color) => {
      if (count > maxColorCount) {
        maxColorCount = count
        topColor = color
      }
    })

    megaStars.push({
      x: cell.x,
      y: cell.y,
      color: topColor,
      message: topMessage,
      timestamp: Date.now(),
      sessionId,
      isMega: true,
      mergedCount: cell.count,
    })
  }

  // Redistribute stars from non-selected cells to nearest mega star
  for (const cell of cellData) {
    if (selectedCellKeys.has(cell.key)) continue

    let nearestIdx = 0
    let minDist = Infinity
    for (let i = 0; i < megaStars.length; i++) {
      const d = Math.hypot(megaStars[i].x - cell.x, megaStars[i].y - cell.y)
      if (d < minDist) {
        minDist = d
        nearestIdx = i
      }
    }

    megaStars[nearestIdx].mergedCount = (megaStars[nearestIdx].mergedCount || 0) + cell.count
  }

  return megaStars
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
  const latestPositionPatchRef = useRef<EditableStarPatch | null>(null)
  const messageSaveTimeout = useRef<number | null>(null)
  const [selectedColor, setSelectedColor] = useState('#00ffff')
  const [message, setMessage] = useState('')
  const [messageSubmitted, setMessageSubmitted] = useState(false)
  const [totalStarsEver, setTotalStarsEver] = useState(0)
  const [starsSinceMerge, setStarsSinceMerge] = useState(0)
  const [mergeCount, setMergeCount] = useState(0)
  const [isDraggingVisitStar, setIsDraggingVisitStar] = useState(false)
  const [filterError, setFilterError] = useState(false)
  const [capacityError, setCapacityError] = useState(false)
  const metaReceivedRef = useRef(false)
  const metadataUnavailableRef = useRef(false)
  const localFallbackRef = useRef(false)
  const mergeInProgressRef = useRef(false)
  const sessionId = useRef(getSessionId())
  const isPhone = useIsPhone()

  const sectionRef = useRef(null)
  const inView = useInView(sectionRef, { once: true, margin: '-50px' })

  const drawStars = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
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

    // Draw connections - sparser
    stars.forEach((star, i) => {
      const x1 = star.x * w, y1 = star.y * h
      stars.slice(i + 1).forEach(other => {
        const x2 = other.x * w, y2 = other.y * h
        const d = Math.hypot(x1 - x2, y1 - y2)
        const maxDist = star.isMega || other.isMega ? 180 : 80
        if (d < maxDist) {
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2)
          const alpha = (star.isMega || other.isMega) ? 0.12 : 0.08
          ctx.strokeStyle = `rgba(255,255,255,${alpha * (1 - d / maxDist)})`
          ctx.lineWidth = star.isMega || other.isMega ? 1 : 0.5
          ctx.stroke()
        }
      })
    })

    // Draw stars
    stars.forEach(star => {
      const x = star.x * w, y = star.y * h
      const isHovered = hoveredRef.current === star
      const isCurrentVisitStar =
        star.visitId === PAGE_VISIT_ID ||
        (currentVisitStarRef.current?.key != null && star.key === currentVisitStarRef.current.key)
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
  }, [])

  const loadLocalState = useCallback(() => {
    const saved = storageGet('constellation-stars')
    let stars: Star[] = []
    if (saved) {
      try { stars = JSON.parse(saved) } catch { stars = [] }
    }
    starsRef.current = stars
    currentVisitStarRef.current = getVisitStar(stars)

    const derivedStats = getDerivedStarStats(stars)
    setStarsSinceMerge(derivedStats.regularCount)

    const savedTotal = storageGet('constellation-totalStarsEver')
    if (savedTotal != null) {
      setTotalStarsEver(Number(savedTotal))
    } else {
      setTotalStarsEver(derivedStats.totalCount)
      storageSet('constellation-totalStarsEver', String(derivedStats.totalCount))
    }

    const savedMergeCount = storageGet('constellation-mergeCount')
    setMergeCount(savedMergeCount != null ? Number(savedMergeCount) : derivedStats.mergeCount)

    drawStars()
  }, [drawStars])

  const activateLocalFallback = useCallback(() => {
    if (localFallbackRef.current) return
    localFallbackRef.current = true
    loadLocalState()
  }, [loadLocalState])

  const addLocalStar = useCallback((newStar: Star) => {
    starsRef.current = [...starsRef.current, newStar]
    if (newStar.visitId === PAGE_VISIT_ID) {
      currentVisitStarRef.current = newStar
    }
    storageSet('constellation-stars', JSON.stringify(starsRef.current))
    setStarsSinceMerge(prev => prev + 1)
    setTotalStarsEver(prev => {
      const nextTotal = prev + 1
      storageSet('constellation-totalStarsEver', String(nextTotal))
      return nextTotal
    })
    drawStars()
  }, [drawStars])

  const applyVisitStarPatchLocally = useCallback((patch: EditableStarPatch) => {
    const targetStar = currentVisitStarRef.current ?? getVisitStar(starsRef.current)
    if (!targetStar) return null

    let updatedStar: Star | null = null
    let foundStar = false

    starsRef.current = starsRef.current.map(star => {
      const isTarget = star.visitId === PAGE_VISIT_ID || (targetStar.key != null && star.key === targetStar.key)
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
    if (localFallbackRef.current) {
      storageSet('constellation-stars', JSON.stringify(starsRef.current))
    }
    drawStars()
    return updatedStar
  }, [drawStars])

  const persistVisitStarPatch = useCallback((patch: EditableStarPatch) => {
    const targetStar = currentVisitStarRef.current ?? getVisitStar(starsRef.current)
    if (!targetStar) return

    const db = getFirebase()
    if (db && targetStar.key && !localFallbackRef.current) {
      void update(dbRef(db, `stars/${targetStar.key}`), patch).catch(() => {
        const fallbackStar = currentVisitStarRef.current ?? { ...targetStar, ...patch }
        activateLocalFallback()

        if (getVisitStar(starsRef.current)) {
          applyVisitStarPatchLocally(patch)
        } else {
          addLocalStar({ ...fallbackStar, ...patch, key: undefined })
        }
      })
    } else {
      applyVisitStarPatchLocally(patch)
    }
  }, [activateLocalFallback, addLocalStar, applyVisitStarPatchLocally])

  // Firebase real-time listener
  useEffect(() => {
    const db = getFirebase()
    if (db && !localFallbackRef.current) {
      const starsDbRef = dbRef(db, 'stars')
      const metaRef = dbRef(db, 'metadata')
      const handleStarsFailure = () => activateLocalFallback()
      const handleMetadataFailure = () => {
        metadataUnavailableRef.current = true
        if (!metaReceivedRef.current) {
          const derivedStats = getDerivedStarStats(starsRef.current)
          setTotalStarsEver(derivedStats.totalCount)
          setMergeCount(derivedStats.mergeCount)
        }
      }

      const unsubStars = onValue(
        starsDbRef,
        (snapshot) => {
          const data = snapshot.val()
          const starsList: Star[] = data
            ? Object.entries(data).map(([key, val]) => ({ ...(val as Star), key }))
            : []
          starsRef.current = starsList
          const visitStar = getVisitStar(starsList)
          if (visitStar) {
            currentVisitStarRef.current = visitStar
          }
          const derivedStats = getDerivedStarStats(starsList)

          setStarsSinceMerge(derivedStats.regularCount)

          if (!metaReceivedRef.current) {
            setTotalStarsEver(derivedStats.totalCount)
            if (metadataUnavailableRef.current) {
              setMergeCount(derivedStats.mergeCount)
            }
          }

          drawStars()
        },
        handleStarsFailure
      )

      const unsubMeta = onValue(
        metaRef,
        (snapshot) => {
          const data = snapshot.val()
          metadataUnavailableRef.current = false
          if (data) {
            if (data.totalStarsEver != null) {
              metaReceivedRef.current = true
              setTotalStarsEver(data.totalStarsEver)
            }
            if (data.mergeCount != null) {
              setMergeCount(data.mergeCount)
            }
          }
        },
        handleMetadataFailure
      )

      // Initialize metadata fields if not yet set
      get(metaRef)
        .then(snap => {
          const data = snap.val()
          metadataUnavailableRef.current = false
          const needsTotal = !data || data.totalStarsEver == null
          const needsMerge = !data || data.mergeCount == null

          if (!needsTotal && !needsMerge) return

          return get(starsDbRef).then(starsSnap => {
            const starsData = starsSnap.val()
            const updates: Record<string, number> = {}

            if (needsTotal) {
              if (!starsData) return
              const allStars: Star[] = Object.values(starsData)
              let total = 0
              allStars.forEach(s => {
                total += s.isMega ? (s.mergedCount || 1) : 1
              })
              if (total > 0) updates.totalStarsEver = total
            }

            if (needsMerge) {
              const hasMega = starsData && Object.values(starsData as Record<string, Star>).some(s => s.isMega)
              const totalForCalc = data?.totalStarsEver || updates.totalStarsEver || 0
              updates.mergeCount = hasMega ? Math.max(1, Math.floor(totalForCalc / MERGE_THRESHOLD)) : 0
            }

            if (Object.keys(updates).length > 0) {
              return update(dbRef(db, 'metadata'), updates)
            }
          })
        })
        .catch(handleMetadataFailure)

      return () => { unsubStars(); unsubMeta() }
    } else {
      loadLocalState()
    }
  }, [activateLocalFallback, drawStars, loadLocalState])

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
      drawStars()
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [drawStars])

  // Animation — redraw at ~1.5s intervals; pause when tab hidden to save CPU.
  // Reduced-motion users get a static field (stars still redraw on data changes).
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0, animId: number
    const tick = () => {
      if (document.hidden) return // pause: do not schedule next frame
      frame++
      if (frame % 90 === 0) drawStars()
      animId = requestAnimationFrame(tick)
    }
    const start = () => { animId = requestAnimationFrame(tick) }
    const onVisibility = () => { if (!document.hidden) start() }
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelAnimationFrame(animId)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [drawStars])

  // Check if we need to merge. Uses a Firebase transaction-based lock so
  // concurrent clients can't both trigger a merge and double-up mega stars.
  const checkAndMerge = useCallback(async () => {
    const db = getFirebase()
    if (!db || localFallbackRef.current) return
    if (mergeInProgressRef.current) return

    const regularStars = starsRef.current.filter(s => !s.isMega)
    if (regularStars.length < MERGE_THRESHOLD) return

    mergeInProgressRef.current = true
    let lockClaimed = false
    const lockRef = dbRef(db, 'metadata/mergeLock')

    try {
      const claimedAt = Date.now()
      const txn = await runTransaction(lockRef, current => {
        if (typeof current === 'number' && (claimedAt - current) < MERGE_LOCK_TIMEOUT_MS) {
          return // another client holds a fresh lock — abort
        }
        return claimedAt
      })

      if (!txn.committed || txn.snapshot.val() !== claimedAt) return
      lockClaimed = true

      // Fetch fresh stars under the lock; local state may be stale.
      const snap = await get(dbRef(db, 'stars'))
      const data = snap.val()
      const freshStars: Star[] = data
        ? Object.entries(data).map(([key, val]) => ({ ...(val as Star), key }))
        : []
      const freshRegular = freshStars.filter(s => !s.isMega)
      if (freshRegular.length < MERGE_THRESHOLD) return

      const newMegaStars = calculateMegaStarsFromBatch(freshStars)
      if (newMegaStars.length === 0) return

      const updates: Record<string, unknown> = {}
      freshStars.forEach(s => {
        if (s.key) updates[`stars/${s.key}`] = null
      })
      newMegaStars.forEach(ms => {
        const newKey = push(dbRef(db, 'stars')).key
        if (newKey) {
          updates[`stars/${newKey}`] = {
            x: ms.x,
            y: ms.y,
            color: ms.color,
            message: ms.message,
            timestamp: ms.timestamp,
            sessionId: ms.sessionId,
            isMega: true,
            mergedCount: ms.mergedCount,
          }
        }
      })
      updates['metadata/mergeCount'] = fbIncrement(1)
      updates['metadata/mergeLock'] = null

      await update(dbRef(db), updates)
      lockClaimed = false // lock cleared atomically above
    } catch (e) {
      console.warn('Constellation merge failed:', e)
    } finally {
      if (lockClaimed) {
        try { await update(dbRef(db, 'metadata'), { mergeLock: null }) } catch { /* best effort */ }
      }
      mergeInProgressRef.current = false
    }
  }, [])

  const ensureVisitStar = useCallback(() => {
    const existingStar = currentVisitStarRef.current ?? getVisitStar(starsRef.current)
    if (existingStar) {
      currentVisitStarRef.current = existingStar
      pageVisitStarStarted = true
      return
    }

    if (pageVisitStarStarted) return
    pageVisitStarStarted = true

    if (starsRef.current.length >= MAX_STARS) {
      setCapacityError(true)
      window.setTimeout(() => setCapacityError(false), 2000)
      void checkAndMerge()
      return
    }

    const newStar: Star = {
      x: randomStarCoordinate(),
      y: randomStarCoordinate(),
      color: selectedColor,
      message: '',
      timestamp: Date.now(),
      sessionId: sessionId.current,
      visitId: PAGE_VISIT_ID,
    }

    currentVisitStarRef.current = newStar

    const db = getFirebase()
    if (db && !localFallbackRef.current) {
      const newStarRef = push(dbRef(db, 'stars'))
      const optimisticStar = { ...newStar, key: newStarRef.key ?? undefined }
      currentVisitStarRef.current = optimisticStar
      starsRef.current = [
        ...starsRef.current.filter(star => star.visitId !== PAGE_VISIT_ID),
        optimisticStar,
      ]
      drawStars()

      void set(newStarRef, newStar)
        .then(() => {
          void update(dbRef(db, 'metadata'), { totalStarsEver: fbIncrement(1) }).catch(() => {})
          void checkAndMerge()
        })
        .catch(() => {
          const fallbackStar = currentVisitStarRef.current ?? newStar
          activateLocalFallback()
          if (!getVisitStar(starsRef.current)) {
            addLocalStar({ ...fallbackStar, key: undefined })
          }
        })
    } else {
      addLocalStar(newStar)
    }
  }, [activateLocalFallback, addLocalStar, checkAndMerge, drawStars, selectedColor])

  useEffect(() => {
    ensureVisitStar()
  }, [ensureVisitStar])

  const getCanvasPoint = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    }
  }, [])

  const schedulePositionSave = useCallback((patch: EditableStarPatch) => {
    latestPositionPatchRef.current = patch
    if (positionSaveTimeout.current) {
      window.clearTimeout(positionSaveTimeout.current)
    }

    positionSaveTimeout.current = window.setTimeout(() => {
      const nextPatch = latestPositionPatchRef.current
      latestPositionPatchRef.current = null
      positionSaveTimeout.current = null
      if (nextPatch) {
        persistVisitStarPatch(nextPatch)
      }
    }, 120)
  }, [persistVisitStarPatch])

  const flushPositionSave = useCallback(() => {
    if (positionSaveTimeout.current) {
      window.clearTimeout(positionSaveTimeout.current)
      positionSaveTimeout.current = null
    }

    const nextPatch = latestPositionPatchRef.current
    latestPositionPatchRef.current = null
    if (nextPatch) {
      persistVisitStarPatch(nextPatch)
    }
  }, [persistVisitStarPatch])

  const moveVisitStar = useCallback((clientX: number, clientY: number) => {
    const point = getCanvasPoint(clientX, clientY)
    const visitStar = currentVisitStarRef.current ?? getVisitStar(starsRef.current)
    if (!point || !visitStar) return

    const patch = { x: point.x, y: point.y }
    applyVisitStarPatchLocally(patch)
    schedulePositionSave(patch)
  }, [applyVisitStarPatchLocally, getCanvasPoint, schedulePositionSave])

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
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
    const patch = { color }
    applyVisitStarPatchLocally(patch)
    persistVisitStarPatch(patch)
  }, [applyVisitStarPatchLocally, persistVisitStarPatch])

  const saveMessage = useCallback((nextMessage: string) => {
    const msg = nextMessage.trim()
    if (msg && !isClean(msg)) {
      setFilterError(true)
      return
    }

    setFilterError(false)
    const patch = { message: msg }
    applyVisitStarPatchLocally(patch)
    persistVisitStarPatch(patch)
  }, [applyVisitStarPatchLocally, persistVisitStarPatch])

  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value)
    setFilterError(false)
  }

  const submitMessage = useCallback(() => {
    const msg = message.trim()
    if (msg && !isClean(msg)) {
      setFilterError(true)
      return
    }
    saveMessage(message)
    setMessageSubmitted(true)
  }, [message, saveMessage])

  const startEditing = useCallback(() => {
    setMessageSubmitted(false)
  }, [])

  useEffect(() => {
    return () => {
      if (positionSaveTimeout.current) {
        window.clearTimeout(positionSaveTimeout.current)
      }
      if (messageSaveTimeout.current) {
        window.clearTimeout(messageSaveTimeout.current)
      }
    }
  }, [])

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
      const dx = (star.x - mx) * rect.width
      const dy = (star.y - my) * rect.height
      const hitRadius = star.isMega ? 28 : 18
      if (Math.hypot(dx, dy) < hitRadius) {
        found = star
        break
      }
    }

    if (found !== hoveredRef.current) {
      hoveredRef.current = found
      drawStars()

      if (found && tooltipRef.current) {
        const starX = found.x * rect.width
        const starY = found.y * rect.height

        let label = ''
        if (found.isMega) {
          // Mega star: show "message (X stars)" or just "(X stars)"
          if (found.message) {
            label = found.message
          }
          // Star count will be shown separately in HTML
        } else {
          // Regular star - just show message, no delete instruction
          label = found.message || ''
        }

        if (label || found.isMega) {
          if (found.isMega) {
            tooltipRef.current.innerHTML = `${found.message ? `"${escapeHtml(found.message)}" ` : ''}<span class="constellation__tooltip-count">(${Number(found.mergedCount) || 0} stars)</span>`
          } else {
            tooltipRef.current.textContent = label
          }
          tooltipRef.current.style.left = `${starX}px`
          tooltipRef.current.style.top = `${starY - 45}px`
          tooltipRef.current.classList.add('is-visible')
        } else {
          tooltipRef.current.classList.remove('is-visible')
        }
      } else {
        tooltipRef.current?.classList.remove('is-visible')
      }
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
      </div>

      <p className="constellation__intro">
        One star is added automatically for each visit. Your current star has a ring around it.
        {' '}At {MERGE_THRESHOLD} regular stars, they merge into {MEGA_STAR_COUNT} mega stars at the densest areas.
      </p>

      <motion.div
        className={`constellation ${isDraggingVisitStar ? 'is-dragging' : ''}`}
        ref={containerRef}
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <canvas
          ref={canvasRef}
          className="constellation__canvas"
          aria-label="Constellation sky. Drag to move your star."
          data-cursor-drag
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onContextMenu={e => e.preventDefault()}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => {
            tooltipTimeout.current = window.setTimeout(() => {
              hoveredRef.current = null
              tooltipRef.current?.classList.remove('is-visible')
              drawStars()
            }, 600)
          }}
        />
        <div ref={tooltipRef} className="constellation__tooltip" />
      </motion.div>

      <div className="constellation__editor">
        <div className="constellation__editor-header">
          <span className="constellation__editor-kicker">Your star</span>
          <span className="constellation__editor-hint">
            {isPhone ? 'Tap or drag the sky to reposition it.' : 'Drag or click anywhere in the sky to reposition it.'}
          </span>
        </div>

        <div className="constellation__controls" aria-label="Edit your star">
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
                className={`constellation__message ${filterError || capacityError ? 'is-error' : ''} ${messageSubmitted ? 'is-submitted' : ''}`}
                placeholder="Add a message to your star"
                aria-label="Message for your star"
                maxLength={50}
                value={message}
                disabled={messageSubmitted}
                onChange={handleMessageChange}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !messageSubmitted) {
                    e.preventDefault()
                    submitMessage()
                  }
                }}
              />
              <motion.button
                type="button"
                className={`constellation__msg-btn ${messageSubmitted ? 'constellation__msg-btn--edit' : 'constellation__msg-btn--submit'}`}
                onClick={messageSubmitted ? startEditing : submitMessage}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                aria-label={messageSubmitted ? 'Edit your message' : 'Submit your message'}
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
              {!filterError && capacityError && (
                <span className="constellation__filter-error">Constellation full, merging stars, try again</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
