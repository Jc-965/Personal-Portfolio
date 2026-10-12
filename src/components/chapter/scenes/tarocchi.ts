/**
 * Tarocchi's scene. The centrepiece is the app's pixel Magician card (Sarah Seekins's PixelTarot art, from the
 * edited atlas public/Tarocchi/chapter/cards.webp) as a thick card with gilded edges that turns toward the pointer.
 * In the magician act its pixels lift off as voxels into a relief of the figure (depth from the alpha channel of
 * magician-voxels.png), stream around a large infinity sign as the reader scrolls, and settle back onto the card. A
 * press on the lifted figure bursts the voxels outward, and they fall back into place. The spread act deals the
 * app's three spreads (Three-Card, Compass, V) as real layouts the reader switches between, lifts by hover, and
 * turns by click. The branches act fans out the five illustrated scenes a reading travels through, and hovering a
 * scene turns the ASCII room into it.
 */
import * as THREE from 'three'
import type { ChapterScene, SceneFactory, SceneFrame, SceneOutput, ScenePanel } from '../types'
import { HEIGHT_VOXELS, VOXEL, createWizard } from './wizard'

/** Atlas layout of cards.webp: 316 by 556 px cells on a 2 px gutter, each the 79 by 139 art at 4x. */
const ATLAS = { w: 2228, h: 1118, cellW: 316, cellH: 556 }
const FRAMES = {
  magician: [2, 2], fool: [320, 2], star: [320, 560], moon: [638, 560], sun: [956, 560], wheel: [1910, 2], back: [1592, 560],
} as const satisfies Record<string, readonly [number, number]>
type Frame = keyof typeof FRAMES
/** The cards the spreads deal, in dealing order. */
const DEAL: Frame[] = ['fool', 'star', 'moon', 'sun', 'wheel']
/** Card size in world units, the art's 79:139 aspect, and the spread cards' scale. */
const CARD_W = 1
const CARD_H = CARD_W * (139 / 79)
const CARD_D = 0.035
const SPREAD_SCALE = 0.55
/** The art's own infinity sign is centred at about row 25 of 139, so the loop forms where the card prints it. */
const LOOP = { x: 0.02, y: (0.5 - 25 / 139) * CARD_H, z: 0.4, a: 0.78 }
/** The scenes a reading travels through (gameReducer.ts allScenes), and each one's index in the story's backdrops. */
const SCENES = ['castle', 'cave', 'city', 'forest', 'rural'] as const
const SCENE_BACKDROP: Record<(typeof SCENES)[number], number> = { castle: 2, cave: 3, city: 4, forest: 5, rural: 6 }
const SCENE_W = 1.25
const SCENE_H = SCENE_W / 1.5
/** Pointer reach, as ParkiWell's rig: the card turns up to 0.3 rad of yaw and 0.17 of pitch toward the cursor. */
const TILT = { yaw: 0.3, pitch: 0.17 }
/** Time constants of the motions a click or hover starts, seconds. */
const FLIP_EASE = 0.28
const HOVER_EASE = 0.16
const LAYOUT_EASE = 0.32
const ROOM_FADE = 0.45
/** Seconds a burst takes to throw the voxels out and let them fall back. */
const BURST_S = 1.6
/** Rings and sides of each wire's tube. */
const TUBE_SEGMENTS = 28
const TUBE_SIDES = 6

type Layout = 'three' | 'compass' | 'v'
/**
 * Slots per layout in card widths from the spread's centre, each with the panel label it carries. The orders follow
 * SelectPage.tsx. Three-Card reads past, present, and future, the compass reads south, west, east, and north, and
 * the V reads its root and then each choice with its outcome. Panel order is the story's panels list.
 */
