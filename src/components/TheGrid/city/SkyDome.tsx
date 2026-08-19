import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { createConstellationStar, updateConstellationStar } from '../../../utils/constellationApi'
import {
  claimConstellationVisitStarCreation,
  getConstellationSessionSecret,
  getConstellationVisitId,
  markConstellationVisitStarCreated,
} from '../../../utils/constellationIdentity'
import { ensureAnonymousUid, writeStarPosition } from '../../../utils/constellationDirectWrite'
import { subscribeToConstellation } from '../../../utils/constellationRealtime'
import { storageGet, storageSet } from '../../../utils/safeStorage'
import { isStarMessageAllowed, saveModeratedStarMessage } from '../../../utils/starModeration'
import { mulberry32 } from './rand'
import { SCENE_BG } from './sceneColor'
import type { GridInteraction, SkyState } from './interaction'

/**
 * The night above the city — the same Firebase constellation visitors sign on
 * the main site, made tangible in 3D. Everyone's stars render on the dome and
 * tooltip their messages on hover; if this browser owns a star (anonymous-auth
 * uid matches), it gets a pulsing ring and can be grabbed and dragged across
 * the sky. Creation, movement, color, and moderated messages use the same
 * persisted identity and API paths as the main-page constellation.
 */

export type { SkyState, SkyTooltip } from './interaction'

const MAX_LIVE_STARS = 600
const DOME_CENTER = new THREE.Vector3(0, 0, -100)
const DOME_RADIUS = 295
// Star interaction only matters near the sky deck; earlier in the journey the
// dome is scenery and pointer work would be wasted.
const INTERACTIVE_PROGRESS = 0.78
const DRAG_WRITE_INTERVAL_MS = 140
const MAX_LINES = 900
const MAX_FLIGHT_SEGMENTS = 160
const FLIGHT_DURATION_MS = 1050
const REPOSITION_DURATION_MS = 620
const TEMP_VISIT_KEY = '__grid_visit_star__'
const VISIT_ID = getConstellationVisitId()
// Normalized-space reach for constellation links (~9% of the sky).
const LINE_REACH_SQ = 0.062 * 0.062

