/**
 * The Blue Shield of California world: the members' Android app as a large white phone on a dark glass table whose
 * top is a field of member lights, with the work around it. A reel-to-reel replay engine fires recorded requests at a
 * wall of 231 endpoint sockets, the 220+ API endpoints it replayed. A paired replay sends the same request with and
 * without the service JWT, and both come back with the same response, the flaw it proved. The app's bundled
 * credential, a gold key in front of the phone, then moves server-side into a vault. In the close the phone's blank
 * screen (the production defect) boots into the rebuilt billing and payment flow, twelve red risk markers around it
 * are fixed, and the member lights come on outward from the phone.
 *
 * The home page shows the finished world. A click on an endpoint replays a pair against it, a click on the lit
 * phone steps through the flow's screens, and the pointer wakes the member lights it passes over. Motion follows the
 * scroll and the pointer. A clicked replay and woken lights run on the clock and report busy until they settle.
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GLOW, ease, frame, mulberry32, ramp, smoother, sunlight } from '../kit'
import type { IslandFactory, IslandFrame, IslandOutput, IslandPanel } from '../types'

/** The table's radius and thickness in world units. Its top is at y 0. */
const TABLE_R = 2.05
const TABLE_H = 0.08
/** World point the camera looks at, low on the phone so the table's front edge and the phone's top both stay in frame. */
const TARGET = new THREE.Vector3(0.1, 0.62, -0.05)
/** The phone's foot and facing (radians about y from +z), and its body. */
const PHONE = { x: -0.62, z: -0.5, yaw: 0.36 }
const PHONE_W = 1.0
const PHONE_H = 2.04
const PHONE_D = 0.1
const PEDESTAL_H = 0.06
const SCREEN_W = 0.9
const SCREEN_H = 1.8
/** Atlas cells of the phone's screen: the blank screen of the defect, the member home, billing, payments, and paid. */
const BLANK = 0
const CELLS = 5
/** The replay deck, the endpoint wall, and the vault: centre on the table and facing. */
const DECK = { x: 0.5, z: 0.66, yaw: 0.2 }
const WALL = { x: 1.02, z: -0.9, yaw: -0.28 }
const VAULT = { x: 1.6, z: 0.16, yaw: -0.75 }
/** The wall's face: 21 by 11 sockets, 231 endpoints, and its size and centre height. */
const GRID = { cols: 21, rows: 11, w: 1.24, h: 0.66, y: 0.74 }
/** The endpoint the scrolled pair replays against, and the share of endpoints the audit flags. */
const PAIR_CELL = 115
const FLAGGED = 0.16
/** Crash and data-integrity risks fixed, one marker each. */
const RISKS = 12
/** Requests the work act streams at the wall before the pair. */
const STREAM = 28
/** Seconds of a clicked pair: out to the endpoint, held there, and back. */
const PAIR_OUT = 0.8
const PAIR_HOLD = 0.3
const PAIR_BACK = 0.8
const PAIR_S = PAIR_OUT + PAIR_HOLD + PAIR_BACK + 0.7
/** Member lights on the table in a sunflower spiral, and the radius around the pointer that wakes them. */
const MEMBERS = 1300
const WAKE_R = 0.3
const ACCENT = '#2d7ff9'

/** Additive glow in three shapes: by how squarely a surface faces the camera, radial on a disc's uv, or a ring's outer edge. */
type GlowMode = 'RIM' | 'RADIAL' | 'RING'

const GLOW_VERTEX = /* glsl */ `
varying vec3 vColor;
varying vec2 vUv;
varying float vFacing;
varying vec3 vLocal;
varying vec3 vWorld;
void main() {
  vec4 local = vec4(position, 1.0);
  vec3 n = normal;
  vColor = vec3(1.0);
#ifdef USE_INSTANCING
  local = instanceMatrix * local;
  n = mat3(instanceMatrix) * n;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor = instanceColor;
#endif
  vUv = uv;
  vLocal = position;
  vec4 world = modelMatrix * local;
  vWorld = world.xyz;
  vFacing = abs(dot(normalize(mat3(modelMatrix) * n), normalize(cameraPosition - world.xyz)));
  gl_Position = projectionMatrix * viewMatrix * world;
}`

