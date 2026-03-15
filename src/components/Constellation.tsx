import { useRef, useState, useEffect, useCallback } from 'react'
import { motion, useInView } from 'framer-motion'
import { initializeApp } from 'firebase/app'
import { getDatabase, ref as dbRef, push, remove, onValue, update, increment as fbIncrement, get, type Database } from 'firebase/database'
import useIsPhone from '../hooks/useIsPhone'

interface Star {
  x: number
  y: number
  color: string
  message: string
  timestamp: number
  sessionId: string
  key?: string
  isMega?: boolean
  mergedCount?: number
}

const COLORS = [
  { value: '#00ffff', label: 'Cyan' },
  { value: '#ff00ff', label: 'Magenta' },
  { value: '#00ff41', label: 'Green' },
  { value: '#ffcc00', label: 'Yellow' },
  { value: '#ff3366', label: 'Red' },
]

const MERGE_THRESHOLD = 300
const MEGA_STAR_COUNT = 10
const MIN_MEGA_DISTANCE = 0.12

const BLOCKED_WORDS = [
  'fuck','shit','bitch','damn','dick','cock','pussy','whore','slut',
  'fag','nigger','nigga','retard','stfu','gtfo','ass','cunt',
]

function isClean(text: string): boolean {
  if (!text) return true
  const lower = text.toLowerCase().replace(/[^a-z]/g, '')
  return !BLOCKED_WORDS.some(w => lower.includes(w))
}

function escapeHtml(text: string): string {
  const el = document.createElement('span')
  el.textContent = text
  return el.innerHTML
}

function getSessionId(): string {
  let id = localStorage.getItem('constellation-session')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('constellation-session', id)
  }
  return id
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

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

let firebaseApp: ReturnType<typeof initializeApp> | null = null
let database: Database | null = null

function getFirebase() {
  if (!firebaseApp) {
    try {
      firebaseApp = initializeApp(firebaseConfig)
      database = getDatabase(firebaseApp)
    } catch (e) {
      console.warn('Firebase init failed:', e)
    }
  }
  return database
}

