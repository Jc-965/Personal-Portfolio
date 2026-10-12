/**
 * The Sorcea scene: a vanity-table still life after dark, in plum, rose gold, and ring light, built around the
 * app's shade matcher. A glass cloche holds the CIELAB color solid, a lattice of chips that samples the sRGB gamut
 * on a CIELAB grid with L* up, a* across, and b* toward the front. A probe tone sits inside it, and threads of light
 * run from the probe to the twelve foundation compacts fanned in front, stronger for a smaller Delta-E. The dial at
 * the front left is the shade gauge: its segments are the spectrum, the closest matches lift, the needle marks the
 * skin-tone fit, and a glow spans the confidence band. Four of the rebuilt app's real screens stand on display
 * risers, and a jewellery box at the front right sends four requests to the home screen in parallel.
 *
 * On the home page the still life rests with the default tone. On the journey page the arrival opens the compacts,
 * the work act draws the threads and sweeps the gauge up, and the close lines the four requests up in a queue on
 * the box, then launches them together so they reach the home screen at once. From the work act on, the probe
 * follows the pointer through the solid in a plane facing the camera, a press pins it, and the choices set sample
 * tones. Pointing at a phone names its screen.
 *
 * Color maths: sRGB to linear (IEC 61966-2-1), linear to XYZ with the D65 matrix, XYZ to CIELAB against the D65
 * white, and Delta-E 1976, the Euclidean distance in CIELAB.
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { GLOW, clamp01, ease, frame, ramp, smoother } from '../kit'
import type { IslandFactory, IslandFrame, IslandOutput, IslandPanel } from '../types'

type Lab = [number, number, number]

/** The D65 reference white in XYZ with Y at 1. */
const WHITE = [0.95047, 1, 1.08883] as const
const DELTA = 6 / 29
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const labF = (t: number) => (t > DELTA ** 3 ? Math.cbrt(t) : t / (3 * DELTA * DELTA) + 4 / 29)
const labFInverse = (t: number) => (t > DELTA ? t * t * t : 3 * DELTA * DELTA * (t - 4 / 29))