const GLOW_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uGain;
uniform float uClip;
varying vec3 vColor;
varying vec2 vUv;
varying float vFacing;
varying vec3 vLocal;
varying vec3 vWorld;
void main() {
  float a = uGain;
#if defined(RIM)
  a *= vFacing * vFacing;
#elif defined(RADIAL)
  float d = clamp(length(vUv - 0.5) * 2.0, 0.0, 1.0);
  a *= (1.0 - d) * (1.0 - d);
#elif defined(RING)
  float r = length(vLocal.xz);
  a *= smoothstep(0.86, 0.99, r) * (1.0 - smoothstep(0.99, 1.0, r));
  if (length(vWorld.xz) > uClip) discard;
#endif
  vec3 c = uColor * vColor * a;
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

/**
 * The endpoint wall's face, one socket per endpoint. Sockets light blue in reading order up to uLit of them as they
 * are replayed, a seeded FLAGGED share turns amber as uFlag reaches it, and the paired, clicked, and hovered sockets
 * flare.
 */
const GRID_FRAGMENT = /* glsl */ `
uniform float uLit;
uniform float uFlag;
uniform vec2 uGrid;
uniform float uPair;
uniform float uPairGlow;
uniform float uClick;
uniform float uClickGlow;
uniform float uHover;
varying vec2 vUv;
float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
void main() {
  vec2 cellUv = vec2(vUv.x * uGrid.x, (1.0 - vUv.y) * uGrid.y);
  vec2 cell = floor(cellUv);
  float index = cell.y * uGrid.x + cell.x;
  vec2 f = fract(cellUv) - 0.5;
  float mask = 1.0 - smoothstep(0.26, 0.34, max(abs(f.x), abs(f.y)) * 0.9 + length(f) * 0.25);
  float lit = step(index + 0.5, uLit * uGrid.x * uGrid.y);
  float h = hash(index + 3.0);
  float flagged = step(h, ${FLAGGED.toFixed(3)}) * step(h / ${FLAGGED.toFixed(3)}, uFlag);
  vec3 off = vec3(0.05, 0.08, 0.14);
  vec3 on = vec3(0.12, 0.42, 1.25);
  vec3 amber = vec3(1.7, 0.72, 0.12);
  vec3 c = mix(off, on, lit);
  c = mix(c, amber, flagged);
  float pair = step(abs(index - uPair), 0.5) * uPairGlow;
  float click = step(abs(index - uClick), 0.5) * uClickGlow;
  float hover = step(abs(index - uHover), 0.5);
  c += vec3(1.6, 1.8, 2.0) * max(pair, click) + vec3(0.5, 0.7, 1.0) * hover;
  c = mix(vec3(0.015, 0.02, 0.035), c, mask);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const UV_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

/** A rounded rectangle centred on the origin. */
function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

/** A canvas 2D context with a rounded-rectangle fill, a circle fill, and a check mark. */
function painter(g: CanvasRenderingContext2D) {
  return {
    rr(x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) {
      g.beginPath()
      g.moveTo(x + r, y)
      g.arcTo(x + w, y, x + w, y + h, r)
      g.arcTo(x + w, y + h, x, y + h, r)
      g.arcTo(x, y + h, x, y, r)
      g.arcTo(x, y, x + w, y, r)
      g.closePath()
      g.fillStyle = fill
      g.fill()
    },
    circle(x: number, y: number, r: number, fill: string) {
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fillStyle = fill
      g.fill()
    },
    check(x: number, y: number, s: number, stroke: string, width: number) {
      g.beginPath()
      g.moveTo(x - 0.45 * s, y)
      g.lineTo(x - 0.12 * s, y + 0.32 * s)
      g.lineTo(x + 0.48 * s, y - 0.34 * s)
      g.strokeStyle = stroke
      g.lineWidth = width
      g.lineCap = 'round'
      g.lineJoin = 'round'
      g.stroke()
    },
  }
}

/**
 * The phone's screens side by side, 256 by 512 px each: the blank screen members were left on, the member home, and
 * the rebuilt billing, payments, and paid screens. The screens carry shapes, not words.
 */
function drawScreens() {
  const canvas = document.createElement('canvas')
  canvas.width = 256 * CELLS
  canvas.height = 512
  const g = canvas.getContext('2d')
  if (!g) return canvas
  const { rr, circle, check } = painter(g)
  const ink = '#1b2b44'
  const soft = '#c9d5e6'
  const blue = ACCENT
  const green = '#22b46a'
  // The blank screen: near black, with a loader stalled a third of the way round.
  g.fillStyle = '#04070d'
  g.fillRect(0, 0, 256, 512)
  g.beginPath()
  g.arc(128, 256, 26, -Math.PI / 2, Math.PI / 6)
  g.strokeStyle = '#1d2a3d'
  g.lineWidth = 6
  g.lineCap = 'round'
  g.stroke()
  for (let k = 1; k < CELLS; k++) {
    const ox = k * 256
    g.fillStyle = '#f6f9fd'
    g.fillRect(ox, 0, 256, 512)
    rr(ox + 22, 14, 34, 7, 3.5, ink)
    rr(ox + 196, 14, 14, 7, 3.5, ink)
    rr(ox + 214, 14, 20, 7, 3.5, ink)
  }
  {
    const ox = 256
    rr(ox + 14, 34, 228, 132, 20, blue)
    rr(ox + 34, 66, 48, 58, 14, 'rgba(255,255,255,0.9)')
    rr(ox + 100, 74, 110, 14, 7, '#ffffff')
    rr(ox + 100, 98, 76, 10, 5, 'rgba(255,255,255,0.65)')
    rr(ox + 100, 120, 92, 10, 5, 'rgba(255,255,255,0.65)')
    const icons = [blue, green, '#f2a33a', '#7a6cf0']
    for (let i = 0; i < 4; i++) {
      const x = ox + 14 + (i % 2) * 118
      const y = 184 + Math.floor(i / 2) * 124
      rr(x, y, 110, 112, 16, '#ffffff')
      circle(x + 30, y + 32, 16, icons[i])
      rr(x + 16, y + 64, 74, 10, 5, ink)
      rr(x + 16, y + 84, 52, 8, 4, soft)
    }
    rr(ox + 14, 446, 228, 50, 18, '#ffffff')
    for (let i = 0; i < 4; i++) circle(ox + 46 + i * 54, 471, 7, i === 0 ? blue : soft)
  }
  {
    const ox = 512
    rr(ox + 14, 34, 228, 64, 18, blue)
    rr(ox + 32, 58, 90, 14, 7, '#ffffff')
    rr(ox + 22, 118, 150, 30, 8, ink)
    rr(ox + 22, 158, 88, 18, 9, '#dbe8fb')
    ;[120, 96, 140, 84, 108].forEach((w, i) => {
      const y = 202 + i * 34
      rr(ox + 22, y, w, 10, 5, soft)
      rr(ox + 190, y, 44, 10, 5, ink)
    })
    rr(ox + 22, 378, 212, 3, 1.5, soft)
    rr(ox + 22, 394, 80, 14, 7, ink)
    rr(ox + 168, 394, 66, 14, 7, ink)
    rr(ox + 22, 440, 212, 46, 23, blue)
    rr(ox + 98, 458, 60, 10, 5, '#ffffff')
  }
  {
    const ox = 768
    const grad = g.createLinearGradient(ox + 20, 40, ox + 236, 170)
    grad.addColorStop(0, '#4b93ff')
    grad.addColorStop(1, '#1554c4')
    rr(ox + 20, 40, 216, 134, 18, grad)
    rr(ox + 40, 72, 34, 26, 6, '#f0c96a')
    for (let i = 0; i < 4; i++) rr(ox + 40 + i * 46, 120, 36, 9, 4.5, 'rgba(255,255,255,0.8)')
    rr(ox + 22, 200, 130, 28, 8, ink)
    for (let i = 0; i < 2; i++) {
      const y = 252 + i * 64
      rr(ox + 18, y, 220, 52, 14, '#ffffff')
      circle(ox + 44, y + 26, 11, i === 0 ? blue : soft)
      if (i === 0) circle(ox + 44, y + 26, 5, '#ffffff')
      rr(ox + 68, y + 16, 100, 9, 4.5, ink)
      rr(ox + 68, y + 31, 64, 7, 3.5, soft)
    }
    rr(ox + 22, 440, 212, 46, 23, blue)
    check(ox + 128, 463, 22, '#ffffff', 5)
  }
  {
    const ox = 1024
    circle(ox + 128, 140, 70, green)
    check(ox + 128, 142, 64, '#ffffff', 11)
    rr(ox + 58, 236, 140, 16, 8, ink)
    rr(ox + 78, 264, 100, 10, 5, soft)
    for (let i = 0; i < 3; i++) {
      const y = 312 + i * 30
      rr(ox + 30, y, 90, 9, 4.5, soft)
      rr(ox + 180, y, 46, 9, 4.5, ink)
    }
    rr(ox + 22, 440, 212, 46, 23, '#ffffff')
    rr(ox + 98, 458, 60, 10, 5, blue)
  }
  return canvas
}

const createScene: IslandFactory = (ctx) => {
  const scene = new THREE.Scene()
  scene.environment = ctx.environment
  scene.environmentIntensity = 0.7
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80)
  // A white key from the front right, a cool fill, and a strong blue rim from behind, for a dark stage.
  const lights = sunlight(scene, { sun: '#ffffff', sky: '#a9c4ff', ground: '#0b1830' })
  lights[0].light.position.set(2.8, 5.2, 3.8)
  lights[0].base = 2.3
  lights[1].base = 0.9
  lights[2].light.color.set('#6f9dff')
  lights[2].base = 1.6

  const world = new THREE.Group()
  scene.add(world)
  const geometries: THREE.BufferGeometry[] = []
  const owned: { dispose(): void }[] = []
  const keep = <G extends THREE.BufferGeometry>(geometry: G) => {
    geometries.push(geometry)
    return geometry
  }
  const own = <T extends { dispose(): void }>(thing: T) => {
    owned.push(thing)
    return thing
  }
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], shadow = true) => {
    const m = new THREE.Mesh(geometry, material)
    m.castShadow = shadow
    m.receiveShadow = true
    return m
  }
  const merge = (parts: THREE.BufferGeometry[]) => {
    const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g))
    const merged = mergeGeometries(flat, false)
    for (const g of new Set([...parts, ...flat])) g.dispose()
    return keep(merged ?? new THREE.BufferGeometry())
  }
  const gloss = (color: THREE.ColorRepresentation, roughness = 0.2, extra: THREE.MeshStandardMaterialParameters = {}) =>
    own(new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05, ...extra }))
  const basic = (r: number, g: number, b: number) => own(new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) }))
  const glow = (mode: GlowMode, color: THREE.ColorRepresentation, gain: number, side: THREE.Side = THREE.FrontSide) =>
    own(new THREE.ShaderMaterial({
      ...GLOW,
      side,
      defines: { [mode]: '' },
      uniforms: { uColor: { value: new THREE.Color(color) }, uGain: { value: gain }, uClip: { value: 100 } },
      vertexShader: GLOW_VERTEX,
      fragmentShader: GLOW_FRAGMENT,
    }))
  const white = gloss('#f4f7fb', 0.18)
  const graphite = gloss('#1a2333', 0.32, { metalness: 0.35 })
  const blackGlass = gloss('#05080f', 0.08, { metalness: 0.2 })
  const scratch = new THREE.Matrix4()
  const tint = new THREE.Color()

  // The table: dark glass with a lit edge.
  const tableGeometry = keep(new THREE.CylinderGeometry(TABLE_R, TABLE_R * 0.97, TABLE_H, 128, 1))
  tableGeometry.translate(0, -TABLE_H / 2, 0)
  world.add(mesh(tableGeometry, [graphite, gloss('#030810', 0.7, { metalness: 0.1, envMapIntensity: 0.15 }), graphite], false))
  const edgeGeometry = keep(new THREE.TorusGeometry(TABLE_R - 0.02, 0.009, 6, 192))
  edgeGeometry.rotateX(Math.PI / 2)
  const edge = new THREE.Mesh(edgeGeometry, basic(0.3, 0.6, 1.7))
  edge.position.y = 0.004
  world.add(edge)

  // Placement on the table, in the world group's frame.
  const placed = (group: THREE.Group, at: { x: number; z: number; yaw: number }) => {
    group.position.set(at.x, 0, at.z)
    group.rotation.y = at.yaw
    group.updateMatrix()
    world.add(group)
    return group
  }
  const phone = placed(new THREE.Group(), PHONE)
  const deck = placed(new THREE.Group(), DECK)
  const wall = placed(new THREE.Group(), WALL)
  const vault = placed(new THREE.Group(), VAULT)

  // The member lights: a sunflower spiral clear of everything standing on the table.
  const memberX: number[] = []
  const memberZ: number[] = []
  {
    const golden = Math.PI * (3 - Math.sqrt(5))
    const clear = [[PHONE, 0.68], [DECK, 0.52], [WALL, 0.5], [VAULT, 0.42]] as const
    for (let i = 0; i < MEMBERS; i++) {
      const r = (TABLE_R - 0.1) * Math.sqrt((i + 0.5) / MEMBERS)
      const x = Math.cos(i * golden) * r
      const z = Math.sin(i * golden) * r
      if (clear.some(([at, radius]) => Math.hypot(x - at.x, z - at.z) < radius)) continue
      memberX.push(x)
      memberZ.push(z)
    }
  }
  const memberCount = memberX.length
  const memberRandom = mulberry32(2026)
  /** 1 for the few members lit before anything happens. */
  const memberBase = Float32Array.from({ length: memberCount }, () => (memberRandom() < 0.07 ? 1 : 0))
  const memberDistance = Float32Array.from({ length: memberCount }, (_, i) => Math.hypot(memberX[i] - PHONE.x, memberZ[i] - PHONE.z))
  /** Pointer-woken members: 1 once the pointer has passed, and the eased brightness of that waking. */
  const memberWoken = new Uint8Array(memberCount)
  const memberWake = new Float32Array(memberCount)
  /** The brightness each member was last written with, so the colour buffers upload only on change. */
  const memberShown = new Float32Array(memberCount).fill(-1)
  const dotGeometry = keep(new THREE.CircleGeometry(0.016, 8))
  dotGeometry.rotateX(-Math.PI / 2)
  const haloGeometry = keep(new THREE.CircleGeometry(0.07, 12))
  haloGeometry.rotateX(-Math.PI / 2)
  const dots = new THREE.InstancedMesh(dotGeometry, own(new THREE.MeshBasicMaterial({ color: '#ffffff' })), memberCount)
  const halos = new THREE.InstancedMesh(haloGeometry, glow('RADIAL', '#ffffff', 0.7, THREE.DoubleSide), memberCount)
  const memberOff = new THREE.Color(0.06, 0.12, 0.24)
  const memberOn = new THREE.Color(0.7, 1.3, 2.4)
  const memberHalo = new THREE.Color(0.1, 0.32, 1.0)
  for (let i = 0; i < memberCount; i++) {
    scratch.makeTranslation(memberX[i], 0.003, memberZ[i])
    dots.setMatrixAt(i, scratch)
    scratch.makeTranslation(memberX[i], 0.005, memberZ[i])
    halos.setMatrixAt(i, scratch)
    dots.setColorAt(i, memberOff)
    halos.setColorAt(i, tint.setRGB(0, 0, 0))
  }
  halos.renderOrder = 2
  world.add(dots, halos)
  const cursorGeometry = keep(new THREE.CircleGeometry(0.42, 32))
  cursorGeometry.rotateX(-Math.PI / 2)
  const cursor = new THREE.Mesh(cursorGeometry, glow('RADIAL', '#4f9bff', 0.6, THREE.DoubleSide))
  cursor.visible = false
  cursor.renderOrder = 3
  world.add(cursor)
  const ringGeometry = keep(new THREE.RingGeometry(0.8, 1, 128, 1))
  ringGeometry.rotateX(-Math.PI / 2)
  const ringMaterial = glow('RING', '#7fb4ff', 1.3, THREE.DoubleSide)
  ringMaterial.uniforms.uClip.value = TABLE_R - 0.04
  const ring = new THREE.Mesh(ringGeometry, ringMaterial)
  ring.position.set(PHONE.x, 0.012, PHONE.z)
  ring.visible = false
  ring.renderOrder = 3
  world.add(ring)

  // The phone: a white body on a lit pedestal, black glass, and the screen atlas.
  {
    const pedestal = keep(new THREE.CylinderGeometry(0.6, 0.64, PEDESTAL_H, 64))
    pedestal.translate(0, PEDESTAL_H / 2, 0)
    phone.add(mesh(pedestal, graphite))
    const ringPedestal = keep(new THREE.TorusGeometry(0.625, 0.011, 6, 96))
    ringPedestal.rotateX(Math.PI / 2)
    const lit = new THREE.Mesh(ringPedestal, basic(0.35, 0.7, 2.0))
    lit.position.y = PEDESTAL_H * 0.6
    phone.add(lit)
    const body = mesh(keep(new RoundedBoxGeometry(PHONE_W, PHONE_H, PHONE_D, 6, 0.09)), white)
    body.position.y = PEDESTAL_H + PHONE_H / 2
    const glass = mesh(keep(new THREE.ShapeGeometry(roundedRect(PHONE_W - 0.05, PHONE_H - 0.05, 0.07), 6)), blackGlass, false)
    glass.position.set(0, PEDESTAL_H + PHONE_H / 2, PHONE_D / 2 + 0.002)
    const lens = new THREE.Mesh(keep(new THREE.CircleGeometry(0.016, 16)), basic(0.03, 0.05, 0.08))
    lens.position.set(0, PEDESTAL_H + PHONE_H - 0.07, PHONE_D / 2 + 0.004)
    const button = mesh(keep(new RoundedBoxGeometry(0.014, 0.16, 0.03, 2, 0.006)), white)
    button.position.set(PHONE_W / 2 + 0.004, PEDESTAL_H + PHONE_H * 0.68, 0)
    const bump = mesh(keep(new RoundedBoxGeometry(0.34, 0.15, 0.025, 3, 0.05)), blackGlass)
    bump.position.set(0.2, PEDESTAL_H + PHONE_H - 0.17, -PHONE_D / 2 - 0.008)
    phone.add(body, glass, lens, button, bump)
  }
  const screenTexture = own(new THREE.CanvasTexture(drawScreens()))
  screenTexture.colorSpace = THREE.SRGBColorSpace
  screenTexture.anisotropy = 4
  screenTexture.repeat.set(1 / CELLS, 1)
  const screenMaterial = own(new THREE.MeshBasicMaterial({ map: screenTexture }))
  const screen = new THREE.Mesh(keep(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H)), screenMaterial)
  screen.position.set(0, PEDESTAL_H + PHONE_H / 2 - 0.01, PHONE_D / 2 + 0.004)
  phone.add(screen)
  const screenGlow = new THREE.Mesh(keep(new THREE.PlaneGeometry(SCREEN_W * 1.5, SCREEN_H * 1.25)), glow('RADIAL', '#5c9dff', 0, THREE.DoubleSide))
  screenGlow.position.set(0, PEDESTAL_H + PHONE_H / 2, PHONE_D / 2 + 0.03)
  screenGlow.renderOrder = 2
  phone.add(screenGlow)

  // The twelve risk markers around the phone: red octahedra that turn green and sink into it as they are fixed.
  const riskGeometry = keep(new THREE.OctahedronGeometry(0.055, 0))
  const risks = new THREE.InstancedMesh(riskGeometry, own(new THREE.MeshBasicMaterial({ color: '#ffffff' })), RISKS)
  const riskAuraGeometry = keep(new THREE.SphereGeometry(0.1, 12, 8))
  const riskAuras = new THREE.InstancedMesh(riskAuraGeometry, glow('RIM', '#ffffff', 1), RISKS)
  riskAuras.renderOrder = 2
  const riskAt: THREE.Vector3[] = []
  // Six float beside each long edge of the phone, clear of its screen, at heights spread up its length.
  for (let i = 0; i < RISKS; i++) {
    const side = i % 2 ? 1 : -1
    const local = new THREE.Vector3(side * (0.68 + 0.13 * ((i * 5) % 3)), 0.32 + (((i * 7) % RISKS) / RISKS) * 1.62, -0.18 + 0.12 * ((i * 3) % 3))
    riskAt.push(local.applyMatrix4(phone.matrix))
    risks.setColorAt(i, tint.setRGB(1, 1, 1))
    riskAuras.setColorAt(i, tint.setRGB(0, 0, 0))
  }
  const phoneHeart = new THREE.Vector3(0, PEDESTAL_H + PHONE_H * 0.5, 0).applyMatrix4(phone.matrix)
  world.add(risks, riskAuras)

  // The bundled credential: a gold key in front of the phone that moves into the vault.
  const key = new THREE.Group()
  {
    const gold = gloss('#f2c14e', 0.22, { metalness: 0.8, emissive: '#c88a10', emissiveIntensity: 0.55 })
    const bow = mesh(keep(new THREE.TorusGeometry(0.06, 0.018, 8, 24)), gold)
    bow.position.x = -0.1
    const shaft = mesh(keep(new RoundedBoxGeometry(0.2, 0.026, 0.022, 2, 0.008)), gold)
    shaft.position.x = 0.06
    const tooth = mesh(keep(new RoundedBoxGeometry(0.028, 0.05, 0.022, 2, 0.008)), gold)
    tooth.position.set(0.13, -0.03, 0)
    const tooth2 = mesh(keep(new RoundedBoxGeometry(0.022, 0.036, 0.022, 2, 0.008)), gold)
    tooth2.position.set(0.085, -0.024, 0)
    const aura = new THREE.Mesh(keep(new THREE.SphereGeometry(0.17, 16, 10)), glow('RIM', '#ffb43a', 0.45))
    aura.renderOrder = 2
    key.add(bow, shaft, tooth, tooth2, aura)
  }
  world.add(key)
  /** The key's place before it moves: in front of the phone's lower right corner, clear of the screen's middle. */
  const keyFrom = new THREE.Vector3(0.3, PEDESTAL_H + 0.3, PHONE_D / 2 + 0.2).applyMatrix4(phone.matrix)

  // The vault: a steel safe with a round door that opens for the key and locks behind it.
  const door = new THREE.Group()
  const lockMaterial = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.7, 0.1) }))
  {
    const steel = gloss('#8f9bb0', 0.28, { metalness: 0.75 })
    const body = mesh(keep(new RoundedBoxGeometry(0.6, 0.62, 0.52, 4, 0.06)), steel)
    body.position.y = 0.31
    const recess = mesh(keep(new THREE.CylinderGeometry(0.23, 0.23, 0.02, 40)), graphite, false)
    recess.rotation.x = Math.PI / 2
    recess.position.set(0, 0.33, 0.255)
    const slab = mesh(keep(new THREE.CylinderGeometry(0.215, 0.215, 0.05, 40)), gloss('#aeb9cc', 0.24, { metalness: 0.8 }))
    slab.rotation.x = Math.PI / 2
    slab.position.set(0.215, 0, 0.025)
    const dial = mesh(keep(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 24)), graphite)
    dial.rotation.x = Math.PI / 2
    dial.position.set(0.215, 0, 0.06)
    const lock = new THREE.Mesh(keep(new THREE.TorusGeometry(0.15, 0.01, 6, 48)), lockMaterial)
    lock.position.set(0.215, 0, 0.053)
    door.add(slab, dial, lock)
    door.position.set(-0.215, 0.33, 0.26)
    const feet = merge([-1, 1].flatMap((sx) => [-1, 1].map((sz) => {
      const foot = new THREE.CylinderGeometry(0.035, 0.035, 0.04, 12)
      foot.translate(sx * 0.22, -0.01, sz * 0.18)
      return foot
    })))
    vault.add(body, recess, door, mesh(feet, graphite))
  }
  const vaultMouth = new THREE.Vector3(0, 0.33, 0.45).applyMatrix4(vault.matrix)

  // The replay deck: two reels of recorded traffic on a graphite deck, with the head the replays leave from.
  const reels: THREE.Mesh[] = []
  {
    const top = mesh(keep(new RoundedBoxGeometry(0.92, 0.1, 0.46, 4, 0.035)), graphite)
    top.position.y = 0.05
    const strip = new THREE.Mesh(keep(new THREE.BoxGeometry(0.8, 0.012, 0.012)), basic(0.3, 0.65, 1.8))
    strip.position.set(0, 0.06, 0.232)
    const reelGeometry = (() => {
      const hub = new THREE.CylinderGeometry(0.045, 0.045, 0.06, 20)
      const flange = new THREE.CylinderGeometry(0.17, 0.17, 0.012, 40)
      flange.translate(0, -0.024, 0)
      const tape = new THREE.CylinderGeometry(0.13, 0.13, 0.04, 40)
      const spokes = [0, 1, 2].map((k) => {
        const spoke = new THREE.BoxGeometry(0.3, 0.008, 0.03)
        spoke.rotateY((k * Math.PI) / 3)
        spoke.translate(0, 0.026, 0)
        return spoke
      })
      return merge([hub, flange, tape, ...spokes])
    })()
    const reelMaterial = gloss('#3d6fd1', 0.3, { metalness: 0.3, emissive: '#16357a', emissiveIntensity: 0.6 })
    for (const sx of [-0.23, 0.23]) {
      const reel = mesh(reelGeometry, reelMaterial)
      reel.position.set(sx, 0.135, -0.02)
      reels.push(reel)
      deck.add(reel)
    }
    const head = mesh(keep(new RoundedBoxGeometry(0.12, 0.08, 0.07, 2, 0.02)), white)
    head.position.set(0, 0.14, 0.15)
    const tapePath = new THREE.Mesh(keep(new THREE.BoxGeometry(0.5, 0.03, 0.006)), gloss('#2a2f3a', 0.5))
    tapePath.position.set(0, 0.14, 0.118)
    deck.add(top, strip, head, tapePath)
  }
  const deckHead = new THREE.Vector3(0, 0.2, 0.15).applyMatrix4(deck.matrix)

  // The endpoint wall: a graphite frame on two legs with 231 sockets on its face.
  const gridUniforms = {
    uLit: { value: 0 },
    uFlag: { value: 0 },
    uGrid: { value: new THREE.Vector2(GRID.cols, GRID.rows) },
    uPair: { value: PAIR_CELL },
    uPairGlow: { value: 0 },
    uClick: { value: -1 },
    uClickGlow: { value: 0 },
    uHover: { value: -1 },
  }
  const gridFace = new THREE.Mesh(keep(new THREE.PlaneGeometry(GRID.w, GRID.h)), own(new THREE.ShaderMaterial({ uniforms: gridUniforms, vertexShader: UV_VERTEX, fragmentShader: GRID_FRAGMENT })))
  gridFace.position.set(0, GRID.y, 0.042)
  {
    const frameWall = mesh(keep(new RoundedBoxGeometry(GRID.w + 0.1, GRID.h + 0.1, 0.08, 4, 0.03)), graphite)
    frameWall.position.y = GRID.y
    const legs = merge([-1, 1].map((sx) => {
      const leg = new THREE.BoxGeometry(0.05, GRID.y - GRID.h / 2, 0.05)
      leg.translate(sx * (GRID.w / 2 - 0.12), (GRID.y - GRID.h / 2) / 2, 0)
      return leg
    }))
    const rim = new THREE.Mesh(keep(new THREE.BoxGeometry(GRID.w + 0.06, 0.012, 0.012)), basic(0.3, 0.65, 1.8))
    rim.position.set(0, GRID.y + GRID.h / 2 + 0.05, 0.042)
    wall.add(frameWall, mesh(legs, graphite), gridFace, rim)
  }
  /** A socket's centre in the world group's frame. */
  const cellPoint = (index: number, out: THREE.Vector3) => {
    const col = index % GRID.cols
    const row = Math.floor(index / GRID.cols)
    out.set(((col + 0.5) / GRID.cols - 0.5) * GRID.w, GRID.y + (0.5 - (row + 0.5) / GRID.rows) * GRID.h, 0.05)
    return out.applyMatrix4(wall.matrix)
  }

  // Replayed requests: glowing pills, one aura each, and the gold JWT rings the paired ones carry.
  const PACKETS = STREAM + 4
  const pillGeometry = keep(new THREE.CapsuleGeometry(0.04, 0.08, 4, 12))
  pillGeometry.rotateX(Math.PI / 2)
  const pills = new THREE.InstancedMesh(pillGeometry, own(new THREE.MeshBasicMaterial({ color: '#ffffff' })), PACKETS)
  const pillAuraGeometry = keep(new THREE.SphereGeometry(0.15, 12, 8))
  const pillAuras = new THREE.InstancedMesh(pillAuraGeometry, glow('RIM', '#ffffff', 1), PACKETS)
  pillAuras.renderOrder = 2
  const jwtGeometry = keep(new THREE.TorusGeometry(0.066, 0.014, 8, 24))
  const jwts = new THREE.InstancedMesh(jwtGeometry, own(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.2, 0.3) })), 2)
  for (let i = 0; i < PACKETS; i++) {
    pills.setColorAt(i, tint.setRGB(1, 1, 1))
    pillAuras.setColorAt(i, tint.setRGB(0, 0, 0))
  }
  world.add(pills, pillAuras, jwts)

  // Frame state, reused every frame.
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const hits: THREE.Intersection[] = []
  const hit = new THREE.Vector3()
  const b = new THREE.Vector3()
  const at = new THREE.Vector3()
  const ahead = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const forward = new THREE.Vector3(0, 0, 1)
  const dir = new THREE.Vector3()
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0)
  const pickPhone: THREE.Object3D[] = [phone]
  const pickWall: THREE.Object3D[] = [gridFace]
  let clickAt = -1
  let clickCell = PAIR_CELL
  let steps = 0
  let pressAt = -1
  let clock = 0

  /** The point `t` of the way along a hop from `from` to `to` that rises `lift` in the middle and sits `side` to its left, written to `out`. */
  const hop = (from: THREE.Vector3, to: THREE.Vector3, t: number, lift: number, side: number, out: THREE.Vector3) => {
    out.lerpVectors(from, to, t)
    out.y += lift * 4 * t * (1 - t)
    const dx = to.x - from.x
    const dz = to.z - from.z
    const len = Math.hypot(dx, dz) || 1
    out.x += (-dz / len) * side
    out.z += (dx / len) * side
    return out
  }
  /** Writes packet `i` at `t` along its hop, facing along it, `size` big, coloured (r, g, bl), with an aura `glowGain` strong. */
  const putPill = (i: number, from: THREE.Vector3, to: THREE.Vector3, t: number, side: number, size: number, r: number, g: number, bl: number, glowGain: number) => {
    if (size <= 0.001) {
      pills.setMatrixAt(i, hidden)
      pillAuras.setMatrixAt(i, hidden)
      return
    }
    hop(from, to, t, 0.75, side, at)
    hop(from, to, Math.min(1, t + 0.02), 0.75, side, ahead)
    dir.subVectors(ahead, at)
    if (dir.lengthSq() < 1e-10) dir.subVectors(to, from)
    quaternion.setFromUnitVectors(forward, dir.normalize())
    scale.setScalar(size)
    scratch.compose(at, quaternion, scale)
    pills.setMatrixAt(i, scratch)
    pillAuras.setMatrixAt(i, scratch)
    pills.setColorAt(i, tint.setRGB(r, g, bl))
    pillAuras.setColorAt(i, tint.setRGB(r * 0.35, g * 0.35, bl * 0.35).multiplyScalar(glowGain))
  }

  const pick = (x: number, y: number, objects: THREE.Object3D[]) => {
    ndc.set(x, y)
    raycaster.setFromCamera(ndc, camera)
    hits.length = 0
    raycaster.intersectObjects(objects, true, hits)
    return hits[0] ?? null
  }
  /** The socket under a pointer, or -1. */
  const pickCell = (x: number, y: number) => {
    const first = pick(x, y, pickWall)
    if (!first?.uv) return -1
    const col = Math.min(GRID.cols - 1, Math.floor(first.uv.x * GRID.cols))
    const row = Math.min(GRID.rows - 1, Math.floor((1 - first.uv.y) * GRID.rows))
    return row * GRID.cols + col
  }
  /** The table point, in the world group's frame, under a pointer, or false when the pointer misses the table. */
  const pickTable = (x: number, y: number) => {
    ndc.set(x, y)
    raycaster.setFromCamera(ndc, camera)
    const ray = raycaster.ray
    if (Math.abs(ray.direction.y) < 1e-4) return false
    const t = (world.position.y - ray.origin.y) / ray.direction.y
    if (t <= 0) return false
    hit.copy(ray.direction).multiplyScalar(t).add(ray.origin)
    hit.y -= world.position.y
    return Math.hypot(hit.x, hit.z) < TABLE_R
  }
  const wake = (radius: number) => {
    for (let i = 0; i < memberCount; i++) {
      if (!memberWoken[i] && Math.hypot(memberX[i] - hit.x, memberZ[i] - hit.z) < radius) memberWoken[i] = 1
    }
  }

  const view = (f: IslandFrame) => {
    if (f.mode === 'home') return { distance: 9 - 0.4 * f.hover, yaw: 0.32 + f.tiltX * 0.28, pitch: 0.46 - f.tiltY * 0.1, focusX: 0.5, focusY: 0.5 }
    const arrival = f.local('arrival')
    const w = f.local('work')
    const c = f.local('impact')
    const dive = smoother(ramp(arrival, 0, 0.8))
    const work = smoother(ramp(w, 0, 0.25)) * (1 - smoother(ramp(c, 0, 0.5)))
    const distance = (f.narrow ? 30 : 17) - (f.narrow ? 6 : 5.5) * dive - 1.4 * work + 1.4 * smoother(ramp(c, 0.2, 0.8)) + 0.6 * f.push
    const yaw = 0.26 + 0.3 * dive + 0.36 * w + 0.16 * c + f.tiltX * 0.16 + f.dragYaw
    const pitch = 0.6 - 0.14 * dive + 0.06 * work - f.tiltY * 0.08
    return { distance, yaw, pitch, focusX: f.narrow ? 0.5 : 0.36, focusY: f.narrow ? 0.7 : 0.5 }
  }

  // Labels, in the story's panel order: the two lanes of a pair in flight, and the response they share.
  const HIDDEN = new THREE.Vector3(0, -50, 0)
  const panels: IslandPanel[] = Array.from({ length: 3 }, () => ({ center: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), halfH: 0, corners: [new THREE.Vector3()], develop: 0, opacity: 0 }))
  /** Shows panel `k` hanging under the world-group point `point`, or hides it when `point` is null. */
  const setPanel = (k: number, point: THREE.Vector3 | null) => {
    const panel = panels[k]
    if (point) world.localToWorld(panel.center.copy(point))
    else panel.center.copy(HIDDEN)
    panel.corners[0].copy(panel.center)
    panel.halfH = point ? -0.05 : 0
    panel.develop = point ? 1 : 0
    panel.opacity = point ? 1 : 0
  }
  const anchors = new Map<string, THREE.Vector3 | null>()
  const wallAnchor = new THREE.Vector3()
  const phoneAnchor = new THREE.Vector3()
  const labelAt = new THREE.Vector3()
  const cellAt = new THREE.Vector3()
  const bounds = Array.from({ length: 12 }, () => new THREE.Vector3())
  /** The scrolled pair and a clicked pair: out and back progress (0 to 1, or -1 when not flying) and the target socket. */
  const pairs = [{ out: -1, back: -1, cell: PAIR_CELL }, { out: -1, back: -1, cell: PAIR_CELL }]

  return {
    scene,
    camera,
    update(f): IslandOutput {
      clock = f.time
      let busy = false
      const home = f.mode === 'home'
      const w = home ? 1 : f.local('work')
      const c = home ? 1 : f.local('impact')
      const v = view(f)
      world.position.y = 0.12 * f.hover
      for (const { light, base: intensity } of lights) light.intensity = intensity * (1 + 0.2 * f.push)
      frame(camera, TARGET, v.distance, v.yaw, v.pitch, f.aspect, v.focusX, v.focusY)

      // The replay: the reels turn with the work, a stream of recorded requests lights every socket in turn, and then
      // the pair flies out with and without the JWT and comes back with the same response.
      reels[0].rotation.y = w * 18
      reels[1].rotation.y = w * 14
      for (let j = 0; j < STREAM; j++) {
        const t = home ? -1 : (w - (0.02 + j * 0.0105)) / 0.07
        if (t <= 0 || t >= 1) {
          putPill(j, deckHead, deckHead, 0, 0, 0, 0, 0, 0, 0)
          continue
        }
        cellPoint(Math.floor(((j + 0.5) / STREAM) * GRID.cols * GRID.rows), b)
        putPill(j, deckHead, b, t, 0, 1, 0.35, 0.75, 2.0, 1)
      }
      gridUniforms.uLit.value = home ? 1 : smoother(ramp(w, 0.03, 0.34))
      pairs[0].out = home ? -1 : ramp(w, 0.38, 0.47)
      pairs[0].back = home ? -1 : ramp(w, 0.5, 0.59)
      pairs[1].out = -1
      pairs[1].back = -1
      pairs[1].cell = clickCell
      let clickedGlow = 0
      if (clickAt >= 0) {
        const e = clock - clickAt
        if (e < PAIR_S) {
          busy = true
          pairs[1].out = Math.min(1, e / PAIR_OUT)
          pairs[1].back = Math.max(0, (e - PAIR_OUT - PAIR_HOLD) / PAIR_BACK)
          clickedGlow = smoother(ramp(e, PAIR_OUT - 0.1, PAIR_OUT + 0.1)) * (1 - smoother(ramp(e, PAIR_S - 0.5, PAIR_S)))
        } else clickAt = -1
      }
      let flying = -1
      for (let p = 0; p < 2; p++) {
        const pair = pairs[p]
        cellPoint(pair.cell, b)
        const going = pair.out > 0 && pair.out < 1
        const coming = pair.back > 0 && pair.back < 1
        for (let lane = 0; lane < 2; lane++) {
          const i = STREAM + p * 2 + lane
          const side = lane ? -0.09 : 0.09
          if (going) putPill(i, deckHead, b, pair.out, side, 1.15, 0.35, 0.75, 2.0, 1.2)
          else if (coming) putPill(i, b, deckHead, pair.back, -side, 1.15, 0.3, 1.8, 0.6, 1.2)
          else putPill(i, deckHead, deckHead, 0, 0, 0, 0, 0, 0, 0)
          // The JWT ring rides the first lane on the way out only.
          if (lane === 0) {
            if (going) {
              scale.setScalar(1)
              scratch.compose(at, quaternion, scale)
              jwts.setMatrixAt(p, scratch)
            } else jwts.setMatrixAt(p, hidden)
          }
        }
        if (going || coming) flying = p
      }
      gridUniforms.uPairGlow.value = home ? 0 : smoother(ramp(w, 0.46, 0.49)) * (1 - smoother(ramp(w, 0.62, 0.68)))
      gridUniforms.uClick.value = clickCell
      gridUniforms.uClickGlow.value = clickedGlow
      gridUniforms.uFlag.value = home ? 1 : smoother(ramp(w, 0.58, 0.68))
      pills.instanceMatrix.needsUpdate = true
      pillAuras.instanceMatrix.needsUpdate = true
      jwts.instanceMatrix.needsUpdate = true
      if (pills.instanceColor) pills.instanceColor.needsUpdate = true
      if (pillAuras.instanceColor) pillAuras.instanceColor.needsUpdate = true

      // The key leaves the phone for the vault, whose door opens for it and locks behind it.
      const opened = home ? 0 : smoother(ramp(w, 0.64, 0.72)) * (1 - smoother(ramp(w, 0.86, 0.93)))
      door.rotation.y = -1.9 * opened
      const flown = home ? 1 : smoother(ramp(w, 0.7, 0.86))
      key.visible = flown < 0.999
      hop(keyFrom, vaultMouth, flown, 0.9, 0, key.position)
      key.rotation.set(0.3 * (1 - flown), -0.6 + 1.4 * flown, 0.25 * Math.sin(Math.PI * flown))
      key.scale.setScalar(1.6 - 0.7 * smoother(ramp(flown, 0.8, 1)))
      const locked = home ? 1 : smoother(ramp(w, 0.88, 0.95))
      lockMaterial.color.setRGB(1.6 - 1.3 * locked, 0.7 + 0.9 * locked, 0.1 + 0.4 * locked)

      // The close: the blank screen boots, the risks are fixed, and the members light.
      const boot = home ? 1 : smoother(ramp(c, 0.06, 0.2))
      const stepped = home ? 1 : c < 0.3 ? 1 : c < 0.44 ? 2 : c < 0.58 ? 3 : 4
      const cell = boot < 0.5 ? BLANK : 1 + ((stepped - 1 + steps) % (CELLS - 1))
      screenTexture.offset.x = cell / CELLS
      screenMaterial.color.setScalar(0.25 + 0.95 * boot)
      ;(screenGlow.material as THREE.ShaderMaterial).uniforms.uGain.value = 0.35 * boot + 0.5 * Math.sin(Math.PI * boot)
      const pressed = pressAt < 0 ? 1 : (clock - pressAt) / 0.3
      if (pressed < 1) busy = true
      screen.scale.setScalar(1 - 0.03 * Math.sin(Math.PI * Math.min(1, pressed)))
      for (let i = 0; i < RISKS; i++) {
        const fixAt = 0.12 + i * 0.022
        const fixed = home ? 1 : smoother(ramp(c, fixAt, fixAt + 0.05))
        const gone = home ? 1 : smoother(ramp(c, fixAt + 0.06, fixAt + 0.14))
        at.lerpVectors(riskAt[i], phoneHeart, gone)
        quaternion.setFromAxisAngle(up, i * 0.7 + w * 3)
        scale.setScalar(Math.max(1e-4, 1 - gone))
        scratch.compose(at, quaternion, scale)
        risks.setMatrixAt(i, scratch)
        riskAuras.setMatrixAt(i, scratch)
        risks.setColorAt(i, tint.setRGB(1.9 - 1.6 * fixed, 0.25 + 1.4 * fixed, 0.2 + 0.4 * fixed))
        riskAuras.setColorAt(i, tint.setRGB(0.55 - 0.5 * fixed, 0.06 + 0.4 * fixed, 0.05 + 0.12 * fixed))
      }
      risks.instanceMatrix.needsUpdate = true
      riskAuras.instanceMatrix.needsUpdate = true
      if (risks.instanceColor) risks.instanceColor.needsUpdate = true
      if (riskAuras.instanceColor) riskAuras.instanceColor.needsUpdate = true
      const front = home ? 99 : 5 * smoother(ramp(c, 0.18, 0.9))
      ring.visible = !home && front > 0.02 && c < 0.95
      ring.scale.setScalar(Math.max(0.01, front))
      ringMaterial.uniforms.uGain.value = 1.3 * (1 - smoother(ramp(c, 0.7, 0.92)))

      // The pointer: sockets light under it, and it wakes the members it passes over.
      scene.updateMatrixWorld()
      const pickable = home ? f.hover > 0.5 : true
      gridUniforms.uHover.value = f.pointer.inside && pickable && !home ? pickCell(f.pointer.x, f.pointer.y) : -1
      const overTable = f.pointer.inside && pickable && pickTable(f.pointer.x, f.pointer.y)
      cursor.visible = overTable
      if (overTable) {
        cursor.position.set(hit.x, 0.01, hit.z)
        wake(WAKE_R)
      }
      let colours = false
      for (let i = 0; i < memberCount; i++) {
        if (memberWoken[i] && memberWake[i] < 1) {
          memberWake[i] = ease(memberWake[i], 1, f.dt, 0.16)
          if (memberWake[i] < 1) busy = true
        }
        const lit = Math.max(memberBase[i] * 0.85, smoother(ramp(front - memberDistance[i], 0, 0.35)), memberWake[i])
        if (Math.abs(lit - memberShown[i]) < 1e-3) continue
        memberShown[i] = lit
        colours = true
        dots.setColorAt(i, tint.copy(memberOff).lerp(memberOn, lit))
        halos.setColorAt(i, tint.copy(memberHalo).multiplyScalar(lit))
      }
      if (colours) {
        if (dots.instanceColor) dots.instanceColor.needsUpdate = true
        if (halos.instanceColor) halos.instanceColor.needsUpdate = true
      }

      const pair = flying >= 0 ? pairs[flying] : null
      if (pair && pair.out > 0.08 && pair.out < 0.92) {
        cellPoint(pair.cell, b)
        setPanel(0, hop(deckHead, b, pair.out, 0.75, 0.09, labelAt).setY(labelAt.y + 0.3))
        setPanel(1, hop(deckHead, b, pair.out, 0.75, -0.09, labelAt).setY(labelAt.y - 0.08))
      } else {
        setPanel(0, null)
        setPanel(1, null)
      }
      const sharedScroll = !home && w > 0.49 && w < 0.61
      const sharedClick = clickAt >= 0 && pairs[1].back > 0.15
      setPanel(2, sharedScroll || sharedClick ? cellPoint(sharedClick ? clickCell : PAIR_CELL, cellAt).setY(cellAt.y + 0.36) : null)

      anchors.set('wall', world.localToWorld(cellPoint(GRID.cols * 2 + 4, wallAnchor)))
      anchors.set('phone', world.localToWorld(phoneAnchor.set(0, PEDESTAL_H + PHONE_H * 0.62, PHONE_D / 2).applyMatrix4(phone.matrix)))
      for (let k = 0; k < bounds.length; k++) world.localToWorld(bounds[k].set(Math.cos((k / 12) * Math.PI * 2) * TABLE_R, -TABLE_H, Math.sin((k / 12) * Math.PI * 2) * TABLE_R))
      return { anchors, panels, bounds, focusY: 0.5, busy, ready: true }
    },
    press(point) {
      const cell = pickCell(point.x, point.y)
      if (cell >= 0) {
        clickCell = cell
        clickAt = ctx.now()
        return true
      }
      if (pick(point.x, point.y, pickPhone)) {
        if (screenMaterial.color.r > 0.9) {
          steps++
          pressAt = ctx.now()
        }
        return true
      }
      if (pickTable(point.x, point.y)) {
        wake(WAKE_R * 1.4)
        return true
      }
      return false
    },
    dispose() {
      geometries.forEach((g) => g.dispose())
      owned.forEach((o) => o.dispose())
      for (const instanced of [dots, halos, risks, riskAuras, pills, pillAuras, jwts]) instanced.dispose()
    },
  }
}

export default createScene
