import { useRef, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { m, AnimatePresence, useInView } from 'framer-motion'
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
  key?: string
  visitId?: string
  isMega?: boolean
  mergedCount?: number
  // Anonymous-auth uid recorded at creation. When it matches this browser's
  // uid, position updates go straight to Firebase instead of through the API.
  ownerUid?: string
}

type EditableStarPatch = Partial<Pick<Star, 'x' | 'y' | 'color' | 'message'>>
type PositionPatch = { x: number; y: number }
type StarMotion = {
  fromX: number
  fromY: number
  toX: number
  toY: number
  startedAt: number
  duration: number
  // Emit a small ring when this tween lands — set for the visitor's own
  // send-flying glide, never for remote stars.
  landPulse?: boolean
}

// The visitor's star entering the page: drawn on a fixed full-viewport overlay
// canvas (the section canvas is clipped to its own box, so a flight from the
// screen corner can only exist outside it). Start point is viewport pixels;
// the landing target is re-read from the constellation's bounding rect every
// frame so scrolling mid-flight never bends the landing.
type EntranceFlight = {
  motionKey: string
  fromX: number
  fromY: number
  startedAt: number
  duration: number
}

type Spark = {
  angle: number
  speed: number
  size: number
}

type SkyEffect = {
  kind: 'shockwave' | 'pulse' | 'pop'
  x: number
  y: number
  color: string
  startedAt: number
  duration: number
  maxRadius: number
  sparks?: Spark[]
}

// maxRadius is the wavefront's final reach in px; the landing shockwave
// computes it from the canvas diagonal at draw time instead (0 here).
const EFFECT_PRESETS: Record<SkyEffect['kind'], { duration: number; maxRadius: number }> = {
  shockwave: { duration: 1100, maxRadius: 0 },
  pulse: { duration: 500, maxRadius: 150 },
  pop: { duration: 520, maxRadius: 120 },
}

// Physical push each wave applies to nearby stars. Purely visual: rendered
// positions displace as the front passes and relax back on their own — the
// offset is a function of (position, time), data coordinates never move.
// The wave itself has no drawn ring; the medium moving IS the visual.
const WAVE_PHYSICS: Record<SkyEffect['kind'], { push: number; width: number }> = {
  shockwave: { push: 55, width: 150 },
  pulse: { push: 14, width: 70 },
  pop: { push: 8, width: 60 },
}

type DirectWriteModule = typeof import('../utils/constellationDirectWrite')

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
// Two position-sync cadences: direct Firebase writes ride the already-open
// WebSocket and can stream near frame rate; API-routed writes go through a
// serverless function and are throttled to respect its rate limit. The
// in-flight guard in drainPositionSync keeps the real rate at whatever the
// round trip allows.
const DIRECT_POSITION_SYNC_INTERVAL_MS = 40
const API_POSITION_SYNC_INTERVAL_MS = 80
// Remote moves are tweened over the gap between the updates that produced them,
// clamped so a first hop or a long pause still reads as motion rather than a
// teleport or a crawl.
const REMOTE_MOVE_MIN_MS = 90
const REMOTE_MOVE_MAX_MS = 320
const CACHE_WRITE_DELAY_MS = 500
// Grab-based dragging: pointerdown only picks the star up inside this radius,
// so clicking empty sky no longer teleports it. Touch gets a wider target.
const GRAB_RADIUS_MOUSE_PX = 24
const GRAB_RADIUS_TOUCH_PX = 36
// Double-click / double-tap on open sky sends the star gliding there.
const DOUBLE_TAP_WINDOW_MS = 350
const DOUBLE_TAP_RADIUS_PX = 40
const SPAWN_FLIGHT_DURATION_MS = 1000
// How long to wait for anonymous auth before creating the star without an
// ownerUid (which simply means API-routed position sync for this visit).
const OWNER_UID_WAIT_MS = 2500
const SPAWN_CANDIDATES = 14

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

function parseFiniteNumber(value: unknown): number | null {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

/**
 * Stars now arrive one child at a time from Firebase and from the local cache,
 * so every entry is normalized at the boundary. A star missing coordinates or a
 * color would otherwise throw inside the canvas gradient and blank the sky.
 */
function normalizeStar(key: string | undefined, raw: unknown): Star | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<Star>
  const x = parseFiniteNumber(value.x)
  const y = parseFiniteNumber(value.y)
  if (x == null || y == null) return null

  const mergedCount = parseFiniteNumber(value.mergedCount)
  const star: Star = {
    x: clamp01(x),
    y: clamp01(y),
    color: typeof value.color === 'string' && value.color ? value.color : COLORS[0].value,
    message: typeof value.message === 'string' ? value.message : '',
    timestamp: parseFiniteNumber(value.timestamp) ?? 0,
    isMega: value.isMega === true,
  }
  if (key) star.key = key
  else if (typeof value.key === 'string') star.key = value.key
  if (typeof value.visitId === 'string') star.visitId = value.visitId
  if (mergedCount != null) star.mergedCount = mergedCount
  if (typeof value.ownerUid === 'string') star.ownerUid = value.ownerUid
  return star
}

/**
 * Identity for the animation maps. The optimistic visit star has no database
 * key yet, so it animates under its visit id until the server assigns one;
 * migrateMotionIdentity moves any in-flight animation across at that moment.
 */
function getMotionKey(star: Star): string | null {
  if (star.key) return star.key
  return star.visitId === PAGE_VISIT_ID ? PAGE_VISIT_ID : null
}

// Softer ease-out exponent than a cubic: the star keeps meaningful terminal
// velocity, so it lands with impact rather than drifting to a stop — the
// shockwave sells the energy it arrives with.
function easeOutImpact(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return 1 - Math.pow(1 - clamped, 2.2)
}

/* ------------------------------------------------------------------ */
/* Star appearance: deterministic per-star look + cached sprites      */
/* ------------------------------------------------------------------ */

// How long a movement trail lingers behind a moving star, and how many
// breadcrumb points it keeps. Small on purpose: trails exist only for stars
// that are actually moving.
const TRAIL_LIFETIME_MS = 380
const TRAIL_MAX_POINTS = 10
// Idle shimmer repaint cadence (~11fps). Subtle amplitude keeps the low rate
// invisible; the motion loop takes over at full frame rate whenever anything
// actually moves.
const TWINKLE_INTERVAL_MS = 90

type StarLook = {
  archetype: number
  scale: number
  rotation: number
  twinklePhase: number
  twinkleSpeed: number
}

// Looks are derived from a hash of the star's stable identity, so every
// browser renders the same star the same way on every frame — nothing extra
// is stored in the database. WeakMap: star objects are replaced on update,
// but the hash re-derives the identical look, and dead entries self-collect.
const starLookCache = new WeakMap<Star, StarLook>()