const starVertexShader = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aSeed;
  uniform float uScale;
  varying vec3 vColor;
  varying float vSeed;
  void main() {
    vColor = aColor;
    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (uScale / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`

const starFragmentShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vColor;
  varying float vSeed;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    // Star core with a faint 4-point diffraction cross.
    float core = 1.0 - smoothstep(0.06, 0.5, d);
    float cross = max(
      (1.0 - smoothstep(0.0, 0.5, abs(p.x))) * (1.0 - smoothstep(0.0, 0.06, abs(p.y))),
      (1.0 - smoothstep(0.0, 0.5, abs(p.y))) * (1.0 - smoothstep(0.0, 0.06, abs(p.x)))
    );
    float twinkle = 0.55 + 0.45 * sin(uTime * (0.4 + fract(vSeed) * 1.4) + vSeed * 43.0);
    float alpha = (core + cross * 0.55) * twinkle;
    gl_FragColor = vec4(vColor * (0.75 + 0.5 * twinkle), alpha);
  }
`

const ringFragmentShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vColor;
  varying float vSeed;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float pulse = 0.36 + 0.05 * sin(uTime * 2.2);
    float ring = (1.0 - smoothstep(pulse, pulse + 0.05, d)) * smoothstep(pulse - 0.09, pulse - 0.04, d);
    gl_FragColor = vec4(vColor, ring * 0.9);
  }
`

function makeStarMaterial(pixelRatio: number, fragment = starFragmentShader) {
  return new THREE.ShaderMaterial({
    vertexShader: starVertexShader,
    fragmentShader: fragment,
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: 620 * pixelRatio },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

/** Map the constellation's normalized 2D sky (x right, y down) onto the dome. */
function starPosition(x: number, y: number, out: THREE.Vector3) {
  const az = (x - 0.5) * Math.PI * 1.25
  const el = Math.PI * 0.12 + (1 - y) * Math.PI * 0.34
  out.set(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    -Math.cos(az) * Math.cos(el),
  )
  return out.multiplyScalar(DOME_RADIUS).add(DOME_CENTER)
}

/** Inverse of starPosition: a dome-surface point back to normalized (x, y). */
function domePointToXY(point: THREE.Vector3): { x: number; y: number } {
  const dir = point.clone().sub(DOME_CENTER).normalize()
  const el = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1))
  const az = Math.atan2(dir.x, -dir.z)
  return {
    x: THREE.MathUtils.clamp(az / (Math.PI * 1.25) + 0.5, 0, 1),
    y: THREE.MathUtils.clamp(1 - (el - Math.PI * 0.12) / (Math.PI * 0.34), 0, 1),
  }
}

interface LiveStar {
  x: number
  y: number
  color: string
  isMega: boolean
  message: string
  mergedCount: number
  ownerUid: string | null
  timestamp: number
  visitId: string | null
}

interface StarMotion {
  fromX: number
  fromY: number
  toX: number
  toY: number
  startedAt: number
  duration: number
}

function normalizeLiveStar(raw: unknown): LiveStar | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const x = record.x
  const y = record.y
  if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return null
  const color = typeof record.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(record.color)
    ? record.color
    : '#7efcff'
  return {
    x: THREE.MathUtils.clamp(x, 0, 1),
    y: THREE.MathUtils.clamp(y, 0, 1),
    color,
    isMega: record.isMega === true,
    message: typeof record.message === 'string' ? record.message.trim().slice(0, 60) : '',
    mergedCount: typeof record.mergedCount === 'number' ? record.mergedCount : 0,
    ownerUid: typeof record.ownerUid === 'string' ? record.ownerUid : null,
    timestamp: typeof record.timestamp === 'number' ? record.timestamp : 0,
    visitId: typeof record.visitId === 'string' ? record.visitId : null,
  }
}

function readCachedSky(): { stars: Map<string, LiveStar>; ownKey: string | null } {
  const stars = new Map<string, LiveStar>()
  let ownKey: string | null = null
  const raw = storageGet('constellation-stars')
  if (!raw) return { stars, ownKey }

  try {
    const cached = JSON.parse(raw) as unknown
    if (!Array.isArray(cached)) return { stars, ownKey }
    for (const item of cached.slice(-MAX_LIVE_STARS)) {
      const star = normalizeLiveStar(item)
      if (!star || !item || typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      const isOwn = star.visitId === VISIT_ID
      const key = typeof record.key === 'string'
        ? record.key
        : isOwn
          ? TEMP_VISIT_KEY
          : null
      if (!key) continue
      stars.set(key, star)
      if (isOwn) ownKey = key
    }
  } catch {
    // A malformed cache should never prevent the live sky from mounting.
  }
  return { stars, ownKey }
}

function easeOutImpact(value: number): number {
  const t = THREE.MathUtils.clamp(value, 0, 1)
  return 1 - Math.pow(1 - t, 2.2)
}

function motionPoint(motion: StarMotion, now: number) {
  const progress = THREE.MathUtils.clamp((now - motion.startedAt) / motion.duration, 0, 1)
  const eased = easeOutImpact(progress)
  return {
    x: THREE.MathUtils.lerp(motion.fromX, motion.toX, eased),
    y: THREE.MathUtils.lerp(motion.fromY, motion.toY, eased),
    active: progress < 1,
    progress,
  }
}

function cacheVisitStar(key: string, star: LiveStar): void {
  let cached: Array<Record<string, unknown>> = []
  const raw = storageGet('constellation-stars')
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        cached = parsed.filter((item): item is Record<string, unknown> => (
          Boolean(item) && typeof item === 'object'
        ))
      }
    } catch {
      cached = []
    }
  }

  const record = {
    ...star,
    key: key === TEMP_VISIT_KEY ? undefined : key,
    visitId: VISIT_ID,
  }
  const index = cached.findIndex(item => (
    item.visitId === VISIT_ID ||
    (key !== TEMP_VISIT_KEY && item.key === key)
  ))
  if (index >= 0) cached[index] = record
  else cached.push(record)
  storageSet('constellation-stars', JSON.stringify(cached))
}

function GradientDome() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uBg;
          varying vec3 vDir;

          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

          void main() {
            float up = clamp(vDir.y, 0.0, 1.0);
            vec3 zenith = vec3(0.014, 0.032, 0.08);
            vec3 color = mix(uBg, zenith, pow(up, 0.6));
            // Light pollution: cyan city glow hugging the horizon, strongest
            // down the avenue (-z) where the skyline is densest.
            // Wide reach (pow 3.2) so the glow still kisses the frame
            // bottom when the sky-deck camera pitches up at the stars.
            float horizon = pow(1.0 - abs(vDir.y), 2.1);
            float avenue = 0.6 + 0.4 * smoothstep(0.2, 1.0, -vDir.z);
            color += vec3(0.0, 0.085, 0.1) * horizon * avenue;
            color += vec3(0.07, 0.015, 0.1) * pow(1.0 - abs(vDir.y), 8.0) * (1.0 - avenue);
            // Two-octave value-noise nebula so the upper sky has weather.
            vec2 sky = vec2(atan(vDir.x, -vDir.z) * 2.0, vDir.y * 4.0);
            float n = hash(floor(sky * 2.0)) * 0.6 + hash(floor(sky * 5.0)) * 0.4;
            float band = sin(vDir.y * 9.0 + vDir.x * 3.0) * sin(vDir.x * 7.0 - vDir.z * 4.0);
            color += vec3(0.014, 0.024, 0.055) * smoothstep(0.1, 1.0, up) * (0.3 + 0.35 * band + 0.55 * n);
            gl_FragColor = vec4(color, 1.0);
          }
        `,
        uniforms: { uBg: { value: SCENE_BG } },
      }),
    [],
  )
  const geometry = useMemo(() => new THREE.SphereGeometry(330, 48, 28), [])
  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])
  return <mesh geometry={geometry} material={material} position={DOME_CENTER} renderOrder={-10} />
}