const LAYOUTS: Record<Layout, { at: readonly [number, number]; label: number }[]> = {
  three: [{ at: [-1.15, 0], label: 0 }, { at: [0, 0], label: 1 }, { at: [1.15, 0], label: 2 }],
  compass: [{ at: [0, -1.05], label: 3 }, { at: [-1.15, 0], label: 4 }, { at: [1.15, 0], label: 5 }, { at: [0, 1.05], label: 6 }],
  v: [{ at: [0, -1.02], label: 7 }, { at: [-0.62, 0.02], label: 8 }, { at: [-1.22, 1.02], label: 9 }, { at: [0.62, 0.02], label: 10 }, { at: [1.22, 1.02], label: 11 }],
}
const SPREAD_LABELS = 12
const LAYOUT_KEYS = Object.keys(LAYOUTS) as Layout[]

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / Math.max(1e-9, b - a))
const smoother = (t: number) => {
  const x = clamp01(t)
  return x * x * x * (x * (x * 6 - 15) + 10)
}
/** Eases `from` toward `to` with time constant `tc` seconds, landing on it once within 1e-4. */
const ease = (from: number, to: number, dt: number, tc: number) => (Math.abs(to - from) < 1e-4 ? to : from + (to - from) * (1 - Math.exp(-dt / tc)))
const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
/** A small seeded generator returning floats in [0, 1). The same seed gives the same sequence on every visit. */
function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const VOXEL_VERTEX = /* glsl */ `
attribute vec2 aHome;
attribute float aDepth;
attribute vec3 aColor;
attribute vec4 aSeed;
uniform float uLift;
uniform float uFlow;
uniform float uPhase;
uniform float uPixel;
uniform float uRelief;
uniform float uCardH;
uniform vec4 uLoop;
uniform vec3 uRayOrigin;
uniform vec3 uRayDir;
uniform float uRepel;
uniform float uBurst;
varying vec3 vColor;
varying vec3 vNormal;
varying float vGlow;
varying float vFlow;

// Bernoulli's lemniscate, the infinity sign, a either side of its centre.
vec2 lemniscate(float t, float a) {
  float s = sin(t);
  float c = cos(t);
  return vec2(c, s * c) * (a / (1.0 + s * s));
}

void main() {
  vec3 home = vec3(aHome, 0.0);
  // Each voxel leaves the card at its own moment, a wave from the feet up loosened by its seed.
  float wave = aHome.y / uCardH + 0.5;
  float lift = smoothstep(0.0, 1.0, clamp(uLift * 1.6 - wave * 0.4 - aSeed.x * 0.2, 0.0, 1.0));
  vec3 p = home + vec3(0.0, 0.0, (0.02 + aDepth * uRelief) * lift);
  // On the loop each voxel keeps its place along the curve (aSeed.x) and a place in a round cross-section around
  // it (aSeed.y the angle, aSeed.z the radius), so the stream fills a band with the curve's true normal.
  float t = aSeed.x * 6.2831853 + uPhase;
  vec2 at = lemniscate(t, uLoop.w);
  vec2 along = normalize(lemniscate(t + 0.01, uLoop.w) - at + 1e-6);
  vec2 across = vec2(-along.y, along.x);
  float angle = aSeed.y * 6.2831853;
  float radius = sqrt(aSeed.z) * 0.045;
  vec3 loop = uLoop.xyz + vec3(at + across * cos(angle) * radius, sin(angle) * radius * 1.6);
  float flow = smoothstep(0.0, 1.0, clamp(uFlow * 1.5 - aSeed.x * 0.5, 0.0, 1.0));
  p = mix(p, loop, flow) + vec3(0.0, 0.0, sin(flow * 3.14159) * 0.22);
  // A burst throws the lifted voxels out from the figure and lets them fall back.
  vec3 away = normalize(vec3(aHome.x, aHome.y - 0.1, 0.55) + (aSeed.yzw - 0.5) * 0.9);
  p += away * uBurst * (0.35 + aSeed.w) * 0.7 * lift;
  // The pointer parts the standing relief around its own ray, in this mesh's space, so the opening stays under the
  // cursor at every depth of the relief and every turn of the card.
  vec3 toVoxel = p - uRayOrigin;
  vec3 offRay = toVoxel - dot(toVoxel, uRayDir) * uRayDir;
  float push = uRepel * exp(-dot(offRay, offRay) / 0.02) * lift * (1.0 - flow);
  p += normalize(offRay + 1e-5) * push * 0.1 - uRayDir * push * 0.12;
  vec3 world = p + position * uPixel * mix(0.92, 0.7, flow);
  vNormal = normalize(normalMatrix * normal);
  vColor = aColor;
  vFlow = flow;
  vGlow = push * 0.6 + uBurst * 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
}
`

const VOXEL_FRAGMENT = /* glsl */ `
uniform vec3 uKey;
uniform float uLight;
varying vec3 vColor;
varying vec3 vNormal;
varying float vGlow;
varying float vFlow;
void main() {
  float diffuse = max(dot(normalize(vNormal), uKey), 0.0);
  vec3 lit = vColor * (0.42 + 0.78 * diffuse) * uLight;
  // On the loop the pixels keep a share of their colour and burn gold, so the sign reads as one band of light.
  vec3 gold = vec3(1.0, 0.72, 0.32) * (0.55 + 0.6 * diffuse);
  vec3 colour = mix(lit, lit * 0.45 + gold * 0.8, vFlow) + gold * vGlow * 0.5;
  gl_FragColor = vec4(colour, 1.0);
}
`

/** A wire from the Magician card to one scene. A light runs along it with the scroll, and it brightens on hover. */
const WIRE_VERTEX = /* glsl */ `
varying float vAlong;
void main() {
  vAlong = uv.x;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const WIRE_FRAGMENT = /* glsl */ `