function getStarLook(star: Star): StarLook {
  const cached = starLookCache.get(star)
  if (cached) return cached

  const seedSource = star.key ?? star.visitId ?? `${star.timestamp}-${star.color}`
  let hash = 2166136261
  for (let i = 0; i < seedSource.length; i++) {
    hash ^= seedSource.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  hash >>>= 0
  const rand = (shift: number) => ((hash >>> shift) & 1023) / 1023

  const look: StarLook = {
    archetype: (hash >>> 2) & 3,
    scale: 0.82 + rand(4) * 0.45,
    rotation: rand(12) * Math.PI,
    twinklePhase: rand(18) * Math.PI * 2,
    twinkleSpeed: 0.0006 + rand(23) * 0.001,
  }
  starLookCache.set(star, look)
  return look
}

const SPRITE_SIZE = 64
const MEGA_SPRITE_SIZE = 112

// Pre-rendered star sprites, keyed by color/archetype/mega. Each is drawn
// once (gradients, diffraction spikes, hot core) and then blitted with
// drawImage — replacing the per-star per-frame radial gradient + shadowBlur
// that used to dominate the paint cost.
const starSpriteCache = new Map<string, HTMLCanvasElement>()

function getStarSprite(color: string, archetype: number, isMega: boolean): HTMLCanvasElement | null {
  const cacheKey = `${color}|${archetype}|${isMega ? 'm' : 's'}`
  const cached = starSpriteCache.get(cacheKey)
  if (cached) return cached

  const size = isMega ? MEGA_SPRITE_SIZE : SPRITE_SIZE
  const sprite = document.createElement('canvas')
  sprite.width = size
  sprite.height = size
  const ctx = sprite.getContext('2d')
  if (!ctx) return null
  const center = size / 2

  const drawSpike = (angle: number, length: number, halfWidth: number, alpha: number) => {
    for (const direction of [0, Math.PI]) {
      ctx.save()
      ctx.translate(center, center)
      ctx.rotate(angle + direction)
      const grad = ctx.createLinearGradient(0, 0, length, 0)
      grad.addColorStop(0, '#ffffff')
      grad.addColorStop(0.3, color)
      grad.addColorStop(1, color + '00')
      ctx.globalAlpha = alpha
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.moveTo(0, -halfWidth)
      ctx.lineTo(length, 0)
      ctx.lineTo(0, halfWidth)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
    ctx.globalAlpha = 1
  }

  // Soft halo behind everything.
  const halo = ctx.createRadialGradient(center, center, 0, center, center, center)
  halo.addColorStop(0, color)
  halo.addColorStop(0.22, color + '55')
  halo.addColorStop(1, color + '00')
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(center, center, center, 0, Math.PI * 2)
  ctx.fill()

  // Diffraction spikes: four archetypes so the sky reads as individuals, not
  // clones. Mega stars get six heavy spikes regardless.
  if (isMega) {
    for (let i = 0; i < 3; i++) {
      drawSpike((i * Math.PI) / 3, center * 0.94, center * 0.055, 0.9)
    }
  } else if (archetype === 0) {
    drawSpike(0, center * 0.95, center * 0.05, 0.9)
    drawSpike(Math.PI / 2, center * 0.95, center * 0.05, 0.9)
  } else if (archetype === 1) {
    drawSpike(0, center * 0.78, center * 0.055, 0.85)
    drawSpike(Math.PI / 2, center * 0.78, center * 0.055, 0.85)
    drawSpike(Math.PI / 4, center * 0.42, center * 0.04, 0.55)
    drawSpike((3 * Math.PI) / 4, center * 0.42, center * 0.04, 0.55)
  } else if (archetype === 2) {
    drawSpike(0, center * 0.72, center * 0.05, 0.8)
    drawSpike(Math.PI / 3, center * 0.72, center * 0.05, 0.8)
    drawSpike((2 * Math.PI) / 3, center * 0.72, center * 0.05, 0.8)
  } else {
    // Compact glow-forward star: short soft spikes, brighter halo.
    drawSpike(0, center * 0.5, center * 0.07, 0.7)
    drawSpike(Math.PI / 2, center * 0.5, center * 0.07, 0.7)
    const boost = ctx.createRadialGradient(center, center, 0, center, center, center * 0.5)
    boost.addColorStop(0, color + '66')
    boost.addColorStop(1, color + '00')
    ctx.fillStyle = boost
    ctx.beginPath()
    ctx.arc(center, center, center * 0.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // Body and white-hot core.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(center, center, size * (isMega ? 0.075 : 0.06), 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(center, center, size * (isMega ? 0.045 : 0.032), 0, Math.PI * 2)
  ctx.fill()

  starSpriteCache.set(cacheKey, sprite)
  return sprite
}

/**
 * Best-of-N spawn placement: sample random candidates and keep the one
 * furthest from every existing star, so a new visitor never lands on top of
 * someone (and then can't find their own ring).
 */
function findOpenSpawnPoint(stars: Star[]): { x: number; y: number } {
  let best = { x: randomStarCoordinate(), y: randomStarCoordinate() }
  if (stars.length === 0) return best

  let bestDistance = -1
  for (let i = 0; i < SPAWN_CANDIDATES; i++) {
    const candidate = i === 0
      ? best
      : { x: randomStarCoordinate(), y: randomStarCoordinate() }
    let minDistance = Infinity
    for (const star of stars) {
      const distance = Math.hypot(star.x - candidate.x, star.y - candidate.y)
      if (distance < minDistance) minDistance = distance
    }
    if (minDistance > bestDistance) {
      bestDistance = minDistance
      best = candidate
    }
  }
  return best
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

function getStarTotalWeight(star: Star): number {
  return star.isMega ? Math.max(1, star.mergedCount || 1) : 1
}

// Only used until the metadata node reports the authoritative count.
function getFallbackMergeCount(stars: Star[], totalCount: number): number {
  return stars.some(star => star.isMega)
    ? Math.max(1, Math.floor(totalCount / MERGE_THRESHOLD))
    : 0
}

function getDisplayedTotal(derivedTotal: number, metadataTotal: number | null): number {
  return metadataTotal == null ? derivedTotal : Math.max(metadataTotal, derivedTotal)
}

function getMotionPosition(motion: StarMotion, now: number) {
  const progress = Math.min(1, Math.max(0, (now - motion.startedAt) / motion.duration))
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
  const messageInputRef = useRef<HTMLInputElement>(null)
  const starsRef = useRef<Star[]>([])
  // Key -> position in starsRef, so a remote move is an O(1) in-place swap
  // instead of a rebuild of the whole sky.
  const starIndexRef = useRef(new Map<string, number>())
  const liveStarKeysRef = useRef(new Set<string>())
  const regularCountRef = useRef(0)
  const totalCountRef = useRef(0)
  const messagesDirtyRef = useRef(true)
  const derivedSyncScheduledRef = useRef(false)
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
  const remoteUpdateAtRef = useRef(new Map<string, number>())
  // Breadcrumbs of recent rendered positions, kept only for stars that are
  // actually moving; each drains away within TRAIL_LIFETIME_MS of the star
  // stopping.
  const trailHistoryRef = useRef(new Map<string, Array<{ x: number; y: number; time: number }>>())
  const spawnFlightRef = useRef<EntranceFlight | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  // Star exists in data but hasn't made its entrance yet — hidden until the
  // sky scrolls into view so the fly-in is actually seen.
  const pendingSpawnEntranceRef = useRef(false)
  const effectsRef = useRef<SkyEffect[]>([])
  const grabOffsetRef = useRef({ dx: 0, dy: 0 })
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null)
  const initialSyncDoneRef = useRef(false)
  const reducedMotionRef = useRef(
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false),
  )
  const directWriteRef = useRef<DirectWriteModule | null>(null)
  const ownerUidRef = useRef<string | null>(null)
  const ownerUidPromiseRef = useRef<Promise<string | null> | null>(null)
  // Flips true after a direct write is rejected (rules not deployed yet, star
  // without ownerUid) so every later frame goes straight to the API path.
  const directWriteBrokenRef = useRef(false)
  const drawRequestRef = useRef<number | null>(null)
  const cacheWriteTimeoutRef = useRef<number | null>(null)
  const pendingCacheRef = useRef<{ stars: Star[]; total: number } | null>(null)
  // Every visitor starts with a random color — five cyan skies in a row make
  // the constellation look single-player.
  const [selectedColor, setSelectedColor] = useState(
    () => COLORS[Math.floor(Math.random() * COLORS.length)].value,
  )
  const [message, setMessage] = useState('')
  const [isEditingMessage, setIsEditingMessage] = useState(false)
  const [hasSavedMessage, setHasSavedMessage] = useState(false)
  const [totalStarsEver, setTotalStarsEver] = useState(0)
  const [starsSinceMerge, setStarsSinceMerge] = useState(0)
  const [mergeCount, setMergeCount] = useState(0)
  const [isDraggingVisitStar, setIsDraggingVisitStar] = useState(false)
  // Mounts the fixed full-viewport canvas the entrance flight draws on.
  const [entranceFlightActive, setEntranceFlightActive] = useState(false)
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

  // The visit star is placed (and counted) the moment the page loads, so the
  // caption field is a read-only summary of an existing star until the visitor
  // asks to edit it.
  const isMessageLocked = !isEditingMessage

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
    const motionKey = getMotionKey(star)
    const motion = motionKey ? starMotionsRef.current.get(motionKey) : null
    const point = motion
      ? getMotionPosition(motion, performance.now())
      : { x: star.x, y: star.y }
    tooltip.style.left = `${point.x * rect.width}px`
    tooltip.style.top = `${point.y * rect.height - 45}px`
    tooltip.classList.add('is-visible')
  }, [])

  // No requestDraw here on purpose: pushEffect is also called from inside the
  // paint loop (flight landings), where scheduling another frame would race
  // the loop's own continuation. Callers outside the loop follow up with
  // requestDraw themselves; inside it, a pending effect keeps the loop alive.
  const pushEffect = useCallback((kind: SkyEffect['kind'], x: number, y: number, color: string) => {
    if (reducedMotionRef.current) return
    // Landings throw sparks; lesser events (release pulse, remote pop) are
    // just a flash plus their displacement wave.
    const sparks = kind === 'shockwave'
      ? Array.from({ length: 14 }, () => ({
          angle: Math.random() * Math.PI * 2,
          speed: 55 + Math.random() * 95,
          size: 1 + Math.random() * 1.4,
        }))
      : undefined
    effectsRef.current.push({
      kind,
      x,
      y,
      color,
      startedAt: performance.now(),
      sparks,
      ...EFFECT_PRESETS[kind],
    })
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
    const flight = spawnFlightRef.current
    const awaitingEntrance = pendingSpawnEntranceRef.current
    const visitStar = currentVisitStarRef.current

    let hasActiveMotion = false

    // Evaluate wave effects before positioning: their fronts physically
    // displace the rendered star positions below, so the whole web — stars and
    // the connection lines between them — ripples outward and springs back.
    const activeWaves: Array<{
      effect: SkyEffect
      t: number
      front: number
      cx: number
      cy: number
      push: number
      width: number
      strength: number
    }> = []
    if (effectsRef.current.length > 0) {
      const remaining: SkyEffect[] = []
      for (const effect of effectsRef.current) {
        const t = (now - effect.startedAt) / effect.duration
        if (t >= 1) continue
        remaining.push(effect)
        const eased = 1 - Math.pow(1 - t, 3)
        const waveRadius = effect.kind === 'shockwave'
          ? Math.hypot(w, h) * 0.55
          : effect.maxRadius
        const physics = WAVE_PHYSICS[effect.kind]
        activeWaves.push({
          effect,
          t,
          front: waveRadius * eased,
          cx: effect.x * w,
          cy: effect.y * h,
          push: physics.push,
          width: physics.width,
          strength: Math.pow(1 - t, 1.5),
        })
      }
      effectsRef.current = remaining
    }

    // Gaussian bump centered on the expanding front: rises as the wave
    // arrives, falls to zero as it passes — stars return home by construction.
    const displace = (px: number, py: number) => {
      let dx = 0
      let dy = 0
      for (const wave of activeWaves) {
        const distX = px - wave.cx
        const distY = py - wave.cy
        const distance = Math.hypot(distX, distY)
        if (distance < 4) continue
        const offset = (distance - wave.front) / wave.width
        const magnitude = wave.push * Math.exp(-offset * offset) * wave.strength
        if (magnitude < 0.05) continue
        dx += (distX / distance) * magnitude
        dy += (distY / distance) * magnitude
      }
      return { dx, dy }
    }

    const starPoints = stars.map((star, index) => {
      const motionKey = getMotionKey(star)
      const isOwn = isVisitStar(star, visitStar)

      // Entrance not started yet, or mid-flight on the full-viewport overlay:
      // either way the star hasn't arrived in this canvas, so it isn't drawn
      // here. The overlay loop performs the handoff at landing.
      if ((isOwn && awaitingEntrance) || (flight && motionKey === flight.motionKey)) {
        return { star, index, motionKey, x: star.x * w, y: star.y * h, hidden: true }
      }

      const motion = motionKey ? starMotionsRef.current.get(motionKey) : null
      const point = motion
        ? getMotionPosition(motion, now)
        : { x: star.x, y: star.y, active: false }

      if (motion && point.active) {
        hasActiveMotion = true
      } else if (motion && motionKey) {
        starMotionsRef.current.delete(motionKey)
        if (motion.landPulse) pushEffect('pulse', motion.toX, motion.toY, star.color)
      }

      const basePx = point.x * w
      const basePy = point.y * h

      // Trail breadcrumbs come from the pre-displacement position: tweened
      // moves and drags leave streaks, but a shockwave rippling the whole sky
      // must not spawn 260 trails at once.
      const isMoving = Boolean(motion && point.active) || (isOwn && isDraggingVisitStarRef.current)
      if (!reducedMotionRef.current && motionKey && isMoving) {
        const trails = trailHistoryRef.current
        let history = trails.get(motionKey)
        const last = history?.[history.length - 1]
        if (!last || Math.hypot(basePx - last.x, basePy - last.y) > 2) {
          if (!history) {
            history = []
            trails.set(motionKey, history)
          }
          history.push({ x: basePx, y: basePy, time: now })
          if (history.length > TRAIL_MAX_POINTS) history.shift()
        }
      }

      let px = basePx
      let py = basePy
      if (activeWaves.length > 0) {
        const wave = displace(px, py)
        px += wave.dx
        py += wave.dy
      }

      return {
        star,
        index,
        motionKey,
        x: px,
        y: py,
        hidden: false,
      }
    })
    const connectionGrid = new Map<string, typeof starPoints>()

    starPoints.forEach(point => {
      // A star mid-entrance doesn't thread into the web until it lands.
      if (point.hidden) return
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
      if (point.hidden) return
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

    // Movement trails, drawn beneath the stars: a moving star pulls a fading
    // streak of its own color behind it. Only stars with breadcrumb history
    // pay anything; the histories drain and delete themselves once still.
    if (trailHistoryRef.current.size > 0) {
      const trails = trailHistoryRef.current
      ctx.lineCap = 'round'
      starPoints.forEach(point => {
        if (point.hidden || !point.motionKey) return
        const history = trails.get(point.motionKey)
        if (!history) return
        while (history.length > 0 && now - history[0].time > TRAIL_LIFETIME_MS) {
          history.shift()
        }
        if (history.length === 0) {
          trails.delete(point.motionKey)
          return
        }
        hasActiveMotion = true
        let previous: { x: number; y: number } = point
        for (let i = history.length - 1; i >= 0; i--) {
          const crumb = history[i]
          const fade = 1 - (now - crumb.time) / TRAIL_LIFETIME_MS
          ctx.globalAlpha = 0.3 * fade
          ctx.strokeStyle = point.star.color
          ctx.lineWidth = 3.4 * fade + 0.3
          ctx.beginPath()
          ctx.moveTo(previous.x, previous.y)
          ctx.lineTo(crumb.x, crumb.y)
          ctx.stroke()
          previous = crumb
        }
      })
      ctx.globalAlpha = 1
      // Histories whose stars vanished mid-move (merges, removals) still
      // need to drain rather than linger forever.
      for (const [key, history] of trails) {
        while (history.length > 0 && now - history[0].time > TRAIL_LIFETIME_MS) {
          history.shift()
        }
        if (history.length === 0) trails.delete(key)
        else hasActiveMotion = true
      }
    }

    // Draw stars: one drawImage blit per star from the sprite cache, plus a
    // slow per-star twinkle on alpha and scale. Amplitude is small enough
    // that the idle ~11fps shimmer cadence reads as atmosphere, not flicker.
    const twinkleEnabled = !reducedMotionRef.current
    starPoints.forEach(({ star, x, y, hidden }) => {
      if (hidden) return
      const isHovered = hoveredRef.current === star
      const isCurrentVisitStar = isVisitStar(star, currentVisitStarRef.current)
      const isMega = star.isMega
      const isOwnDragging = isCurrentVisitStar && isDraggingVisitStarRef.current

      const look = getStarLook(star)
      const sprite = getStarSprite(star.color, look.archetype, Boolean(isMega))
      if (!sprite) return

      const twinkle = twinkleEnabled
        ? Math.sin(now * look.twinkleSpeed + look.twinklePhase)
        : 0
      const emphasis = isHovered || isOwnDragging ? 1.3 : 1
      const dest = (isMega ? 64 : 30) * look.scale * emphasis * (1 + twinkle * 0.05)

      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(look.rotation)
      ctx.globalAlpha = Math.min(1, (isHovered || isOwnDragging ? 1 : 0.82) + twinkle * 0.14)
      ctx.drawImage(sprite, -dest / 2, -dest / 2, dest, dest)
      ctx.restore()

      if (isHovered) {
        ctx.strokeStyle = star.color + '80'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y)
        ctx.moveTo(x, y - 10); ctx.lineTo(x, y + 10)
        ctx.stroke()
      }

      if (isCurrentVisitStar && !isMega) {
        const ringRadius = isOwnDragging ? 14 : 12
        ctx.strokeStyle = star.color + '38'
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.arc(x, y, ringRadius, 0, Math.PI * 2)
        ctx.stroke()

        ctx.strokeStyle = star.color + 'd0'
        ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.arc(x, y, ringRadius - 2, 0, Math.PI * 2)
        ctx.stroke()
      }
    })

    // Impact rendering: no drawn rings — the displaced stars and web carry the
    // wave. What's drawn is the impact itself: a hot flash that cools fast,
    // and sparks thrown radially that decelerate and die out.
    for (const wave of activeWaves) {
      const { effect, t, cx, cy } = wave

      // Flash: white-hot core cooling into the star's color, gone by t=0.3.
      if (t < 0.3) {
        const flashFade = 1 - t / 0.3
        const isImpact = effect.kind === 'shockwave'
        const flashRadius = (isImpact ? 26 : 14) + (isImpact ? 44 : 18) * (t / 0.3)
        const flash = ctx.createRadialGradient(cx, cy, 0, cx, cy, flashRadius)
        flash.addColorStop(0, '#ffffff')
        flash.addColorStop(0.3, effect.color)
        flash.addColorStop(1, 'transparent')
        ctx.globalAlpha = flashFade * flashFade * (isImpact ? 0.85 : 0.5)
        ctx.fillStyle = flash
        ctx.beginPath()
        ctx.arc(cx, cy, flashRadius, 0, Math.PI * 2)
        ctx.fill()
      }

      // Sparks: streaks that decelerate outward, drawn only for landings.
      if (effect.sparks && t < 0.65) {
        const sparkT = t / 0.65
        const travel = 1 - Math.pow(1 - sparkT, 3)
        const trail = 1 - Math.pow(1 - Math.max(0, sparkT - 0.07), 3)
        const sparkFade = Math.pow(1 - sparkT, 1.4)
        ctx.lineCap = 'round'
        for (const spark of effect.sparks) {
          const cos = Math.cos(spark.angle)
          const sin = Math.sin(spark.angle)
          ctx.globalAlpha = sparkFade * 0.9
          ctx.strokeStyle = effect.color
          ctx.lineWidth = spark.size * sparkFade + 0.3
          ctx.beginPath()
          ctx.moveTo(cx + cos * spark.speed * trail, cy + sin * spark.speed * trail)
          ctx.lineTo(cx + cos * spark.speed * travel, cy + sin * spark.speed * travel)
          ctx.stroke()
        }
      }
    }
    ctx.globalAlpha = 1
    // Read the ref, not the pruned snapshot: a landing this frame pushed its
    // shockwave after activeWaves was built, and the loop must keep running.
    if (effectsRef.current.length > 0) hasActiveMotion = true

    const hoveredPoint = starPoints.find(point => point.star === hoveredRef.current)
    if (hoveredPoint && tooltipRef.current?.classList.contains('is-visible')) {
      tooltipRef.current.style.left = `${hoveredPoint.x}px`
      tooltipRef.current.style.top = `${hoveredPoint.y - 45}px`
    }

    return hasActiveMotion
  }, [pushEffect])

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

  /* ------------------------------------------------------------------ */
  /* Star list bookkeeping                                              */
  /* ------------------------------------------------------------------ */

  const reindexStars = useCallback(() => {
    const index = starIndexRef.current
    index.clear()
    starsRef.current.forEach((star, position) => {
      if (star.key) index.set(star.key, position)
    })
  }, [])

  const applyStarCountDelta = useCallback((star: Star, sign: 1 | -1) => {
    if (star.isMega) {
      totalCountRef.current = Math.max(0, totalCountRef.current + sign * getStarTotalWeight(star))
      return
    }
    regularCountRef.current = Math.max(0, regularCountRef.current + sign)
    totalCountRef.current = Math.max(0, totalCountRef.current + sign)
  }, [])

  const replaceStarList = useCallback((list: Star[]) => {
    starsRef.current = list
    reindexStars()
    let regular = 0
    let total = 0
    list.forEach(star => {
      if (!star.isMega) regular++
      total += getStarTotalWeight(star)
    })
    regularCountRef.current = regular
    totalCountRef.current = total
    messagesDirtyRef.current = true
  }, [reindexStars])

  const insertStar = useCallback((star: Star) => {
    if (star.key) starIndexRef.current.set(star.key, starsRef.current.length)
    starsRef.current.push(star)
    applyStarCountDelta(star, 1)
    if (star.message) messagesDirtyRef.current = true
  }, [applyStarCountDelta])

  const replaceStarAt = useCallback((position: number, star: Star): Star | null => {
    const previous = starsRef.current[position]
    if (!previous) return null
    starsRef.current[position] = star
    if (star.key) starIndexRef.current.set(star.key, position)
    applyStarCountDelta(previous, -1)
    applyStarCountDelta(star, 1)
    if (
      previous.message !== star.message ||
      previous.isMega !== star.isMega ||
      previous.mergedCount !== star.mergedCount
    ) {
      messagesDirtyRef.current = true
    }
    return previous
  }, [applyStarCountDelta])

  const removeStarAt = useCallback((position: number): Star | null => {
    const [removed] = starsRef.current.splice(position, 1)
    reindexStars()
    if (!removed) return null
    applyStarCountDelta(removed, -1)
    if (removed.message) messagesDirtyRef.current = true
    if (removed.key) {
      starMotionsRef.current.delete(removed.key)
      remoteUpdateAtRef.current.delete(removed.key)
      trailHistoryRef.current.delete(removed.key)
    }
    return removed
  }, [applyStarCountDelta, reindexStars])

  const findStarPosition = useCallback((star: Star): number => {
    if (star.key) {
      const position = starIndexRef.current.get(star.key)
      if (position !== undefined) return position
    }
    return starsRef.current.indexOf(star)
  }, [])

  const flushDerivedState = useCallback(() => {
    derivedSyncScheduledRef.current = false
    setStarsSinceMerge(regularCountRef.current)
    updateDisplayedTotal(totalCountRef.current)
    if (messagesDirtyRef.current) {
      messagesDirtyRef.current = false
      syncAccessibleMessages(starsRef.current)
    }
    scheduleCachedSnapshot(
      starsRef.current,
      getDisplayedTotal(totalCountRef.current, metadataTotalRef.current),
    )
  }, [scheduleCachedSnapshot, syncAccessibleMessages, updateDisplayedTotal])

  // Firebase delivers a burst of child events for a single server update (a
  // merge rewrites the whole sky), so the counters and the screen-reader list
  // settle once per batch instead of once per star.
  const scheduleDerivedSync = useCallback(() => {
    if (derivedSyncScheduledRef.current) return
    derivedSyncScheduledRef.current = true
    queueMicrotask(flushDerivedState)
  }, [flushDerivedState])

  // The optimistic star animates under PAGE_VISIT_ID until the server assigns
  // its database key; any entrance flight or glide in progress follows it
  // across so the animation never freezes mid-air at that moment.
  const migrateMotionIdentity = useCallback((fromKey: string, toKey: string) => {
    if (fromKey === toKey) return
    const flight = spawnFlightRef.current
    if (flight?.motionKey === fromKey) flight.motionKey = toKey
    const motion = starMotionsRef.current.get(fromKey)
    if (motion) {
      starMotionsRef.current.delete(fromKey)
      starMotionsRef.current.set(toKey, motion)
    }
  }, [])

  // Grabbing the star takes manual control: whatever automated movement is
  // running (entrance flight, send-flying glide) stops immediately.
  const cancelVisitStarAnimations = useCallback(() => {
    pendingSpawnEntranceRef.current = false
    spawnFlightRef.current = null
    setEntranceFlightActive(false)
    const star = currentVisitStarRef.current
    const motionKey = star ? getMotionKey(star) : null
    if (motionKey) starMotionsRef.current.delete(motionKey)
  }, [])

  const startRemoteMotion = useCallback((key: string, previous: Star, next: Star) => {
    if (reducedMotionRef.current) return
    const now = performance.now()
    const lastUpdateAt = remoteUpdateAtRef.current.get(key)
    remoteUpdateAtRef.current.set(key, now)
    const gap = lastUpdateAt == null ? REMOTE_MOVE_MAX_MS : now - lastUpdateAt
    const duration = Math.min(REMOTE_MOVE_MAX_MS, Math.max(REMOTE_MOVE_MIN_MS, gap))
    const activeMotion = starMotionsRef.current.get(key)
    const from = activeMotion
      ? getMotionPosition(activeMotion, now)
      : { x: previous.x, y: previous.y }
    starMotionsRef.current.set(key, {
      fromX: from.x,
      fromY: from.y,
      toX: next.x,
      toY: next.y,
      startedAt: now,
      duration,
    })
  }, [])

  const dropOptimisticVisitStar = useCallback(() => {
    const position = starsRef.current.findIndex(
      star => !star.key && star.visitId === PAGE_VISIT_ID,
    )
    if (position >= 0) removeStarAt(position)
  }, [removeStarAt])

  const loadLocalState = useCallback(() => {
    const saved = storageGet('constellation-stars')
    let stars: Star[] = []
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as unknown
        if (Array.isArray(parsed)) {
          stars = parsed
            .map(entry => normalizeStar(undefined, entry))
            .filter((star): star is Star => star !== null)
        }
      } catch {
        stars = []
      }
    }
    // Keep this page's optimistic visit star — it exists only in memory when
    // the Firebase write never settled (stalled connection).
    const pendingVisitStar = currentVisitStarRef.current
    if (pendingVisitStar && !getVisitStar(stars, pendingVisitStar)) {
      stars = [...stars, pendingVisitStar]
    }
    replaceStarList(stars)
    currentVisitStarRef.current = getVisitStar(starsRef.current, currentVisitStarRef.current)
    setHasVisitStar(Boolean(currentVisitStarRef.current))
    syncAccessibleMessages(starsRef.current)
    messagesDirtyRef.current = false

    setStarsSinceMerge(regularCountRef.current)
    derivedTotalRef.current = totalCountRef.current

    const savedTotal = storageGet('constellation-totalStarsEver')
    const savedTotalNumber = savedTotal == null ? null : parseFiniteNumber(savedTotal)
    const displayTotal = getDisplayedTotal(totalCountRef.current, savedTotalNumber)
    setTotalStarsEver(displayTotal)
    if (savedTotalNumber == null || displayTotal > savedTotalNumber) {
      storageSet('constellation-totalStarsEver', String(displayTotal))
    }

    const fallbackMergeCount = getFallbackMergeCount(starsRef.current, totalCountRef.current)
    const savedMergeCount = storageGet('constellation-mergeCount')
    setMergeCount(savedMergeCount != null
      ? (parseFiniteNumber(savedMergeCount) ?? fallbackMergeCount)
      : fallbackMergeCount)

    requestDraw()
  }, [replaceStarList, requestDraw, syncAccessibleMessages])

  const activateLocalFallback = useCallback(() => {
    if (localFallbackRef.current) return
    localFallbackRef.current = true
    setConnectionStatus('offline')
    loadLocalState()
    storageSet('constellation-stars', JSON.stringify(starsRef.current))
  }, [loadLocalState])

  // A failed write endpoint doesn't mean the sky is offline — reads may still
  // be live. Keep the view live and let the visitor's star ride along in
  // memory; the realtime handlers preserve it via its visitId.
  const addPendingVisitStar = useCallback((star: Star) => {
    const existingStar = getVisitStar(starsRef.current, currentVisitStarRef.current)
    if (existingStar) {
      currentVisitStarRef.current = existingStar
      setHasVisitStar(true)
      return
    }

    currentVisitStarRef.current = star
    insertStar(star)
    setHasVisitStar(true)
    scheduleDerivedSync()
    requestDraw()
  }, [insertStar, requestDraw, scheduleDerivedSync])

  const applyVisitStarPatchLocally = useCallback((patch: EditableStarPatch) => {
    const targetStar = currentVisitStarRef.current ?? getVisitStar(starsRef.current, currentVisitStarRef.current)
    if (!targetStar) return null

    pendingVisitPatchRef.current = {
      ...pendingVisitPatchRef.current,
      ...patch,
    }

    const position = findStarPosition(targetStar)
    let updatedStar: Star
    if (position >= 0 && starsRef.current[position]) {
      updatedStar = { ...starsRef.current[position], ...patch }
      replaceStarAt(position, updatedStar)
    } else {
      updatedStar = { ...targetStar, ...patch }
      insertStar(updatedStar)
      setHasVisitStar(true)
    }

    currentVisitStarRef.current = updatedStar
    if (localFallbackRef.current) {
      storageSet('constellation-stars', JSON.stringify(starsRef.current))
    }
    scheduleDerivedSync()
    requestDraw()
    return updatedStar
  }, [findStarPosition, insertStar, replaceStarAt, requestDraw, scheduleDerivedSync])

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

  /* ------------------------------------------------------------------ */
  /* Realtime handlers                                                  */
  /* ------------------------------------------------------------------ */

  const upsertRemoteStar = useCallback((key: string, raw: unknown) => {
    const incoming = normalizeStar(key, raw)
    if (!incoming) return
    liveStarKeysRef.current.add(key)

    const isOwnStar = incoming.visitId === PAGE_VISIT_ID
    let next = incoming

    if (isOwnStar) {
      // Local edits the server hasn't echoed yet must survive the round trip,
      // or a drag snaps backwards each time an older write lands.
      const pendingPatch = pendingVisitPatchRef.current
      const unresolvedPatch: EditableStarPatch = {}
      const reconciled = { ...incoming }

      if (pendingPatch.x !== undefined && pendingPatch.x !== incoming.x) {
        unresolvedPatch.x = pendingPatch.x
        reconciled.x = pendingPatch.x
      }
      if (pendingPatch.y !== undefined && pendingPatch.y !== incoming.y) {
        unresolvedPatch.y = pendingPatch.y
        reconciled.y = pendingPatch.y
      }
      if (pendingPatch.color !== undefined && pendingPatch.color !== incoming.color) {
        unresolvedPatch.color = pendingPatch.color
        reconciled.color = pendingPatch.color
      }
      if (pendingPatch.message !== undefined && pendingPatch.message !== incoming.message) {
        unresolvedPatch.message = pendingPatch.message
        reconciled.message = pendingPatch.message
      }

      pendingVisitPatchRef.current = unresolvedPatch
      next = reconciled
      // Any animation running under the optimistic identity follows the star
      // to its database key before the placeholder is dropped.
      migrateMotionIdentity(PAGE_VISIT_ID, key)
      dropOptimisticVisitStar()
    }

    const position = starIndexRef.current.get(key)
    if (position === undefined) {
      insertStar(next)
      // Another visitor's star arriving right now — a brief ring makes the
      // moment visible instead of the star just silently existing. Initial
      // sync is excluded: hundreds of pops on load would be noise.
      if (!isOwnStar && initialSyncDoneRef.current) {
        pushEffect('pop', next.x, next.y, next.color)
      }
    } else {
      const previous = replaceStarAt(position, next)
      if (previous && !isOwnStar && (previous.x !== next.x || previous.y !== next.y)) {
        startRemoteMotion(key, previous, next)
      }
    }

    if (isOwnStar) {
      currentVisitStarRef.current = next
      setHasVisitStar(true)
    }

    if (hoveredRef.current?.key === key) {
      hoveredRef.current = next
      syncTooltip(next)
    }

    scheduleDerivedSync()
    requestDraw()
  }, [
    dropOptimisticVisitStar,
    insertStar,
    migrateMotionIdentity,
    pushEffect,
    replaceStarAt,
    requestDraw,
    scheduleDerivedSync,
    startRemoteMotion,
    syncTooltip,
  ])

  const removeRemoteStar = useCallback((key: string) => {
    liveStarKeysRef.current.delete(key)
    const position = starIndexRef.current.get(key)
    if (position === undefined) return
    removeStarAt(position)

    if (currentVisitStarRef.current?.key === key) {
      currentVisitStarRef.current = null
      pendingVisitPatchRef.current = {}
      setHasVisitStar(false)
    }
    if (hoveredRef.current?.key === key) {
      hoveredRef.current = null
      syncTooltip(null)
    }

    scheduleDerivedSync()
    requestDraw()
  }, [removeStarAt, requestDraw, scheduleDerivedSync, syncTooltip])

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
        updateDisplayedTotal(totalCountRef.current)
        setMergeCount(getFallbackMergeCount(starsRef.current, totalCountRef.current))
      }
    }

    // Anonymous auth and the direct-write module load alongside the realtime
    // subscription. createVisitStar awaits this uid (with a timeout) so the
    // star it creates carries an ownerUid and can stream positions directly.
    ownerUidPromiseRef.current ??= import('../utils/constellationDirectWrite')
      .then(module => {
        directWriteRef.current = module
        return module.ensureAnonymousUid()
      })
      .then(uid => {
        ownerUidRef.current = uid
        return uid
      })
      .catch(() => null)

    const connect = async () => {
      try {
        const { subscribeToConstellation } = await import('../utils/constellationRealtime')
        if (disposed) return

        unsubscribe = subscribeToConstellation({
          onStarAdded: (key, value) => {
            if (disposed) return
            upsertRemoteStar(key, value)
          },
          onStarChanged: (key, value) => {
            if (disposed) return
            upsertRemoteStar(key, value)
          },
          onStarRemoved: key => {
            if (disposed) return
            removeRemoteStar(key)
          },
          onStarsSynced: isInitial => {
            if (disposed) return
            window.clearTimeout(stallTimeout)
            localFallbackRef.current = false
            setConnectionStatus('live')
            initialSyncDoneRef.current = true

            if (isInitial) {
              // Cached stars that the server no longer has (merged away while
              // this browser was closed) never fire child_removed, so the first
              // full sync is the moment to drop them.
              const liveKeys = liveStarKeysRef.current
              const pruned = starsRef.current.filter(star => (
                star.key ? liveKeys.has(star.key) : star.visitId === PAGE_VISIT_ID
              ))
              if (pruned.length !== starsRef.current.length) {
                replaceStarList(pruned)
                currentVisitStarRef.current = getVisitStar(
                  starsRef.current,
                  currentVisitStarRef.current,
                )
                setHasVisitStar(Boolean(currentVisitStarRef.current))
              }
            }

            if (!metaReceivedRef.current && metadataUnavailableRef.current) {
              const fallbackMergeCount = getFallbackMergeCount(
                starsRef.current,
                totalCountRef.current,
              )
              setMergeCount(fallbackMergeCount)
              storageSet('constellation-mergeCount', String(fallbackMergeCount))
            }

            positionSyncDrainRef.current()
            scheduleDerivedSync()
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
    removeRemoteStar,
    replaceStarList,
    requestDraw,
    scheduleDerivedSync,
    updateDisplayedTotal,
    upsertRemoteStar,
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

  // Idle shimmer: request a repaint at a gentle cadence, but only while the
  // sky is actually on screen and the tab is visible. The interval merely
  // schedules a paint — the rAF-coalesced loop does the work — and while
  // paused (scrolled away, hidden tab, reduced motion) the sky costs nothing.
  useEffect(() => {
    if (reducedMotionRef.current) return
    const container = containerRef.current
    if (!container) return

    let interval: number | null = null
    let inView = false
    const start = () => {
      if (interval === null && inView && !document.hidden) {
        interval = window.setInterval(requestDraw, TWINKLE_INTERVAL_MS)
      }
    }
    const stop = () => {
      if (interval !== null) {
        window.clearInterval(interval)
        interval = null
      }
    }
    const observer = new IntersectionObserver(entries => {
      inView = entries[0]?.isIntersecting ?? false
      if (inView) start()
      else stop()
    }, { rootMargin: '60px' })
    observer.observe(container)
    const handleVisibility = () => {
      if (document.hidden) stop()
      else start()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      stop()
      observer.disconnect()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [requestDraw])

  const createVisitStar = useCallback(() => {
    const existingStar = currentVisitStarRef.current ?? getVisitStar(starsRef.current, currentVisitStarRef.current)
    if (existingStar) {
      currentVisitStarRef.current = existingStar
      setHasVisitStar(true)
      return
    }

    const spawnPoint = findOpenSpawnPoint(starsRef.current)
    const newStar: Star = {
      x: spawnPoint.x,
      y: spawnPoint.y,
      color: selectedColor,
      message: '',
      timestamp: Date.now(),
      visitId: PAGE_VISIT_ID,
    }

    setSaveError(false)
    // Place the star before starting any network work. Visitors can drag,
    // recolor, and caption it immediately even on a slow connection.
    addPendingVisitStar(newStar)
    // Hold the star off-canvas until the sky scrolls into view, then fly it in.
    if (!reducedMotionRef.current) pendingSpawnEntranceRef.current = true

    void (async () => {
      // Give anonymous auth a moment to mint the uid — a star created with an
      // ownerUid can stream its drags straight to Firebase. On timeout the
      // star is simply created without one and this visit stays on API sync.
      let ownerUid = ownerUidRef.current
      if (!ownerUid && ownerUidPromiseRef.current) {
        ownerUid = await Promise.race([
          ownerUidPromiseRef.current,
          new Promise<null>(resolve => {
            window.setTimeout(() => resolve(null), OWNER_UID_WAIT_MS)
          }),
        ])
      }

      const created = await createConstellationStar({
        sessionSecret: sessionSecret.current,
        visitId: PAGE_VISIT_ID,
        x: newStar.x,
        y: newStar.y,
        color: newStar.color,
        ownerUid: ownerUid ?? undefined,
      })

      if (!created) {
        if (localFallbackRef.current) {
          storageSet('constellation-stars', JSON.stringify(starsRef.current))
        }
        return
      }

      const pendingPatch = pendingVisitPatchRef.current
      const liveStar: Star = {
        ...(normalizeStar(created.key, created.star) ?? newStar),
        ...pendingPatch,
        key: created.key,
      }
      // The realtime child event for this star may already have landed; either
      // way the keyless placeholder goes and the keyed row wins. An entrance
      // flight or glide in progress follows the star to its new identity.
      migrateMotionIdentity(PAGE_VISIT_ID, created.key)
      dropOptimisticVisitStar()
      const position = starIndexRef.current.get(created.key)
      if (position === undefined) {
        insertStar(liveStar)
      } else {
        replaceStarAt(position, liveStar)
      }
      currentVisitStarRef.current = liveStar
      setHasVisitStar(true)
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
      scheduleDerivedSync()
      requestDraw()
    })()
  }, [
    addPendingVisitStar,
    dropOptimisticVisitStar,
    insertStar,
    migrateMotionIdentity,
    persistVisitStarPatch,
    replaceStarAt,
    requestDraw,
    scheduleDerivedSync,
    selectedColor,
  ])

  // One star is placed automatically per page visit — no button involved. That
  // placement *is* the visitor's submission; the caption is an edit on top of it.
  useEffect(() => {
    if (pageVisitStarStarted) return
    pageVisitStarStarted = true
    createVisitStar()
  }, [createVisitStar])

  const startSpawnFlight = useCallback(() => {
    pendingSpawnEntranceRef.current = false
    const star = currentVisitStarRef.current
    const motionKey = star ? getMotionKey(star) : null
    if (!star || !motionKey || reducedMotionRef.current) {
      requestDraw()
      return
    }
    // Viewport pixels: just beyond the top-right corner of the screen. The
    // flight itself renders on the fixed overlay canvas, so it genuinely
    // crosses the page — over the nav, other sections, everything.
    spawnFlightRef.current = {
      motionKey,
      fromX: window.innerWidth + 80,
      fromY: -80,
      startedAt: 0, // stamped by the overlay loop on its first frame
      duration: SPAWN_FLIGHT_DURATION_MS,
    }
    setEntranceFlightActive(true)
    requestDraw()
  }, [requestDraw])

  // The entrance flight loop: draws the comet on the full-viewport overlay.
  // The landing target is re-read from the constellation's bounding rect every
  // frame, so scrolling mid-flight bends the path instead of missing the mark.
  useEffect(() => {
    if (!entranceFlightActive) return
    let frame: number | null = null

    const finish = (landed: boolean) => {
      const flight = spawnFlightRef.current
      spawnFlightRef.current = null
      setEntranceFlightActive(false)
      const star = currentVisitStarRef.current
      if (landed && flight && star) {
        pushEffect('shockwave', star.x, star.y, star.color)
      }
      requestDraw()
    }

    const paint = () => {
      frame = null
      const overlay = overlayCanvasRef.current
      const flight = spawnFlightRef.current
      const star = currentVisitStarRef.current
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!overlay || !flight || !star || !rect || rect.width === 0) {
        finish(false)
        return
      }
      const ctx = overlay.getContext('2d')
      if (!ctx) {
        finish(false)
        return
      }

      const vw = window.innerWidth
      const vh = window.innerHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (overlay.width !== vw * dpr || overlay.height !== vh * dpr) {
        overlay.width = vw * dpr
        overlay.height = vh * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, vw, vh)

      const now = performance.now()
      if (flight.startedAt === 0) flight.startedAt = now
      const rawT = (now - flight.startedAt) / flight.duration

      const toX = rect.left + star.x * rect.width
      const toY = rect.top + star.y * rect.height
      const dx = toX - flight.fromX
      const dy = toY - flight.fromY
      const travel = Math.hypot(dx, dy) || 1
      // Gravity-like bow perpendicular to the straight line, capped so odd
      // viewport geometry can't fold the arc back on itself.
      const bow = Math.min(280, travel * 0.18)
      const controlX = (flight.fromX + toX) / 2 + (dy / travel) * bow
      const controlY = (flight.fromY + toY) / 2 - (dx / travel) * bow

      const pointAt = (t: number) => {
        const eased = easeOutImpact(t)
        const inv = 1 - eased
        return {
          x: inv * inv * flight.fromX + 2 * inv * eased * controlX + eased * eased * toX,
          y: inv * inv * flight.fromY + 2 * inv * eased * controlY + eased * eased * toY,
        }
      }

      if (rawT >= 1) {
        finish(true)
        return
      }

      const head = pointAt(rawT)

      // Tapered comet tail sampled backwards in time.
      const ghostCount = 8
      let previous = head
      ctx.lineCap = 'round'
      for (let ghost = 1; ghost <= ghostCount; ghost++) {
        const ghostT = rawT - (ghost * 30) / flight.duration
        if (ghostT <= 0) break
        const ghostPoint = pointAt(ghostT)
        const fade = 1 - ghost / (ghostCount + 1)
        ctx.globalAlpha = 0.32 * fade
        ctx.strokeStyle = star.color
        ctx.lineWidth = 5.5 * fade + 0.5
        ctx.beginPath()
        ctx.moveTo(previous.x, previous.y)
        ctx.lineTo(ghostPoint.x, ghostPoint.y)
        ctx.stroke()
        previous = ghostPoint
      }

      // The comet head: bright glow, star-colored body, white-hot core.
      const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 34)
      glow.addColorStop(0, star.color)
      glow.addColorStop(0.35, star.color + '50')
      glow.addColorStop(1, 'transparent')
      ctx.globalAlpha = 1
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(head.x, head.y, 34, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = star.color
      ctx.beginPath()
      ctx.arc(head.x, head.y, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(head.x, head.y, 2, 0, Math.PI * 2)
      ctx.fill()

      frame = window.requestAnimationFrame(paint)
    }

    frame = window.requestAnimationFrame(paint)
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [entranceFlightActive, pushEffect, requestDraw])

  // The entrance waits for the sky to scroll into view — an animation nobody
  // sees is a star that just silently appears.
  useEffect(() => {
    if (!skyInView || !hasVisitStar) return
    if (!pendingSpawnEntranceRef.current) return
    startSpawnFlight()
  }, [skyInView, hasVisitStar, startSpawnFlight])

  const getCanvasPoint = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    }
  }, [])

  // Direct writes need the module loaded, an anonymous uid, and a star whose
  // ownerUid matches it. One rejected write flips the whole session to the API
  // path — rules not deployed or auth revoked won't resolve mid-drag.
  const canDirectWrite = useCallback((star: Star | null | undefined) => {
    return Boolean(
      star?.key &&
      star.ownerUid &&
      !directWriteBrokenRef.current &&
      directWriteRef.current &&
      ownerUidRef.current &&
      star.ownerUid === ownerUidRef.current,
    )
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

    const interval = canDirectWrite(targetStar)
      ? DIRECT_POSITION_SYNC_INTERVAL_MS
      : API_POSITION_SYNC_INTERVAL_MS
    const elapsed = performance.now() - positionSyncLastSentAtRef.current
    const delay = Math.max(0, interval - elapsed)
    positionSaveTimeout.current = window.setTimeout(() => {
      positionSaveTimeout.current = null
      const nextPatch = latestPositionPatchRef.current
      const latestTarget = currentVisitStarRef.current ??
        getVisitStar(starsRef.current, currentVisitStarRef.current)
      const starKey = latestTarget?.key
      if (!nextPatch || !starKey || localFallbackRef.current) return

      latestPositionPatchRef.current = null
      positionSyncInFlightRef.current = true
      positionSyncLastSentAtRef.current = performance.now()

      const sendViaApi = () => updateConstellationStar({
        starKey,
        sessionSecret: sessionSecret.current,
        patch: nextPatch,
      }).then(() => undefined)

      const directModule = directWriteRef.current
      const send = canDirectWrite(latestTarget) && directModule
        ? directModule.writeStarPosition(starKey, nextPatch.x, nextPatch.y).then(ok => {
            if (ok) return
            // Rejected or failed — hand this same frame to the API so no
            // movement is dropped, and stop trying the direct path.
            directWriteBrokenRef.current = true
            return sendViaApi()
          })
        : sendViaApi()

      void send.finally(() => {
        positionSyncInFlightRef.current = false
        if (latestPositionPatchRef.current) {
          positionSyncDrainRef.current()
        }
      })
    }, delay)
  }, [canDirectWrite])

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

  // The star's on-screen position right now, wherever a glide has it
  // mid-animation — hit-testing against raw data coordinates would make a
  // moving star ungrabbable. (The entrance flight never reaches here: pointer
  // handlers ignore the star entirely until it has landed.)
  const getVisitStarRenderPoint = useCallback(() => {
    const star = currentVisitStarRef.current
    if (!star) return null
    const motionKey = getMotionKey(star)
    const motion = motionKey ? starMotionsRef.current.get(motionKey) : null
    if (motion) {
      const point = getMotionPosition(motion, performance.now())
      return { x: point.x, y: point.y }
    }
    return { x: star.x, y: star.y }
  }, [])

  const moveVisitStar = useCallback((clientX: number, clientY: number) => {
    const point = getCanvasPoint(clientX, clientY)
    const visitStar = currentVisitStarRef.current ?? getVisitStar(starsRef.current, currentVisitStarRef.current)
    if (!point || !visitStar) return

    const patch = {
      x: clamp01(point.x + grabOffsetRef.current.dx),
      y: clamp01(point.y + grabOffsetRef.current.dy),
    }
    applyVisitStarPatchLocally(patch)
    schedulePositionSave(patch)
  }, [applyVisitStarPatchLocally, getCanvasPoint, schedulePositionSave])

  // Double-click / double-tap on open sky: the star glides over and lands
  // with a pulse. The data position updates immediately (and syncs), only the
  // rendering is tweened.
  const flyVisitStarTo = useCallback((clientX: number, clientY: number) => {
    const point = getCanvasPoint(clientX, clientY)
    const star = currentVisitStarRef.current
    if (!point || !star) return
    const from = getVisitStarRenderPoint() ?? { x: star.x, y: star.y }
    cancelVisitStarAnimations()
    applyVisitStarPatchLocally(point)
    schedulePositionSave(point)

    const motionKey = getMotionKey(star)
    if (!reducedMotionRef.current && motionKey) {
      const distance = Math.hypot(point.x - from.x, point.y - from.y)
      starMotionsRef.current.set(motionKey, {
        fromX: from.x,
        fromY: from.y,
        toX: point.x,
        toY: point.y,
        startedAt: performance.now(),
        // Speed scales with distance so short hops feel snappy and cross-sky
        // sends still read as travel, not teleportation.
        duration: Math.min(650, Math.max(260, distance * 900)),
        landPulse: true,
      })
    }
    requestDraw()
  }, [
    applyVisitStarPatchLocally,
    cancelVisitStarAnimations,
    getCanvasPoint,
    getVisitStarRenderPoint,
    requestDraw,
    schedulePositionSave,
  ])

  const endDrag = useCallback((e: React.PointerEvent<HTMLCanvasElement>, emitPulse: boolean) => {
    isDraggingVisitStarRef.current = false
    setIsDraggingVisitStar(false)
    flushPositionSave()
    if (emitPulse) {
      const star = currentVisitStarRef.current
      if (star) pushEffect('pulse', star.x, star.y, star.color)
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    requestDraw()
  }, [flushPositionSave, pushEffect, requestDraw])

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    const star = currentVisitStarRef.current
    const canvas = canvasRef.current
    if (!star || !canvas || pendingSpawnEntranceRef.current || spawnFlightRef.current) return
    const point = getCanvasPoint(e.clientX, e.clientY)
    if (!point) return

    // Grab, don't teleport: only a press on (or near) the star picks it up.
    // Anywhere else is a plain click — see the double-tap logic in pointerup.
    const rect = canvas.getBoundingClientRect()
    const renderPoint = getVisitStarRenderPoint() ?? { x: star.x, y: star.y }
    const distancePx = Math.hypot(
      (point.x - renderPoint.x) * rect.width,
      (point.y - renderPoint.y) * rect.height,
    )
    const grabRadius = e.pointerType === 'touch' ? GRAB_RADIUS_TOUCH_PX : GRAB_RADIUS_MOUSE_PX
    if (distancePx > grabRadius) return

    e.preventDefault()
    cancelVisitStarAnimations()
    // Keep the star under the exact spot it was grabbed instead of snapping
    // its center onto the pointer.
    const heldPoint = { x: clamp01(renderPoint.x), y: clamp01(renderPoint.y) }
    grabOffsetRef.current = {
      dx: heldPoint.x - point.x,
      dy: heldPoint.y - point.y,
    }
    applyVisitStarPatchLocally(heldPoint)
    schedulePositionSave(heldPoint)
    isDraggingVisitStarRef.current = true
    setIsDraggingVisitStar(true)
    e.currentTarget.setPointerCapture(e.pointerId)
    requestDraw()
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingVisitStarRef.current) return
    e.preventDefault()
    moveVisitStar(e.clientX, e.clientY)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDraggingVisitStarRef.current) {
      endDrag(e, true)
      return
    }

    if (
      e.button !== 0 ||
      !currentVisitStarRef.current ||
      pendingSpawnEntranceRef.current ||
      spawnFlightRef.current
    ) {
      return
    }
    const now = performance.now()
    const lastTap = lastTapRef.current
    lastTapRef.current = { time: now, x: e.clientX, y: e.clientY }
    if (
      lastTap &&
      now - lastTap.time < DOUBLE_TAP_WINDOW_MS &&
      Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_TAP_RADIUS_PX
    ) {
      lastTapRef.current = null
      flyVisitStarTo(e.clientX, e.clientY)
    }
  }

  // A cancelled gesture (scroll takeover, palm rejection) ends the drag
  // without the landing pulse — nothing intentional happened.
  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingVisitStarRef.current) return
    endDrag(e, false)
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
    // Keyboard control is manual control — stop any entrance or glide so the
    // nudge acts on where the star visibly is.
    cancelVisitStarAnimations()
    const patch = {
      x: clamp01(star.x + direction[0]),
      y: clamp01(star.y + direction[1]),
    }
    applyVisitStarPatchLocally(patch)
    schedulePositionSave(patch)
  }, [applyVisitStarPatchLocally, cancelVisitStarAnimations, schedulePositionSave])

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
        setIsEditingMessage(false)
        setHasSavedMessage(true)
      }
    } finally {
      setIsModeratingMessage(false)
    }
  }, [isModeratingMessage, message, saveMessage])

  const startEditing = useCallback(() => {
    setIsEditingMessage(true)
    setHasSavedMessage(false)
    window.requestAnimationFrame(() => messageInputRef.current?.focus())
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
      if (
        (pendingSpawnEntranceRef.current || spawnFlightRef.current) &&
        isVisitStar(star, currentVisitStarRef.current)
      ) {
        continue
      }
      const motionKey = getMotionKey(star)
      const motion = motionKey ? starMotionsRef.current.get(motionKey) : null
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

  const messageButtonLabel = isEditingMessage
    ? 'Submit'
    : (message.trim() ? 'Edit' : 'Add')

  return (
    <>
      <m.header
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
      </m.header>

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
        Your star was added the moment this page loaded and is visible to
        everyone here right now. Grab it to drag it, double-{isPhone ? 'tap' : 'click'} open sky to send
        it flying there, recolor it, and add a message whenever you like.
        {' '}At {MERGE_THRESHOLD} regular stars, they merge into {MEGA_STAR_COUNT} mega stars at the densest areas.
      </p>

      <m.div
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
            ? 'Constellation sky. Drag your star to move it, double-click or double-tap open sky to send it there, or use the arrow keys. Hold Shift for larger keyboard steps.'
            : 'Constellation sky. Your star is being placed automatically.'}
          tabIndex={0}
          data-cursor-drag
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
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
      </m.div>

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
          <span className="constellation__editor-kicker">
            {hasVisitStar ? 'Your star is live' : 'Placing your star'}
          </span>
          <span className="constellation__editor-hint">
            {isPhone
              ? 'Drag your star, or double-tap the sky to send it there.'
              : 'Drag your star, double-click the sky to send it, arrow keys to nudge.'}
          </span>
        </div>

        <div className="constellation__controls" role="group" aria-label="Edit your star">
          <div
            className="constellation__color-picker"
            aria-label="Choose your star color"
          >
            {COLORS.map(c => (
              <button
                key={c.value}
                type="button"
                className={selectedColor === c.value ? 'active' : ''}
                style={{ '--btn-color': c.value } as React.CSSProperties}
                onClick={() => handleColorSelect(c.value)}
                disabled={!hasVisitStar}
                aria-label={c.label}
              />
            ))}
          </div>
          <div className="constellation__input-wrap">
            <div className="constellation__message-row">
              <input
                ref={messageInputRef}
                type="text"
                className={`constellation__message ${filterError || saveError ? 'is-error' : ''} ${isMessageLocked || isModeratingMessage ? 'is-submitted' : ''}`}
                placeholder={isMessageLocked && !message
                  ? 'No message yet — your star is already up'
                  : 'Add a message to your star'}
                aria-label="Message for your star"
                maxLength={50}
                value={message}
                readOnly={isMessageLocked || isModeratingMessage}
                onChange={handleMessageChange}
                onKeyDown={e => {
                  if (e.key === 'Enter' && isEditingMessage && !isModeratingMessage) {
                    e.preventDefault()
                    void submitMessage()
                  }
                }}
              />
              <m.button
                type="button"
                className={`constellation__msg-btn ${isEditingMessage ? 'constellation__msg-btn--submit' : 'constellation__msg-btn--edit'}`}
                onClick={isEditingMessage ? () => { void submitMessage() } : startEditing}
                disabled={!hasVisitStar || isModeratingMessage}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                aria-label={isModeratingMessage
                  ? 'Checking message'
                  : isEditingMessage
                    ? 'Submit your message'
                    : message.trim()
                      ? 'Edit your message'
                      : 'Add a message to your star'}
                aria-busy={isModeratingMessage}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <m.span
                    key={messageButtonLabel}
                    className="constellation__msg-btn-label"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {messageButtonLabel}
                  </m.span>
                </AnimatePresence>
              </m.button>
            </div>
            {/* role=status makes save/error feedback audible to screen readers */}
            <div role="status" aria-live="polite">
              <AnimatePresence>
                {hasSavedMessage && !isEditingMessage && !filterError && (
                  <m.span
                    className="constellation__saved"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.25 }}
                  >
                    &#10003; saved to your star
                  </m.span>
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

      {/* Full-viewport canvas the entrance comet flies across. Portaled to
          body so no ancestor transform or overflow clip can cage it; removed
          the moment the star lands. */}
      {entranceFlightActive && createPortal(
        <canvas
          ref={overlayCanvasRef}
          className="constellation__entrance-overlay"
          aria-hidden="true"
        />,
        document.body,
      )}
    </>
  )
}