function AmbientStars({ pixelRatio }: { pixelRatio: number }) {
  const { geometry, material, points } = useMemo(() => {
    const rng = mulberry32(2077)
    const count = 620
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const seeds = new Float32Array(count)
    const v = new THREE.Vector3()
    const tint = new THREE.Color()
    for (let i = 0; i < count; i++) {
      // Own elevation mapping: reaches below the constellation band so the
      // lower third of the sky-deck frame isn't empty.
      const az = (rng() * 1.6 - 0.8) * Math.PI * 0.78
      const el = Math.PI * 0.045 + Math.pow(rng(), 1.35) * Math.PI * 0.42
      v.set(
        Math.sin(az) * Math.cos(el),
        Math.sin(el),
        -Math.cos(az) * Math.cos(el),
      ).multiplyScalar(DOME_RADIUS).add(DOME_CENTER)
      positions.set([v.x, v.y, v.z], i * 3)
      tint.setHSL(0.5 + rng() * 0.12, 0.5, 0.68 + rng() * 0.24)
      colors.set([tint.r, tint.g, tint.b], i * 3)
      sizes[i] = 0.7 + rng() * 1.3
      seeds[i] = rng() * 100
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    const material = makeStarMaterial(pixelRatio)
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    return { geometry, material, points }
  }, [pixelRatio])

  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])

  useFrame(state => {
    material.uniforms.uTime.value = state.clock.elapsedTime
  })

  return <primitive object={points} />
}

