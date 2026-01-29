import { useRef, useState, useEffect, useCallback } from 'react'
import { motion, useInView } from 'framer-motion'
import { initializeApp } from 'firebase/app'
import { getDatabase, ref as dbRef, push, remove, onValue, type Database } from 'firebase/database'

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

function getSessionId(): string {
  let id = localStorage.getItem('constellation-session')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('constellation-session', id)
  }
  return id
}

// Calculate mega stars from a batch of regular stars
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

  const sortedCells = Array.from(density.entries())
    .map(([key, cellStars]) => {
      const [gx, gy] = key.split(',').map(Number)
      return {
        x: (gx + 0.5) / gridSize,
        y: (gy + 0.5) / gridSize,
        stars: cellStars,
        count: cellStars.length,
      }
    })
    .sort((a, b) => b.count - a.count)

  const megaStars: Star[] = []
  const sessionId = getSessionId()

  for (const cell of sortedCells) {
    if (megaStars.length >= MEGA_STAR_COUNT) break

    const tooClose = megaStars.some(
      ms => Math.hypot(ms.x - cell.x, ms.y - cell.y) < MIN_MEGA_DISTANCE
    )
    if (tooClose) continue

    // Find most common message (excluding empty)
    const messageCounts: Map<string, number> = new Map()
    cell.stars.forEach(s => {
      if (s.message && s.message.trim()) {
        const msg = s.message.trim()
        messageCounts.set(msg, (messageCounts.get(msg) || 0) + 1)
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

    // Find most common color
    const colorCounts: Map<string, number> = new Map()
    cell.stars.forEach(s => {
      colorCounts.set(s.color, (colorCounts.get(s.color) || 0) + 1)
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
  const [totalStars, setTotalStars] = useState(0)
  const [megaStarCount, setMegaStarCount] = useState(0)
  const [filterError, setFilterError] = useState(false)
  const sessionId = useRef(getSessionId())

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

  // Firebase real-time listener
  useEffect(() => {
    const db = getFirebase()
    if (db) {
      const starsDbRef = dbRef(db, 'stars')
      const unsubscribe = onValue(starsDbRef, (snapshot) => {
        const data = snapshot.val()
        const starsList: Star[] = data
          ? Object.entries(data).map(([key, val]) => ({ ...(val as Star), key }))
          : []
        starsRef.current = starsList

        // Count totals
        let total = 0
        let megaCount = 0
        starsList.forEach(s => {
          if (s.isMega) {
            megaCount++
            total += s.mergedCount || 1
          } else {
            total++
          }
        })
        setTotalStars(total)
        setMegaStarCount(megaCount)

        drawStars()
      })
      return () => unsubscribe()
    } else {
      const saved = localStorage.getItem('constellation-stars')
      let stars: Star[] = []
      if (saved) {
        try { stars = JSON.parse(saved) } catch { stars = [] }
      }
      starsRef.current = stars

      let total = 0
      let megaCount = 0
      stars.forEach(s => {
        if (s.isMega) {
          megaCount++
          total += s.mergedCount || 1
        } else {
          total++
        }
      })
      setTotalStars(total)
      setMegaStarCount(megaCount)

      drawStars()
    }
  }, [drawStars])

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

  // Animation
  useEffect(() => {
    let frame = 0, animId: number
    const tick = () => {
      frame++
      if (frame % 90 === 0) drawStars()
      animId = requestAnimationFrame(tick)
    }
    animId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animId)
  }, [drawStars])

  // Check if we need to merge
  const checkAndMerge = useCallback(() => {
    const db = getFirebase()
    if (!db) return

    const stars = starsRef.current
    const regularStars = stars.filter(s => !s.isMega)

    if (regularStars.length >= MERGE_THRESHOLD) {
      // Create mega stars from regular stars
      const megaStars = calculateMegaStarsFromBatch(regularStars)

      // Remove regular stars and add mega stars
      regularStars.forEach(star => {
        if (star.key) {
          remove(dbRef(db, `stars/${star.key}`))
        }
      })

      megaStars.forEach(megaStar => {
        push(dbRef(db, 'stars'), megaStar)
      })
    }
  }, [])

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
    if (db) {
      push(dbRef(db, 'stars'), newStar).then(() => {
        // Check merge after adding
        setTimeout(checkAndMerge, 500)
      })
    } else {
      starsRef.current = [...starsRef.current, newStar]
      localStorage.setItem('constellation-stars', JSON.stringify(starsRef.current))
      setTotalStars(prev => prev + 1)
      drawStars()
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
      if (Math.hypot(star.x - mx, star.y - my) < 0.03) {
        const db = getFirebase()
        if (db && star.key) {
          remove(dbRef(db, `stars/${star.key}`))
        } else {
          starsRef.current = starsRef.current.filter(s => s !== star)
          localStorage.setItem('constellation-stars', JSON.stringify(starsRef.current))
          setTotalStars(prev => prev - 1)
          drawStars()
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
    const threshold = 0.04

    for (const star of starsRef.current) {
      if (Math.hypot(star.x - mx, star.y - my) < threshold) {
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
          tooltipRef.current.innerHTML = found.isMega
            ? `${found.message ? `"${found.message}" ` : ''}<span class="constellation__tooltip-count">(${found.mergedCount} stars)</span>`
            : label
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
    <section className="section constellation-section" id="constellation" ref={sectionRef}>
      <motion.header
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
          <span className="constellation__stat-value">{totalStars}</span>
          <span className="constellation__stat-label">total stars</span>
        </span>
        <span className="constellation__stat-divider">/</span>
        <span className="constellation__stat">
          <span className="constellation__stat-value">{megaStarCount}</span>
          <span className="constellation__stat-label">mega stars</span>
        </span>
      </div>

      <p className="constellation__intro">
        Click to place a star. At {MERGE_THRESHOLD} regular stars, they merge into {MEGA_STAR_COUNT} mega stars at the densest areas.
        Your stars have a ring — <span className="constellation__delete-hint">right-click to delete</span>.
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
    </section>
  )
}
