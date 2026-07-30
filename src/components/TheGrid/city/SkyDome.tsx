import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { subscribeToConstellation } from '../../../utils/constellationRealtime'
import { mulberry32 } from './rand'
import { SCENE_BG } from './sceneColor'
import type { GridInteraction } from './interaction'

/**
 * The night above the city — the same Firebase constellation visitors sign on
 * the main site, made tangible in 3D. Everyone's stars render on the dome and
 * tooltip their messages on hover; if this browser owns a star (anonymous-auth
 * uid matches), it gets a pulsing ring and can be grabbed and dragged across
 * the sky — position writes ride the same security-rule-guarded direct path
 * the 2D constellation uses. Creation/messages stay on the main page.
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
    float core = smoothstep(0.5, 0.06, d);
    float cross = max(
      smoothstep(0.5, 0.0, abs(p.x)) * smoothstep(0.06, 0.0, abs(p.y)),
      smoothstep(0.5, 0.0, abs(p.y)) * smoothstep(0.06, 0.0, abs(p.x))
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
    float ring = smoothstep(pulse + 0.05, pulse, d) * smoothstep(pulse - 0.09, pulse - 0.04, d);
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
  }
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
            color += vec3(0.0, 0.105, 0.125) * horizon * avenue;
            color += vec3(0.07, 0.015, 0.1) * pow(1.0 - abs(vDir.y), 8.0) * (1.0 - avenue);
            // Two-octave value-noise nebula so the upper sky has weather.
            vec2 sky = vec2(atan(vDir.x, -vDir.z) * 2.0, vDir.y * 4.0);
            float n = hash(floor(sky * 2.0)) * 0.6 + hash(floor(sky * 5.0)) * 0.4;
            float band = sin(vDir.y * 9.0 + vDir.x * 3.0) * sin(vDir.x * 7.0 - vDir.z * 4.0);
            color += vec3(0.014, 0.024, 0.055) * smoothstep(0.15, 1.0, up) * (0.35 + 0.4 * band + 0.5 * n);
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
  const { progressRef, dragActiveRef, onSky, onTooltip } = interaction
  const starsRef = useRef(new Map<string, LiveStar>())
  const orderRef = useRef<string[]>([])
  const dirtyRef = useRef(false)
  const liveRef = useRef(false)
  const uidRef = useRef<string | null>(null)
  const uidRequestedRef = useRef(false)
  const ownKeyRef = useRef<string | null>(null)
  const draggingRef = useRef(false)
  const lastWriteRef = useRef(0)
  const writeQueuedRef = useRef<{ x: number; y: number } | null>(null)
  const writeFnRef = useRef<((key: string, x: number, y: number) => Promise<boolean>) | null>(null)

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

  useEffect(() => {
    const markDirty = () => { dirtyRef.current = true }
    const unsubscribe = subscribeToConstellation({
      onStarAdded: (key, value) => {
        const star = normalizeLiveStar(value)
        if (star) { starsRef.current.set(key, star); markDirty() }
      },
      onStarChanged: (key, value) => {
        const star = normalizeLiveStar(value)
        // Ignore server echoes for the star being dragged locally.
        if (star && !(draggingRef.current && key === ownKeyRef.current)) {
          starsRef.current.set(key, star)
          markDirty()
        }
      },
      onStarRemoved: key => {
        if (starsRef.current.delete(key)) markDirty()
      },
      onStarsSynced: () => { liveRef.current = true; markDirty() },
      onMetadata: () => {},
      onStarsError: () => { liveRef.current = false; markDirty() },
      onMetadataError: () => {},
    })
    if (!unsubscribe) onSky?.({ count: 0, live: false, ownStar: false })
    return () => { unsubscribe?.() }
  }, [onSky])

  const scratch = useMemo(() => new THREE.Vector3(), [])
  const domeSphere = useMemo(() => new THREE.Sphere(DOME_CENTER.clone(), DOME_RADIUS), [])

  const flushWrite = (final = false) => {
    const queued = writeQueuedRef.current
    const key = ownKeyRef.current
    const write = writeFnRef.current
    if (!queued || !key || !write) return
    const now = performance.now()
    if (!final && now - lastWriteRef.current < DRAG_WRITE_INTERVAL_MS) return
    lastWriteRef.current = now
    writeQueuedRef.current = null
    void write(key, queued.x, queued.y)
  }

  const endDrag = () => {
    if (!draggingRef.current) return
    draggingRef.current = false
    if (dragActiveRef) dragActiveRef.current = false
    flushWrite(true)
    document.body.style.cursor = ''
  }

  useEffect(() => {
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
    return () => {
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
      endDrag()
    }
    // endDrag is stable-by-refs; listeners registered once.
  }, [])

  const onGrabDown = (e: ThreeEvent<PointerEvent>) => {
    if (!ownKeyRef.current || progressRef.current < INTERACTIVE_PROGRESS) return
    e.stopPropagation()
    draggingRef.current = true
    if (dragActiveRef) dragActiveRef.current = true
    document.body.style.cursor = 'grabbing'
    onTooltip?.(null)
  }

  const onStarsMove = (e: ThreeEvent<PointerEvent>) => {
    if (progressRef.current < INTERACTIVE_PROGRESS || draggingRef.current) return
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

  useFrame(state => {
    const time = state.clock.elapsedTime
    material.uniforms.uTime.value = time
    ringMaterial.uniforms.uTime.value = time

    // The constellation web is the sky station's reveal — down in the city
    // it reads as clutter over the skyline, so it fades in on approach.
    const reveal = THREE.MathUtils.smoothstep(progressRef.current, 0.62, 0.88)
    ;(linePoints.material as THREE.LineBasicMaterial).opacity = 0.32 * reveal

    // Lazily identify this browser's star once the visitor nears the sky.
    if (!uidRequestedRef.current && progressRef.current > 0.5) {
      uidRequestedRef.current = true
      void import('../../../utils/constellationDirectWrite').then(async module => {
        writeFnRef.current = module.writeStarPosition
        const uid = await module.ensureAnonymousUid()
        if (uid) { uidRef.current = uid; dirtyRef.current = true }
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
          starsRef.current.set(ownKeyRef.current, { ...star, x, y })
          writeQueuedRef.current = { x, y }
          dirtyRef.current = true
        }
      }
      flushWrite()
    }

    if (!dirtyRef.current) return
    dirtyRef.current = false

    if (uidRef.current) {
      let ownKey: string | null = null
      for (const [key, star] of starsRef.current) {
        if (star.ownerUid === uidRef.current) { ownKey = key; break }
      }
      ownKeyRef.current = ownKey
    }

    const position = geometry.getAttribute('position') as THREE.BufferAttribute
    const color = geometry.getAttribute('aColor') as THREE.BufferAttribute
    const size = geometry.getAttribute('aSize') as THREE.BufferAttribute
    const seed = geometry.getAttribute('aSeed') as THREE.BufferAttribute
    const tint = new THREE.Color()

    let i = 0
    orderRef.current.length = 0
    for (const [key, star] of starsRef.current) {
      if (i >= MAX_LIVE_STARS) break
      orderRef.current.push(key)
      starPosition(star.x, star.y, scratch)
      position.setXYZ(i, scratch.x, scratch.y, scratch.z)
      tint.set(star.color)
      color.setXYZ(i, tint.r, tint.g, tint.b)
      size.setX(i, star.isMega ? 6.4 : key === ownKeyRef.current ? 4.4 : 3.6)
      seed.setX(i, (star.x * 137 + star.y * 61) % 100)
      i++
    }
    geometry.setDrawRange(0, i)
    position.needsUpdate = true
    color.needsUpdate = true
    size.needsUpdate = true
    seed.needsUpdate = true

    // Connect each star to its nearest neighbors (in constellation space).
    const linePosition = lineGeometry.getAttribute('position') as THREE.BufferAttribute
    const lineColor = lineGeometry.getAttribute('color') as THREE.BufferAttribute
    const entries: Array<{ x: number; y: number; px: number; py: number; pz: number; r: number; g: number; b: number }> = []
    let k = 0
    for (const star of starsRef.current.values()) {
      if (k >= i) break
      tint.set(star.color)
      entries.push({
        x: star.x, y: star.y,
        px: position.getX(k), py: position.getY(k), pz: position.getZ(k),
        r: tint.r, g: tint.g, b: tint.b,
      })
      k++
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
      starPosition(own.x, own.y, scratch)
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

    onSky?.({ count: starsRef.current.size, live: liveRef.current, ownStar: !!own })
  })

  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
    ringGeometry.dispose()
    ringMaterial.dispose()
    grabGeometry.dispose()
    grabMaterial.dispose()
    lineGeometry.dispose()
    ;(linePoints.material as THREE.Material).dispose()
  }, [geometry, material, ringGeometry, ringMaterial, grabGeometry, grabMaterial, lineGeometry, linePoints])

  return (
    <group>
      <primitive object={linePoints} />
      <primitive object={points} onPointerMove={onStarsMove} onPointerOut={onStarsOut} />
      <primitive object={ringPoints} />
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