export default function Constellation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const starsRef = useRef<Star[]>([])
  const hoveredRef = useRef<Star | null>(null)
  const tooltipTimeout = useRef<number | null>(null)
  const [selectedColor, setSelectedColor] = useState('#00ffff')
  const [message, setMessage] = useState('')
  const [totalStarsEver, setTotalStarsEver] = useState(0)
  const [starsSinceMerge, setStarsSinceMerge] = useState(0)
  const [mergeCount, setMergeCount] = useState(0)
  const [filterError, setFilterError] = useState(false)
  const metaReceivedRef = useRef(false)
  const localFallbackRef = useRef(false)
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
      const isOwn = star.sessionId === sessionId.current
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

      if (isOwn && !isMega) {
        ctx.strokeStyle = star.color + '40'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(x, y, 8, 0, Math.PI * 2)
        ctx.stroke()
      }
    })
  }, [])

  const loadLocalState = useCallback(() => {
    const saved = localStorage.getItem('constellation-stars')
    let stars: Star[] = []
    if (saved) {
      try { stars = JSON.parse(saved) } catch { stars = [] }
    }
    starsRef.current = stars

    let calculatedTotal = 0
    let regularCount = 0
    stars.forEach(s => {
      if (s.isMega) {
        calculatedTotal += s.mergedCount || 1
      } else {
        regularCount++
        calculatedTotal++
      }
    })
    setStarsSinceMerge(regularCount)

    const savedTotal = localStorage.getItem('constellation-totalStarsEver')
    if (savedTotal != null) {
      setTotalStarsEver(Number(savedTotal))
    } else {
      setTotalStarsEver(calculatedTotal)
      localStorage.setItem('constellation-totalStarsEver', String(calculatedTotal))
    }

    const savedMergeCount = localStorage.getItem('constellation-mergeCount')
    setMergeCount(savedMergeCount != null ? Number(savedMergeCount) : 0)

    drawStars()
  }, [drawStars])

  const activateLocalFallback = useCallback(() => {
    if (localFallbackRef.current) return
    localFallbackRef.current = true
    loadLocalState()
  }, [loadLocalState])

  const addLocalStar = useCallback((newStar: Star) => {
    starsRef.current = [...starsRef.current, newStar]
    localStorage.setItem('constellation-stars', JSON.stringify(starsRef.current))
    setStarsSinceMerge(prev => prev + 1)
    setTotalStarsEver(prev => {
      const nextTotal = prev + 1
      localStorage.setItem('constellation-totalStarsEver', String(nextTotal))
      return nextTotal
    })
    drawStars()
  }, [drawStars])

  const removeLocalStar = useCallback((targetStar: Star) => {
    starsRef.current = starsRef.current.filter(star => star !== targetStar)
    localStorage.setItem('constellation-stars', JSON.stringify(starsRef.current))
    setStarsSinceMerge(prev => Math.max(0, prev - 1))
    drawStars()
  }, [drawStars])

  // Firebase real-time listener
  useEffect(() => {
    const db = getFirebase()
    if (db && !localFallbackRef.current) {
      const starsDbRef = dbRef(db, 'stars')
      const metaRef = dbRef(db, 'metadata')
      const handleRemoteFailure = () => activateLocalFallback()

      const unsubStars = onValue(
        starsDbRef,
        (snapshot) => {
          const data = snapshot.val()
          const starsList: Star[] = data
            ? Object.entries(data).map(([key, val]) => ({ ...(val as Star), key }))
            : []
          starsRef.current = starsList

          let regularCount = 0
          let calculatedTotal = 0
          starsList.forEach(s => {
            if (s.isMega) {
              calculatedTotal += s.mergedCount || 1
            } else {
              regularCount++
              calculatedTotal++
            }
          })
          setStarsSinceMerge(regularCount)

          if (!metaReceivedRef.current) {
            setTotalStarsEver(calculatedTotal)
          }

          drawStars()
        },
        handleRemoteFailure
      )

      const unsubMeta = onValue(
        metaRef,
        (snapshot) => {
          const data = snapshot.val()
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
        handleRemoteFailure
      )

      // Initialize metadata fields if not yet set
      get(metaRef)
        .then(snap => {
          const data = snap.val()
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
        .catch(handleRemoteFailure)

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

  // Animation — redraw at ~1.5s intervals; pause when tab hidden to save CPU
  useEffect(() => {
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

  // Check if we need to merge
  const checkAndMerge = useCallback(() => {
    const db = getFirebase()
    if (!db || localFallbackRef.current) return

    const stars = starsRef.current
    const regularStars = stars.filter(s => !s.isMega)

    // Merge when 300 regular stars (stars since last merge) have accumulated
    if (regularStars.length >= MERGE_THRESHOLD) {
      // Merge ALL stars (including existing mega stars) into 10 new mega stars
      const newMegaStars = calculateMegaStarsFromBatch(stars)

      // Remove ALL existing stars
      stars.forEach(star => {
        if (star.key) {
          void remove(dbRef(db, `stars/${star.key}`)).catch(activateLocalFallback)
        }
      })

      // Add the 10 new mega stars
      newMegaStars.forEach(megaStar => {
        void push(dbRef(db, 'stars'), megaStar).catch(activateLocalFallback)
      })

      // Track the merge
      void update(dbRef(db, 'metadata'), { mergeCount: fbIncrement(1) }).catch(activateLocalFallback)
    }
  }, [activateLocalFallback])

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height

    const msg = message.trim()
    if (msg && !isClean(msg)) {
      setFilterError(true)
      setTimeout(() => setFilterError(false), 2000)
      return
    }

    const newStar: Star = {
      x, y,
      color: selectedColor,
      message: msg,
      timestamp: Date.now(),
      sessionId: sessionId.current,
    }

    const db = getFirebase()
    if (db && !localFallbackRef.current) {
      push(dbRef(db, 'stars'), newStar)
        .then(() => {
          void update(dbRef(db, 'metadata'), { totalStarsEver: fbIncrement(1) }).catch(() => {})
          setTimeout(checkAndMerge, 500)
        })
        .catch(() => {
          activateLocalFallback()
          addLocalStar(newStar)
        })
    } else {
      addLocalStar(newStar)
    }
    setMessage('')
  }

  const handleRightClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left) / rect.width
    const my = (e.clientY - rect.top) / rect.height

    for (const star of starsRef.current) {
      if (star.sessionId !== sessionId.current || star.isMega) continue
      const dx = (star.x - mx) * rect.width
      const dy = (star.y - my) * rect.height
      if (Math.hypot(dx, dy) < 15) {
        const db = getFirebase()
        if (db && star.key && !localFallbackRef.current) {
          void remove(dbRef(db, `stars/${star.key}`)).catch(() => {
            activateLocalFallback()
            removeLocalStar(star)
          })
        } else {
          removeLocalStar(star)
        }
        break
      }
    }
  }

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
        {isPhone ? 'Tap to place a star.' : 'Click to place a star.'} At {MERGE_THRESHOLD} regular stars, they merge into {MEGA_STAR_COUNT} mega stars at the densest areas.
        {isPhone ? ' Stars you add keep a ring so they are easy to spot.' : (
          <> Your stars have a ring — <span className="constellation__delete-hint">right-click to delete</span>.</>
        )}
      </p>

      <motion.div
        className="constellation"
        ref={containerRef}
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <canvas
          ref={canvasRef}
          className="constellation__canvas"
          onClick={handleClick}
          onContextMenu={handleRightClick}
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

      <div className="constellation__controls">
        <div className="constellation__color-picker">
          {COLORS.map(c => (
            <button
              key={c.value}
              className={selectedColor === c.value ? 'active' : ''}
              style={{ '--btn-color': c.value } as React.CSSProperties}
              onClick={() => setSelectedColor(c.value)}
              aria-label={c.label}
            />
          ))}
        </div>
        <div className="constellation__input-wrap">
          <input
            type="text"
            className={`constellation__message ${filterError ? 'is-error' : ''}`}
            placeholder="Leave a message"
            maxLength={50}
            value={message}
            onChange={e => { setMessage(e.target.value); setFilterError(false) }}
          />
          {filterError && (
            <span className="constellation__filter-error">Please keep messages appropriate</span>
          )}
        </div>
      </div>
    </>
  )
}