/** CIELAB of an sRGB hex colour such as '#D2A07C'. */
function hexToLab(hex: string): Lab {
  const n = parseInt(hex.slice(1), 16)
  const r = toLinear(((n >> 16) & 255) / 255)
  const g = toLinear(((n >> 8) & 255) / 255)
  const b = toLinear((n & 255) / 255)
  const fx = labF((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / WHITE[0])
  const fy = labF((0.2126729 * r + 0.7151522 * g + 0.072175 * b) / WHITE[1])
  const fz = labF((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / WHITE[2])
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** Writes the linear sRGB of a CIELAB colour into `out`, unclamped. A component outside 0 to 1 is out of gamut. */
function labToLinear(L: number, a: number, b: number, out: number[]) {
  const fy = (L + 16) / 116
  const x = WHITE[0] * labFInverse(fy + a / 500)
  const y = WHITE[1] * labFInverse(fy)
  const z = WHITE[2] * labFInverse(fy - b / 200)
  out[0] = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z
  out[1] = -0.969266 * x + 1.8760108 * y + 0.041556 * z
  out[2] = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z
}
const inGamut = (rgb: number[]) => rgb[0] >= -1e-4 && rgb[0] <= 1.0001 && rgb[1] >= -1e-4 && rgb[1] <= 1.0001 && rgb[2] >= -1e-4 && rgb[2] <= 1.0001
const deltaE = (p: Lab, q: Lab) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])

/** The foundation shade spectrum, lightest first. Compact i on the table and segment i on the gauge carry shade i. */
const SHADES = ['#F3D9C4', '#EBCBB0', '#E2BC9C', '#D8AE8A', '#CB9C76', '#BD8B64', '#AD7A55', '#9A6846', '#85573A', '#704630', '#5A3826', '#45291C']
/** The probe's starting tone. It matches the first `tone` choice in content/roles/sorcea.ts. */
const DEFAULT_TONE = '#D2A07C'
/** Delta-E at which a shade's thread falls to 1/e of full strength. */
const THREAD_DELTA_E = 6

/**
 * World units per CIELAB unit across a* and b*, and per unit of L*, which is drawn 1.5 times taller so its ten
 * layers read. L* 0 sits SOLID_Y above the cloche's base.
 */
const AB_SCALE = 0.0078
const L_SCALE = AB_SCALE * 1.5
const SOLID_Y = 0.18
/** The cloche's glass radius, and the height where its wall meets the dome. */
const GLASS_R = 0.88
const WALL_TOP = 0.78
/** The camera yaw of the work act, which the screens and the gauge face. */
const FACE_YAW = -0.3
/** The gauge's sweep in radians: shade 1 at START, the deepest shade at START - SWEEP, clockwise over the top. */
const DIAL_START = (210 * Math.PI) / 180
const DIAL_SWEEP = (240 * Math.PI) / 180
/** Radians a compact's lid stands open. */
const LID_OPEN = 1.9
const TARGET = new THREE.Vector3(0, 0.2, 0)
/** The yaw about y that turns an object at (x, z) to face the work act's camera. */
const facing = (x: number, z: number) => Math.atan2(Math.sin(FACE_YAW) * 9 - x, Math.cos(FACE_YAW) * 9 - z)

/** The rebuilt screens, two per riser, left riser first. Labels in content/roles/sorcea.ts follow this order. */
const SCREENS = ['/sorcea/search.webp', '/sorcea/tutorial.webp', '/sorcea/home.webp', '/sorcea/score.webp']
const PHONE_SPOTS = [[-1.95, -0.98], [-1.4, -0.98], [1.4, -0.98], [1.95, -0.98]]
const HOME_PHONE = 2
/** The four parallel requests: the jewellery box they leave from, and the impact-act span of their flight. */
const BOX = new THREE.Vector3(1.8, 0, 0.62)
const REQUESTS = 4
const LAUNCH = [0.28, 0.68] as const

const THREAD_VERTEX = /* glsl */ `
attribute float aT;
attribute float aSide;
attribute float aThread;
uniform vec3 uFrom;
uniform vec3 uTo[12];
uniform float uWeight[12];
uniform vec3 uTint[12];
uniform float uWidth;
uniform float uReveal;
varying float vAlpha;
varying float vEdge;
varying vec3 vTint;
void main() {
  int k = int(aThread + 0.5);
  vec3 a = uFrom;
  vec3 b = uTo[k];
  vec3 c = mix(a, b, 0.5) + vec3(0.0, 0.25 + 0.2 * distance(a, b), 0.0);
  float t = aT * uReveal;
  vec3 p = mix(mix(a, c, t), mix(c, b, t), t);
  vec3 d = mix(c - a, b - c, t);
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  vec3 side = normalize(cross((modelViewMatrix * vec4(d, 0.0)).xyz, view.xyz));
  view.xyz += side * aSide * uWidth;
  gl_Position = projectionMatrix * view;
  vAlpha = uWeight[k] * min(1.0, uReveal * 2.0);
  vEdge = aSide;
  vTint = uTint[k];
}`

/** The thread's core: the shade's colour lightened toward the middle, straight alpha for normal blending. */
const THREAD_CORE = /* glsl */ `
varying float vAlpha;
varying float vEdge;
varying vec3 vTint;
void main() {
  float e = abs(vEdge);
  float a = vAlpha * (1.0 - smoothstep(0.5, 1.0, e));
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(vTint, vec3(1.0, 0.97, 0.95), 0.5 * (1.0 - e)) * 1.4, a);
}`

/** The thread's halo, premultiplied for GLOW blending. */
const THREAD_HALO = /* glsl */ `
varying float vAlpha;
varying float vEdge;
varying vec3 vTint;
void main() {
  float a = vAlpha * pow(1.0 - abs(vEdge), 2.0) * 0.55;
  if (a < 0.002) discard;
  gl_FragColor = vec4(mix(vTint, vec3(1.0, 0.85, 0.8), 0.4) * a, a);
}`

const BAND_VERTEX = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

/** The confidence band: the gauge's ring between uLo and uHi of the sweep, premultiplied for GLOW blending. */
const BAND_FRAGMENT = /* glsl */ `
uniform float uLo;
uniform float uHi;
uniform float uOn;
uniform vec3 uColor;
varying vec2 vP;
void main() {
  float s = mod(${DIAL_START.toFixed(6)} - atan(vP.y, vP.x), 6.2831853) / ${DIAL_SWEEP.toFixed(6)};
  float band = smoothstep(uLo - 0.02, uLo + 0.01, s) * (1.0 - smoothstep(uHi - 0.01, uHi + 0.02, s)) * step(s, 1.0);
  float a = band * uOn;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * a, a);
}`

const HALO_VERTEX = /* glsl */ `
attribute float aOn;
uniform float uScale;
uniform float uSize;
varying float vOn;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = aOn > 0.0 ? uSize * uScale / -view.z : 0.0;
  vOn = aOn;
}`

const HALO_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vOn;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = vOn * pow(max(0.0, 1.0 - d), 2.2);
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor * a, a);
}`

const createScene: IslandFactory = (ctx) => {
  const scene = new THREE.Scene()
  scene.environment = ctx.environment
  scene.environmentIntensity = 0.45
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80)
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  const geo = <G extends THREE.BufferGeometry>(geometry: G) => { geometries.push(geometry); return geometry }
  const mat = <M extends THREE.Material>(material: M) => { materials.push(material); return material }
  // Standard materials throughout, and a clearcoat only where a finish asks for one, since the physical shader costs
  // more per pixel.
  const finish = (color: THREE.ColorRepresentation, o: { roughness?: number; metalness?: number; clearcoat?: number; emissive?: THREE.ColorRepresentation; emissiveIntensity?: number } = {}) => {
    const base = { color, roughness: o.roughness ?? 0.5, metalness: o.metalness ?? 0, emissive: o.emissive ?? '#000000', emissiveIntensity: o.emissiveIntensity ?? 0 }
    return mat(o.clearcoat ? new THREE.MeshPhysicalMaterial({ ...base, clearcoat: o.clearcoat, clearcoatRoughness: 0.2 }) : new THREE.MeshStandardMaterial(base))
  }
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, cast = true) => {
    const m = new THREE.Mesh(geometry, material)
    m.castShadow = cast
    m.receiveShadow = true
    return m
  }

  // A warm key from the front left, a dim plum fill, a rose rim from behind, and a cool cyan kick from the left.
  const key = new THREE.DirectionalLight('#ffe7d8', 2.5)
  key.position.set(-3.2, 6.5, 4.4)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  Object.assign(key.shadow.camera, { left: -3.4, right: 3.4, top: 3.4, bottom: -3.4, near: 1, far: 18 })
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.02
  key.shadow.radius = 5
  const fill = new THREE.HemisphereLight('#8a4a6a', '#14060d', 0.9)
  const rim = new THREE.DirectionalLight('#ff8fb8', 2.2)
  rim.position.set(3.5, 3.5, -4.5)
  const kick = new THREE.DirectionalLight('#86e9ff', 0.9)
  kick.position.set(-5, 1.5, -1)
  scene.add(key, key.target, fill, rim, kick)
  const lights = [key, fill, rim, kick].map((light) => ({ light, base: light.intensity }))

  const world = new THREE.Group()
  scene.add(world)

  const lacquer = finish('#4b1c33', { roughness: 0.22, clearcoat: 1 })
  const plum = finish('#5e2541', { roughness: 0.35 })
  const deepPlum = finish('#2e0f1f', { roughness: 0.5 })
  const gold = finish('#e2b47a', { roughness: 0.25, metalness: 0.9 })
  const roseGold = finish('#eab09c', { roughness: 0.28, metalness: 0.8 })
  const neon = finish('#ff86ae', { emissive: '#ff6f9f', emissiveIntensity: 2.2, roughness: 0.4 })
  const darkMirror = finish('#3a1a2a', { roughness: 0.06, metalness: 1 })
  // The compacts' lid mirrors stay matte, so the key light leaves no hot spots across the fan.
  const compactMirror = finish('#8a5a6e', { roughness: 0.55, metalness: 0.15, emissive: '#3a1428', emissiveIntensity: 0.4 })
  const ringLight = finish('#fff1e6', { emissive: '#ffe3cf', emissiveIntensity: 2.6, roughness: 0.4 })

  // The vanity: a lacquered top with a rose neon edge, an apron with three drawers, and four slim legs.
  const roundedRect = (w: number, d: number, r: number) => {
    const s = new THREE.Shape()
    const x = w / 2
    const y = d / 2
    s.moveTo(-x + r, -y)
    s.lineTo(x - r, -y)
    s.quadraticCurveTo(x, -y, x, -y + r)
    s.lineTo(x, y - r)
    s.quadraticCurveTo(x, y, x - r, y)
    s.lineTo(-x + r, y)
    s.quadraticCurveTo(-x, y, -x, y - r)
    s.lineTo(-x, -y + r)
    s.quadraticCurveTo(-x, -y, -x + r, -y)
    return s
  }
  const outline = roundedRect(4.6, 2.9, 0.45)
  const top = geo(new THREE.ExtrudeGeometry(outline, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 10 }))
  top.rotateX(-Math.PI / 2)
  top.translate(0, -0.13, 0)
  world.add(mesh(top, lacquer))
  const edgePath = new THREE.CatmullRomCurve3(outline.getSpacedPoints(160).map((p) => new THREE.Vector3(p.x * 1.007, -0.02, -p.y * 1.01)), true)
  world.add(mesh(geo(new THREE.TubeGeometry(edgePath, 320, 0.018, 6, true)), neon, false))
  const apron = geo(new THREE.ExtrudeGeometry(roundedRect(4.2, 2.5, 0.35), { depth: 0.3, bevelEnabled: false, curveSegments: 8 }))
  apron.rotateX(-Math.PI / 2)
  apron.translate(0, -0.5, 0)
  world.add(mesh(apron, deepPlum))
  const drawer = geo(new RoundedBoxGeometry(1.15, 0.2, 0.04, 2, 0.015))
  const knob = geo(new THREE.SphereGeometry(0.03, 12, 8))
  for (const x of [-1.32, 0, 1.32]) {
    const d = mesh(drawer, plum)
    d.position.set(x, -0.35, 1.25)
    const k = mesh(knob, gold)
    k.position.set(x, -0.35, 1.28)
    world.add(d, k)
  }
  const leg = geo(new THREE.CylinderGeometry(0.06, 0.035, 0.85, 12))
  const foot = geo(new THREE.CylinderGeometry(0.04, 0.04, 0.07, 12))
  for (const [x, z] of [[-1.85, -0.95], [1.85, -0.95], [-1.85, 0.95], [1.85, 0.95]]) {
    const l = mesh(leg, deepPlum)
    l.position.set(x * 1.02, -0.9, z * 1.02)
    l.rotation.set(z * 0.07, 0, -x * 0.04)
    const f = mesh(foot, gold)
    f.position.set(x * 1.05, -1.32, z * 1.06)
    world.add(l, f)
  }

  // The vanity mirror behind the cloche: dark glass in a ring light, on a rose-gold stand.
  const mirror = new THREE.Group()
  mirror.position.set(0, 1.18, -1.18)
  mirror.rotation.x = -0.08
  const ring = mesh(geo(new THREE.TorusGeometry(0.8, 0.05, 12, 72)), ringLight, false)
  const frameRing = mesh(geo(new THREE.TorusGeometry(0.88, 0.035, 10, 72)), roseGold)
  const glassDisc = mesh(geo(new THREE.CircleGeometry(0.76, 64)), darkMirror, false)
  const back = mesh(geo(new THREE.CircleGeometry(0.9, 64)), deepPlum, false)
  back.rotation.y = Math.PI
  back.position.z = -0.012
  mirror.add(ring, frameRing, glassDisc, back)
  world.add(mirror)
  const post = geo(new THREE.CylinderGeometry(0.022, 0.026, 1.18, 10))
  const pivot = geo(new THREE.SphereGeometry(0.04, 12, 8))
  for (const x of [-0.94, 0.94]) {
    const p = mesh(post, roseGold)
    p.position.set(x, 0.59, -1.18)
    const k = mesh(pivot, gold)
    k.position.set(x, 1.18, -1.18)
    world.add(p, k)
  }
  const stand = mesh(geo(new RoundedBoxGeometry(2.04, 0.05, 0.26, 2, 0.02)), roseGold)
  stand.position.set(0, 0.025, -1.18)
  world.add(stand)

  // The cloche: a gold-rimmed base, a stem, the chip lattice, and a glass bell with a bright rim.
  const cloche = new THREE.Group()
  world.add(cloche)
  const tray = mesh(geo(new THREE.CylinderGeometry(GLASS_R + 0.06, GLASS_R + 0.1, 0.06, 48)), gold)
  tray.position.y = 0.03
  const inset = mesh(geo(new THREE.CylinderGeometry(GLASS_R, GLASS_R, 0.02, 48)), plum)
  inset.position.y = 0.065
  const stem = mesh(geo(new THREE.CylinderGeometry(0.018, 0.03, SOLID_Y - 0.03, 10)), gold)
  stem.position.y = 0.07 + (SOLID_Y - 0.03) / 2
  cloche.add(tray, inset, stem)

  const glassMaterial = mat(new THREE.MeshPhysicalMaterial({ color: '#ffe9f0', roughness: 0.05, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.06, depthWrite: false }))
  glassMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float rimLight = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5);
totalEmissiveRadiance += vec3(1.0, 0.72, 0.82) * rimLight * 0.7;
diffuseColor.a = mix(diffuseColor.a, 0.5, rimLight);`)
  }
  const bellWall = new THREE.Mesh(geo(new THREE.CylinderGeometry(GLASS_R, GLASS_R, WALL_TOP - 0.07, 64, 1, true)), glassMaterial)
  bellWall.position.y = (WALL_TOP + 0.07) / 2
  const bellDome = new THREE.Mesh(geo(new THREE.SphereGeometry(GLASS_R, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2)), glassMaterial)
  bellDome.position.y = WALL_TOP
  bellWall.renderOrder = bellDome.renderOrder = 2
  const bellKnob = mesh(geo(new THREE.SphereGeometry(0.07, 16, 12)), gold)
  bellKnob.position.y = WALL_TOP + GLASS_R + 0.04
  cloche.add(bellWall, bellDome, bellKnob)

  // The chip lattice: CIELAB grid points (L* every 10, a* and b* every 14) whose colour is inside the sRGB gamut,
  // each chip its own colour. Chips near the line from the eye to the probe shrink away, so the probe stays in view.
  const rgb = [0, 0, 0]
  const chipPositions: number[] = []
  const chipColours: number[] = []
  for (let L = 5; L < 100; L += 10) {
    for (let a = -112; a <= 112; a += 14) {
      for (let b = -112; b <= 112; b += 14) {
        labToLinear(L, a, b, rgb)
        if (!inGamut(rgb)) continue
        chipPositions.push(a * AB_SCALE, SOLID_Y + L * L_SCALE, b * AB_SCALE)
        chipColours.push(clamp01(rgb[0]), clamp01(rgb[1]), clamp01(rgb[2]))
      }
    }
  }
  const chipUniforms = { uProbe: { value: new THREE.Vector3() }, uEye: { value: new THREE.Vector3() }, uGlow: { value: 0.32 } }
  const chipMaterial = mat(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0 }))
  chipMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, chipUniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform vec3 uProbe;