function LiveStars({ pixelRatio, interaction }: { pixelRatio: number; interaction: GridInteraction }) {
  const { progressRef, dragActiveRef, onSky, onSkyController, onTooltip } = interaction
  const initialSky = useMemo(() => readCachedSky(), [])
  const starsRef = useRef(initialSky.stars)
  const orderRef = useRef<string[]>([])
  const dirtyRef = useRef(initialSky.stars.size > 0)
  const stateDirtyRef = useRef(true)
  const liveRef = useRef(false)
  const uidRef = useRef<string | null>(null)
  const uidRequestedRef = useRef(false)
  const ownKeyRef = useRef<string | null>(initialSky.ownKey)
  const draggingRef = useRef(false)
  const placingRef = useRef(false)
  const savingMessageRef = useRef(false)
  const preferredColorRef = useRef(
    initialSky.ownKey
      ? initialSky.stars.get(initialSky.ownKey)?.color ?? '#00ffff'
      : '#00ffff',
  )
  const errorRef = useRef<string | null>(null)
  const motionsRef = useRef(new Map<string, StarMotion>())
  const pendingMessageRef = useRef<string | null>(null)
  const creationInFlightRef = useRef(false)
  const sessionSecretRef = useRef(getConstellationSessionSecret())
  const lastWriteRef = useRef(0)
  const writeQueuedRef = useRef<{ x: number; y: number } | null>(null)

  const { geometry, material, points } = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_LIVE_STARS * 3), 3))
    geometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(MAX_LIVE_STARS * 3), 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAX_LIVE_STARS), 1))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(MAX_LIVE_STARS), 1))
    geometry.setDrawRange(0, 0)
    geometry.boundingSphere = new THREE.Sphere(DOME_CENTER.clone(), DOME_RADIUS + 10)
    const material = makeStarMaterial(pixelRatio)
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    return { geometry, material, points }
  }, [pixelRatio])

  // Constellation web: faint additive lines joining near-neighbor stars —
  // what makes 95 dots read as one shared sky instead of scattered specks.
  const { lineGeometry, linePoints } = useMemo(() => {
    const lineGeometry = new THREE.BufferGeometry()
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_LINES * 6), 3))
    lineGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_LINES * 6), 3))
    lineGeometry.setDrawRange(0, 0)
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const linePoints = new THREE.LineSegments(lineGeometry, material)
    linePoints.frustumCulled = false
    return { lineGeometry, linePoints }
  }, [])

  const { flightGeometry, flightLines } = useMemo(() => {
    const flightGeometry = new THREE.BufferGeometry()
    flightGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(MAX_FLIGHT_SEGMENTS * 6), 3),
    )
    flightGeometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(MAX_FLIGHT_SEGMENTS * 6), 3),
    )
    flightGeometry.setDrawRange(0, 0)
    const flightMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const flightLines = new THREE.LineSegments(flightGeometry, flightMaterial)
    flightLines.frustumCulled = false
    return { flightGeometry, flightLines }
  }, [])

  const { ringGeometry, ringMaterial, ringPoints } = useMemo(() => {
    const ringGeometry = new THREE.BufferGeometry()
    ringGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3))
    ringGeometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array([1, 1, 1]), 3))
    ringGeometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array([12]), 1))
    ringGeometry.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array([1]), 1))
    ringGeometry.setDrawRange(0, 0)
    const ringMaterial = makeStarMaterial(pixelRatio, ringFragmentShader)
    const ringPoints = new THREE.Points(ringGeometry, ringMaterial)
    ringPoints.frustumCulled = false
    return { ringGeometry, ringMaterial, ringPoints }
  }, [pixelRatio])

  // Invisible grab pad tracking the own star: meshes raycast far more
  // reliably than sized points, so dragging starts on this, not the points.
  const grabMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    [],
  )
  const grabGeometry = useMemo(() => new THREE.PlaneGeometry(26, 26), [])
  const grabRef = useRef<THREE.Mesh>(null)
  const placementGeometry = useMemo(
    () => new THREE.SphereGeometry(DOME_RADIUS, 48, 28),
    [],
  )
  const placementMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false,
    }),
    [],
  )

  useEffect(() => {
    const markDirty = (stateChanged = true) => {
      dirtyRef.current = true
      if (stateChanged) stateDirtyRef.current = true
    }
    const unsubscribe = subscribeToConstellation({
      onStarAdded: (key, value) => {
        const star = normalizeLiveStar(value)
        if (!star) return
        const isNew = !starsRef.current.has(key)
        if (star.visitId === VISIT_ID) {
          const tempMotion = motionsRef.current.get(TEMP_VISIT_KEY)
          if (tempMotion) {
            motionsRef.current.delete(TEMP_VISIT_KEY)
            motionsRef.current.set(key, tempMotion)
          }
          starsRef.current.delete(TEMP_VISIT_KEY)
          ownKeyRef.current = key
          preferredColorRef.current = star.color
          markConstellationVisitStarCreated()
        } else if (isNew && liveRef.current) {
          motionsRef.current.set(key, {
            fromX: 1.08,
            fromY: -0.08,
            toX: star.x,
            toY: star.y,
            startedAt: performance.now(),
            duration: FLIGHT_DURATION_MS,
          })
        }
        starsRef.current.set(key, star)
        markDirty()
      },
      onStarChanged: (key, value) => {
        const star = normalizeLiveStar(value)
        // Ignore server echoes for the star being dragged locally.
        if (star && !(draggingRef.current && key === ownKeyRef.current)) {
          const previous = starsRef.current.get(key)
          if (
            previous &&
            liveRef.current &&
            (Math.abs(previous.x - star.x) > 1e-4 || Math.abs(previous.y - star.y) > 1e-4)
          ) {
            const active = motionsRef.current.get(key)
            const from = active ? motionPoint(active, performance.now()) : previous
            motionsRef.current.set(key, {
              fromX: from.x,
              fromY: from.y,
              toX: star.x,
              toY: star.y,
              startedAt: performance.now(),
              duration: REPOSITION_DURATION_MS,
            })
          }
          starsRef.current.set(key, star)
          markDirty()
        }
      },
      onStarRemoved: key => {
        motionsRef.current.delete(key)
        if (starsRef.current.delete(key)) markDirty()
      },
      onStarsSynced: () => {
        liveRef.current = true
        markDirty()
      },
      onMetadata: () => {},
      onStarsError: () => {
        liveRef.current = false
        markDirty()
      },
      onMetadataError: () => {},
    })
    if (!unsubscribe) {
      liveRef.current = false
      markDirty()
    }
    return () => { unsubscribe?.() }
  }, [])

  const scratch = useMemo(() => new THREE.Vector3(), [])
  const flightStart = useMemo(() => new THREE.Vector3(), [])
  const flightEnd = useMemo(() => new THREE.Vector3(), [])
  const domeSphere = useMemo(() => new THREE.Sphere(DOME_CENTER.clone(), DOME_RADIUS), [])

  const publishSkyState = useCallback(() => {
    const own = ownKeyRef.current ? starsRef.current.get(ownKeyRef.current) : null
    const state: SkyState = {
      count: starsRef.current.size,
      live: liveRef.current,
      ownStar: Boolean(own),
      placing: placingRef.current,
      color: own?.color ?? preferredColorRef.current,
      message: own?.message ?? '',
      savingMessage: savingMessageRef.current,
      error: errorRef.current,
    }
    onSky?.(state)
  }, [onSky])

  const persistPosition = useCallback(async (key: string, x: number, y: number) => {
    if (key === TEMP_VISIT_KEY) return false
    const star = starsRef.current.get(key)
    if (star?.ownerUid && uidRef.current === star.ownerUid) {
      const directSaved = await writeStarPosition(key, x, y)
      if (directSaved) return true
    }
    return updateConstellationStar({
      starKey: key,
      sessionSecret: sessionSecretRef.current,
      patch: { x, y },
    })
  }, [])

  const flushWrite = useCallback((final = false) => {
    const queued = writeQueuedRef.current
    const key = ownKeyRef.current
    if (!queued || !key) return
    const now = performance.now()
    if (!final && now - lastWriteRef.current < DRAG_WRITE_INTERVAL_MS) return
    lastWriteRef.current = now
    writeQueuedRef.current = null
    const star = starsRef.current.get(key)
    if (star) cacheVisitStar(key, star)
    void persistPosition(key, queued.x, queued.y)
  }, [persistPosition])

  const endDrag = useCallback(() => {
    if (!draggingRef.current) return
    draggingRef.current = false
    if (dragActiveRef) dragActiveRef.current = false
    flushWrite(true)
    document.body.style.cursor = placingRef.current ? 'crosshair' : ''
  }, [dragActiveRef, flushWrite])

  useEffect(() => {
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
    return () => {
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
      endDrag()
    }
  }, [endDrag])

  const requestPlacement = useCallback(() => {
    placingRef.current = true
    errorRef.current = null
    stateDirtyRef.current = true
    document.body.style.cursor = 'crosshair'
    publishSkyState()
  }, [publishSkyState])

  const cancelPlacement = useCallback(() => {
    placingRef.current = false
    stateDirtyRef.current = true
    document.body.style.cursor = ''
    publishSkyState()
  }, [publishSkyState])

  const setColor = useCallback((color: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return
    preferredColorRef.current = color
    const key = ownKeyRef.current
    const star = key ? starsRef.current.get(key) : null
    if (key && star) {
      const next = { ...star, color }
      starsRef.current.set(key, next)
      cacheVisitStar(key, next)
      dirtyRef.current = true
      if (key !== TEMP_VISIT_KEY) {
        void updateConstellationStar({
          starKey: key,
          sessionSecret: sessionSecretRef.current,
          patch: { color },
        })
      }
    }
    errorRef.current = null
    stateDirtyRef.current = true
    publishSkyState()
  }, [publishSkyState])

  const saveMessage = useCallback(async (message: string): Promise<boolean> => {
    const key = ownKeyRef.current
    const star = key ? starsRef.current.get(key) : null
    if (!key || !star) {
      errorRef.current = 'Place your star before adding a transmission.'
      stateDirtyRef.current = true
      publishSkyState()
      return false
    }

    const nextMessage = message.trim().slice(0, 50)
    savingMessageRef.current = true
    errorRef.current = null
    stateDirtyRef.current = true
    publishSkyState()

    let saved = false
    if (key === TEMP_VISIT_KEY) {
      saved = !nextMessage || await isStarMessageAllowed(nextMessage)
      if (saved) pendingMessageRef.current = nextMessage
    } else {
      const result = await saveModeratedStarMessage({
        starKey: key,
        sessionSecret: sessionSecretRef.current,
        message: nextMessage,
      })
      saved = result === 'saved'
      if (!saved) {
        errorRef.current = result === 'flagged'
          ? 'Please keep the transmission appropriate.'
          : 'The transmission could not be saved yet.'
      }
    }

    if (saved) {
      const next = { ...star, message: nextMessage }
      starsRef.current.set(key, next)
      cacheVisitStar(key, next)
      dirtyRef.current = true
    }
    savingMessageRef.current = false
    stateDirtyRef.current = true
    publishSkyState()
    return saved
  }, [publishSkyState])

  const placeOrMoveStar = useCallback((x: number, y: number) => {
    const target = {
      x: THREE.MathUtils.clamp(x, 0.02, 0.98),
      y: THREE.MathUtils.clamp(y, 0.02, 0.98),
    }
    placingRef.current = false
    document.body.style.cursor = ''
    errorRef.current = null

    const existingKey = ownKeyRef.current
    const existing = existingKey ? starsRef.current.get(existingKey) : null
    if (existingKey && existing) {
      const active = motionsRef.current.get(existingKey)
      const from = active ? motionPoint(active, performance.now()) : existing
      const next = { ...existing, ...target }
      starsRef.current.set(existingKey, next)
      motionsRef.current.set(existingKey, {
        fromX: from.x,
        fromY: from.y,
        toX: target.x,
        toY: target.y,
        startedAt: performance.now(),
        duration: REPOSITION_DURATION_MS,
      })
      writeQueuedRef.current = target
      cacheVisitStar(existingKey, next)
      flushWrite(true)
      dirtyRef.current = true
      stateDirtyRef.current = true
      publishSkyState()
      return
    }

    if (!claimConstellationVisitStarCreation()) {
      errorRef.current = 'Your star is already entering the shared sky. Try again in a moment.'
      stateDirtyRef.current = true
      publishSkyState()
      return
    }

    const optimistic: LiveStar = {
      ...target,
      color: preferredColorRef.current,
      isMega: false,
      message: '',
      mergedCount: 0,
      ownerUid: uidRef.current,
      timestamp: Date.now(),
      visitId: VISIT_ID,
    }
    starsRef.current.set(TEMP_VISIT_KEY, optimistic)
    ownKeyRef.current = TEMP_VISIT_KEY
    motionsRef.current.set(TEMP_VISIT_KEY, {
      fromX: 1.08,
      fromY: -0.08,
      toX: target.x,
      toY: target.y,
      startedAt: performance.now(),
      duration: FLIGHT_DURATION_MS,
    })
    cacheVisitStar(TEMP_VISIT_KEY, optimistic)
    dirtyRef.current = true
    stateDirtyRef.current = true
    creationInFlightRef.current = true
    publishSkyState()

    void (async () => {
      let ownerUid = uidRef.current
      if (!ownerUid) {
        ownerUid = await Promise.race([
          ensureAnonymousUid(),
          new Promise<null>(resolve => window.setTimeout(() => resolve(null), 2500)),
        ])
        uidRef.current = ownerUid
      }

      const created = await createConstellationStar({
        sessionSecret: sessionSecretRef.current,
        visitId: VISIT_ID,
        x: target.x,
        y: target.y,
        color: optimistic.color,
        ownerUid: ownerUid ?? undefined,
      })
      creationInFlightRef.current = false
      if (!created) {
        liveRef.current = false
        errorRef.current = 'Live sync is unavailable. Your star is saved in this browser.'
        stateDirtyRef.current = true
        publishSkyState()
        return
      }

      const local = starsRef.current.get(TEMP_VISIT_KEY) ?? optimistic
      const server = normalizeLiveStar(created.star) ?? optimistic
      const next: LiveStar = {
        ...server,
        x: local.x,
        y: local.y,
        color: local.color,
        message: local.message,
        ownerUid: server.ownerUid ?? ownerUid,
        visitId: VISIT_ID,
      }
      const motion = motionsRef.current.get(TEMP_VISIT_KEY)
      motionsRef.current.delete(TEMP_VISIT_KEY)
      if (motion) motionsRef.current.set(created.key, motion)
      starsRef.current.delete(TEMP_VISIT_KEY)
      starsRef.current.set(created.key, next)
      ownKeyRef.current = created.key
      markConstellationVisitStarCreated()
      cacheVisitStar(created.key, next)

      if (next.x !== target.x || next.y !== target.y) {
        void persistPosition(created.key, next.x, next.y)
      }
      if (next.color !== server.color) {
        void updateConstellationStar({
          starKey: created.key,
          sessionSecret: sessionSecretRef.current,
          patch: { color: next.color },
        })
      }
      const pendingMessage = pendingMessageRef.current
      if (pendingMessage != null) {
        pendingMessageRef.current = null
        const result = await saveModeratedStarMessage({
          starKey: created.key,
          sessionSecret: sessionSecretRef.current,
          message: pendingMessage,
        })
        if (result !== 'saved') {
          errorRef.current = 'Your star landed, but its transmission did not save.'
        }
      }
      dirtyRef.current = true
      stateDirtyRef.current = true
      publishSkyState()
    })()
  }, [flushWrite, persistPosition, publishSkyState])

  useEffect(() => {
    onSkyController?.({ requestPlacement, cancelPlacement, setColor, saveMessage })
    dirtyRef.current = true
    stateDirtyRef.current = true
    publishSkyState()
    return () => {
      onSkyController?.(null)
      document.body.style.cursor = ''
    }
  }, [
    cancelPlacement,
    onSkyController,
    publishSkyState,
    requestPlacement,
    saveMessage,
    setColor,
  ])

  const onGrabDown = (e: ThreeEvent<PointerEvent>) => {
    if (
      placingRef.current ||
      !ownKeyRef.current ||
      progressRef.current < INTERACTIVE_PROGRESS
    ) return
    e.stopPropagation()
    motionsRef.current.delete(ownKeyRef.current)
    draggingRef.current = true
    if (dragActiveRef) dragActiveRef.current = true
    document.body.style.cursor = 'grabbing'
    onTooltip?.(null)
  }

  const onStarsMove = (e: ThreeEvent<PointerEvent>) => {
    if (
      placingRef.current ||
      progressRef.current < INTERACTIVE_PROGRESS ||
      draggingRef.current
    ) return
    const index = e.index
    if (index === undefined || index >= orderRef.current.length) return
    const star = starsRef.current.get(orderRef.current[index])
    if (!star) { onTooltip?.(null); return }
    const isOwn = orderRef.current[index] === ownKeyRef.current
    const label = star.isMega
      ? `${star.message || 'mega star'} (${Math.max(star.mergedCount, 2)} merged)`
      : star.message
    if (!label && !isOwn) { onTooltip?.(null); return }
    onTooltip?.({
      x: e.nativeEvent.clientX,
      y: e.nativeEvent.clientY,
      text: isOwn ? `${label ? `"${label}" — ` : ''}your star · drag to move` : `"${label}"`,
      color: star.color,
    })
  }

  const onStarsOut = () => onTooltip?.(null)

  const onPlacementDown = (event: ThreeEvent<PointerEvent>) => {
    if (!placingRef.current || progressRef.current < INTERACTIVE_PROGRESS) return
    event.stopPropagation()
    const point = domePointToXY(event.point)
    placeOrMoveStar(point.x, point.y)
  }

  useFrame(state => {
    const time = state.clock.elapsedTime
    const now = performance.now()
    material.uniforms.uTime.value = time
    ringMaterial.uniforms.uTime.value = time

    // The constellation web is the sky station's reveal — down in the city
    // it reads as clutter over the skyline, so it fades in on approach.
    const reveal = THREE.MathUtils.smoothstep(progressRef.current, 0.62, 0.88)
    ;(linePoints.material as THREE.LineBasicMaterial).opacity = 0.32 * reveal

    // Lazily identify this browser's star once the visitor nears the sky.
    if (!uidRequestedRef.current && progressRef.current > 0.5) {
      uidRequestedRef.current = true
      void ensureAnonymousUid().then(uid => {
        uidRef.current = uid
        dirtyRef.current = true
        stateDirtyRef.current = true
      })
    }

    // Drag: project the pointer onto the dome and move the star locally;
    // Firebase writes are throttled, with a final flush on release.
    if (draggingRef.current && ownKeyRef.current) {
      state.raycaster.setFromCamera(state.pointer, state.camera)
      if (state.raycaster.ray.intersectSphere(domeSphere, scratch)) {
        const { x, y } = domePointToXY(scratch)
        const star = starsRef.current.get(ownKeyRef.current)
        if (star && (Math.abs(star.x - x) > 1e-4 || Math.abs(star.y - y) > 1e-4)) {
          motionsRef.current.delete(ownKeyRef.current)
          starsRef.current.set(ownKeyRef.current, { ...star, x, y })
          writeQueuedRef.current = { x, y }
          dirtyRef.current = true
        }
      }
      flushWrite()
    }

    if (!dirtyRef.current && motionsRef.current.size === 0) return
    dirtyRef.current = false

    let exactOwnKey: string | null = null
    for (const [key, star] of starsRef.current) {
      if (star.visitId === VISIT_ID) {
        exactOwnKey = key
        break
      }
    }
    if (exactOwnKey) {
      ownKeyRef.current = exactOwnKey
      markConstellationVisitStarCreated()
    } else if (ownKeyRef.current !== TEMP_VISIT_KEY) {
      ownKeyRef.current = null
    }

    const position = geometry.getAttribute('position') as THREE.BufferAttribute
    const color = geometry.getAttribute('aColor') as THREE.BufferAttribute
    const size = geometry.getAttribute('aSize') as THREE.BufferAttribute
    const seed = geometry.getAttribute('aSeed') as THREE.BufferAttribute
    const tint = new THREE.Color()

    let i = 0
    let hasActiveMotion = false
    const renderedStars: Array<{ star: LiveStar; x: number; y: number }> = []
    orderRef.current.length = 0
    for (const [key, star] of starsRef.current) {
      if (i >= MAX_LIVE_STARS) break
      orderRef.current.push(key)
      const motion = motionsRef.current.get(key)
      const rendered = motion
        ? motionPoint(motion, now)
        : { x: star.x, y: star.y, active: false, progress: 1 }
      if (motion && rendered.active) {
        hasActiveMotion = true
      } else if (motion) {
        motionsRef.current.delete(key)
      }
      renderedStars.push({ star, x: rendered.x, y: rendered.y })
      starPosition(rendered.x, rendered.y, scratch)
      position.setXYZ(i, scratch.x, scratch.y, scratch.z)
      tint.set(star.color)
      color.setXYZ(i, tint.r, tint.g, tint.b)
      const arrivalBoost = motion && rendered.active
        ? 1 + Math.sin(Math.min(1, rendered.progress) * Math.PI) * 1.15
        : 1
      size.setX(i, (star.isMega ? 6.4 : key === ownKeyRef.current ? 4.8 : 3.8) * arrivalBoost)
      seed.setX(i, (star.x * 137 + star.y * 61) % 100)
      i++
    }
    geometry.setDrawRange(0, i)
    position.needsUpdate = true
    color.needsUpdate = true
    size.needsUpdate = true
    seed.needsUpdate = true

    // Comet tails make new and repositioned stars visibly travel through the
    // dome instead of popping between database coordinates.
    const flightPosition = flightGeometry.getAttribute('position') as THREE.BufferAttribute
    const flightColor = flightGeometry.getAttribute('color') as THREE.BufferAttribute
    let flightSegment = 0
    for (const [key, motion] of motionsRef.current) {
      if (flightSegment >= MAX_FLIGHT_SEGMENTS) break
      const star = starsRef.current.get(key)
      if (!star) continue
      const current = motionPoint(motion, now)
      if (!current.active) continue
      tint.set(star.color)
      for (let sample = 0; sample < 8 && flightSegment < MAX_FLIGHT_SEGMENTS; sample++) {
        const currentT = Math.max(0, current.progress - sample * 0.035)
        const previousT = Math.max(0, current.progress - (sample + 1) * 0.035)
        const currentEase = easeOutImpact(currentT)
        const previousEase = easeOutImpact(previousT)
        starPosition(
          THREE.MathUtils.lerp(motion.fromX, motion.toX, currentEase),
          THREE.MathUtils.lerp(motion.fromY, motion.toY, currentEase),
          flightStart,
        )
        starPosition(
          THREE.MathUtils.lerp(motion.fromX, motion.toX, previousEase),
          THREE.MathUtils.lerp(motion.fromY, motion.toY, previousEase),
          flightEnd,
        )
        const fade = 1 - sample / 8
        flightPosition.setXYZ(flightSegment * 2, flightStart.x, flightStart.y, flightStart.z)
        flightPosition.setXYZ(flightSegment * 2 + 1, flightEnd.x, flightEnd.y, flightEnd.z)
        flightColor.setXYZ(flightSegment * 2, tint.r * fade, tint.g * fade, tint.b * fade)
        flightColor.setXYZ(
          flightSegment * 2 + 1,
          tint.r * fade * 0.4,
          tint.g * fade * 0.4,
          tint.b * fade * 0.4,
        )
        flightSegment++
      }
    }
    flightGeometry.setDrawRange(0, flightSegment * 2)
    flightPosition.needsUpdate = true
    flightColor.needsUpdate = true
    ;(flightLines.material as THREE.LineBasicMaterial).opacity = 0.72 * reveal

    // Connect each star to its nearest neighbors (in constellation space).
    const linePosition = lineGeometry.getAttribute('position') as THREE.BufferAttribute
    const lineColor = lineGeometry.getAttribute('color') as THREE.BufferAttribute
    const entries: Array<{ x: number; y: number; px: number; py: number; pz: number; r: number; g: number; b: number }> = []
    for (let k = 0; k < renderedStars.length; k++) {
      const rendered = renderedStars[k]
      tint.set(rendered.star.color)
      entries.push({
        x: rendered.x, y: rendered.y,
        px: position.getX(k), py: position.getY(k), pz: position.getZ(k),
        r: tint.r, g: tint.g, b: tint.b,
      })
    }
    let seg = 0
    const linkCount = new Uint8Array(entries.length)
    outer: for (let a = 0; a < entries.length; a++) {
      if (linkCount[a] >= 2) continue
      for (let b = a + 1; b < entries.length; b++) {
        if (linkCount[b] >= 2) continue
        const dx = entries[a].x - entries[b].x
        const dy = entries[a].y - entries[b].y
        if (dx * dx + dy * dy > LINE_REACH_SQ) continue
        linePosition.setXYZ(seg * 2, entries[a].px, entries[a].py, entries[a].pz)
        linePosition.setXYZ(seg * 2 + 1, entries[b].px, entries[b].py, entries[b].pz)
        lineColor.setXYZ(seg * 2, entries[a].r * 0.5, entries[a].g * 0.5, entries[a].b * 0.5)
        lineColor.setXYZ(seg * 2 + 1, entries[b].r * 0.5, entries[b].g * 0.5, entries[b].b * 0.5)
        linkCount[a]++
        linkCount[b]++
        seg++
        if (seg >= MAX_LINES) break outer
        if (linkCount[a] >= 2) break
      }
    }
    lineGeometry.setDrawRange(0, seg * 2)
    linePosition.needsUpdate = true
    lineColor.needsUpdate = true

    // Own-star ring + grab pad follow the star.
    const own = ownKeyRef.current ? starsRef.current.get(ownKeyRef.current) : null
    if (own) {
      const ownIndex = orderRef.current.indexOf(ownKeyRef.current as string)
      const ownRendered = ownIndex >= 0 ? renderedStars[ownIndex] : null
      starPosition(ownRendered?.x ?? own.x, ownRendered?.y ?? own.y, scratch)
      const ringPosition = ringGeometry.getAttribute('position') as THREE.BufferAttribute
      ringPosition.setXYZ(0, scratch.x, scratch.y, scratch.z)
      ringPosition.needsUpdate = true
      const ringColor = ringGeometry.getAttribute('aColor') as THREE.BufferAttribute
      tint.set(own.color)
      ringColor.setXYZ(0, tint.r, tint.g, tint.b)
      ringColor.needsUpdate = true
      ringGeometry.setDrawRange(0, 1)
      if (grabRef.current) {
        grabRef.current.position.copy(scratch)
        grabRef.current.lookAt(state.camera.position)
        grabRef.current.visible = true
      }
    } else {
      ringGeometry.setDrawRange(0, 0)
      if (grabRef.current) grabRef.current.visible = false
    }

    flightLines.visible = hasActiveMotion
    if (stateDirtyRef.current) {
      stateDirtyRef.current = false
      publishSkyState()
    }
  })

  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
    ringGeometry.dispose()
    ringMaterial.dispose()
    grabGeometry.dispose()
    grabMaterial.dispose()
    placementGeometry.dispose()
    placementMaterial.dispose()
    lineGeometry.dispose()
    flightGeometry.dispose()
    ;(linePoints.material as THREE.Material).dispose()
    ;(flightLines.material as THREE.Material).dispose()
  }, [
    geometry,
    material,
    ringGeometry,
    ringMaterial,
    grabGeometry,
    grabMaterial,
    placementGeometry,
    placementMaterial,
    lineGeometry,
    linePoints,
    flightGeometry,
    flightLines,
  ])

  return (
    <group>
      <primitive object={linePoints} />
      <primitive object={flightLines} />
      <primitive object={points} onPointerMove={onStarsMove} onPointerOut={onStarsOut} />
      <primitive object={ringPoints} />
      <mesh
        geometry={placementGeometry}
        material={placementMaterial}
        position={DOME_CENTER}
        onPointerDown={onPlacementDown}
      />
      <mesh
        ref={grabRef}
        geometry={grabGeometry}
        material={grabMaterial}
        visible={false}
        onPointerDown={onGrabDown}
      />
    </group>
  )
}

export default function SkyDome({ interaction }: { interaction: GridInteraction }) {
  const { gl } = useThree()
  const pixelRatio = gl.getPixelRatio()
  return (
    <group>
      <GradientDome />
      <AmbientStars pixelRatio={pixelRatio} />
      <LiveStars pixelRatio={pixelRatio} interaction={interaction} />
    </group>
  )
}