uniform float uDraw;
uniform float uHead;
uniform float uHot;
varying float vAlong;
void main() {
  if (vAlong > uDraw) discard;
  float pulse = exp(-pow((vAlong - uHead) * 9.0, 2.0));
  gl_FragColor = vec4(vec3(1.0, 0.72, 0.3) * (0.35 + 1.4 * pulse + 0.9 * uHot), 1.0);
}
`

/** A BoxGeometry whose +z face samples `front`'s atlas cell and whose -z face samples the card back. */
function cardGeometry(front: Frame) {
  const geometry = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_D)
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute
  // BoxGeometry builds its faces in the order +x, -x, +y, -y, +z, -z, four vertices each. The atlas uploads with
  // its top row at v = 1, so a cell's bottom edge is at 1 - (y + height) / atlas height.
  const remap = (first: number, [x, y]: readonly [number, number]) => {
    const u0 = x / ATLAS.w
    const u1 = (x + ATLAS.cellW) / ATLAS.w
    const v0 = 1 - (y + ATLAS.cellH) / ATLAS.h
    const v1 = 1 - y / ATLAS.h
    for (let i = first; i < first + 4; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0))
  }
  remap(16, FRAMES[front])
  remap(20, FRAMES.back)
  return geometry
}

/** A tube with fixed topology whose rings shapeTube moves in place, so a wire never reallocates its buffers. */
function tubeGeometry() {
  const geometry = new THREE.BufferGeometry()
  const count = (TUBE_SEGMENTS + 1) * TUBE_SIDES
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage))
  const uv = new Float32Array(count * 2)
  const index: number[] = []
  for (let i = 0; i <= TUBE_SEGMENTS; i++) {
    for (let j = 0; j < TUBE_SIDES; j++) {
      const k = i * TUBE_SIDES + j
      uv[k * 2] = i / TUBE_SEGMENTS
      if (i === TUBE_SEGMENTS) continue
      const next = i * TUBE_SIDES + ((j + 1) % TUBE_SIDES)
      index.push(k, k + TUBE_SIDES, next, next, k + TUBE_SIDES, next + TUBE_SIDES)
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geometry.setIndex(index)
  return geometry
}

const tubePoint = new THREE.Vector3()
const tubeTangent = new THREE.Vector3()
const tubeNormal = new THREE.Vector3()
const tubeBinormal = new THREE.Vector3()
const FORWARD = new THREE.Vector3(0, 0, 1)
function shapeTube(geometry: THREE.BufferGeometry, curve: THREE.Curve<THREE.Vector3>, radius: number) {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i <= TUBE_SEGMENTS; i++) {
    const t = i / TUBE_SEGMENTS
    curve.getPoint(t, tubePoint)
    curve.getTangent(t, tubeTangent)
    tubeNormal.crossVectors(tubeTangent, FORWARD)
    if (tubeNormal.lengthSq() < 1e-8) tubeNormal.set(0, 1, 0)
    tubeNormal.normalize()
    tubeBinormal.crossVectors(tubeTangent, tubeNormal).normalize()
    for (let j = 0; j < TUBE_SIDES; j++) {
      const angle = (j / TUBE_SIDES) * Math.PI * 2
      const cos = Math.cos(angle) * radius
      const sin = Math.sin(angle) * radius
      position.setXYZ(i * TUBE_SIDES + j, tubePoint.x + tubeNormal.x * cos + tubeBinormal.x * sin, tubePoint.y + tubeNormal.y * cos + tubeBinormal.y * sin, tubePoint.z + tubeNormal.z * cos + tubeBinormal.z * sin)
    }
  }
  position.needsUpdate = true
}

const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const

const createScene: SceneFactory = (ctx) => {
  const scene = new THREE.Scene()
  scene.environment = ctx.environment
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60)
  // A warm candle key from the upper left that follows the pointer across the gilt edges, a violet rim from behind,
  // and a soft fill, for the reading table's light.
  const key = new THREE.DirectionalLight('#ffd9a0', 1.6)
  const rim = new THREE.DirectionalLight('#b48cff', 1.1)
  rim.position.set(2.5, 1.2, -3)
  const fill = new THREE.HemisphereLight('#f3e3ff', '#160c22', 0.55)
  scene.add(key, rim, fill)
  const lights = [key, rim, fill].map((light) => ({ light, base: light.intensity }))

  const atlas = ctx.load('/Tarocchi/chapter/cards.webp', { urgent: true, pixelated: true })
  const gold = new THREE.MeshStandardMaterial({ color: '#d8b25a', metalness: 1, roughness: 0.28, envMapIntensity: 1.2 })
  // The art carries its own light, so a share of it is emissive and stays readable away from the key.
  const artMaterial = () => new THREE.MeshStandardMaterial({ map: atlas.texture, emissiveMap: atlas.texture, emissive: '#ffffff', emissiveIntensity: 0.32, roughness: 0.62 })
  const spreadArt = artMaterial()
  const magicianArt = artMaterial()

  const root = new THREE.Group()
  scene.add(root)
  const deck = new THREE.Group()
  root.add(deck)
  const magicianGeometry = cardGeometry('magician')
  const magician = new THREE.Mesh(magicianGeometry, [gold, gold, gold, gold, magicianArt, magicianArt])
  deck.add(magician)

  // One voxel per opaque pixel of the 79 by 139 art, built once magician-voxels.png arrives. RGB is the pixel's
  // colour, and alpha its height in the relief, from 6 for the frame to about 250 for the figure.
  const voxelUniforms = {
    uLift: { value: 0 },
    uFlow: { value: 0 },
    uPhase: { value: 0 },
    uPixel: { value: CARD_W / 79 },
    uRelief: { value: 0.34 },
    uCardH: { value: CARD_H },
    uLoop: { value: new THREE.Vector4(LOOP.x, LOOP.y, LOOP.z, LOOP.a) },
    uRayOrigin: { value: new THREE.Vector3(0, 0, 9) },
    uRayDir: { value: new THREE.Vector3(0, 0, -1) },
    uRepel: { value: 0 },
    uBurst: { value: 0 },
    uKey: { value: new THREE.Vector3(-0.5, 0.55, 0.67).normalize() },
    uLight: { value: 1 },
  }
  const voxelMaterial = new THREE.ShaderMaterial({ vertexShader: VOXEL_VERTEX, fragmentShader: VOXEL_FRAGMENT, uniforms: voxelUniforms })
  let voxels: THREE.Mesh | null = null
  let voxelGeometry: THREE.InstancedBufferGeometry | null = null
  let disposed = false
  fetch('/Tarocchi/chapter/magician-voxels.png')
    .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(`${response.status}`))))
    .then((blob) => createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
    .then((bitmap) => {
      if (disposed) { bitmap.close(); return }
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const draw = canvas.getContext('2d')
      if (!draw) return
      draw.drawImage(bitmap, 0, 0)
      const { data, width, height } = draw.getImageData(0, 0, bitmap.width, bitmap.height)
      bitmap.close()
      const home: number[] = []
      const depth: number[] = []
      const colour: number[] = []
      const seed: number[] = []
      const random = mulberry32(79139)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4
          if (data[i + 3] === 0) continue
          home.push(((x + 0.5) / width - 0.5) * CARD_W, (0.5 - (y + 0.5) / height) * CARD_H)
          depth.push(data[i + 3] / 255)
          colour.push(srgbToLinear(data[i] / 255), srgbToLinear(data[i + 1] / 255), srgbToLinear(data[i + 2] / 255))
          // Four independent draws from a fixed-seed generator, so the wave, the loop, and the burst are the same on
          // every visit.
          seed.push(random(), random(), random(), random())
        }
      }
      const box = new THREE.BoxGeometry(1, 1, 1)
      voxelGeometry = new THREE.InstancedBufferGeometry()
      voxelGeometry.index = box.index
      voxelGeometry.setAttribute('position', box.getAttribute('position'))
      voxelGeometry.setAttribute('normal', box.getAttribute('normal'))
      voxelGeometry.setAttribute('aHome', new THREE.InstancedBufferAttribute(new Float32Array(home), 2))
      voxelGeometry.setAttribute('aDepth', new THREE.InstancedBufferAttribute(new Float32Array(depth), 1))
      voxelGeometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(colour), 3))
      voxelGeometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seed), 4))
      voxelGeometry.instanceCount = depth.length
      voxels = new THREE.Mesh(voxelGeometry, voxelMaterial)
      voxels.frustumCulled = false
      voxels.visible = false
      voxels.position.z = CARD_D / 2 + 0.002
      magician.add(voxels)
      ctx.invalidate()
    })
    .catch((error) => console.warn('[chapter] tarocchi voxels failed to load', error))

  // The spread: five cards that leave the deck for the chosen layout's slots.
  const spread = DEAL.map((frame) => {
    const geometry = cardGeometry(frame)
    const mesh = new THREE.Mesh(geometry, [gold, gold, gold, gold, spreadArt, spreadArt])
    mesh.visible = false
    root.add(mesh)
    return { mesh, geometry, flip: 0, flipGoal: -1, lift: 0 }
  })
  let layout: Layout = 'three'
  /** Eased weight of each layout, so a switch glides every card from its old slot to its new one. */
  const layoutWeight: Record<Layout, number> = { three: 1, compass: 0, v: 0 }

  // The branches: the five scenes as gilt-framed plates, each wired to the Magician card.
  const plateGeometry = new THREE.PlaneGeometry(SCENE_W, SCENE_H)
  const frameGeometry = new THREE.BoxGeometry(SCENE_W + 0.05, SCENE_H + 0.05, 0.02)
  const branches = SCENES.map((name) => {
    const art = ctx.load(`/Tarocchi/chapter/scenes/${name}.webp`)
    const material = new THREE.MeshBasicMaterial({ map: art.texture, toneMapped: false })
    const plate = new THREE.Mesh(plateGeometry, material)
    const frame = new THREE.Mesh(frameGeometry, gold)
    frame.position.z = -0.012
    const group = new THREE.Group()
    group.add(frame, plate)
    group.visible = false
    root.add(group)
    const wireUniforms = { uDraw: { value: 0 }, uHead: { value: 0 }, uHot: { value: 0 } }
    const wireMaterial = new THREE.ShaderMaterial({ vertexShader: WIRE_VERTEX, fragmentShader: WIRE_FRAGMENT, uniforms: wireUniforms })
    const wire = new THREE.Mesh(tubeGeometry(), wireMaterial)
    wire.frustumCulled = false
    wire.visible = false
    root.add(wire)
    return { art, material, plate, group, wire, wireMaterial, wireUniforms, hover: 0 }
  })
  // Maestro Tarocchi, the app's guide (wizard.ts), conjures the deck through the spread and the scenes and delivers
  // the reading at the close.
  const wizard = createWizard(ctx)
  root.add(wizard.group)
  const guideAt = new THREE.Vector3()
  const closeAt = new THREE.Vector3()
  const dealFrom = new THREE.Vector3()
  const wireFrom = new THREE.Vector3()
  /** Each dealt card's progress out of the hand, 0 to 1, from the scroll or a spread choice. */
  const dealIn = DEAL.map(() => 0)
  /** A spread choice deals every card at once, whatever the scroll: its eased progress and its goal. */
  let dealt = 0
  let dealtGoal = 0

  /** The room the pointer has picked, and the fade from the room shown before it. -1 is the act's own room. */
  let roomPick = -1
  let roomFrom = -1
  let roomFade = 1

  let narrow = ctx.narrow
  let burstStart = -1
  let clock = 0
  let lift = 0
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3())
  const deckAt = new THREE.Vector3()
  const slot = new THREE.Vector3()
  const rayInverse = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const spreadMeshes = spread.map((card) => card.mesh)
  const plates = branches.map((branch) => branch.plate)

  /** Points the camera straight down -z from `dist` so world (0, targetY) sits at `focusX` of the frame's width. */
  const aim = (dist: number, targetY: number, aspect: number, focusX: number) => {
    const visibleH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const offset = (0.5 - focusX) * visibleH * aspect
    camera.position.set(offset, targetY, dist)
    camera.lookAt(offset, targetY, 0)
  }
  const cornersOf = (object: THREE.Object3D, w: number, h: number) => CORNERS.map(([x, y]) => object.localToWorld(new THREE.Vector3((x * w) / 2, (y * h) / 2, 0)))
  const hiddenPanel = (): ScenePanel => {
    const at = magician.getWorldPosition(new THREE.Vector3())
    return { center: at, up: new THREE.Vector3(0, 1, 0), halfH: 0, corners: [at], develop: 0, opacity: 0 }
  }

  const update = (f: SceneFrame): SceneOutput => {
    const a = f.local('arrival')
    const m = f.local('magician')
    const s = f.local('spread')
    const b = f.local('branches')
    const c = f.local('close')
    clock = f.time
    let busy = false

    // A spread choice plays the spread act forward to its finished state, whatever the scroll: `sp` is the spread
    // act's local as the scene shows it. Scrolling back above the spread resets the choice.
    if (s <= 0.001) dealtGoal = 0
    const nextDealt = ease(dealt, dealtGoal, f.dt, 0.7)
    if (nextDealt !== dealt) busy = true
    dealt = nextDealt
    // The choice's hold fades over the act's first 8%, so scrolling back above the spread undeals it with the scroll.
    const sp = Math.max(s, 0.92 * dealt * smoother(ramp(s, 0, 0.08)))

    const yaw = -f.interaction.tiltX * TILT.yaw + f.interaction.dragYaw
    const pitch = -f.interaction.tiltY * TILT.pitch

    // The deck. It rises face down and turns over to the Magician as the glyphs resolve, by 0.6 of the arrival, so
    // the home page's preview (which ends at 0.65) holds the face. The magician act turns it 0.45 rad aside while
    // the relief stands, so the depth reads, and back for the loop. From the spread to the close it steps aside and
    // shrinks so the cards and scenes have the stage, raised on wide stages so the wizard can hold it up from below.
    // The close brings it home with the wizard beside it.
    const turnOver = smoother(ramp(a, 0.3, 0.6))
    const sideways = 0.45 * smoother(ramp(m, 0.12, 0.3)) * (1 - smoother(ramp(m, 0.42, 0.56)))
    const aside = smoother(ramp(sp, 0, 0.3)) * (1 - smoother(ramp(c, 0, 0.45)))
    const wider = smoother(ramp(b, 0, 0.3)) * (1 - smoother(ramp(c, 0, 0.45)))
    const rise = smoother(ramp(a, 0, 0.6))
    const summon = smoother(ramp(c, 0.08, 0.4))
    deck.rotation.set(pitch, Math.PI * (1 - turnOver) + sideways + yaw, 0)
    // On phones the deck rises out of frame while the cards are dealt below it, and returns small over the scenes.
    if (narrow) deck.position.set(0, -0.15 * (1 - rise) + aside * (2.8 * (1 - wider) + 0.8 * wider), -1.0 * aside * (1 - wider))
    else deck.position.set(-0.75 * aside + 0.15 * wider, -0.15 * (1 - rise) + aside * (0.5 - 0.25 * wider), 0)
    deck.scale.setScalar((0.92 + 0.08 * rise) * (1 - (narrow ? 0.35 : 0.28) * aside))
    deck.updateMatrixWorld(true)
    deck.getWorldPosition(deckAt)

    // The deal. Each card leaves the conjuring hand on its own stretch of the spread act.
    let flick = 0
    for (let i = 0; i < DEAL.length; i++) {
      const byScroll = ramp(sp, 0.08 + i * 0.07, 0.3 + i * 0.07)
      dealIn[i] = smoother(byScroll)
      flick = Math.max(flick, Math.sin(Math.PI * clamp01(byScroll * 2.2)))
    }

    // The wizard (wizard.ts). On wide stages he assembles below the raised card as the spread begins, conjures it
    // with his near hand, and flicks each card out of that hand. Over the scenes he raises his staff and the wires
    // spring from its crystal. At the close he drifts across in front of the card to its right, dipping as he
    // passes, opens his arms to present the reading, and leaves with the dissolve. Phones bring him in small beside
    // the deck over the scenes. His head follows the pointer throughout.
    const appear = narrow ? smoother(ramp(b, 0.05, 0.3)) : smoother(ramp(sp, 0.08, 0.32))
    const wizardScale = narrow ? 0.36 + 0.14 * summon : 0.76 - 0.12 * summon
    if (narrow) {
      guideAt.set(deckAt.x - 0.68, deckAt.y - 0.58, 0.15)
      closeAt.set(0.28, -1.1, 0.45)
    } else {
      guideAt.set(deckAt.x + 0.62, -1.48, 0.2)
      closeAt.set(deckAt.x + 0.92, -1.22, 0.3)
    }
    const travel = Math.sin(Math.PI * summon)
    wizard.group.position.lerpVectors(guideAt, closeAt, summon).add(slot.set(0, -0.15 * travel, 0.5 * travel))
    wizard.group.scale.setScalar(wizardScale)
    wizard.group.rotation.set(pitch * 0.15, yaw * 0.4 - 0.35 * (1 - wider) * (1 - summon) + 0.25 * wider * (1 - summon) - 0.4 * summon, 0)

    // The relief, the loop, and the burst.
    lift = smoother(ramp(m, 0.08, 0.34)) * (1 - smoother(ramp(m, 0.8, 0.96)))
    const flow = smoother(ramp(m, 0.4, 0.55)) * (1 - smoother(ramp(m, 0.68, 0.8)))
    voxelUniforms.uLift.value = lift
    voxelUniforms.uFlow.value = flow
    voxelUniforms.uPhase.value = m * Math.PI * 2.8
    const sinceBurst = burstStart < 0 ? Infinity : clock - burstStart
    const burst = sinceBurst < BURST_S ? Math.sin(Math.PI * Math.min(1, sinceBurst / 0.25) * 0.5) * Math.exp(-Math.max(0, sinceBurst - 0.25) * 3.2) : 0
    if (sinceBurst < BURST_S) busy = true
    else burstStart = -1
    voxelUniforms.uBurst.value = burst
    if (voxels) voxels.visible = lift > 0.002
    // The card's art darkens behind the lifted voxels, so the pixels read as having left it.
    const left = 1 - 0.88 * ramp(lift, 0, 0.35)
    magicianArt.color.setScalar(left)
    magicianArt.emissiveIntensity = 0.32 * left

    const flare = 1 + 0.25 * f.push
    for (const { light, base } of lights) light.intensity = base * flare
    voxelUniforms.uLight.value = flare
    const conjure = narrow ? 0 : appear * (1 - wider) * (1 - summon)
    if (wizard.update({
      appear,
      conjure,
      channel: wider * (1 - summon),
      present: summon,
      flick: narrow ? 0 : flick * (1 - wider),
      stream: 0.5 + 0.5 * conjure,
      target: deckAt,
      lookX: f.interaction.tiltX,
      lookY: f.interaction.tiltY,
      time: f.time,
      light: flare,
    }, camera)) busy = true
    // Cards leave from the conjuring hand while he is there, and the scenes' wires from the crystal.
    const guiding = narrow ? 0 : appear
    dealFrom.copy(deckAt)
    if (guiding > 0.002) dealFrom.lerp(wizard.hand(slot), guiding)
    if (guiding > 0.002) wizard.crystal(wireFrom)
    key.position.set(-2.4 + f.interaction.tiltX * 3.2, 2.6 - f.interaction.tiltY * 2.2, 3.2)

    // The camera: closer over the arrival, closer still for the relief, wide for the spread, wider for the scenes.
    let dist = narrow ? 8.0 : 5.2
    dist -= (narrow ? 0.7 : 0.5) * rise
    dist -= (narrow ? 0.3 : 0.9) * smoother(ramp(m, 0.05, 0.32)) * (1 - smoother(ramp(m, 0.84, 1)))
    // The loop rises over the card's top edge, so the camera eases up and back while it holds.
    dist += 0.55 * flow
    dist += (narrow ? 1.0 : 2.4) * aside + (narrow ? 0.6 : 1.0) * wider + (narrow ? 0 : 0.8) * summon
    dist *= 1 - 0.05 * f.push
    aim(dist, (narrow ? -0.85 : 0) + 0.2 * flow, f.aspect, narrow ? 0.5 : 0.64 - 0.04 * aside)
    camera.updateMatrixWorld()

    // The pointer: it parts the relief, lifts a dealt card, and picks a scene.
    let parting = false
    let hoverCard = -1
    let hoverPlate = -1
    if (f.pointer.inside) {
      ndc.set(f.pointer.x, f.pointer.y)
      raycaster.setFromCamera(ndc, camera)
      if (voxels) {
        parting = true
        rayInverse.copy(voxels.matrixWorld).invert()
        voxelUniforms.uRayOrigin.value.copy(raycaster.ray.origin).applyMatrix4(rayInverse)
        voxelUniforms.uRayDir.value.copy(raycaster.ray.direction).transformDirection(rayInverse)
      }
      const [cardHit] = raycaster.intersectObjects(spreadMeshes, false)
      if (cardHit?.object.visible) hoverCard = spreadMeshes.findIndex((mesh) => mesh === cardHit.object)
      const [plateHit] = raycaster.intersectObjects(plates, false)
      if (plateHit?.object.parent?.visible) hoverPlate = plates.findIndex((plate) => plate === plateHit.object)
    }
    const repel = ease(voxelUniforms.uRepel.value, parting && lift > 0.05 ? 1 : 0, f.dt, 0.18)
    if (repel !== voxelUniforms.uRepel.value) busy = true
    voxelUniforms.uRepel.value = repel

    // The spread. Cards leave the deck one after another along an arc to their slots and turn face up in turn. A
    // switch of layout glides them to the new slots, a hover lifts one toward the reader, and a click turns one.
    for (const k of LAYOUT_KEYS) {
      const next = ease(layoutWeight[k], k === layout ? 1 : 0, f.dt, LAYOUT_EASE)
      if (next !== layoutWeight[k]) busy = true
      layoutWeight[k] = next
    }
    const reach = SPREAD_SCALE * CARD_W * (narrow ? 0.88 : 1.12)
    const centreX = narrow ? 0 : 1.15
    const centreY = narrow ? 0.1 : -0.05
    spread.forEach((card, i) => {
      let weight = 0
      slot.set(0, 0, 0)
      for (const k of LAYOUT_KEYS) {
        const entry = LAYOUTS[k][i]
        if (!entry) continue
        slot.x += entry.at[0] * layoutWeight[k]
        slot.y += entry.at[1] * layoutWeight[k]
        weight += layoutWeight[k]
      }
      // A card the layout has no slot for returns to the deck as its weight fades.
      if (weight > 0) slot.multiplyScalar(1 / weight)
      slot.set(centreX + slot.x * reach, centreY + slot.y * reach, 0.25)
      const out = dealIn[i] * (1 - smoother(ramp(b, 0, 0.25))) * clamp01(weight)
      curve.v0.copy(dealFrom)
      curve.v1.set(dealFrom.x + 0.2, dealFrom.y + 0.9, dealFrom.z + 0.6)
      curve.v2.set(slot.x, slot.y + 0.7, slot.z + 0.4)
      curve.v3.copy(slot)
      curve.getPoint(out, card.mesh.position)
      const lifted = ease(card.lift, hoverCard === i && out > 0.95 ? 1 : 0, f.dt, HOVER_EASE)
      if (lifted !== card.lift) busy = true
      card.lift = lifted
      card.mesh.position.y += 0.05 * lifted
      card.mesh.position.z += 0.22 * lifted
      const scrolled = smoother(ramp(sp, 0.34 + i * 0.08, 0.46 + i * 0.08))
      if (card.flipGoal >= 0) {
        const flipped = ease(card.flip, card.flipGoal, f.dt, FLIP_EASE)
        if (flipped !== card.flip) busy = true
        card.flip = flipped
      } else card.flip = scrolled
      card.mesh.rotation.set(pitch * 0.6 - 0.12 * (1 - out), Math.PI * (1 - card.flip) + yaw * 0.6, (1 - out) * 0.35 * (i % 2 ? 1 : -1))
      card.mesh.scale.setScalar(SPREAD_SCALE * (0.6 + 0.4 * out) * (1 + 0.06 * lifted))
      card.mesh.visible = out > 0.001
    })

    // The branches. The five scenes fan out in an arc right of the deck (below it on phones), each wired to the
    // card. A light runs along every wire with the scroll, and a hovered scene comes forward and fills the room.
    const fan = smoother(ramp(b, 0.12, 0.42)) * (1 - smoother(ramp(c, 0, 0.35)))
    branches.forEach((branch, i) => {
      const angle = (i - 2) * 0.42
      // Phones set the scenes in two rows, three over two, under the deck.
      if (narrow) slot.set(i < 3 ? (i - 1) * 0.72 : (i - 3.5) * 0.72, i < 3 ? -0.18 : -0.72, -0.2)
      else slot.set(deckAt.x + Math.cos(angle) * 2.3, deckAt.y + Math.sin(angle) * 1.95, -0.2 - Math.abs(i - 2) * 0.12)
      const opened = smoother(clamp01(fan * 1.4 - i * 0.08))
      const hot = ease(branch.hover, hoverPlate === i && opened > 0.95 ? 1 : 0, f.dt, HOVER_EASE)
      if (hot !== branch.hover) busy = true
      branch.hover = hot
      const scale = (narrow ? 0.52 : 0.72) * (0.25 + 0.75 * opened) * (1 + 0.12 * hot)
      branch.group.position.lerpVectors(deckAt, slot, opened)
      branch.group.position.z += 0.35 * hot
      branch.group.rotation.set(pitch * 0.4, (narrow ? 0 : -angle * 0.3) + yaw * 0.5, 0)
      branch.group.scale.setScalar(scale)
      branch.group.visible = opened > 0.002 && branch.art.ready
      branch.wire.visible = branch.group.visible
      if (!branch.wire.visible) return
      // The wire runs from the card's edge nearest the scenes to the scene's edge nearest the card.
      const deckHalf = (narrow ? CARD_H : CARD_W) * 0.5 * deck.scale.x
      if (narrow) curve.v0.set(deckAt.x, deckAt.y - deckHalf, deckAt.z)
      else if (guiding > 0.5) curve.v0.copy(wireFrom)
      else curve.v0.set(deckAt.x + deckHalf, deckAt.y, deckAt.z + 0.05)
      const p = branch.group.position
      if (narrow) curve.v3.set(p.x, p.y + SCENE_H * 0.5 * scale, p.z)
      else curve.v3.set(p.x - SCENE_W * 0.5 * scale, p.y, p.z)
      if (narrow) {
        curve.v1.set(curve.v0.x, curve.v0.y - 0.5, curve.v0.z)
        curve.v2.set(curve.v3.x, curve.v3.y + 0.5, curve.v3.z)
      } else {
        curve.v1.set(curve.v0.x + 0.6, curve.v0.y, curve.v0.z)
        curve.v2.set(curve.v3.x - 0.6, curve.v3.y, curve.v3.z)
      }
      shapeTube(branch.wire.geometry, curve, 0.006 * (1 + hot))
      branch.wireUniforms.uDraw.value = opened
      branch.wireUniforms.uHead.value = (b * 2.2 + i * 0.13) % 1
      branch.wireUniforms.uHot.value = hot
    })

    // The room: the act's own, or the hovered scene, faded over ROOM_FADE so a pass of the pointer glides.
    const pick = hoverPlate >= 0 && fan > 0.9 ? SCENE_BACKDROP[SCENES[hoverPlate]] : -1
    if (pick !== roomPick) {
      roomFrom = roomPick
      roomPick = pick
      roomFade = 0
    }
    if (roomFade < 1) {
      roomFade = Math.min(1, roomFade + f.dt / ROOM_FADE)
      busy = true
    }
    const base = f.base.backdrop
    const backdrop = roomPick < 0 && roomFade >= 1
      ? base
      : { ...base, a: roomFrom < 0 ? base.b : roomFrom, b: roomPick < 0 ? base.b : roomPick, mix: smoother(roomFade), glyphOnly: 0 }

    scene.updateMatrixWorld()

    // Panels: the spread's twelve slot labels (only the current layout's show), then the five scenes.
    const panels: ScenePanel[] = []
    for (let p = 0; p < SPREAD_LABELS; p++) panels.push(hiddenPanel())
    spread.forEach((card, i) => {
      const entry = LAYOUTS[layout][i]
      if (!entry) return
      card.mesh.getWorldQuaternion(quaternion)
      panels[entry.label] = {
        center: card.mesh.getWorldPosition(new THREE.Vector3()),
        up: new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion),
        halfH: (CARD_H / 2) * card.mesh.scale.y,
        corners: cornersOf(card.mesh, CARD_W, CARD_H),
        develop: card.flip > 0.98 && layoutWeight[layout] > 0.98 && card.lift < 0.5 ? 1 : 0,
        opacity: card.mesh.visible ? 1 : 0,
      }
    })
    for (const branch of branches) {
      branch.group.getWorldQuaternion(quaternion)
      panels.push({
        center: branch.group.getWorldPosition(new THREE.Vector3()),
        up: new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion),
        halfH: (SCENE_H / 2) * branch.group.scale.y,
        corners: cornersOf(branch.plate, SCENE_W, SCENE_H),
        develop: fan > 0.98 && branch.hover < 0.5 ? 1 : 0,
        opacity: branch.group.visible ? 1 : 0,
      })
    }

    const corners = cornersOf(magician, CARD_W, CARD_H)
    const anchors = new Map<string, THREE.Vector3 | null>()
    anchors.set('card', magician.localToWorld(new THREE.Vector3(-0.46, -0.2, 0)))
    anchors.set('head', magician.localToWorld(new THREE.Vector3(0.05, 0.22, 0.32 * lift)))
    anchors.set('robe', magician.localToWorld(new THREE.Vector3(-0.12, -0.22, 0.3 * lift)))
    anchors.set('infinity', magician.localToWorld(new THREE.Vector3(LOOP.x - LOOP.a * 0.9, LOOP.y, LOOP.z * flow)))
    anchors.set('deal', spread[0].mesh.visible ? spread[0].mesh.getWorldPosition(new THREE.Vector3()) : null)
    anchors.set('scene', branches[0].group.visible ? branches[0].group.getWorldPosition(new THREE.Vector3()) : null)
    const bounds = [...corners]
    for (const card of spread) if (card.mesh.visible) bounds.push(...cornersOf(card.mesh, CARD_W, CARD_H))
    for (const branch of branches) if (branch.group.visible) bounds.push(...cornersOf(branch.plate, SCENE_W, SCENE_H))
    if (wizard.group.visible) {
      const tall = HEIGHT_VOXELS * VOXEL * wizard.group.scale.y
      bounds.push(wizard.group.position.clone(), wizard.group.position.clone().add(new THREE.Vector3(0, tall, 0)))
    }
    anchors.set('wizard', wizard.group.visible ? wizard.hand(new THREE.Vector3()) : null)

    return {
      decode: f.base.decode,
      gather: f.base.gather,
      backdrop,
      revealAt: deckAt.clone(),
      anchors,
      hit: corners,
      panels,
      bounds,
      bodyLight: flare,
      busy,
      ready: atlas.ready,
    }
  }

  const press = (point: { x: number; y: number }) => {
    ndc.set(point.x, point.y)
    raycaster.setFromCamera(ndc, camera)
    const [cardHit] = raycaster.intersectObjects(spreadMeshes.filter((mesh) => mesh.visible), false)
    const card = cardHit && spread.find((entry) => entry.mesh === cardHit.object)
    if (card) {
      card.flipGoal = card.flip > 0.5 ? 0 : 1
      return true
    }
    if (wizard.hit(raycaster)) {
      wizard.cast(ctx.now())
      return true
    }
    if (lift > 0.5 && raycaster.intersectObject(magician, false).length) {
      burstStart = ctx.now()
      return true
    }
    return false
  }

  const command = (name: string, value: string) => {
    if (name !== 'spread' || !(value in LAYOUTS)) return
    layout = value as Layout
    // A choice deals the spread now and turns every card face up, whatever the scroll.
    dealtGoal = 1
    for (const card of spread) card.flipGoal = -1
  }

  const chapter: ChapterScene = {
    scene,
    camera,
    update,
    press,
    command,
    setNarrow: (next) => { narrow = next },
    dispose: () => {
      disposed = true
      magicianGeometry.dispose()
      for (const card of spread) card.geometry.dispose()
      gold.dispose()
      spreadArt.dispose()
      magicianArt.dispose()
      voxelGeometry?.dispose()
      voxelMaterial.dispose()
      plateGeometry.dispose()
      frameGeometry.dispose()
      wizard.dispose()
      for (const branch of branches) {
        branch.material.dispose()
        branch.wire.geometry.dispose()
        branch.wireMaterial.dispose()
      }
    },
  }
  return chapter
}

export default createScene