uniform vec3 uEye;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vec3 chipAt = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
vec3 sight = uProbe - uEye;
float along = clamp(dot(chipAt - uEye, sight) / dot(sight, sight), 0.0, 1.0);
float apart = length(chipAt - (uEye + sight * along));
transformed *= smoothstep(0.07, 0.16, apart);`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uGlow;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vColor.rgb * uGlow;`)
  }
  const chipCount = chipPositions.length / 3
  const chips = new THREE.InstancedMesh(geo(new RoundedBoxGeometry(0.074, 0.06, 0.074, 1, 0.012)), chipMaterial, chipCount)
  const placed = new THREE.Matrix4()
  const tint = new THREE.Color()
  for (let i = 0; i < chipCount; i++) {
    chips.setMatrixAt(i, placed.makeTranslation(chipPositions[i * 3], chipPositions[i * 3 + 1], chipPositions[i * 3 + 2]))
    chips.setColorAt(i, tint.setRGB(chipColours[i * 3], chipColours[i * 3 + 1], chipColours[i * 3 + 2]))
  }
  chips.frustumCulled = false
  cloche.add(chips)

  // The probe: a sphere in the tone's own colour with a bright ring and a soft halo.
  const probe = new THREE.Group()
  const probeMaterial = finish('#d2a07c', { roughness: 0.25 })
  const probeBall = mesh(geo(new THREE.IcosahedronGeometry(0.055, 3)), probeMaterial, false)
  const probeRing = new THREE.Mesh(geo(new THREE.TorusGeometry(0.085, 0.008, 8, 40)), ringLight)
  probeRing.rotation.x = Math.PI / 2
  probe.add(probeBall, probeRing)
  cloche.add(probe)

  // Soft halos, one point each: the probe's, then the four requests'.
  const haloOn = new Float32Array(1 + REQUESTS)
  const haloPositions = new Float32Array((1 + REQUESTS) * 3)
  const haloGeometry = geo(new THREE.BufferGeometry())
  const haloPosition = new THREE.BufferAttribute(haloPositions, 3).setUsage(THREE.DynamicDrawUsage)
  const haloOnAttribute = new THREE.BufferAttribute(haloOn, 1).setUsage(THREE.DynamicDrawUsage)
  haloGeometry.setAttribute('position', haloPosition)
  haloGeometry.setAttribute('aOn', haloOnAttribute)
  const haloUniforms = { uScale: { value: 600 }, uSize: { value: 0.42 }, uColor: { value: new THREE.Color('#ffe2ea') } }
  const halos = new THREE.Points(haloGeometry, mat(new THREE.ShaderMaterial({ uniforms: haloUniforms, vertexShader: HALO_VERTEX, fragmentShader: HALO_FRAGMENT, ...GLOW })))
  halos.frustumCulled = false
  halos.renderOrder = 4
  world.add(halos)

  // The compacts: twelve fanned in an arc in front of the cloche, lids open behind their pans. Each part is one
  // instanced mesh, and a lit compact lifts and its pan glows.
  const shadeLab = SHADES.map(hexToLab)
  const shadeColours = SHADES.map((hex) => new THREE.Color(hex))
  const n = SHADES.length
  const caseGeometry = geo(new THREE.CylinderGeometry(0.11, 0.116, 0.05, 32))
  const panGeometry = geo(new THREE.CylinderGeometry(0.088, 0.088, 0.012, 32))
  const panGlow = new THREE.InstancedBufferAttribute(new Float32Array(n), 1)
  panGeometry.setAttribute('aGlow', panGlow)
  const lidGeometry = geo(new THREE.CylinderGeometry(0.11, 0.11, 0.018, 32))
  lidGeometry.translate(0, 0.009, 0.11)
  const lidMirrorGeometry = geo(new THREE.CylinderGeometry(0.088, 0.088, 0.004, 32))
  lidMirrorGeometry.translate(0, -0.002, 0.11)
  const panMaterial = mat(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }))
  panMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aGlow;
