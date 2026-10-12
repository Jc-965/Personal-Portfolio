/**
 * The ScottyLabs AI world: Bark, CMU's campus AI assistant, as a night scene of dark hex tiles over a neon grid. Bark
 * is a violet core in a wire shell with two rings of orbiting tokens, and a Scottie dog in a CMU-red collar sits on
 * its tile. Four MCP tools stand on their own tiles around it (a folded campus map with a pin, a course stack under
 * a mortarboard, a dining cup, and a transit bus at its stop) and stream live data into the core. Questions reach
 * Bark from a floating chat window, the React client, through an injection guard whose curtain burns injected
 * prompts and leaking tokens, beside sixteen test lights. Answers stream back as tokens through three rings, the SSE
 * pipeline's LangGraph, FastAPI, and Express stages. Facts settle into three glass vaults, one per user, and a fact
 * aimed at the wrong user's vault bursts on its glass.
 *
 * On the home page the finished world rests with everything in flight. On the journey page the arrival sends
 * questions into the core, the work act runs the tool lookups, the guard, its tests, and the streamed answer, then
 * dims every tool but the query's, and the close fills the vaults. Hovering a tool lights its stream. A click on a
 * tool, the core, or the chat asks a question: it crosses the guard, Bark calls the tool and recalls from memory, and
 * the answer streams back as tokens.
 *
 * Every glow is one instanced billboard whose per-instance buffers the CPU rewrites each drawn frame. Flow along
 * each path follows the scroll and the pointer, never the clock, except for a clicked question, which runs on the
 * clock for ASK_S seconds and reports busy until its last token lands. update() allocates nothing.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GLOW, ease, frame, materials, mulberry32, ramp, smoother } from '../kit'
import type { IslandFactory, IslandFrame, IslandOutput, IslandPanel } from '../types'

/** The yaw, radians, the layout is composed for: `place` puts u to the right and v toward a camera at this yaw. */
const LAYOUT_YAW = 0.85
const RIGHT = new THREE.Vector2(Math.cos(LAYOUT_YAW), -Math.sin(LAYOUT_YAW))
const TOWARD = new THREE.Vector2(Math.sin(LAYOUT_YAW), Math.cos(LAYOUT_YAW))
const place = (u: number, y: number, v: number) => new THREE.Vector3(u * RIGHT.x + v * TOWARD.x, y, u * RIGHT.y + v * TOWARD.y)

/** World point the camera looks at, the middle of the world's height. */
const TARGET = new THREE.Vector3(0, 0.66, 0)
/** Bark's core centre. */
const CORE = new THREE.Vector3(0, 1.4, 0)
/** Seconds a clicked question takes from the chat to the core, Bark's lookup, and one token's flight back. */
const ASK_FLY = 0.6
const ASK_THINK = 0.75
const TOKEN_FLY = 0.8
/** Tokens in one streamed answer, and the seconds between their departures. */
const TOKENS = 16
const TOKEN_GAP = 0.07
/** Seconds from a click until its last token lands. */
const ASK_S = ASK_FLY + ASK_THINK + (TOKENS - 1) * TOKEN_GAP + TOKEN_FLY
/** Glow billboards drawn per frame at most. */
const MAX_GLOWS = 420
/** Token dashes in the chat window's answer bubble, four rows of nine. */
const DASHES = 36
/** The guard's live attack tests, one light each. */
const TESTS = 16
/** Memory vaults, one per user, and crystals in each. */
const VAULTS = 3
const PER_VAULT = 3

const INK = '#1c1838'
const TILE = '#2b2554'
const NEON = { cyan: '#5ce1ff', violet: '#a06bff', pink: '#ff5ca8', amber: '#ffc46b', mint: '#7cffb2' }

const COLOR = {
  question: new THREE.Color('#ffe7a3'),
  data: new THREE.Color(NEON.cyan),
  violet: new THREE.Color(NEON.violet),
  white: new THREE.Color('#ece6ff'),
  attack: new THREE.Color('#ff3b3b'),
  ember: new THREE.Color('#ffb347'),
  token: new THREE.Color('#bff4ff'),
  mint: new THREE.Color(NEON.mint),
  amber: new THREE.Color(NEON.amber),
  off: new THREE.Color('#3a3560'),
}
const VAULT_COLORS = [new THREE.Color(NEON.violet), new THREE.Color(NEON.cyan), new THREE.Color(NEON.mint)]

/**
 * Merges the meshes under `root` that share a material and shadow flag into one mesh each, in root's space, and
 * replaces root's children with them. Source geometries stay untouched. Returns the merged geometries, which the
 * caller disposes.
 */
function bake(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const inverse = root.matrixWorld.clone().invert()
  const relative = new THREE.Matrix4()
  const groups = new Map<string, { material: THREE.Material; cast: boolean; parts: THREE.BufferGeometry[] }>()
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    const material = mesh.material as THREE.Material
    const key = `${material.uuid}|${mesh.castShadow}`
    let group = groups.get(key)
    if (!group) {
      group = { material, cast: mesh.castShadow, parts: [] }
      groups.set(key, group)
    }
    const part = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
    for (const name of Object.keys(part.attributes)) if (name !== 'position' && name !== 'normal') part.deleteAttribute(name)
    part.applyMatrix4(relative.multiplyMatrices(inverse, mesh.matrixWorld))
    group.parts.push(part)
  })
  root.clear()
  const merged: THREE.BufferGeometry[] = []
  for (const { material, cast, parts } of groups.values()) {
    const geometry = mergeGeometries(parts, false)
    parts.forEach((part) => part.dispose())
    if (!geometry) continue
    merged.push(geometry)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = cast
    mesh.receiveShadow = true
    root.add(mesh)
  }
  return merged
}

const GLOW_VERTEX = /* glsl */ `
attribute vec3 aAt;
attribute vec4 aTint;
attribute float aSize;
varying vec2 vUv;
varying vec4 vTint;
void main() {
  vec4 view = modelViewMatrix * vec4(aAt, 1.0);
  view.xy += position.xy * aSize;
  gl_Position = projectionMatrix * view;
  vUv = uv;
  vTint = aTint;
}`

const GLOW_FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying vec4 vTint;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.0, 0.24, d);
  float halo = 1.0 - smoothstep(0.0, 1.0, d);
  float a = vTint.a * (halo * halo * 0.55 + core);
  gl_FragColor = vec4(mix(vTint.rgb, vec3(1.0), core * 0.45) * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

/** The guard's curtain: a soft violet sheet in the arch's opening that flares red while attacks burn on it. */
const CURTAIN_FRAGMENT = /* glsl */ `
uniform float uOn;
uniform float uBurn;
varying vec2 vUv;
void main() {
  vec2 p = vec2((vUv.x - 0.5) * 0.44, vUv.y * 0.62);
  float inside = p.y < 0.42 ? 1.0 - smoothstep(0.16, 0.2, abs(p.x)) : 1.0 - smoothstep(0.16, 0.2, length(p - vec2(0.0, 0.42)));
  float sheen = 0.45 + 0.55 * smoothstep(0.0, 0.62, p.y);
  vec3 color = mix(vec3(0.55, 0.42, 1.0), vec3(1.0, 0.3, 0.22), clamp(uBurn * 1.6, 0.0, 1.0));
  float a = inside * sheen * (0.3 * uOn + 1.1 * uBurn);
  gl_FragColor = vec4(color * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const UP = new THREE.Vector3(0, 1, 0)
const UNIT_BOX = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5))
const HIDDEN_AT = new THREE.Vector3(0, -50, 0)
/** The panel every unnamed target returns: out of view, undeveloped, and transparent. */
const HIDDEN: IslandPanel = { center: HIDDEN_AT, up: UP, halfH: 0, corners: [HIDDEN_AT], develop: 0, opacity: 0 }

const createScene: IslandFactory = (ctx) => {
  const scene = new THREE.Scene()
  scene.environment = ctx.environment
  scene.environmentIntensity = 0.3
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80)
  const mats = materials()
  const random = mulberry32(1501)
  const geometries: THREE.BufferGeometry[] = []
  const owned: THREE.Material[] = []
  const keep = <G extends THREE.BufferGeometry>(geometry: G) => {
    geometries.push(geometry)
    return geometry
  }
  const world = new THREE.Group()
  scene.add(world)

  // Night light: a cool moon with a soft shadow, a violet sky fill, a pink rim, and the core's own violet light.
  const moon = new THREE.DirectionalLight('#c3cfff', 1.7)
  moon.position.set(-2.4, 5.5, 3.2)
  moon.castShadow = true
  moon.shadow.mapSize.set(1024, 1024)
  Object.assign(moon.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 16 })
  moon.shadow.bias = -0.0006
  moon.shadow.normalBias = 0.02
  const fill = new THREE.HemisphereLight('#a596ec', '#1a1530', 1.5)
  const rim = new THREE.DirectionalLight('#ff9fd0', 0.8)
  rim.position.set(2.5, 2, -4)
  const glowLight = new THREE.PointLight(NEON.violet, 5, 0, 2)
  glowLight.position.copy(CORE)
  scene.add(moon, moon.target, fill, rim, glowLight)
  const lights = [moon, fill, rim].map((light) => ({ light, base: light.intensity }))

  const unit = keep(new THREE.BoxGeometry(1, 1, 1))
  const neon = (color: string, intensity = 2.2) => mats.get(color, { emissive: color, emissiveIntensity: intensity, roughness: 0.4 })
  const solid = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, cast = true) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = cast
    mesh.receiveShadow = true
    mesh.position.set(x, y, z)
    return mesh
  }
  const block = (w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = solid(unit, material, x, y, z)
    mesh.scale.set(w, h, d)
    return mesh
  }
  const ink = mats.get(INK, { roughness: 0.55, metalness: 0.25 })
  const tileTop = mats.get(TILE, { roughness: 0.5, metalness: 0.2 })
  const statics = new THREE.Group()

  // Hex tiles: a dark slab with a lighter top and a neon rim, floating at its own height.
  const tileShapes = new Map<number, { slab: THREE.BufferGeometry; top: THREE.BufferGeometry; rim: THREE.BufferGeometry }>()
  const tile = (at: THREE.Vector3, r: number, rimColor: string) => {
    let shapes = tileShapes.get(r)
    if (!shapes) {
      const rimGeometry = new THREE.TorusGeometry(r * 0.99, 0.013, 4, 6)
      rimGeometry.rotateX(Math.PI / 2)
      rimGeometry.rotateY(Math.PI / 6)
      shapes = { slab: keep(new THREE.CylinderGeometry(r, r * 0.86, 0.16, 6)), top: keep(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.012, 6)), rim: keep(rimGeometry) }
      tileShapes.set(r, shapes)
    }
    const group = new THREE.Group()
    group.position.copy(at)
    group.add(solid(shapes.slab, ink, 0, -0.08, 0))
    group.add(solid(shapes.top, tileTop, 0, 0.006, 0))
    group.add(solid(shapes.rim, neon(rimColor, 1.8), 0, 0.002, 0, false))
    statics.add(group)
  }
  const onTile = (at: THREE.Vector3, turn: number) => {
    const group = new THREE.Group()
    group.position.copy(at)
    group.rotation.y = turn
    statics.add(group)
    return group
  }

  // The holographic floor: rings and spokes below the tiles.
  const gridPoints: number[] = []
  for (const r of [0.9, 1.55, 2.2, 2.75]) {
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * Math.PI * 2 + Math.PI / 6
      const a1 = ((k + 1) / 6) * Math.PI * 2 + Math.PI / 6
      gridPoints.push(Math.cos(a0) * r, 0, Math.sin(a0) * r, Math.cos(a1) * r, 0, Math.sin(a1) * r)
    }
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    gridPoints.push(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9, Math.cos(a) * 2.75, 0, Math.sin(a) * 2.75)
  }
  const gridGeometry = keep(new THREE.BufferGeometry())
  gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3))
  const gridMaterial = new THREE.LineBasicMaterial({ color: '#3a5f8f', ...GLOW })
  owned.push(gridMaterial)
  const grid = new THREE.LineSegments(gridGeometry, gridMaterial)
  grid.position.y = -0.45
  world.add(grid)

  // Bark's tile, and the Scottie dog sitting on it in a CMU-red collar.
  tile(new THREE.Vector3(0, 0, 0), 0.62, NEON.violet)
  const dog = onTile(place(0.12, 0.012, 0.3), LAYOUT_YAW - 0.35)
  dog.scale.setScalar(1.35)
  const fur = mats.get('#2a2546', { roughness: 0.75 })
  dog.add(block(0.3, 0.13, 0.13, fur, 0, 0.13, 0))
  for (const [x, z] of [[-0.11, -0.045], [-0.11, 0.045], [0.1, -0.045], [0.1, 0.045]]) dog.add(block(0.045, 0.09, 0.045, fur, x, 0.045, z))
  dog.add(block(0.12, 0.13, 0.12, fur, 0.15, 0.25, 0))
  dog.add(block(0.08, 0.07, 0.09, fur, 0.24, 0.22, 0))
  dog.add(block(0.05, 0.05, 0.1, mats.get('#3b3560'), 0.25, 0.18, 0))
  dog.add(block(0.022, 0.022, 0.03, mats.get('#0f0d1d'), 0.285, 0.245, 0))
  const ear = keep(new THREE.ConeGeometry(0.03, 0.08, 4))
  dog.add(solid(ear, fur, 0.14, 0.35, -0.035), solid(ear, fur, 0.14, 0.35, 0.035))
  dog.add(block(0.025, 0.1, 0.025, fur, -0.15, 0.24, 0))
  dog.add(block(0.135, 0.035, 0.135, neon('#e0444e', 1.4), 0.12, 0.2, 0))
  dog.add(block(0.016, 0.016, 0.03, neon(NEON.amber, 2.2), 0.19, 0.18, 0))
  const eye = neon(NEON.cyan, 2.6)
  dog.add(block(0.012, 0.018, 0.018, eye, 0.21, 0.28, -0.035), block(0.012, 0.018, 0.018, eye, 0.21, 0.28, 0.035))

  // Tool 1, campus maps: a folded map with neon streets and a pin.
  const mapsAt = place(-2.15, 0.14, -1.05)
  tile(mapsAt, 0.5, NEON.pink)
  const maps = onTile(mapsAt, LAYOUT_YAW + 0.3)
  const paper = mats.get('#cfd8f2', { roughness: 0.8 })
  for (let k = 0; k < 3; k++) {
    const panel = block(0.22, 0.012, 0.5, paper, (k - 1) * 0.215, 0.05 + (k % 2) * 0.025, 0)
    panel.rotation.z = (k % 2 ? -1 : 1) * 0.12
    maps.add(panel)
  }
  const street = neon(NEON.cyan, 1.6)
  for (const [w, d, x, z] of [[0.62, 0.014, 0, -0.1], [0.62, 0.014, 0, 0.12], [0.014, 0.46, -0.12, 0], [0.014, 0.46, 0.15, 0]] as const) maps.add(block(w, 0.006, d, street, x, 0.085, z))
  const pinMaterial = neon(NEON.pink, 1.4)
  maps.add(solid(keep(new THREE.SphereGeometry(0.1, 16, 12)), pinMaterial, 0.05, 0.52, 0.02))
  const pinTip = keep(new THREE.ConeGeometry(0.07, 0.36, 14))
  pinTip.rotateX(Math.PI)
  maps.add(solid(pinTip, pinMaterial, 0.05, 0.3, 0.02))
  maps.add(solid(keep(new THREE.SphereGeometry(0.04, 10, 8)), mats.get('#ffffff'), 0.05, 0.52, 0.11))

  // Tool 2, courses: a stack of course books under a mortarboard with an amber tassel.
  const coursesAt = place(-1.15, -0.04, -1.6)
  tile(coursesAt, 0.45, NEON.amber)
  const courses = onTile(coursesAt, LAYOUT_YAW - 0.15)
  const covers = ['#3a2f73', '#2d4a7a', '#5a2c5e', '#283a5c']
  const stripes = [NEON.cyan, NEON.amber, NEON.pink, NEON.mint]
  let stackY = 0
  for (let k = 0; k < 4; k++) {
    const h = 0.09 + (k % 2) * 0.02
    const book = new THREE.Group()
    book.position.y = stackY + h / 2
    book.rotation.y = (k - 1.5) * 0.18
    book.add(block(0.44 - k * 0.03, h, 0.32 - k * 0.02, mats.get(covers[k])))
    book.add(block(0.4 - k * 0.03, h - 0.02, 0.3 - k * 0.02, mats.get('#e9e2cf'), 0.02, 0, 0))
    book.add(block(0.012, h * 0.4, 0.3 - k * 0.02, neon(stripes[k], 1.8), -0.22 + k * 0.015 - 0.004, 0, 0))
    courses.add(book)
    stackY += h
  }
  courses.add(block(0.1, 0.06, 0.1, mats.get('#14122a'), 0, stackY + 0.03, 0))
  const mortarboard = block(0.34, 0.02, 0.34, mats.get('#14122a'), 0, stackY + 0.07, 0)
  mortarboard.rotation.y = Math.PI / 4
  courses.add(mortarboard)
  courses.add(block(0.012, 0.16, 0.012, neon(NEON.amber, 2), 0.16, stackY - 0.01, 0))
  courses.add(block(0.03, 0.04, 0.03, neon(NEON.amber, 2), 0.16, stackY - 0.1, 0))

  // Tool 3, dining: a steaming cup on a saucer beside a bowl.
  const diningAt = place(0.9, 0.18, -1.65)
  tile(diningAt, 0.45, NEON.mint)
  const dining = onTile(diningAt, LAYOUT_YAW)
  const ceramic = mats.get('#e8e4f4', { roughness: 0.4 })
  dining.add(solid(keep(new THREE.CylinderGeometry(0.22, 0.18, 0.03, 24)), ceramic, -0.04, 0.02, 0))
  dining.add(solid(keep(new THREE.CylinderGeometry(0.15, 0.12, 0.26, 20)), ceramic, -0.04, 0.165, 0))
  dining.add(solid(keep(new THREE.CylinderGeometry(0.135, 0.135, 0.01, 20)), mats.get('#5a3420', { roughness: 0.3 }), -0.04, 0.29, 0))
  dining.add(solid(keep(new THREE.TorusGeometry(0.065, 0.018, 6, 14)), ceramic, 0.12, 0.17, 0))
  dining.add(solid(keep(new THREE.TorusGeometry(0.15, 0.008, 4, 32).rotateX(Math.PI / 2)), neon(NEON.mint, 2), -0.04, 0.295, 0, false))
  dining.add(solid(keep(new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), mats.get('#3b3560'), 0.12, 0.11, 0.2))
  dining.add(solid(keep(new THREE.CylinderGeometry(0.1, 0.1, 0.01, 16)), mats.get('#ffb35c', { roughness: 0.6 }), 0.12, 0.105, 0.2))

  // Tool 4, transit: a bus at its stop on a short road.
  const transitAt = place(1.7, 0.0, -0.75)
  tile(transitAt, 0.55, NEON.cyan)
  const transit = onTile(transitAt, LAYOUT_YAW + Math.PI / 2 - 0.25)
  transit.add(block(0.86, 0.008, 0.32, mats.get('#1b1833'), 0, 0.016, 0))
  for (let k = 0; k < 4; k++) transit.add(block(0.1, 0.004, 0.016, neon(NEON.amber, 1.2), -0.33 + k * 0.22, 0.022, 0))
  const bus = new THREE.Group()
  bus.position.set(0, 0.02, 0)
  bus.add(block(0.66, 0.22, 0.24, mats.get('#2f3f8f', { roughness: 0.5 }), 0, 0.15, 0))
  bus.add(block(0.67, 0.06, 0.245, mats.get('#e8e4f4', { roughness: 0.5 }), 0, 0.29, 0))
  bus.add(block(0.56, 0.07, 0.25, neon(NEON.cyan, 1.5), -0.03, 0.2, 0))
  bus.add(block(0.012, 0.09, 0.2, neon(NEON.cyan, 1.5), 0.331, 0.2, 0))
  bus.add(block(0.012, 0.03, 0.05, neon(NEON.amber, 2.6), 0.332, 0.08, -0.08), block(0.012, 0.03, 0.05, neon(NEON.amber, 2.6), 0.332, 0.08, 0.08))
  bus.add(block(0.2, 0.03, 0.012, neon(NEON.amber, 1.6), 0.18, 0.31, 0.124))
  const wheel = keep(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12).rotateX(Math.PI / 2))
  for (const [x, z] of [[-0.2, -0.12], [-0.2, 0.12], [0.2, -0.12], [0.2, 0.12]]) bus.add(solid(wheel, mats.get('#0f0d1d'), x, 0.05, z))
  transit.add(bus)
  transit.add(block(0.018, 0.42, 0.018, mats.get('#4a4570'), 0.1, 0.21, -0.25))
  transit.add(block(0.12, 0.1, 0.012, neon(NEON.cyan, 1.4), 0.1, 0.4, -0.25))

  // The memory: three glass vaults, one per user, each with a lock and its own crystals.
  const memoryAt = place(1.3, -0.06, 0.95)
  tile(memoryAt, 0.55, NEON.violet)
  const memoryTurn = LAYOUT_YAW - 0.1
  const vaultAcross = new THREE.Vector3(Math.cos(memoryTurn), 0, -Math.sin(memoryTurn))
  const vaultToward = new THREE.Vector3(Math.sin(memoryTurn), 0, Math.cos(memoryTurn))
  const vaultCentres = [-1, 0, 1].map((k) => memoryAt.clone().addScaledVector(vaultAcross, k * 0.29).addScaledVector(vaultToward, k === 0 ? -0.1 : 0.06))
  const glass = new THREE.MeshStandardMaterial({ color: '#d9ccff', transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.1, depthWrite: false })
  owned.push(glass)
  const vaultNeons = ['#c7a6ff', '#9fefff', '#b8ffd8']
  const lockGeometry = keep(new THREE.TorusGeometry(0.035, 0.008, 4, 16))
  vaultCentres.forEach((centre, k) => {
    const pane = new THREE.Mesh(unit, glass)
    pane.scale.set(0.24, 0.3, 0.24)
    pane.position.copy(centre).setY(centre.y + 0.15)
    pane.rotation.y = memoryTurn
    world.add(pane)
    const vault = onTile(centre, memoryTurn)
    const edge = neon(vaultNeons[k], 1.6)
    for (const [x, z] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) vault.add(block(0.014, 0.3, 0.014, edge, x, 0.15, z))
    vault.add(block(0.255, 0.014, 0.255, edge, 0, 0.3, 0))
    vault.add(block(0.255, 0.02, 0.255, ink, 0, 0.01, 0))
    vault.add(solid(lockGeometry, edge, 0, 0.15, 0.123))
  })
  const crystalGeometry = keep(new THREE.OctahedronGeometry(0.045, 0))
  crystalGeometry.scale(1, 2.2, 1)
  crystalGeometry.translate(0, 0.09, 0)
  const crystalMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#6a58a8', emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.1, flatShading: true })
  owned.push(crystalMaterial)
  const crystals = new THREE.InstancedMesh(crystalGeometry, crystalMaterial, VAULTS * PER_VAULT)
  crystals.frustumCulled = false
  world.add(crystals)
  const crystalItems = Array.from({ length: VAULTS * PER_VAULT }, (_, i) => {
    const vault = Math.floor(i / PER_VAULT)
    const k = i % PER_VAULT
    crystals.setColorAt(i, VAULT_COLORS[vault])
    return {
      at: vaultCentres[vault].clone().addScaledVector(vaultAcross, (k - 1) * 0.06).addScaledVector(vaultToward, k % 2 ? 0.04 : -0.04).setY(vaultCentres[vault].y + 0.02),
      turn: random() * Math.PI,
      tilt: (random() - 0.5) * 0.4,
      size: 0.8 + random() * 0.4,
      born: k === 0 ? -1 : 0.1 + (vault + (k - 1) * VAULTS) * 0.08,
    }
  })

  // The injection guard: a dark arch with a neon edge across the chat's path, and its sixteen test lights.
  const guardAt = place(-0.62, 0.05, 0.85)
  tile(guardAt, 0.42, NEON.pink)
  const chatAt = place(-1.35, 0.8, 1.55)
  const guardTurn = Math.atan2(chatAt.x, chatAt.z)
  const guard = onTile(guardAt, guardTurn)
  const archGeometry = keep(new THREE.TorusGeometry(0.22, 0.04, 6, 16, Math.PI))
  const archEdge = keep(new THREE.TorusGeometry(0.22, 0.012, 4, 24, Math.PI))
  const pinkEdge = neon(NEON.pink, 2.4)
  guard.add(block(0.08, 0.42, 0.08, ink, -0.22, 0.21, 0), block(0.08, 0.42, 0.08, ink, 0.22, 0.21, 0))
  guard.add(solid(archGeometry, ink, 0, 0.42, 0))
  guard.add(solid(archEdge, pinkEdge, 0, 0.42, 0.045, false), solid(archEdge, pinkEdge, 0, 0.42, -0.045, false))
  guard.add(block(0.012, 0.42, 0.012, pinkEdge, -0.22, 0.21, 0.045), block(0.012, 0.42, 0.012, pinkEdge, 0.22, 0.21, 0.045))
  guard.add(block(0.36, 0.09, 0.05, ink, 0, 0.045, 0.2))
  guard.updateMatrixWorld(true)
  const curtainUniforms = { uOn: { value: 1 }, uBurn: { value: 0 } }
  const curtainMaterial = new THREE.ShaderMaterial({
    uniforms: curtainUniforms,
    vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: CURTAIN_FRAGMENT,
    side: THREE.DoubleSide,
    ...GLOW,
  })
  owned.push(curtainMaterial)
  const curtain = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.44, 0.62)), curtainMaterial)
  curtain.position.copy(guardAt).setY(guardAt.y + 0.31)
  curtain.rotation.y = guardTurn
  world.add(curtain)
  const lampMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  owned.push(lampMaterial)
  const tests = new THREE.InstancedMesh(unit, lampMaterial, TESTS)
  const lampScale = new THREE.Matrix4().makeScale(0.024, 0.02, 0.008)
  const lampMatrix = new THREE.Matrix4()
  for (let k = 0; k < TESTS; k++) {
    lampMatrix.makeTranslation(-0.14 + (k % 8) * 0.04, 0.066 - Math.floor(k / 8) * 0.034, 0.227).premultiply(guard.matrixWorld).multiply(lampScale)
    tests.setMatrixAt(k, lampMatrix)
    tests.setColorAt(k, COLOR.off)
  }
  world.add(tests)

  // The chat window, the React client: a dark glass panel with a question bubble and an answer filled by tokens.
  const chat = onTile(chatAt, 0.9)
  chat.add(block(0.94, 0.74, 0.03, mats.get('#15122c', { roughness: 0.3, metalness: 0.25 })))
  for (const [w, h, x, y] of [[0.96, 0.016, 0, 0.37], [0.96, 0.016, 0, -0.37], [0.016, 0.74, 0.47, 0], [0.016, 0.74, -0.47, 0]] as const) chat.add(block(w, h, 0.036, neon(NEON.violet, 2), x, y, 0))
  chat.add(block(0.92, 0.08, 0.034, mats.get('#2e2560'), 0, 0.32, 0))
  chat.add(block(0.022, 0.022, 0.04, neon(NEON.pink, 1.6), -0.41, 0.32, 0), block(0.022, 0.022, 0.04, neon(NEON.amber, 1.6), -0.37, 0.32, 0), block(0.022, 0.022, 0.04, neon(NEON.mint, 1.6), -0.33, 0.32, 0))
  chat.add(block(0.86, 0.075, 0.034, mats.get('#211b44'), 0, -0.3, 0))
  chat.add(block(0.06, 0.05, 0.04, neon(NEON.violet, 2.2), 0.38, -0.3, 0))
  chat.add(block(0.68, 0.36, 0.034, mats.get('#272150'), -0.1, -0.06, 0))
  chat.updateMatrixWorld(true)
  const chatMatrix = chat.matrixWorld.clone()
  const chatQuaternion = new THREE.Quaternion().setFromRotationMatrix(chatMatrix)
  const question = new THREE.Group()
  question.add(block(0.44, 0.1, 0.036, neon('#4a3a1c', 0.4)))
  for (let k = 0; k < 5; k++) question.add(block(0.055, 0.02, 0.04, neon(NEON.amber, 1.4), -0.14 + k * 0.07, 0, 0))
  question.position.copy(chat.localToWorld(new THREE.Vector3(0.2, 0.16, 0)))
  question.rotation.y = chat.rotation.y
  world.add(question)
  const dashMaterial = new THREE.MeshBasicMaterial({ color: '#bff4ff' })
  owned.push(dashMaterial)
  const dashes = new THREE.InstancedMesh(unit, dashMaterial, DASHES)
  dashes.frustumCulled = false
  world.add(dashes)
  const dashSpots: { x: number; y: number; w: number }[] = []
  for (let row = 0; row < 4; row++) {
    let x = -0.4
    for (let k = 0; k < 9; k++) {
      const w = 0.03 + random() * 0.035
      dashSpots.push({ x: x + w / 2, y: 0.07 - row * 0.075, w })
      x += w + 0.012
    }
  }
  const sendAt = chat.localToWorld(new THREE.Vector3(0.38, -0.3, 0.05))
  const inboxAt = chat.localToWorld(new THREE.Vector3(-0.1, -0.06, 0.05))

  geometries.push(...bake(statics))
  world.add(statics)

  // Bark's core: a violet core in a wire shell, and two tilted rings of tokens.
  const coreMaterial = new THREE.MeshStandardMaterial({ color: '#d7c2ff', emissive: '#9b6bff', emissiveIntensity: 2, roughness: 0.3, flatShading: true })
  owned.push(coreMaterial)
  const core = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(0.34, 1)), coreMaterial)
  core.position.copy(CORE)
  world.add(core)
  const shellSource = new THREE.IcosahedronGeometry(0.6, 1)
  const shellGeometry = keep(new THREE.EdgesGeometry(shellSource))
  shellSource.dispose()
  const shellMaterial = new THREE.LineBasicMaterial({ color: '#7fb6ff', ...GLOW })
  owned.push(shellMaterial)
  const shell = new THREE.LineSegments(shellGeometry, shellMaterial)
  shell.position.copy(CORE)
  world.add(shell)
  const rings = [
    { radius: 0.98, tilt: new THREE.Euler(1.2, 0, 0.35), color: NEON.cyan, speed: 1 },
    { radius: 0.82, tilt: new THREE.Euler(1.85, 0, -0.5), color: NEON.violet, speed: -1.4 },
  ].map((spec) => {
    const mesh = new THREE.Mesh(keep(new THREE.TorusGeometry(spec.radius, 0.006, 4, 96)), neon(spec.color, 2.4))
    mesh.position.copy(CORE)
    mesh.rotation.copy(spec.tilt)
    world.add(mesh)
    return { radius: spec.radius, speed: spec.speed, basis: new THREE.Quaternion().setFromEuler(spec.tilt) }
  })
  const RING_TOKENS = 22
  const tokenMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  owned.push(tokenMaterial)
  const ringTokens = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(0.04, 0.04, 0.04)), tokenMaterial, rings.length * RING_TOKENS)
  ringTokens.frustumCulled = false
  const tint = new THREE.Color()
  for (let k = 0; k < rings.length * RING_TOKENS; k++) ringTokens.setColorAt(k, tint.set(k < RING_TOKENS ? '#bff4ff' : '#e2d2ff'))
  world.add(ringTokens)

  // Glow billboards: per-instance centre, colour and alpha, and size in world units.
  const glowAt = new Float32Array(MAX_GLOWS * 3)
  const glowTint = new Float32Array(MAX_GLOWS * 4)
  const glowSize = new Float32Array(MAX_GLOWS)
  const quad = keep(new THREE.PlaneGeometry(1, 1))
  const glowGeometry = keep(new THREE.InstancedBufferGeometry())
  glowGeometry.index = quad.index
  glowGeometry.setAttribute('position', quad.getAttribute('position'))
  glowGeometry.setAttribute('uv', quad.getAttribute('uv'))
  const atAttribute = new THREE.InstancedBufferAttribute(glowAt, 3).setUsage(THREE.DynamicDrawUsage)
  const tintAttribute = new THREE.InstancedBufferAttribute(glowTint, 4).setUsage(THREE.DynamicDrawUsage)
  const sizeAttribute = new THREE.InstancedBufferAttribute(glowSize, 1).setUsage(THREE.DynamicDrawUsage)
  glowGeometry.setAttribute('aAt', atAttribute)
  glowGeometry.setAttribute('aTint', tintAttribute)
  glowGeometry.setAttribute('aSize', sizeAttribute)
  glowGeometry.instanceCount = 0
  const glowMaterial = new THREE.ShaderMaterial({ vertexShader: GLOW_VERTEX, fragmentShader: GLOW_FRAGMENT, ...GLOW })
  owned.push(glowMaterial)
  const glows = new THREE.Mesh(glowGeometry, glowMaterial)
  glows.frustumCulled = false
  glows.renderOrder = 2
  world.add(glows)
  let glowCount = 0
  const put = (at: THREE.Vector3, color: THREE.Color, size: number, alpha: number) => {
    if (glowCount >= MAX_GLOWS || alpha < 0.004) return
    const i = glowCount++
    glowAt[i * 3] = at.x
    glowAt[i * 3 + 1] = at.y
    glowAt[i * 3 + 2] = at.z
    glowTint[i * 4] = color.r
    glowTint[i * 4 + 1] = color.g
    glowTint[i * 4 + 2] = color.b
    glowTint[i * 4 + 3] = Math.min(1.5, alpha)
    glowSize[i] = size
  }
  const curve = (out: THREE.Vector3, a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, t: number) => {
    const u = 1 - t
    return out.set(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y, u * u * a.z + 2 * u * t * c.z + t * t * b.z)
  }
  const arcOver = (a: THREE.Vector3, b: THREE.Vector3, lift: number, side = 0) => {
    const mid = a.clone().add(b).multiplyScalar(0.5)
    mid.y = Math.max(a.y, b.y) + lift
    mid.x += side * (b.z - a.z) * 0.25
    mid.z -= side * (b.x - a.x) * 0.25
    return mid
  }

  // The paths every glow follows, built once. The chat's line runs chat, guard, core, and answers run back.
  const toolTops = [mapsAt.clone().setY(mapsAt.y + 0.7), coursesAt.clone().setY(coursesAt.y + 0.62), diningAt.clone().setY(diningAt.y + 0.45), transitAt.clone().setY(transitAt.y + 0.42)]
  const TOOLS = toolTops.length
  const streams = toolTops.map((top, k) => ({ from: top, via: arcOver(top, CORE, 0.4, k % 2 ? 0.45 : -0.45), phase: random() }))
  const STREAM_DOTS = 16
  const guardIn = guardAt.clone().setY(guardAt.y + 0.3)
  const coreToGuard = arcOver(CORE, guardIn, 0.1, 0.25)
  const guardToChat = guardIn.clone().lerp(inboxAt, 0.5).setY(Math.max(guardIn.y, inboxAt.y) + 0.12)
  const sendToGuard = sendAt.clone().lerp(guardIn, 0.5).setY(Math.max(sendAt.y, guardIn.y) + 0.2)
  /** A point on the chat's line at t from 0 to 1: outbound runs chat, guard (t 0.4), core, and inbound runs back. */
  const chatLine = (out: THREE.Vector3, t: number, outbound: boolean) => {
    if (outbound) return t < 0.4 ? curve(out, sendAt, sendToGuard, guardIn, t / 0.4) : curve(out, guardIn, coreToGuard, CORE, (t - 0.4) / 0.6)
    return t < 0.6 ? curve(out, CORE, coreToGuard, guardIn, t / 0.6) : curve(out, guardIn, guardToChat, inboxAt, (t - 0.6) / 0.4)
  }
  const questions = Array.from({ length: 12 }, () => ({ phase: random(), wobble: random() * 6 }))
  const attacks = Array.from({ length: 10 }, () => {
    const angle = random() * Math.PI * 2
    return { phase: random(), burst: new THREE.Vector3(Math.cos(angle) * 0.32, 0.1 + random() * 0.3, Math.sin(angle) * 0.32) }
  })
  const answers = Array.from({ length: 18 }, (_, k) => ({ phase: random(), leak: k % 6 === 0 }))
  // The SSE pipeline's stages ring the answer line between the core and the guard.
  const stageRing = keep(new THREE.TorusGeometry(0.11, 0.012, 6, 28))
  const stageMaterials = [neon(NEON.violet, 2.4), neon(NEON.cyan, 2.4), neon(NEON.mint, 2.4)]
  const stageColors = [COLOR.violet, COLOR.data, COLOR.mint]
  const stages = [0.16, 0.32, 0.48].map((t, k) => {
    const at = new THREE.Vector3()
    const ahead = new THREE.Vector3()
    chatLine(at, t, false)
    chatLine(ahead, t + 0.01, false)
    const ring = new THREE.Mesh(stageRing, stageMaterials[k])
    ring.position.copy(at)
    ring.lookAt(ahead)
    world.add(ring)
    return at
  })
  const memoryIn = vaultCentres.map((c) => c.clone().setY(c.y + 0.36))
  const memoryVia = memoryIn.map((to, k) => arcOver(CORE, to, 0.2, 0.3 - k * 0.2))
  const facts = crystalItems.flatMap((item, i) => (item.born >= 0 ? [{ vault: Math.floor(i / PER_VAULT), at: item.born }] : []))
  /** The fact aimed at the wrong user's vault, which bursts on its glass, and when. */
  const STRAY = { from: 0, to: 2, at: 0.72 }
  const beam = Array.from({ length: 7 }, (_, k) => new THREE.Vector3(0, 0.1 + k * 0.14, 0))

  // Faint neon guides under the flowing glows: the tool streams, the chat's line, and the memory line.
  const guidePoints: number[] = []
  const guideColors: number[] = []
  const guide = (sample: (t: number, out: THREE.Vector3) => THREE.Vector3, color: THREE.Color, level: number) => {
    const from = new THREE.Vector3()
    const to = new THREE.Vector3()
    for (let i = 0; i < 40; i++) {
      sample(i / 40, from)
      sample((i + 1) / 40, to)
      guidePoints.push(from.x, from.y, from.z, to.x, to.y, to.z)
      for (let k = 0; k < 2; k++) guideColors.push(color.r * level, color.g * level, color.b * level)
    }
  }
  streams.forEach((s) => guide((t, out) => curve(out, s.from, s.via, CORE, t), COLOR.data, 0.4))
  guide((t, out) => chatLine(out, t, true), COLOR.violet, 0.4)
  guide((t, out) => curve(out, CORE, memoryVia[1], memoryIn[1], t), VAULT_COLORS[0], 0.22)
  const guideGeometry = keep(new THREE.BufferGeometry())
  guideGeometry.setAttribute('position', new THREE.Float32BufferAttribute(guidePoints, 3))
  guideGeometry.setAttribute('color', new THREE.Float32BufferAttribute(guideColors, 3))
  const guideMaterial = new THREE.LineBasicMaterial({ vertexColors: true, ...GLOW })
  owned.push(guideMaterial)
  world.add(new THREE.LineSegments(guideGeometry, guideMaterial))

  // Pick targets as boxes in `world` space, in panel order: the four tools, the core, the guard, the memory, the
  // three stages, the chat. Each carries the point its label hangs from.
  const targets: { local: THREE.Matrix4; label: THREE.Vector3; radius: number }[] = []
  const target = (w: number, h: number, d: number, at: THREE.Vector3, turn: number, label: THREE.Vector3, radius = 0) => {
    targets.push({ local: new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, turn, 0)), new THREE.Vector3(w, h, d)), label, radius })
  }
  target(0.95, 0.75, 0.95, mapsAt.clone().setY(mapsAt.y + 0.35), 0, toolTops[0].clone().setY(toolTops[0].y + 0.1))
  target(0.8, 0.7, 0.8, coursesAt.clone().setY(coursesAt.y + 0.33), 0, toolTops[1].clone().setY(toolTops[1].y + 0.1))
  target(0.8, 0.55, 0.8, diningAt.clone().setY(diningAt.y + 0.25), 0, toolTops[2].clone().setY(toolTops[2].y + 0.12))
  target(1.0, 0.5, 1.0, transitAt.clone().setY(transitAt.y + 0.22), 0, toolTops[3].clone().setY(toolTops[3].y + 0.12))
  target(1, 1, 1, CORE, 0, CORE.clone().setY(CORE.y + 1.1), 0.58)
  target(0.62, 0.66, 0.4, guardAt.clone().setY(guardAt.y + 0.32), guardTurn, guardAt.clone().setY(guardAt.y + 0.8))
  target(1.0, 0.42, 0.7, memoryAt.clone().setY(memoryAt.y + 0.18), memoryTurn, memoryAt.clone().setY(memoryAt.y + 0.55))
  for (const at of stages) target(0.3, 0.3, 0.3, at, 0, at.clone().setY(at.y + 0.2))
  target(1.0, 0.8, 0.12, chatAt, chat.rotation.y, chatAt.clone().setY(chatAt.y + 0.5))
  const CORE_PICK = TOOLS
  const STAGE_PICK = TOOLS + 3
  const CHAT_PICK = targets.length - 1
  const pickWorld = new THREE.Matrix4()
  const pickInverse = new THREE.Matrix4()
  const pickRay = new THREE.Ray()
  const pickHit = new THREE.Vector3()
  const pickSphere = new THREE.Sphere()

  // Output, allocated once: one panel per target, the anchors, and the bounds, rewritten in place each frame.
  const panelSlots: IslandPanel[] = targets.map(() => {
    const at = new THREE.Vector3()
    return { center: at, up: UP, halfH: -0.06, corners: [at], develop: 1, opacity: 1 }
  })
  const panels: IslandPanel[] = targets.map(() => HIDDEN)
  const anchorPoints = { tool: new THREE.Vector3(), core: new THREE.Vector3(), guard: new THREE.Vector3(), memory: new THREE.Vector3() }
  const anchors = new Map<string, THREE.Vector3 | null>(Object.entries(anchorPoints))
  const boundsLocal = [new THREE.Vector3(0, -0.3, 0), guardAt.clone().setY(guardAt.y - 0.2), chatAt.clone().setY(chatAt.y - 0.42), memoryAt.clone().setY(memoryAt.y - 0.2)]
  const bounds = boundsLocal.map(() => new THREE.Vector3())
  const output: IslandOutput = { anchors, panels, bounds, focusY: 0.5, busy: false, ready: true }

  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const p = new THREE.Vector3()
  const offset = new THREE.Vector3()
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const scale = new THREE.Vector3()
  const hoverGlow = new Float32Array(targets.length)
  const view = { distance: 0, yaw: 0, pitch: 0, focusX: 0.5, focusY: 0.5 }
  let hovered = -1
  let wasJourney = false
  let askAt = -1
  let askTool = 0
  let answered = false
  /** The tool whose stream the work act's end keeps lit: the last one hovered or clicked. */
  let matched = 2

  /** The target a ray from the camera through `x`, `y` meets first, or -1. The core tests as a sphere. */
  const pick = (x: number, y: number) => {
    ndc.set(x, y)
    raycaster.setFromCamera(ndc, camera)
    let best = -1
    let nearest = Infinity
    for (let k = 0; k < targets.length; k++) {
      pickWorld.multiplyMatrices(world.matrixWorld, targets[k].local)
      if (targets[k].radius > 0) {
        pickSphere.set(pickSphere.center.setFromMatrixPosition(pickWorld), targets[k].radius)
        if (!raycaster.ray.intersectSphere(pickSphere, pickHit)) continue
      } else {
        pickInverse.copy(pickWorld).invert()
        pickRay.copy(raycaster.ray).applyMatrix4(pickInverse)
        if (!pickRay.intersectBox(UNIT_BOX, pickHit)) continue
        pickHit.applyMatrix4(pickWorld)
      }
      const distance = pickHit.distanceToSquared(raycaster.ray.origin)
      if (distance < nearest) {
        nearest = distance
        best = k
      }
    }
    return best
  }

  const frameView = (f: IslandFrame) => {
    if (f.mode === 'home') {
      view.distance = 8.1 - 0.4 * f.hover
      view.yaw = 0.7 + f.tiltX * 0.28
      view.pitch = 0.4 - f.tiltY * 0.1
      view.focusX = 0.5
      view.focusY = 0.5
      return view
    }
    const a = f.local('arrival')
    const w = f.local('work')
    const c = f.local('impact')
    const dive = smoother(ramp(a, 0, 0.8))
    const close = smoother(ramp(w, 0, 0.3)) * (1 - smoother(ramp(c, 0.1, 0.6)))
    view.distance = (f.narrow ? 30 : 17) - (f.narrow ? 6 : 5.5) * dive - 0.8 * close + 1.6 * smoother(ramp(c, 0.2, 0.8)) + 0.6 * f.push
    view.yaw = 0.45 + 0.35 * dive + 0.22 * w + 0.1 * c + f.tiltX * 0.18 + f.dragYaw
    view.pitch = 0.52 - 0.16 * dive + 0.04 * close - f.tiltY * 0.08
    view.focusX = f.narrow ? 0.5 : 0.36
    view.focusY = f.narrow ? 0.7 : 0.5
    return view
  }

  return {
    scene,
    camera,
    update(f): IslandOutput {
      let busy = false
      const home = f.mode === 'home'
      // Back on the home page the chat forgets its answer, so the next arrival streams it again.
      if (home && wasJourney) {
        answered = false
        askAt = -1
      }
      wasJourney = !home
      const v = frameView(f)
      world.position.y = 0.12 * f.hover
      for (let k = 0; k < lights.length; k++) lights[k].light.intensity = lights[k].base * (1 + 0.2 * f.push)
      frame(camera, TARGET, v.distance, v.yaw, v.pitch, f.aspect, v.focusX, v.focusY)
      scene.updateMatrixWorld()

      const a = home ? 1 : f.local('arrival')
      const w = home ? 1 : f.local('work')
      const c = home ? 1 : f.local('impact')
      const since = askAt < 0 ? Infinity : ctx.now() - askAt
      const asking = since < ASK_S
      if (asking) busy = true
      if (askAt >= 0 && !asking) answered = true
      // Flow: the scroll and the pointer stir every path, and a clicked question adds the clock while it runs.
      const stir = f.tiltX * 0.16 + f.tiltY * 0.1 + f.dragYaw * 0.3
      const flow = (home ? 0.3 : a * 1.4 + w * 2.6 + c * 1.2) + stir
      const spin = flow + (asking ? since * 1.6 : 0)

      // Hover lights a tool's stream and names what is under the pointer.
      hovered = f.pointer.inside && (home ? f.hover > 0.5 : true) ? pick(f.pointer.x, f.pointer.y) : -1
      if (hovered >= 0 && hovered < TOOLS) matched = hovered
      for (let k = 0; k < targets.length; k++) {
        const next = ease(hoverGlow[k], hovered === k ? 1 : 0, f.dt, 0.12)
        if (next !== hoverGlow[k]) busy = true
        hoverGlow[k] = next
      }

      glowCount = 0
      // Bark kindles over the arrival, swells while it looks a question up, and its shell and rings turn with
      // the flow.
      const kindle = home ? 1 : 0.35 + 0.65 * smoother(ramp(a, 0.05, 0.6))
      const think = asking ? Math.sin(Math.PI * ramp(since, ASK_FLY - 0.1, ASK_FLY + ASK_THINK + 0.3)) : 0
      coreMaterial.emissiveIntensity = 0.8 + 1.6 * kindle + 1.6 * think
      glowLight.intensity = 2 + 4 * kindle + 4 * think
      core.scale.setScalar(0.85 + 0.15 * kindle + 0.15 * think)
      core.rotation.set(spin * 0.3, spin * 0.5, 0)
      shell.rotation.set(-spin * 0.2, -spin * 0.35, spin * 0.1)
      shell.scale.setScalar(0.92 + 0.08 * kindle + 0.08 * think)
      put(CORE, COLOR.violet, 2.3 + 0.7 * think, (0.22 + 0.28 * kindle) * (1 + think))
      put(CORE, COLOR.white, 0.85, 0.3 * kindle + 0.5 * think)
      for (let k = 0; k < beam.length; k++) put(beam[k], COLOR.violet, 0.36 - k * 0.03, (0.18 + 0.2 * kindle) * (1 - k / 8))
      for (let r = 0; r < rings.length; r++) {
        const ring = rings[r]
        for (let k = 0; k < RING_TOKENS; k++) {
          const angle = (k / RING_TOKENS) * Math.PI * 2 + spin * 0.5 * ring.speed
          offset.set(Math.cos(angle) * ring.radius, Math.sin(angle) * ring.radius, 0).applyQuaternion(ring.basis)
          euler.set(angle, angle * 0.5, 0)
          quaternion.setFromEuler(euler)
          const s = (k % 3 === 0 ? 1.3 : 0.8) * (0.6 + 0.4 * kindle)
          ringTokens.setMatrixAt(r * RING_TOKENS + k, matrix.compose(p.copy(CORE).add(offset), quaternion, scale.set(s, s, s)))
        }
      }
      ringTokens.instanceMatrix.needsUpdate = true

      // Questions: fireflies from the chat window through the guard into the core.
      const asked = home ? 0.9 : 0.15 + 0.85 * smoother(ramp(a, 0.05, 0.35)) - 0.4 * smoother(ramp(w, 0.15, 0.45))
      for (let k = 0; k < questions.length; k++) {
        const q = questions[k]
        const t = (q.phase + flow * 0.42) % 1
        chatLine(p, t, true)
        p.x += Math.sin(t * 9 + q.wobble) * 0.03
        p.y += Math.cos(t * 7 + q.wobble) * 0.025
        tint.copy(COLOR.question).lerp(COLOR.violet, t * t)
        put(p, tint, 0.1 + 0.025 * (k % 3), asked * Math.pow(Math.sin(Math.PI * t), 0.6))
      }

      // Tool lookups: every MCP tool streams live data into the core. The work act's end keeps only the matched
      // tool's stream, the query-matched binding.
      const lookup = home ? 0.75 : 0.15 + 0.85 * smoother(ramp(w, 0.04, 0.25))
      const bound = home ? 0 : smoother(ramp(w, 0.85, 0.97))
      for (let k = 0; k < TOOLS; k++) {
        const s = streams[k]
        const hot = hoverGlow[k] + (asking && k === askTool ? think : 0)
        const level = lookup * (1 - bound * (k === matched ? 0 : 0.85)) * (home ? 1 : smoother(ramp(w, 0.04 + k * 0.04, 0.2 + k * 0.04)) * 0.8 + 0.2) + hot * 0.7
        for (let i = 0; i < STREAM_DOTS; i++) {
          const t = (i / STREAM_DOTS + s.phase + flow * (0.55 + 0.5 * hot) + (asking && k === askTool ? since * 0.9 : 0)) % 1
          curve(p, s.from, s.via, CORE, t)
          tint.copy(COLOR.data).lerp(COLOR.violet, t * t)
          put(p, tint, 0.09 + 0.05 * hot, level * (0.4 + 0.7 * Math.sin(Math.PI * t)))
        }
      }
      // Steam rises from the dining cup.
      for (let k = 0; k < 4; k++) {
        const t = (k / 4 + flow * 0.3) % 1
        p.copy(diningAt).add(offset.set(Math.sin(t * 6 + k) * 0.04, 0.34 + t * 0.4, 0))
        put(p, COLOR.white, 0.12 + 0.1 * t, 0.22 * Math.sin(Math.PI * t))
      }

      // The guard: injected prompts ride in from the chat and burn on the curtain, and its tests light green.
      const attackOn = home ? 0.6 : smoother(ramp(w, 0.3, 0.45)) * (1 - smoother(ramp(c, 0.1, 0.4)))
      let burning = 0
      for (let k = 0; k < attacks.length; k++) {
        const atk = attacks[k]
        const t = (atk.phase + flow * 0.45) % 1
        if (t < 0.78) {
          chatLine(p, (t / 0.78) * 0.4, true)
          put(p, COLOR.attack, 0.1, attackOn * Math.min(1, t * 6) * 1.2)
          continue
        }
        const e = (t - 0.78) / 0.22
        burning = Math.max(burning, 1 - e)
        p.copy(guardIn).addScaledVector(atk.burst, Math.sqrt(e))
        tint.copy(COLOR.attack).lerp(COLOR.ember, e)
        put(p, tint, 0.1 + 0.12 * e, attackOn * (1 - e) * 1.4)
        put(p.addScaledVector(atk.burst, 0.35), COLOR.ember, 0.045, attackOn * (1 - e) * 1.2)
      }
      curtainUniforms.uOn.value = home ? 0.9 : 0.35 + 0.65 * smoother(ramp(a, 0.2, 0.6))
      curtainUniforms.uBurn.value = attackOn * (0.25 + 0.75 * burning) * 0.75
      if (attackOn > 0.01) put(guardIn, COLOR.attack, 0.9, attackOn * (0.12 + 0.3 * burning))
      const passed = home ? TESTS : ramp(w, 0.35, 0.8) * TESTS
      for (let k = 0; k < TESTS; k++) tests.setColorAt(k, k < passed - 0.5 ? COLOR.mint : k < passed + 0.5 ? COLOR.amber : COLOR.off)
      if (tests.instanceColor) tests.instanceColor.needsUpdate = true

      // Answers: tokens stream from the core through the SSE stages and the guard into the chat. A token that would
      // leak the prompt burns on the guard instead.
      const answerOn = home ? 0.7 : smoother(ramp(w, 0.45, 0.6)) * (1 - 0.6 * smoother(ramp(c, 0.2, 0.6)))
      for (let k = 0; k < answers.length; k++) {
        const ans = answers[k]
        const t = (ans.phase + flow * 0.5) % 1
        if (ans.leak && t > 0.6) {
          const e = (t - 0.6) / 0.4
          p.copy(guardIn).addScaledVector(attacks[k % attacks.length].burst, Math.sqrt(e) * 0.8)
          put(p, COLOR.ember, 0.08 + 0.08 * e, answerOn * (1 - e))
          continue
        }
        chatLine(p, t, false)
        put(p, ans.leak ? COLOR.attack : COLOR.token, 0.075 + 0.02 * (k % 2), answerOn * Math.pow(Math.sin(Math.PI * t), 0.5) * 0.9)
      }
      for (let k = 0; k < stages.length; k++) put(stages[k], stageColors[k], 0.42 + 0.2 * hoverGlow[STAGE_PICK + k], (0.12 + 0.3 * answerOn) * (1 + hoverGlow[STAGE_PICK + k]))

      // The chat: the question bubble arrives with the first questions, and the answer fills token by token as the
      // stream lands, or as a clicked question's tokens do.
      let landed = 0
      if (asking) for (let j = 0; j < TOKENS; j++) if (since - ASK_FLY - ASK_THINK - j * TOKEN_GAP >= TOKEN_FLY) landed++
      const scrolled = home || answered ? 1 : smoother(ramp(w, 0.5, 0.92))
      const filled = asking ? landed / TOKENS : scrolled
      question.scale.setScalar(home ? 1 : Math.max(1e-4, smoother(ramp(a, 0.15, 0.35))))
      for (let k = 0; k < DASHES; k++) {
        const s = dashSpots[k]
        const on = ramp(filled * DASHES - k, 0, 1)
        offset.set(s.x, s.y, 0.022).applyMatrix4(chatMatrix)
        dashes.setMatrixAt(k, matrix.compose(offset, chatQuaternion, scale.set(s.w * on + 1e-4, 0.03 * on + 1e-4, 0.012 * on + 1e-4)))
      }
      dashes.instanceMatrix.needsUpdate = true
      put(inboxAt, COLOR.token, 0.9, 0.12 + 0.12 * filled)

      // Memory: facts arc from the core into their user's vault and a crystal grows where each lands. One fact
      // aimed at the wrong vault bursts on its glass.
      if (!home) {
        for (let k = 0; k < facts.length; k++) {
          const fact = facts[k]
          const e = ramp(c, fact.at - 0.1, fact.at)
          if (e <= 0 || e >= 1) continue
          curve(p, CORE, memoryVia[fact.vault], memoryIn[fact.vault], smoother(e))
          put(p, VAULT_COLORS[fact.vault], 0.09, Math.sin(Math.PI * e) * 0.9 + 0.2)
        }
        const stray = ramp(c, STRAY.at - 0.12, STRAY.at)
        if (stray > 0 && stray < 1) {
          curve(p, CORE, memoryVia[STRAY.to], memoryIn[STRAY.to], smoother(stray))
          put(p, VAULT_COLORS[STRAY.from], 0.1, 1)
        }
        const burst = ramp(c, STRAY.at, STRAY.at + 0.08)
        if (burst > 0 && burst < 1) {
          for (let k = 0; k < 5; k++) {
            p.copy(memoryIn[STRAY.to]).addScaledVector(attacks[k].burst, 0.6 * burst)
            put(p, COLOR.attack, 0.08, (1 - burst) * 1.2)
          }
          put(memoryIn[STRAY.to], COLOR.attack, 0.5, (1 - burst) * 0.8)
        }
      }
      for (let i = 0; i < crystalItems.length; i++) {
        const item = crystalItems[i]
        const grow = item.born < 0 || home ? 1 : smoother(ramp(c, item.born, item.born + 0.08))
        const pop = home || item.born < 0 ? 0 : Math.sin(Math.PI * ramp(c, item.born, item.born + 0.1)) * 0.25
        const s = item.size * grow * (1 + pop) + 1e-4
        euler.set(item.tilt, item.turn + flow * 0.08, item.tilt * 0.5)
        quaternion.setFromEuler(euler)
        crystals.setMatrixAt(i, matrix.compose(item.at, quaternion, scale.set(s, s, s)))
      }
      crystals.instanceMatrix.needsUpdate = true

      // A clicked question: its spark crosses the guard to the core, Bark calls the tool and recalls the asker's
      // memory, and the answer streams back as tokens.
      if (asking) {
        const fly = smoother(Math.min(1, since / ASK_FLY))
        for (let trail = 0; trail < 5 && fly < 1; trail++) {
          const t = fly - trail * 0.035
          if (t <= 0) continue
          chatLine(p, t, true)
          put(p, COLOR.question, 0.13 - trail * 0.016, 1.3 - trail * 0.22)
        }
        const recall = ramp(since, ASK_FLY + 0.2, ASK_FLY + ASK_THINK)
        if (recall > 0 && recall < 1) {
          curve(p, memoryIn[0], memoryVia[0], CORE, smoother(recall))
          put(p, VAULT_COLORS[0], 0.12, 1.2)
        }
        for (let j = 0; j < TOKENS; j++) {
          const e = (since - ASK_FLY - ASK_THINK - j * TOKEN_GAP) / TOKEN_FLY
          if (e <= 0 || e >= 1) continue
          chatLine(p, e, false)
          put(p, COLOR.token, 0.085, 1.2)
        }
      }

      atAttribute.needsUpdate = true
      tintAttribute.needsUpdate = true
      sizeAttribute.needsUpdate = true
      glowGeometry.instanceCount = glowCount

      for (let k = 0; k < targets.length; k++) {
        if (home || hovered !== k) {
          panels[k] = HIDDEN
          continue
        }
        world.localToWorld(panelSlots[k].center.copy(targets[k].label))
        panels[k] = panelSlots[k]
      }
      world.localToWorld(anchorPoints.tool.copy(toolTops[2]))
      world.localToWorld(anchorPoints.core.copy(CORE)).y -= 0.4
      world.localToWorld(anchorPoints.guard.copy(guardIn)).y += 0.36
      world.localToWorld(anchorPoints.memory.copy(memoryIn[1]))
      for (let k = 0; k < bounds.length; k++) world.localToWorld(bounds[k].copy(boundsLocal[k]))
      output.busy = busy
      return output
    },
    press(point) {
      const k = pick(point.x, point.y)
      if (k < 0 || (k >= TOOLS && k !== CORE_PICK && k !== CHAT_PICK)) return false
      askTool = k < TOOLS ? k : matched
      matched = askTool
      askAt = ctx.now()
      return true
    },
    dispose() {
      geometries.forEach((g) => g.dispose())
      crystals.dispose()
      tests.dispose()
      dashes.dispose()
      ringTokens.dispose()
      owned.forEach((m) => m.dispose())
      mats.dispose()
    },
  }
}

export default createScene