varying float vGlow;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vGlow = aGlow;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vGlow;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vColor.rgb * (0.1 + vGlow * 0.35);`)
  }
  const cases = new THREE.InstancedMesh(caseGeometry, roseGold, n)
  const pans = new THREE.InstancedMesh(panGeometry, panMaterial, n)
  const lids = new THREE.InstancedMesh(lidGeometry, roseGold, n)
  const lidMirrors = new THREE.InstancedMesh(lidMirrorGeometry, compactMirror, n)
  const compactParts = [cases, pans, lids, lidMirrors]
  for (const part of compactParts) {
    part.castShadow = true
    part.receiveShadow = true
    world.add(part)
  }
  const compactAt: THREE.Vector3[] = []
  const compactTurn: THREE.Quaternion[] = []
  const up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < n; i++) {
    const angle = THREE.MathUtils.degToRad(155 - (130 * i) / (n - 1))
    compactAt.push(new THREE.Vector3(Math.cos(angle) * 1.2, 0, Math.sin(angle) * 1.2))
    compactTurn.push(new THREE.Quaternion().setFromAxisAngle(up, Math.PI / 2 - angle))
    pans.setColorAt(i, shadeColours[i])
  }
  const panTops = shadeColours.map(() => new THREE.Vector3())

  // The threads, one camera-facing ribbon per shade, bent up between the probe and the shade's pan: a coloured
  // core and a glowing halo.
  const SEGMENTS = 28
  const perThread = (SEGMENTS + 1) * 2
  const threadT = new Float32Array(n * perThread)
  const threadSide = new Float32Array(n * perThread)
  const threadId = new Float32Array(n * perThread)
  const threadIndex: number[] = []
  for (let k = 0; k < n; k++) {
    for (let i = 0; i <= SEGMENTS; i++) {
      const v = k * perThread + i * 2
      threadT[v] = threadT[v + 1] = i / SEGMENTS
      threadSide[v] = -1
      threadSide[v + 1] = 1
      threadId[v] = threadId[v + 1] = k
      if (i < SEGMENTS) threadIndex.push(v, v + 1, v + 2, v + 1, v + 3, v + 2)
    }
  }
  const threadGeometry = geo(new THREE.BufferGeometry())
  threadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * perThread * 3), 3))
  threadGeometry.setAttribute('aT', new THREE.Float32BufferAttribute(threadT, 1))
  threadGeometry.setAttribute('aSide', new THREE.Float32BufferAttribute(threadSide, 1))
  threadGeometry.setAttribute('aThread', new THREE.Float32BufferAttribute(threadId, 1))
  threadGeometry.setIndex(threadIndex)
  const threadShared = {
    uFrom: { value: new THREE.Vector3() },
    uTo: { value: panTops },
    uWeight: { value: new Float32Array(n) },
    uTint: { value: shadeColours },
    uReveal: { value: 1 },
  }
  const threadCore = new THREE.Mesh(threadGeometry, mat(new THREE.ShaderMaterial({
    uniforms: { ...threadShared, uWidth: { value: 0.011 } },
    vertexShader: THREAD_VERTEX,
    fragmentShader: THREAD_CORE,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })))
  const threadHalo = new THREE.Mesh(threadGeometry, mat(new THREE.ShaderMaterial({
    uniforms: { ...threadShared, uWidth: { value: 0.05 } },
    vertexShader: THREAD_VERTEX,
    fragmentShader: THREAD_HALO,
    ...GLOW,
    side: THREE.DoubleSide,
  })))
  for (const thread of [threadCore, threadHalo]) {
    thread.frustumCulled = false
    thread.renderOrder = 3
    world.add(thread)
  }

  // The gauge at the front left: a rose-gold case on an easel, the spectrum as twelve segments, the confidence band,
  // and a needle whose hub wears the tone.
  const dial = new THREE.Group()
  dial.position.set(-1.72, 0.56, 0.62)
  dial.rotation.set(-0.12, facing(-1.72, 0.62), 0, 'YXZ')
  world.add(dial)
  const dialCase = mesh(geo(new THREE.CylinderGeometry(0.47, 0.47, 0.08, 48)), roseGold)
  dialCase.rotation.x = Math.PI / 2
  const bezel = mesh(geo(new THREE.TorusGeometry(0.465, 0.028, 10, 56)), gold)
  bezel.position.z = 0.04
  const face = mesh(geo(new THREE.CircleGeometry(0.445, 48)), deepPlum, false)
  face.position.z = 0.041
  dial.add(dialCase, bezel, face)
  const segmentGeometry = geo(new RoundedBoxGeometry(0.09, 0.08, 0.018, 1, 0.007))
  const segmentMaterial = mat(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }))
  segmentMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vColor.rgb * 0.3;`)
  }
  const segments = new THREE.InstancedMesh(segmentGeometry, segmentMaterial, n)
  const segmentMatrix = (i: number, out: THREE.Matrix4, lift: number) => {
    const angle = DIAL_START - (DIAL_SWEEP * i) / (n - 1)
    const r = 0.335 + lift * 0.035
    return out.makeRotationZ(angle - Math.PI / 2).setPosition(Math.cos(angle) * r, Math.sin(angle) * r, 0.052 + lift * 0.016)
  }
  for (let i = 0; i < n; i++) {
    segments.setMatrixAt(i, segmentMatrix(i, placed, 0))
    segments.setColorAt(i, shadeColours[i])
  }
  dial.add(segments)
  const bandUniforms = { uLo: { value: 0 }, uHi: { value: 0 }, uOn: { value: 0 }, uColor: { value: new THREE.Color('#ff7aa5').multiplyScalar(1.2) } }
  const band = new THREE.Mesh(geo(new THREE.RingGeometry(0.24, 0.43, 120, 1)), mat(new THREE.ShaderMaterial({ uniforms: bandUniforms, vertexShader: BAND_VERTEX, fragmentShader: BAND_FRAGMENT, ...GLOW })))
  band.position.z = 0.045
  band.renderOrder = 3
  dial.add(band)
  const needleGeometry = geo(new RoundedBoxGeometry(0.02, 0.32, 0.014, 1, 0.006))
  needleGeometry.translate(0, 0.12, 0)
  const needle = mesh(needleGeometry, ringLight)
  needle.position.z = 0.07
  const hub = mesh(geo(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 24)), probeMaterial)
  hub.rotation.x = Math.PI / 2
  hub.position.z = 0.074
  dial.add(needle, hub)
  const easel = geo(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 8))
  for (const x of [-0.18, 0.18]) {
    const l = mesh(easel, gold)
    l.position.set(x, -0.3, -0.12)
    l.rotation.x = 0.35
    dial.add(l)
  }

  // The rebuilt screens on two display risers, two phones each, turned to the work act's camera.
  const riserGeometry = geo(new RoundedBoxGeometry(1.2, 0.34, 0.56, 3, 0.06))
  const phoneGeometry = geo(new RoundedBoxGeometry(0.42, 0.84, 0.04, 3, 0.04))
  const screenGeometry = geo(new THREE.PlaneGeometry(0.385, 0.79))
  const lipGeometry = geo(new RoundedBoxGeometry(0.34, 0.035, 0.06, 1, 0.012))
  const screenBlank = finish('#2a1622', { roughness: 0.15 })
  const phoneBody = finish('#20101a', { roughness: 0.3, metalness: 0.4 })
  const loads = SCREENS.map((src) => ctx.load(src))
  const screens: THREE.Mesh[] = []
  const screenMaterials: THREE.MeshBasicMaterial[] = []
  const phones: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const riser = mesh(riserGeometry, plum)
    riser.position.set(side * 1.68, 0.17, -0.98)
    world.add(riser)
    const strip = mesh(geo(new RoundedBoxGeometry(1.16, 0.025, 0.025, 1, 0.01)), neon, false)
    strip.position.set(side * 1.68, 0.3, -0.69)
    world.add(strip)
  }
  PHONE_SPOTS.forEach(([x, z], i) => {
    const phone = new THREE.Group()
    phone.position.set(x, 0.34, z)
    phone.rotation.set(-0.16, facing(x, z), 0, 'YXZ')
    const body = mesh(phoneGeometry, phoneBody)
    body.position.y = 0.43
    const blank = mesh(screenGeometry, screenBlank, false)
    blank.position.set(0, 0.43, 0.0205)
    const screenMaterial = mat(new THREE.MeshBasicMaterial({ map: loads[i].texture, color: new THREE.Color(1.1, 1.1, 1.1) }))
    const screen = new THREE.Mesh(screenGeometry, screenMaterial)
    screen.position.set(0, 0.43, 0.021)
    screen.visible = false
    const lip = mesh(lipGeometry, gold)
    lip.position.set(0, 0.0175, 0.05)
    phone.add(body, blank, screen, lip)
    world.add(phone)
    phone.updateMatrix()
    screens.push(screen)
    screenMaterials.push(screenMaterial)
    phones.push(phone)
  })

  // The jewellery box the four requests leave from, its lid open and its velvet lit.
  const box = new THREE.Group()
  box.position.copy(BOX)
  box.rotation.y = facing(BOX.x, BOX.z)
  world.add(box)
  const boxBody = mesh(geo(new RoundedBoxGeometry(0.56, 0.2, 0.36, 2, 0.03)), plum)
  boxBody.position.y = 0.1
  const velvet = mesh(geo(new THREE.PlaneGeometry(0.48, 0.28)), finish('#2b0d1d', { emissive: '#7ae6ff', emissiveIntensity: 0.6 }), false)
  velvet.rotation.x = -Math.PI / 2
  velvet.position.y = 0.201
  const boxLid = mesh(geo(new RoundedBoxGeometry(0.56, 0.05, 0.36, 2, 0.02)), plum)
  // The lid turns 1.9 radians up and back about its hinge on the box's back top edge.
  boxLid.position.set(0, 0.2 + 0.18 * Math.sin(1.9), -0.18 + 0.18 * Math.cos(1.9))
  boxLid.rotation.x = -1.9
  const clasp = mesh(geo(new THREE.BoxGeometry(0.08, 0.06, 0.02)), gold)
  clasp.position.set(0, 0.16, 0.185)
  box.add(boxBody, velvet, boxLid, clasp)
  box.updateMatrix()

  // The requests: four beads, their lanes from the box to the home screen fanned apart, and a queue on the box.
  const laneStart: THREE.Vector3[] = []
  const laneBend: THREE.Vector3[] = []
  const laneEnd: THREE.Vector3[] = []
  const queued: THREE.Vector3[] = []
  const homeScreen = new THREE.Vector3(0, 0.43, 0.03).applyMatrix4(phones[HOME_PHONE].matrix)
  for (let k = 0; k < REQUESTS; k++) {
    const spread = k - (REQUESTS - 1) / 2
    laneStart.push(new THREE.Vector3(spread * 0.1, 0.24, 0).applyMatrix4(box.matrix))
    queued.push(new THREE.Vector3(spread * 0.12, 0.25, 0.02).applyMatrix4(box.matrix))
    laneEnd.push(new THREE.Vector3(spread * 0.06, 0.43 + spread * 0.1, 0.03).applyMatrix4(phones[HOME_PHONE].matrix))
    const middle = new THREE.Vector3().addVectors(laneStart[k], homeScreen).multiplyScalar(0.5)
    laneBend.push(middle.add(new THREE.Vector3(spread * 0.32, 0.75 + Math.abs(spread) * 0.1, spread * 0.1)))
  }
  const bezier = (k: number, u: number, out: THREE.Vector3) => {
    const a = (1 - u) * (1 - u)
    const b = 2 * (1 - u) * u
    const c = u * u
    return out.set(
      laneStart[k].x * a + laneBend[k].x * b + laneEnd[k].x * c,
      laneStart[k].y * a + laneBend[k].y * b + laneEnd[k].y * c,
      laneStart[k].z * a + laneBend[k].z * b + laneEnd[k].z * c,
    )
  }
  const laneMaterial = mat(new THREE.MeshBasicMaterial({ color: new THREE.Color('#7ae6ff').multiplyScalar(0.55), ...GLOW, opacity: 1 }))
  const lanes = laneStart.map((_, k) => {
    const curve = new THREE.QuadraticBezierCurve3(laneStart[k], laneBend[k], laneEnd[k])
    const lane = new THREE.Mesh(geo(new THREE.TubeGeometry(curve, 40, 0.006, 5, false)), laneMaterial)
    lane.visible = false
    world.add(lane)
    return lane
  })
  const beadMaterial = finish('#dff9ff', { emissive: '#7ae6ff', emissiveIntensity: 2.2, roughness: 0.3 })
  const beadGeometry = geo(new THREE.IcosahedronGeometry(0.045, 2))
  const beads = laneStart.map(() => {
    const bead = mesh(beadGeometry, beadMaterial, false)
    bead.visible = false
    world.add(bead)
    return bead
  })

  // State: the tone the probe rests on, where the pointer would put it, and the probe's eased position.
  const pinned: Lab = hexToLab(DEFAULT_TONE)
  const hovered: Lab = [0, 0, 0]
  const tone: Lab = [pinned[0], pinned[1], pinned[2]]
  let interactive = false

  /** Moves a CIELAB colour toward the neutral axis at its lightness until it is inside the sRGB gamut. */
  const clampToGamut = (lab: Lab) => {
    lab[0] = Math.min(97, Math.max(3, lab[0]))
    labToLinear(lab[0], lab[1], lab[2], rgb)
    if (inGamut(rgb)) return
    let lo = 0
    let hi = 1
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2
      labToLinear(lab[0], lab[1] * mid, lab[2] * mid, rgb)
      if (inGamut(rgb)) lo = mid
      else hi = mid
    }
    lab[1] *= lo
    lab[2] *= lo
  }
  const toSolid = (lab: Lab, out: THREE.Vector3) => out.set(lab[1] * AB_SCALE, SOLID_Y + lab[0] * L_SCALE, lab[2] * AB_SCALE)

  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const plane = new THREE.Plane()
  const hit = new THREE.Vector3()
  const forward = new THREE.Vector3()
  const scratch = new THREE.Vector3()
  const normal = new THREE.Vector3()
  const aimAt = (x: number, y: number) => {
    ndc.set(x, y)
    raycaster.setFromCamera(ndc, camera)
  }
  /** The CIELAB point under the aimed ray on a plane through the pinned tone facing the camera, or false off the solid. */
  const pointerLab = (out: Lab) => {
    camera.getWorldDirection(forward)
    forward.y = 0
    if (forward.lengthSq() < 1e-6) return false
    forward.normalize()
    cloche.localToWorld(toSolid(pinned, scratch))
    plane.setFromNormalAndCoplanarPoint(forward, scratch)
    if (!raycaster.ray.intersectPlane(plane, hit)) return false
    cloche.worldToLocal(hit)
    const L = (hit.y - SOLID_Y) / L_SCALE
    if (L < -4 || L > 104 || Math.hypot(hit.x, hit.z) > GLASS_R * 0.95) return false
    out[0] = L
    out[1] = hit.x / AB_SCALE
    out[2] = hit.z / AB_SCALE
    clampToGamut(out)
    return true
  }
  /** The phone whose screen the aimed ray crosses, or -1. */
  const pointedPhone = () => {
    for (let i = 0; i < phones.length; i++) {
      const phone = phones[i]
      normal.set(0, 0, 1).transformDirection(phone.matrixWorld)
      scratch.set(0, 0.43, 0.021).applyMatrix4(phone.matrixWorld)
      plane.setFromNormalAndCoplanarPoint(normal, scratch)
      if (!raycaster.ray.intersectPlane(plane, hit)) continue
      phone.worldToLocal(hit)
      if (Math.abs(hit.x) < 0.21 && Math.abs(hit.y - 0.43) < 0.42) return i
    }
    return -1
  }

  /** The tone's place on the spectrum (0 lightest to n - 1 deepest) and its Delta-E to the spectrum's polyline. */
  const spectrum = { at: 0, distance: 0 }
  const placeOnSpectrum = (lab: Lab) => {
    spectrum.distance = Infinity
    for (let i = 0; i < n - 1; i++) {
      const p = shadeLab[i]
      const q = shadeLab[i + 1]
      const dL = q[0] - p[0]
      const da = q[1] - p[1]
      const db = q[2] - p[2]
      const t = clamp01(((lab[0] - p[0]) * dL + (lab[1] - p[1]) * da + (lab[2] - p[2]) * db) / (dL * dL + da * da + db * db))
      const d = Math.hypot(lab[0] - p[0] - dL * t, lab[1] - p[1] - da * t, lab[2] - p[2] - db * t)
      if (d < spectrum.distance) {
        spectrum.distance = d
        spectrum.at = i + t
      }
    }
  }

  const pose = { distance: 0, yaw: 0, pitch: 0, focusX: 0.5, focusY: 0.5 }
  const view = (f: IslandFrame) => {
    if (f.mode === 'home') {
      pose.distance = 9.4 - 0.4 * f.hover
      pose.yaw = -0.2 + f.tiltX * 0.26
      pose.pitch = 0.46 - f.tiltY * 0.1
      pose.focusX = 0.5
      pose.focusY = 0.5
      return pose
    }
    const a = f.local('arrival')
    const w = f.local('work')
    const c = f.local('impact')
    const dive = smoother(ramp(a, 0, 0.8))
    const close = smoother(ramp(w, 0, 0.3)) * (1 - smoother(ramp(c, 0.1, 0.6)))
    pose.distance = (f.narrow ? 30 : 17) - (f.narrow ? 6 : 4.8) * dive + 0.4 * smoother(ramp(c, 0.2, 0.8)) + 0.6 * f.push
    pose.yaw = 0.15 - 0.3 * dive - 0.15 * smoother(ramp(w, 0, 0.5)) + 0.5 * smoother(ramp(c, 0, 0.6)) + f.tiltX * 0.14 + f.dragYaw
    pose.pitch = 0.62 - 0.2 * dive - 0.06 * close + 0.04 * smoother(ramp(c, 0, 0.6)) - f.tiltY * 0.08
    pose.focusX = f.narrow ? 0.5 : 0.36
    pose.focusY = f.narrow ? 0.7 : 0.5
    return pose
  }

  // The output is one object reused every frame: its anchors, panels, and bounds hold preallocated vectors.
  const panels: IslandPanel[] = phones.map(() => {
    const center = new THREE.Vector3(0, -50, 0)
    return { center, up: new THREE.Vector3(0, 1, 0), halfH: -0.06, corners: [center], develop: 0, opacity: 0 }
  })
  const anchorScreens = new THREE.Vector3()
  const anchorTutorial = new THREE.Vector3()
  const anchorSolid = new THREE.Vector3()
  const anchorGauge = new THREE.Vector3()
  const anchors = new Map<string, THREE.Vector3 | null>([['screens', anchorScreens], ['tutorial', anchorTutorial], ['solid', anchorSolid], ['gauge', anchorGauge]])
  const bounds = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  const out: IslandOutput = { anchors, panels, bounds, focusY: 0.5, busy: false, ready: false }

  const matrix = new THREE.Matrix4()
  const hinge = new THREE.Matrix4()
  const part = new THREE.Matrix4()
  const lifted = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const probeLocal = new THREE.Vector3()
  const projected = new THREE.Vector3()

  return {
    scene,
    camera,
    update(f): IslandOutput {
      const journey = f.mode === 'journey'
      const a = journey ? f.local('arrival') : 1
      const w = journey ? f.local('work') : 1
      const c = journey ? f.local('impact') : 0
      const v = view(f)
      world.position.y = journey ? 0 : 0.1 * f.hover
      for (const { light, base } of lights) light.intensity = base * (1 + 0.2 * f.push)
      frame(camera, TARGET, v.distance, v.yaw, v.pitch, f.aspect, v.focusX, v.focusY)
      scene.updateMatrixWorld()

      // The tone: the pointer's point in the solid while it is over the solid, else the pinned tone.
      interactive = journey && w > 0.02
      const aiming = journey && f.pointer.inside
      if (aiming) aimAt(f.pointer.x, f.pointer.y)
      const hovering = interactive && aiming && pointerLab(hovered)
      const goal = hovering ? hovered : pinned
      let busy = false
      for (let k = 0; k < 3; k++) {
        tone[k] = ease(tone[k], goal[k], f.dt, 0.12)
        if (tone[k] !== goal[k]) busy = true
      }
      labToLinear(tone[0], tone[1], tone[2], rgb)
      probeMaterial.color.setRGB(clamp01(rgb[0]), clamp01(rgb[1]), clamp01(rgb[2]))
      probeMaterial.emissive.copy(probeMaterial.color).multiplyScalar(0.35)
      toSolid(tone, probeLocal)
      probe.position.copy(probeLocal)
      probe.updateMatrixWorld()
      probe.getWorldPosition(chipUniforms.uProbe.value)
      camera.getWorldPosition(chipUniforms.uEye.value)
      haloUniforms.uScale.value = ctx.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
      haloPositions[0] = probeLocal.x
      haloPositions[1] = probeLocal.y
      haloPositions[2] = probeLocal.z
      haloOn[0] = 0.7

      // The compacts open through the arrival, and the nearer a shade's Delta-E, the higher it lifts and glows.
      const reveal = journey ? smoother(ramp(w, 0.04, 0.26)) : 1
      const weights = threadShared.uWeight.value
      for (let i = 0; i < n; i++) {
        const near = Math.exp(-((deltaE(tone, shadeLab[i]) / THREAD_DELTA_E) ** 2))
        weights[i] = near
        panGlow.array[i] = near * reveal
        const open = LID_OPEN * smoother(ramp(a, 0.15 + (i / n) * 0.4, 0.4 + (i / n) * 0.4))
        lifted.copy(compactAt[i]).setY(0.1 * near * reveal)
        matrix.compose(lifted, compactTurn[i], one)
        cases.setMatrixAt(i, part.makeTranslation(0, 0.025, 0).premultiply(matrix))
        pans.setMatrixAt(i, part.makeTranslation(0, 0.056, 0).premultiply(matrix))
        hinge.makeRotationX(-open).setPosition(0, 0.05, -0.11).premultiply(matrix)
        lids.setMatrixAt(i, hinge)
        lidMirrors.setMatrixAt(i, hinge)
        panTops[i].set(0, 0.07, 0).applyMatrix4(matrix)
      }
      for (const instanced of compactParts) instanced.instanceMatrix.needsUpdate = true
      panGlow.needsUpdate = true
      threadShared.uFrom.value.copy(probeLocal)
      threadShared.uReveal.value = reveal
      threadCore.visible = threadHalo.visible = reveal > 0.001

      // The gauge: the needle sweeps up through the work act to the tone's fit, the closest matches lift, and the
      // band's half width grows with the tone's Delta-E to the spectrum.
      placeOnSpectrum(tone)
      const s = (spectrum.at / (n - 1)) * smoother(ramp(w, 0.08, 0.34))
      needle.rotation.z = DIAL_START - DIAL_SWEEP * s - Math.PI / 2
      const half = Math.min(0.32, (0.5 + spectrum.distance / 3) / (n - 1))
      bandUniforms.uLo.value = s - half
      bandUniforms.uHi.value = s + half
      bandUniforms.uOn.value = journey ? smoother(ramp(w, 0.2, 0.36)) : 1
      for (let i = 0; i < n; i++) segments.setMatrixAt(i, segmentMatrix(i, matrix, weights[i] * reveal))
      segments.instanceMatrix.needsUpdate = true

      // The requests: queued on the box, then launched together along their own lanes to the home screen.
      const shown = smoother(ramp(c, 0.04, 0.16)) * (1 - smoother(ramp(c, LAUNCH[1], LAUNCH[1] + 0.06)))
      const flight = smoother(ramp(c, LAUNCH[0], LAUNCH[1]))
      for (let k = 0; k < REQUESTS; k++) {
        const bead = beads[k]
        bead.visible = shown > 0.01
        lanes[k].visible = journey && c > 0.12
        if (bead.visible) {
          bezier(k, flight, bead.position)
          if (flight === 0) bead.position.copy(queued[k])
          else if (flight < 0.12) bead.position.lerpVectors(queued[k], bead.position, flight / 0.12)
          bead.scale.setScalar(shown)
        }
        haloPositions[(k + 1) * 3] = bead.position.x
        haloPositions[(k + 1) * 3 + 1] = bead.position.y
        haloPositions[(k + 1) * 3 + 2] = bead.position.z
        haloOn[k + 1] = bead.visible ? shown : 0
      }
      laneMaterial.color.setRGB(0.27, 0.71, 0.86).multiplyScalar(0.4 + 0.6 * flight * (1 - smoother(ramp(c, LAUNCH[1], 0.85))))
      const arrived = smoother(ramp(c, LAUNCH[1] - 0.04, LAUNCH[1] + 0.02)) * (1 - smoother(ramp(c, 0.8, 0.95)))
      screenMaterials[HOME_PHONE].color.setScalar(1.1 + 0.6 * arrived)
      haloPosition.needsUpdate = true
      haloOnAttribute.needsUpdate = true

      let ready = true
      for (let i = 0; i < loads.length; i++) {
        screens[i].visible = loads[i].ready
        ready = ready && loads[i].ready
      }

      // A phone's name shows only while the pointer is on its screen.
      const pointed = aiming ? pointedPhone() : -1
      for (let i = 0; i < panels.length; i++) {
        const panel = panels[i]
        if (i === pointed) {
          panel.center.set(0, 0.92, 0)
          phones[i].localToWorld(panel.center)
          panel.develop = 1
          panel.opacity = 1
        } else {
          panel.center.set(0, -50, 0)
          panel.develop = 0
          panel.opacity = 0
        }
      }

      phones[HOME_PHONE].localToWorld(anchorScreens.set(0, 0.86, 0))
      phones[1].localToWorld(anchorTutorial.set(0.1, 0.6, 0.03))
      world.localToWorld(anchorSolid.set(0.55, 0.75, 0.5))
      dial.localToWorld(anchorGauge.set(0.3, 0.2, 0.08))
      world.localToWorld(bounds[0].set(0, -1.36, 1.1))
      world.localToWorld(bounds[1].set(-2.2, -1.36, 1))
      world.localToWorld(bounds[2].set(2.2, -1.36, 1))
      projected.copy(TARGET).project(camera)
      out.focusY = projected.y * 0.5 + 0.5
      out.busy = busy
      out.ready = ready
      return out
    },
    press(point) {
      if (!interactive) return false
      aimAt(point.x, point.y)
      if (!pointerLab(hovered)) return false
      pinned[0] = hovered[0]
      pinned[1] = hovered[1]
      pinned[2] = hovered[2]
      ctx.invalidate()
      return true
    },
    command(name, value) {
      if (name !== 'tone' || !/^#[0-9a-f]{6}$/i.test(value)) return
      const lab = hexToLab(value)
      pinned[0] = lab[0]
      pinned[1] = lab[1]
      pinned[2] = lab[2]
      ctx.invalidate()
    },
    dispose() {
      geometries.forEach((g) => g.dispose())
      materials.forEach((m) => m.dispose())
      for (const instanced of [chips, ...compactParts, segments]) instanced.dispose()
    },
  }
}

export default createScene
