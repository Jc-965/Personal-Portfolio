/**
 * The Game Creation Society scene: a saturated video-game arena in teal, magenta, and yellow. Five grey-box
 * platforms float over a pit of neon rings, two chunky players stand on their spawn pads, grapple rings hang over
 * the centre and the high ledge, a scoreboard floats behind, and each player's controller hovers in front.
 *
 * The arena runs a small physics simulation only while something started it. Players fall under gravity and land
 * on platform tops. A grappling rope is a verlet chain whose reel draws the firing player along it to the hook,
 * and the player then arcs onto the platform under the hook. A tether reels the other player in. Players who
 * collide throw sparks and knock the faster one back, and a player who falls into the pit is eliminated, scores the
 * other player a point, and respawns over its pad. The simulation steps at 120 Hz and stops once every player
 * stands still, every rope is stowed, and every spark is out.
 *
 * On the home page the players stand on their pads. On the journey page the work act plays a bout as it scrolls (a
 * grapple to the centre, then a tether that ends in a knockout), the close sends both players swinging at once, and
 * a press fires the chosen player's hook at a platform, a ring, or the other player.
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { GLOW, ease, frame, materials, ramp, smoother } from '../kit'
import type { IslandFactory, IslandFrame, IslandOutput } from '../types'

const TEAL = '#12d6c8'
const MAGENTA = '#ff2e93'
const YELLOW = '#ffd23f'
const INDIGO = '#2a1b52'
const DEEP = '#170e33'

interface Platform { x: number; y: number; z: number; r: number; sides: number; turn: number; trim: string; depth: number }
/** Platform tops in world units: the centre, the two spawn pads, the high ledge, and the low step. */
const PLATFORMS: Platform[] = [
  { x: 0, y: 0, z: 0, r: 0.74, sides: 6, turn: 0, trim: YELLOW, depth: 0.6 },
  { x: -1.75, y: 0.2, z: 0.45, r: 0.56, sides: 8, turn: 0.2, trim: TEAL, depth: 0.5 },
  { x: 1.75, y: 0.2, z: -0.25, r: 0.56, sides: 8, turn: 0.2, trim: MAGENTA, depth: 0.5 },
  { x: 0.15, y: 0.72, z: -1.55, r: 0.52, sides: 4, turn: Math.PI / 4, trim: YELLOW, depth: 0.8 },
  { x: -0.45, y: -0.4, z: 1.55, r: 0.44, sides: 6, turn: 0.3, trim: YELLOW, depth: 0.4 },
]
/** The grapple rings over the centre and over the high ledge. */
const RINGS = [new THREE.Vector3(0, 1.12, 0), new THREE.Vector3(0.15, 1.75, -1.55)]
/** Where a player who grapples each ring lands: the top of the platform under it. */
const RING_LANDS = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.15, 0.72, -1.55)]
const SPAWN_PAD = [1, 2]

/** Gravity in world units per second squared, and the fixed step in seconds. */
const GRAVITY = -7.5
const STEP = 1 / 120
/** Hook flight speed and reel speeds, world units per second. A reel draws its player along the rope at its speed. */
const HOOK_SPEED = 11
const REEL = 5
const TETHER_REEL = 6.5
/** A grapple lets go once the hand is this close to the hook, and the player then arcs onto the landing point. */
const LET_GO = 0.45
/** A player's body centre and hand sit this high above its feet, and two bodies touch inside HIT_DISTANCE. */
const BODY_Y = 0.27
const HAND_Y = 0.32
const HIT_DISTANCE = 0.36
/** Below KO_Y a player is eliminated, and it drops back over its pad after RESPAWN_S seconds. */
const KO_Y = -1.15
const RESPAWN_S = 1.3
/** Knockback in world units per second for the knocked player, horizontally away and upward. */
const KNOCK_OUT = 3.4
const KNOCK_UP = 2.6
/** Simulated seconds after the last event at which a running simulation is put to rest regardless. */
const SETTLE_LIMIT = 12
const ROPE_N = 16
const SPARKS = 160
const TARGET = new THREE.Vector3(0, 0.1, 0)

const SPARK_VERTEX = /* glsl */ `
attribute float aLife;
attribute vec3 aColor;
uniform float uScale;
varying float vLife;
varying vec3 vColor;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = aLife > 0.0 ? max(1.5, (0.025 + 0.05 * aLife) * uScale / -view.z) : 0.0;
  vLife = aLife;
  vColor = aColor;
}`

const SPARK_FRAGMENT = /* glsl */ `
varying float vLife;
varying vec3 vColor;
void main() {
  if (vLife <= 0.0) discard;
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.25, 1.0, d)) * min(1.0, vLife * 2.5);
  gl_FragColor = vec4(vColor * a * 1.8, a);
}`

const SHOCK_VERTEX = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const SHOCK_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vP;
void main() {
  float r = length(vP);
  float a = uAlpha * smoothstep(0.7, 0.9, r) * (1.0 - smoothstep(0.9, 1.0, r));
  gl_FragColor = vec4(uColor * a * 1.6, a);
}`

type RopeState = 'idle' | 'flying' | 'attached' | 'retracting'

interface Player {
  index: number
  colour: THREE.Color
  spawn: THREE.Vector3
  p: THREE.Vector3
  prev: THREE.Vector3
  v: THREE.Vector3
  grounded: boolean
  alive: boolean
  respawnAt: number
  heading: number
  squash: number
  group: THREE.Group
  rope: {
    state: RopeState
    hook: THREE.Vector3
    target: THREE.Vector3
    /** The platform-top point the player arcs onto after a grapple lets go. */
    land: THREE.Vector3
    victim: Player | null
    length: number
    retract: number
    points: Float32Array
    before: Float32Array
  }
}

const createScene: IslandFactory = (ctx) => {
  const scene = new THREE.Scene()
  scene.environment = ctx.environment
  scene.environmentIntensity = 0.3
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80)
  const mats = materials()
  const geometries: THREE.BufferGeometry[] = []
  const owned: { dispose(): void }[] = []
  const geo = <G extends THREE.BufferGeometry>(geometry: G) => { geometries.push(geometry); return geometry }
  const own = <T extends { dispose(): void }>(thing: T) => { owned.push(thing); return thing }
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], cast = true) => {
    const m = new THREE.Mesh(geometry, material)
    m.castShadow = cast
    m.receiveShadow = true
    return m
  }

  // A hard white key, a cool sky fill, and teal and magenta rims from either side.
  const key = new THREE.DirectionalLight('#ffffff', 2.6)
  key.position.set(2.5, 7, 4)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  Object.assign(key.shadow.camera, { left: -3.2, right: 3.2, top: 3.2, bottom: -3.2, near: 1, far: 20 })
  key.shadow.bias = -0.0005
  key.shadow.normalBias = 0.02
  key.shadow.radius = 1.2
  const fill = new THREE.HemisphereLight('#d9e4ff', '#3b1f5c', 1.1)
  const rimTeal = new THREE.DirectionalLight(TEAL, 1.6)
  rimTeal.position.set(-5, 2, -2)
  const rimMagenta = new THREE.DirectionalLight(MAGENTA, 1.6)
  rimMagenta.position.set(5, 2, -3)
  scene.add(key, key.target, fill, rimTeal, rimMagenta)
  const lights = [key, fill, rimTeal, rimMagenta].map((light) => ({ light, base: light.intensity }))

  const world = new THREE.Group()
  scene.add(world)

  // Grey-box tops: a pale lavender with a line every quarter unit and a stronger line every unit, in world space.
  const gridTop = own(new THREE.MeshStandardMaterial({ color: '#ebe6fb', roughness: 0.6, flatShading: true }))
  gridTop.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec2 vGrid;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vGrid = (modelMatrix * vec4(transformed, 1.0)).xz;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vGrid;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec2 fine = abs(fract(vGrid * 4.0 + 0.5) - 0.5) / fwidth(vGrid * 4.0);
vec2 major = abs(fract(vGrid + 0.5) - 0.5) / fwidth(vGrid);
diffuseColor.rgb *= 1.0 - 0.16 * (1.0 - min(min(fine.x, fine.y), 1.0)) - 0.3 * (1.0 - min(min(major.x, major.y), 1.0));`)
  }

  // The platforms: a grid top, a coloured trim band, and a tapered underside of deep indigo rock.
  const platformTops: THREE.Mesh[] = []
  for (const pad of PLATFORMS) {
    const group = new THREE.Group()
    group.position.set(pad.x, pad.y, pad.z)
    group.rotation.y = pad.turn
    const top = mesh(geo(new THREE.CylinderGeometry(pad.r, pad.r, 0.14, pad.sides)), [mats.get('#d8d0f2'), gridTop, mats.get(INDIGO)])
    top.position.y = -0.07
    const trim = mesh(geo(new THREE.CylinderGeometry(pad.r * 1.03, pad.r * 1.03, 0.09, pad.sides)), mats.get(pad.trim, { emissive: pad.trim, emissiveIntensity: 0.25, roughness: 0.4 }))
    trim.position.y = -0.18
    const under = mesh(geo(new THREE.CylinderGeometry(pad.r * 0.96, pad.r * 0.28, pad.depth, pad.sides)), mats.get(INDIGO))
    under.position.y = -0.22 - pad.depth / 2
    group.add(top, trim, under)
    world.add(group)
    platformTops.push(top)
  }

  // The pit: neon rings narrowing as they fall away under the arena, over a dark core.
  const pitColours = [MAGENTA, TEAL, YELLOW, MAGENTA, TEAL]
  for (let i = 0; i < pitColours.length; i++) {
    const colour = pitColours[i]
    const ring = mesh(geo(new THREE.TorusGeometry(2.35 - i * 0.44, 0.04 - i * 0.004, 8, 72)), mats.get(colour, { emissive: colour, emissiveIntensity: 1.3 - i * 0.15, roughness: 0.5 }), false)
    ring.rotation.x = Math.PI / 2
    ring.position.y = -1.05 - i * 0.22
    world.add(ring)
  }
  const core = mesh(geo(new THREE.CircleGeometry(0.62, 40)), mats.get(DEEP, { emissive: '#3a0f4a', emissiveIntensity: 0.6 }), false)
  core.rotation.x = -Math.PI / 2
  core.position.y = -1.98
  world.add(core)

  // The knockout ring around the arena's edge flashes when a player is eliminated.
  const edgeMaterial = own(new THREE.MeshStandardMaterial({ color: MAGENTA, emissive: MAGENTA, emissiveIntensity: 0.9, roughness: 0.4, flatShading: true }))
  const edgeRing = mesh(geo(new THREE.TorusGeometry(2.62, 0.03, 6, 96)), edgeMaterial, false)
  edgeRing.rotation.x = Math.PI / 2
  edgeRing.position.y = -0.5
  world.add(edgeRing)
  let edgeFlash = 0

  // Grapple rings, hovering.
  const grappleRing = geo(new THREE.TorusGeometry(0.17, 0.04, 10, 32))
  for (const at of RINGS) {
    const ring = mesh(grappleRing, mats.get(YELLOW, { emissive: YELLOW, emissiveIntensity: 0.8, roughness: 0.35 }))
    ring.position.copy(at)
    world.add(ring)
  }

  // The players: chunky capsules with a visor, glowing eyes, hands, feet, and a hook launcher on the back.
  const capsule = geo(new THREE.CapsuleGeometry(0.17, 0.2, 4, 10))
  const visorGeometry = geo(new RoundedBoxGeometry(0.25, 0.12, 0.1, 2, 0.04))
  const eyeGeometry = geo(new THREE.BoxGeometry(0.035, 0.05, 0.02))
  const limbGeometry = geo(new THREE.IcosahedronGeometry(0.065, 1))
  const packGeometry = geo(new RoundedBoxGeometry(0.16, 0.2, 0.1, 2, 0.03))
  const nozzleGeometry = geo(new THREE.CylinderGeometry(0.03, 0.04, 0.12, 8))
  const buildPlayer = (index: number, colour: string, spawn: THREE.Vector3): Player => {
    const group = new THREE.Group()
    const body = mesh(capsule, mats.get(colour, { roughness: 0.45 }))
    body.position.y = BODY_Y
    const visor = mesh(visorGeometry, mats.get(DEEP, { roughness: 0.2 }))
    visor.position.set(0, 0.37, 0.12)
    const eyeMaterial = mats.get('#ffffff', { emissive: '#ffffff', emissiveIntensity: 1.8 })
    for (const x of [-0.05, 0.05]) {
      const eye = mesh(eyeGeometry, eyeMaterial, false)
      eye.position.set(x, 0.375, 0.172)
      group.add(eye)
    }
    for (const x of [-0.21, 0.21]) {
      const hand = mesh(limbGeometry, mats.get(colour, { roughness: 0.45 }))
      hand.position.set(x, 0.24, 0.02)
      group.add(hand)
    }
    for (const x of [-0.08, 0.08]) {
      const footMesh = mesh(limbGeometry, mats.get(DEEP))
      footMesh.position.set(x, 0.035, 0.03)
      footMesh.scale.set(1, 0.6, 1.3)
      group.add(footMesh)
    }
    const pack = mesh(packGeometry, mats.get(YELLOW, { roughness: 0.4 }))
    pack.position.set(0, 0.3, -0.17)
    const nozzle = mesh(nozzleGeometry, mats.get(DEEP))
    nozzle.position.set(0, 0.44, -0.17)
    group.add(body, visor, pack, nozzle)
    world.add(group)
    return {
      index, colour: new THREE.Color(colour), spawn: spawn.clone(),
      p: spawn.clone(), prev: spawn.clone(), v: new THREE.Vector3(),
      grounded: true, alive: true, respawnAt: 0, heading: 0, squash: 0, group,
      rope: { state: 'idle', hook: new THREE.Vector3(), target: new THREE.Vector3(), land: new THREE.Vector3(), victim: null, length: 0, retract: 0, points: new Float32Array(ROPE_N * 3), before: new Float32Array(ROPE_N * 3) },
    }
  }
  const players = SPAWN_PAD.map((pad, i) => buildPlayer(i, i ? MAGENTA : TEAL, new THREE.Vector3(PLATFORMS[pad].x, PLATFORMS[pad].y, PLATFORMS[pad].z)))
  const [p1, p2] = players

  // Ropes: each segment is an instance of one thin cylinder, and the hook is a small cone at the rope's end.
  const segmentGeometry = geo(new THREE.CylinderGeometry(0.018, 0.018, 1, 6))
  segmentGeometry.translate(0, 0.5, 0)
  const ropeSegments = new THREE.InstancedMesh(segmentGeometry, mats.get(YELLOW, { emissive: YELLOW, emissiveIntensity: 0.35, roughness: 0.5 }), players.length * (ROPE_N - 1))
  ropeSegments.castShadow = true
  ropeSegments.frustumCulled = false
  world.add(ropeSegments)
  const hookGeometry = geo(new THREE.ConeGeometry(0.055, 0.14, 6))
  hookGeometry.rotateX(Math.PI / 2)
  const hooks = players.map(() => {
    const hook = mesh(hookGeometry, mats.get('#f4f1ff', { roughness: 0.3, metalness: 0.4 }))
    hook.visible = false
    world.add(hook)
    return hook
  })

  // Sparks: a fixed pool of points, each with a life that runs from 1 to 0.
  const sparkPositions = new Float32Array(SPARKS * 3)
  const sparkVelocity = new Float32Array(SPARKS * 3)
  const sparkLife = new Float32Array(SPARKS)
  const sparkColours = new Float32Array(SPARKS * 3)
  const sparkGeometry = geo(new THREE.BufferGeometry())
  const sparkPosition = new THREE.BufferAttribute(sparkPositions, 3).setUsage(THREE.DynamicDrawUsage)
  const sparkLifeAttribute = new THREE.BufferAttribute(sparkLife, 1).setUsage(THREE.DynamicDrawUsage)
  const sparkColour = new THREE.BufferAttribute(sparkColours, 3).setUsage(THREE.DynamicDrawUsage)
  sparkGeometry.setAttribute('position', sparkPosition)
  sparkGeometry.setAttribute('aLife', sparkLifeAttribute)
  sparkGeometry.setAttribute('aColor', sparkColour)
  const sparkUniforms = { uScale: { value: 600 } }
  const sparks = new THREE.Points(sparkGeometry, own(new THREE.ShaderMaterial({ uniforms: sparkUniforms, vertexShader: SPARK_VERTEX, fragmentShader: SPARK_FRAGMENT, ...GLOW })))
  sparks.frustumCulled = false
  sparks.renderOrder = 4
  world.add(sparks)
  let sparkCursor = 0
  let sparksAlive = 0

  // A shockwave ring per player, spreading flat where that player was eliminated.
  const shockGeometry = geo(new THREE.RingGeometry(0.0, 1, 64, 1))
  shockGeometry.rotateX(-Math.PI / 2)
  const shocks = players.map((player) => {
    const uniforms = { uColor: { value: player.colour.clone() }, uAlpha: { value: 0 } }
    const ring = new THREE.Mesh(shockGeometry, own(new THREE.ShaderMaterial({ uniforms, vertexShader: SHOCK_VERTEX, fragmentShader: SHOCK_FRAGMENT, ...GLOW, side: THREE.DoubleSide })))
    ring.visible = false
    ring.renderOrder = 4
    world.add(ring)
    return { ring, uniforms, at: new THREE.Vector3() }
  })

  // The scoreboard: P1, VS, P2 painted once on a canvas, and three pips a side that light with each knockout.
  const board = new THREE.Group()
  board.position.set(-1.35, 1.55, -1.85)
  board.rotation.set(0.1, 0.55, 0)
  world.add(board)
  const boardBody = mesh(geo(new RoundedBoxGeometry(1.8, 0.7, 0.14, 3, 0.06)), mats.get(DEEP, { roughness: 0.4 }))
  const boardFrame = mesh(geo(new RoundedBoxGeometry(1.9, 0.8, 0.1, 3, 0.07)), mats.get(YELLOW, { roughness: 0.4 }))
  boardFrame.position.z = -0.03
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const paint = canvas.getContext('2d')
  if (paint) {
    paint.fillStyle = DEEP
    paint.fillRect(0, 0, 512, 128)
    paint.font = '900 84px system-ui, -apple-system, Segoe UI, sans-serif'
    paint.textAlign = 'center'
    paint.textBaseline = 'middle'
    paint.fillStyle = TEAL
    paint.fillText('P1', 96, 68)
    paint.fillStyle = MAGENTA
    paint.fillText('P2', 416, 68)
    paint.fillStyle = YELLOW
    paint.font = '900 60px system-ui, -apple-system, Segoe UI, sans-serif'
    paint.fillText('VS', 256, 68)
  }
  const boardTexture = own(new THREE.CanvasTexture(canvas))
  boardTexture.colorSpace = THREE.SRGBColorSpace
  const boardFace = new THREE.Mesh(geo(new THREE.PlaneGeometry(1.64, 0.41)), own(new THREE.MeshBasicMaterial({ map: boardTexture, color: new THREE.Color(1.3, 1.3, 1.3) })))
  boardFace.position.set(0, 0.1, 0.071)
  board.add(boardFrame, boardBody, boardFace)
  const pipGeometry = geo(new RoundedBoxGeometry(0.14, 0.09, 0.04, 1, 0.02))
  const pipOff = mats.get('#3b2d6b', { roughness: 0.5 })
  const pipOn = [mats.get(TEAL, { emissive: TEAL, emissiveIntensity: 1.6 }), mats.get(MAGENTA, { emissive: MAGENTA, emissiveIntensity: 1.6 })]
  const pips = [0, 1].map((side) => [0, 1, 2].map((k) => {
    const pip = mesh(pipGeometry, pipOff, false)
    pip.position.set((side ? 1 : -1) * (0.38 + k * 0.18), -0.2, 0.08)
    board.add(pip)
    return pip
  }))
  const score = [0, 0]

  // The controllers, one per player, hovering at the front corners. A player's face button lights as it fires.
  const padBody = geo(new RoundedBoxGeometry(0.64, 0.13, 0.32, 3, 0.06))
  const gripGeometry = geo(new THREE.CapsuleGeometry(0.075, 0.16, 4, 8))
  const dpadGeometry = geo(new THREE.BoxGeometry(0.12, 0.03, 0.035))
  const buttonGeometry = geo(new THREE.CylinderGeometry(0.028, 0.028, 0.03, 12))
  const stickGeometry = geo(new THREE.CylinderGeometry(0.04, 0.045, 0.05, 12))
  const pressed = [0, 0]
  const fireButtons = players.map((_, i) => {
    const colour = i ? MAGENTA : TEAL
    const pad = new THREE.Group()
    pad.position.set(i ? 1.95 : -1.95, -0.62, i ? 1.3 : 1.55)
    pad.rotation.set(0.75, i ? -0.45 : 0.35, i ? -0.12 : 0.12, 'YXZ')
    pad.scale.setScalar(1.25)
    const body = mesh(padBody, mats.get(colour, { roughness: 0.4 }))
    pad.add(body)
    for (const side of [-1, 1]) {
      const grip = mesh(gripGeometry, mats.get(colour, { roughness: 0.4 }))
      grip.position.set(side * 0.24, -0.03, 0.15)
      grip.rotation.set(Math.PI / 2 - 0.4, 0, side * 0.25)
      pad.add(grip)
    }
    const dark = mats.get(DEEP, { roughness: 0.35 })
    for (const turn of [0, Math.PI / 2]) {
      const arm = mesh(dpadGeometry, dark, false)
      arm.position.set(-0.17, 0.075, -0.02)
      arm.rotation.y = turn
      pad.add(arm)
    }
    for (const x of [-0.06, 0.06]) {
      const stick = mesh(stickGeometry, dark)
      stick.position.set(x, 0.08, 0.07)
      pad.add(stick)
    }
    const fire = own(new THREE.MeshStandardMaterial({ color: YELLOW, emissive: YELLOW, emissiveIntensity: 0.2, roughness: 0.35, flatShading: true }))
    const faces: [number, number, THREE.Material][] = [[0.17, 0.03, fire], [0.215, -0.015, mats.get('#ffffff')], [0.125, -0.015, mats.get(i ? TEAL : MAGENTA)], [0.17, -0.06, dark]]
    for (const [x, z, material] of faces) {
      const button = mesh(buttonGeometry, material, false)
      button.position.set(x, 0.075, z)
      pad.add(button)
    }
    world.add(pad)
    return fire
  })

  // The aim reticle shows where a press would fire.
  const reticle = new THREE.Mesh(geo(new THREE.RingGeometry(0.09, 0.13, 32)), own(new THREE.MeshBasicMaterial({ color: YELLOW, transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide })))
  reticle.renderOrder = 5
  reticle.visible = false
  world.add(reticle)

  // Simulation state.
  let active = false
  let simTime = 0
  let lastEvent = 0
  let carry = 0
  let lastHit = -1
  let chosen = 0
  let beat = 0
  let dirty = false
  /** One delayed fire, for the close's second swing. `at` is Infinity when nothing waits. */
  const scheduled = { at: Infinity, player: p2, target: RINGS[0], land: RING_LANDS[0] }
  const deaths: { player: Player; at: THREE.Vector3; time: number }[] = players.map((player) => ({ player, at: new THREE.Vector3(), time: -Infinity }))
  const scratch = new THREE.Vector3()
  const scratch2 = new THREE.Vector3()
  const hand = new THREE.Vector3()
  const hitColour = new THREE.Color(YELLOW)

  const centreOf = (player: Player, out: THREE.Vector3) => out.copy(player.p).setY(player.p.y + BODY_Y)
  const handOf = (player: Player, out: THREE.Vector3) => out.copy(player.p).setY(player.p.y + HAND_Y)

  /** The top of the platform under (x, z) that a falling foot at `y` from `fromY` would land on, or null. */
  const landing = (x: number, z: number, y: number, fromY: number) => {
    for (const pad of PLATFORMS) {
      const reach = pad.r * Math.cos(Math.PI / pad.sides) - 0.04
      if ((x - pad.x) ** 2 + (z - pad.z) ** 2 > reach * reach) continue
      if (y <= pad.y && fromY >= pad.y - 0.06) return pad.y
    }
    return null
  }
  const standing = (player: Player) => {
    for (const pad of PLATFORMS) {
      const reach = pad.r * Math.cos(Math.PI / pad.sides) - 0.04
      if (Math.abs(player.p.y - pad.y) < 0.02 && (player.p.x - pad.x) ** 2 + (player.p.z - pad.z) ** 2 <= reach * reach) return true
    }
    return false
  }

  const wake = () => {
    active = true
    dirty = true
    lastEvent = simTime
    ctx.invalidate()
  }

  const burst = (at: THREE.Vector3, count: number, colour: THREE.Color, speed: number) => {
    for (let k = 0; k < count; k++) {
      const i = sparkCursor
      sparkCursor = (sparkCursor + 1) % SPARKS
      const theta = Math.random() * Math.PI * 2
      const lift = Math.random() * 0.9 + 0.1
      const s = speed * (0.4 + Math.random() * 0.6)
      sparkPositions[i * 3] = at.x
      sparkPositions[i * 3 + 1] = at.y
      sparkPositions[i * 3 + 2] = at.z
      sparkVelocity[i * 3] = Math.cos(theta) * s * (1 - lift * 0.5)
      sparkVelocity[i * 3 + 1] = lift * s
      sparkVelocity[i * 3 + 2] = Math.sin(theta) * s * (1 - lift * 0.5)
      sparkLife[i] = 0.7 + Math.random() * 0.3
      const white = Math.random() * 0.6
      sparkColours[i * 3] = colour.r + (1 - colour.r) * white
      sparkColours[i * 3 + 1] = colour.g + (1 - colour.g) * white
      sparkColours[i * 3 + 2] = colour.b + (1 - colour.b) * white
    }
    sparksAlive = SPARKS
  }

  /** Sends `player`'s hook at `target` to grapple and land on `land`, or at `victim` to tether it. */
  const fire = (player: Player, target: THREE.Vector3 | null, land: THREE.Vector3 | null, victim: Player | null = null) => {
    if (!player.alive) return
    const rope = player.rope
    rope.state = 'flying'
    rope.victim = victim
    if (target) rope.target.copy(target)
    if (land) rope.land.copy(land)
    handOf(player, rope.hook)
    for (let i = 0; i < ROPE_N * 3; i += 3) {
      rope.points[i] = rope.before[i] = rope.hook.x
      rope.points[i + 1] = rope.before[i + 1] = rope.hook.y
      rope.points[i + 2] = rope.before[i + 2] = rope.hook.z
    }
    pressed[player.index] = 1
    wake()
  }

  const stow = (player: Player) => {
    if (player.rope.state === 'attached' || player.rope.state === 'flying') {
      player.rope.state = 'retracting'
      player.rope.retract = 0
    }
  }

  const eliminate = (player: Player) => {
    player.alive = false
    player.respawnAt = simTime + RESPAWN_S
    player.group.visible = false
    stow(player)
    for (const other of players) if (other.rope.victim === player) stow(other)
    const other = players[1 - player.index]
    score[other.index] = Math.min(3, score[other.index] + 1)
    // The burst and the shockwave mark the spot on the knockout ring nearest the fall, so they stay in frame.
    const death = deaths[player.index]
    const reach = Math.min(1, 2.5 / Math.max(1e-6, Math.hypot(player.p.x, player.p.z)))
    death.at.set(player.p.x * reach, -0.5, player.p.z * reach)
    death.time = simTime
    burst(death.at, 48, player.colour, 3.2)
    shocks[player.index].at.copy(death.at)
    edgeFlash = 1
    lastEvent = simTime
  }

  const respawn = (player: Player) => {
    player.alive = true
    player.group.visible = true
    player.p.copy(player.spawn).setY(player.spawn.y + 1.6)
    player.prev.copy(player.p)
    player.v.set(0, 0, 0)
    player.grounded = false
    lastEvent = simTime
  }

  /** Puts every player on its pad, stows the ropes, clears the sparks and the score. */
  const reset = () => {
    for (const player of players) {
      player.alive = true
      player.group.visible = true
      player.p.copy(player.spawn)
      player.prev.copy(player.spawn)
      player.v.set(0, 0, 0)
      player.grounded = true
      player.squash = 0
      player.rope.state = 'idle'
      player.rope.victim = null
    }
    sparkLife.fill(0)
    sparksAlive = 0
    score[0] = score[1] = 0
    scheduled.at = Infinity
    for (const death of deaths) death.time = -Infinity
    edgeFlash = 0
    pressed[0] = pressed[1] = 0
    beat = 0
    active = false
    dirty = false
  }

  const ropeStep = (player: Player, dt: number) => {
    const rope = player.rope
    if (rope.state === 'idle') return
    handOf(player, hand)
    if (rope.state === 'flying') {
      const goal = rope.victim ? centreOf(rope.victim, scratch) : rope.target
      const gap = scratch2.subVectors(goal, rope.hook)
      const distance = gap.length()
      if (distance <= HOOK_SPEED * dt || !rope.victim?.alive && rope.victim) {
        if (rope.victim && !rope.victim.alive) { stow(player); return }
        rope.hook.copy(goal)
        rope.state = 'attached'
        rope.length = rope.hook.distanceTo(hand)
      } else rope.hook.addScaledVector(gap, (HOOK_SPEED * dt) / distance)
    } else if (rope.state === 'attached') {
      const pull = 1 - Math.exp(-dt / 0.06)
      if (rope.victim) {
        // A tether: the firer holds still, and the reel draws the victim toward the firer's hand.
        const victim = rope.victim
        const gap = scratch2.subVectors(hand, centreOf(victim, scratch))
        const distance = gap.length()
        rope.length = distance
        if (distance < 0.3) stow(player)
        else {
          victim.v.lerp(gap.multiplyScalar(TETHER_REEL / distance), pull)
          victim.grounded = false
        }
        centreOf(victim, rope.hook)
      } else {
        // A grapple: the hook holds, and the reel draws the firer along the rope until the hand nears the hook. The
        // player then lets go on an arc that lands on rope.land.
        const gap = scratch2.subVectors(rope.hook, hand)
        const distance = gap.length()
        rope.length = distance
        if (distance < LET_GO) {
          stow(player)
          const flight = Math.min(0.7, Math.max(0.35, player.p.distanceTo(rope.land) / 3))
          player.v.subVectors(rope.land, player.p).divideScalar(flight)
          player.v.y -= 0.5 * GRAVITY * flight
          player.grounded = false
        } else {
          player.v.lerp(gap.multiplyScalar(REEL / distance), pull)
          player.grounded = false
        }
      }
    } else if (rope.state === 'retracting') {
      rope.retract += dt / 0.22
      rope.hook.lerp(hand, Math.min(1, rope.retract))
      if (rope.retract >= 1) {
        rope.state = 'idle'
        rope.victim = null
      }
    }
  }

  /** The rope's verlet chain between the hand and the hook, sagging under gravity when slack. */
  const ropeVerlet = (player: Player, dt: number) => {
    const rope = player.rope
    if (rope.state === 'idle') return
    handOf(player, hand)
    const span = rope.hook.distanceTo(hand)
    const rest = (span * (rope.state === 'attached' ? 1.015 : 1.05)) / (ROPE_N - 1)
    const points = rope.points
    const before = rope.before
    for (let i = 1; i < ROPE_N - 1; i++) {
      const k = i * 3
      for (let a = 0; a < 3; a++) {
        const now = points[k + a]
        points[k + a] = now + (now - before[k + a]) * 0.97 + (a === 1 ? GRAVITY * dt * dt : 0)
        before[k + a] = now
      }
    }
    const last = (ROPE_N - 1) * 3
    points[0] = hand.x
    points[1] = hand.y
    points[2] = hand.z
    points[last] = rope.hook.x
    points[last + 1] = rope.hook.y
    points[last + 2] = rope.hook.z
    for (let iteration = 0; iteration < 10; iteration++) {
      for (let i = 0; i < ROPE_N - 1; i++) {
        const a = i * 3
        const b = a + 3
        const dx = points[b] - points[a]
        const dy = points[b + 1] - points[a + 1]
        const dz = points[b + 2] - points[a + 2]
        const d = Math.hypot(dx, dy, dz) || 1e-6
        const push = (d - rest) / d
        const wa = i === 0 ? 0 : i + 1 === ROPE_N - 1 ? 1 : 0.5
        const wb = i + 1 === ROPE_N - 1 ? 0 : i === 0 ? 1 : 0.5
        points[a] += dx * push * wa
        points[a + 1] += dy * push * wa
        points[a + 2] += dz * push * wa
        points[b] -= dx * push * wb
        points[b + 1] -= dy * push * wb
        points[b + 2] -= dz * push * wb
      }
    }
  }

  const step = (dt: number) => {
    simTime += dt
    if (scheduled.at <= simTime) {
      scheduled.at = Infinity
      fire(scheduled.player, scheduled.target, scheduled.land)
    }
    for (const player of players) {
      if (!player.alive) {
        if (simTime >= player.respawnAt) respawn(player)
        continue
      }
      player.prev.copy(player.p)
      if (!player.grounded) player.v.y += GRAVITY * dt
      player.p.addScaledVector(player.v, dt)
    }
    for (const player of players) ropeStep(player, dt)
    for (const player of players) {
      if (!player.alive) continue
      if (player.grounded) {
        player.v.y = 0
        const grip = Math.exp(-12 * dt)
        player.v.x *= grip
        player.v.z *= grip
        if (Math.hypot(player.v.x, player.v.z) < 0.02) player.v.set(0, 0, 0)
        if (!standing(player)) player.grounded = false
      } else if (player.v.y <= 0) {
        const top = landing(player.p.x, player.p.z, player.p.y, player.prev.y)
        if (top !== null) {
          player.squash = Math.min(0.35, -player.v.y / 14)
          player.p.y = top
          player.v.y = 0
          player.grounded = true
        }
      }
      if (player.p.y < KO_Y) eliminate(player)
    }
    // Two players who touch separate, throw sparks, and the faster one is knocked away.
    if (p1.alive && p2.alive) {
      const a = centreOf(p1, scratch)
      const b = centreOf(p2, scratch2)
      const d = a.distanceTo(b)
      if (d < HIT_DISTANCE && d > 1e-4) {
        const n = b.sub(a).divideScalar(d)
        const closing = p1.v.dot(n) - p2.v.dot(n)
        // The bodies part sideways only, so a player standing on a platform stays on its top.
        const overlap = (HIT_DISTANCE - d) / 2 / Math.max(0.2, Math.hypot(n.x, n.z))
        p1.p.x -= n.x * overlap
        p1.p.z -= n.z * overlap
        p2.p.x += n.x * overlap
        p2.p.z += n.z * overlap
        if (closing > 1 && simTime - lastHit > 0.3) {
          lastHit = simTime
          const knocked = p2.v.length() > p1.v.length() ? p2 : p1
          const holder = knocked === p2 ? p1 : p2
          const away = scratch.subVectors(knocked.p, holder.p).setY(0)
          if (away.lengthSq() < 1e-6) away.set(1, 0, 0)
          away.normalize()
          knocked.v.copy(away).multiplyScalar(KNOCK_OUT).setY(KNOCK_UP)
          knocked.grounded = false
          holder.v.addScaledVector(away, -0.6)
          for (const player of players) stow(player)
          burst(centreOf(p1, scratch2).lerp(centreOf(p2, hand), 0.5), 40, hitColour, 2.6)
          lastEvent = simTime
        }
      }
    }
    for (const player of players) ropeVerlet(player, dt)
    // Sparks fall and fade.
    let alive = 0
    for (let i = 0; i < SPARKS; i++) {
      if (sparkLife[i] <= 0) continue
      sparkLife[i] = Math.max(0, sparkLife[i] - dt * 1.4)
      sparkVelocity[i * 3 + 1] += GRAVITY * 0.6 * dt
      for (let a = 0; a < 3; a++) {
        sparkVelocity[i * 3 + a] *= 1 - 1.5 * dt
        sparkPositions[i * 3 + a] += sparkVelocity[i * 3 + a] * dt
      }
      if (sparkLife[i] > 0) alive++
    }
    sparksAlive = alive
  }

  /** True once nothing in the arena moves or waits. */
  const settled = () => {
    for (const player of players) if (!player.alive || !player.grounded || player.v.lengthSq() !== 0 || player.rope.state !== 'idle') return false
    for (const death of deaths) if (simTime - death.time < 0.8) return false
    return sparksAlive === 0 && scheduled.at === Infinity
  }

  // Picking by ray tests against simple shapes, so no frame allocates: the other player and the grapple rings as
  // spheres, and each platform's top as a disc at its height. The nearest hit wins.
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const ray = new THREE.Ray()
  const sphere = new THREE.Sphere()
  const topPlane = new THREE.Plane()
  const hitPoint = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const aim = { point: new THREE.Vector3(), normal: new THREE.Vector3(), land: new THREE.Vector3(), victim: null as Player | null }
  const pick = (x: number, y: number) => {
    const shooter = players[chosen]
    if (!shooter.alive) return false
    ndc.set(x, y)
    raycaster.setFromCamera(ndc, camera)
    // The ray in the world group's frame, which is world space lifted by the home page's hover.
    ray.copy(raycaster.ray)
    ray.origin.y -= world.position.y
    let best = Infinity
    const rival = players[1 - chosen]
    if (rival.alive && ray.intersectSphere(sphere.set(centreOf(rival, scratch), 0.3), hitPoint)) {
      best = hitPoint.distanceTo(ray.origin)
      aim.point.copy(hitPoint)
      aim.normal.copy(ray.direction).negate()
      aim.victim = rival
    }
    for (let k = 0; k < RINGS.length; k++) {
      if (!ray.intersectSphere(sphere.set(RINGS[k], 0.24), hitPoint)) continue
      const d = hitPoint.distanceTo(ray.origin)
      if (d >= best) continue
      best = d
      aim.point.copy(RINGS[k])
      aim.land.copy(RING_LANDS[k])
      aim.normal.copy(ray.direction).negate()
      aim.victim = null
    }
    for (const pad of PLATFORMS) {
      if (!ray.intersectPlane(topPlane.set(up, -pad.y), hitPoint)) continue
      const reach = pad.r * Math.cos(Math.PI / pad.sides)
      if ((hitPoint.x - pad.x) ** 2 + (hitPoint.z - pad.z) ** 2 > reach * reach) continue
      const d = hitPoint.distanceTo(ray.origin)
      if (d >= best) continue
      best = d
      aim.point.copy(hitPoint)
      aim.land.copy(hitPoint)
      aim.normal.copy(up)
      aim.victim = null
    }
    return best < Infinity
  }

  const pose = { distance: 0, yaw: 0, pitch: 0, focusX: 0.5, focusY: 0.5 }
  const view = (f: IslandFrame) => {
    if (f.mode === 'home') {
      pose.distance = 9.4 - 0.4 * f.hover
      pose.yaw = 0.28 + f.tiltX * 0.28
      pose.pitch = 0.5 - f.tiltY * 0.1
      pose.focusX = 0.5
      pose.focusY = 0.5
      return pose
    }
    const a = f.local('arrival')
    const w = f.local('work')
    const c = f.local('impact')
    const dive = smoother(ramp(a, 0, 0.8))
    pose.distance = (f.narrow ? 30 : 17) - (f.narrow ? 6 : 4.8) * dive + 0.6 * smoother(ramp(c, 0.2, 0.8)) + 0.6 * f.push
    pose.yaw = 0.7 - 0.5 * dive + 0.25 * smoother(ramp(w, 0, 0.8)) - 0.3 * smoother(ramp(c, 0, 0.7)) + f.tiltX * 0.16 + f.dragYaw
    pose.pitch = 0.72 - 0.26 * dive + 0.04 * smoother(ramp(w, 0, 0.3)) - f.tiltY * 0.08
    pose.focusX = f.narrow ? 0.5 : 0.36
    // On phones the arena sits a little lower than the shared 0.7, so the scoreboard clears the stops along the top.
    pose.focusY = f.narrow ? 0.65 : 0.5
    return pose
  }

  // The output is one object reused every frame, with preallocated anchor and bound vectors. The arena has no
  // panels: colour, the scoreboard, and the controllers already tell the players apart.
  const anchorArena = new THREE.Vector3()
  const anchorRival = new THREE.Vector3()
  const anchors = new Map<string, THREE.Vector3 | null>([['arena', anchorArena], ['rival', anchorRival]])
  const bounds = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  const out: IslandOutput = { anchors, panels: [], bounds, focusY: 0.5, busy: false, ready: true }

  const projected = new THREE.Vector3()
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const from = new THREE.Vector3()
  const to = new THREE.Vector3()
  const scale = new THREE.Vector3()
  let journeyBefore = false

  return {
    scene,
    camera,
    update(f): IslandOutput {
      const journey = f.mode === 'journey'
      const w = journey ? f.local('work') : 0
      const c = journey ? f.local('impact') : 0
      const v = view(f)
      world.position.y = journey ? 0 : 0.1 * f.hover
      for (const { light, base } of lights) light.intensity = base * (1 + 0.2 * f.push)
      frame(camera, TARGET, v.distance, v.yaw, v.pitch, f.aspect, v.focusX, v.focusY)
      scene.updateMatrixWorld()

      // The bout: the scroll fires each beat once, in order, each after the arena has settled from the last. The
      // arena resets on the home page and when the scroll returns before the work act.
      if (!journey || journeyBefore !== journey) {
        if (dirty) reset()
      } else if (w < 0.03 && c === 0) {
        if (dirty) reset()
      } else if (!active || simTime - lastEvent > 2.5) {
        if (beat < 1 && w >= 0.14) {
          beat = 1
          fire(p1, RINGS[0], RING_LANDS[0])
        } else if (beat === 1 && w >= 0.5) {
          beat = 2
          fire(p1, null, null, p2)
        } else if (beat === 2 && c >= 0.15) {
          beat = 3
          fire(p1, RINGS[1], RING_LANDS[1])
          scheduled.at = simTime + 0.25
          scheduled.player = p2
          scheduled.target = RINGS[0]
          scheduled.land = RING_LANDS[0]
          wake()
        }
      }
      journeyBefore = journey

      if (active) {
        carry = Math.min(carry + f.dt, 0.1)
        while (carry >= STEP) {
          step(STEP)
          carry -= STEP
        }
        if (settled() || simTime - lastEvent > SETTLE_LIMIT) {
          if (!settled()) {
            for (const player of players) {
              if (!player.alive) respawn(player)
              player.rope.state = 'idle'
              player.v.set(0, 0, 0)
              if (!standing(player)) player.p.copy(player.spawn)
              player.grounded = true
            }
            sparkLife.fill(0)
            sparksAlive = 0
            scheduled.at = Infinity
          }
          active = false
          carry = 0
        }
      }

      // Players: squash after landing, and face the way they move, else each other.
      let easing = false
      for (const player of players) {
        const rival = players[1 - player.index]
        const moving = Math.hypot(player.v.x, player.v.z) > 0.3
        const goal = moving ? Math.atan2(player.v.x, player.v.z) : Math.atan2(rival.spawn.x - player.p.x, rival.spawn.z - player.p.z)
        const turn = Math.atan2(Math.sin(goal - player.heading), Math.cos(goal - player.heading))
        const heading = ease(player.heading, player.heading + turn, f.dt, 0.08)
        if (heading !== player.heading + turn) easing = true
        player.heading = dirty ? heading : goal
        player.squash = ease(player.squash, 0, f.dt, 0.09)
        if (player.squash !== 0) easing = true
        player.group.position.copy(player.p)
        player.group.rotation.y = player.heading
        player.group.scale.set(1 + player.squash * 0.6, 1 - player.squash, 1 + player.squash * 0.6)
      }

      // Ropes and hooks.
      let instance = 0
      for (const player of players) {
        const rope = player.rope
        const shown = rope.state !== 'idle'
        hooks[player.index].visible = shown
        for (let i = 0; i < ROPE_N - 1; i++, instance++) {
          if (!shown) {
            ropeSegments.setMatrixAt(instance, matrix.makeScale(0, 0, 0))
            continue
          }
          from.fromArray(rope.points, i * 3)
          to.fromArray(rope.points, (i + 1) * 3)
          const length = from.distanceTo(to)
          quaternion.setFromUnitVectors(up, to.sub(from).normalize())
          ropeSegments.setMatrixAt(instance, matrix.compose(from, quaternion, scale.set(1, Math.max(1e-4, length), 1)))
        }
        if (shown) {
          from.fromArray(rope.points, (ROPE_N - 2) * 3)
          hooks[player.index].position.copy(rope.hook)
          hooks[player.index].lookAt(world.localToWorld(scratch.copy(rope.hook).multiplyScalar(2).sub(from)))
        }
      }
      ropeSegments.instanceMatrix.needsUpdate = true

      sparkPosition.needsUpdate = true
      sparkLifeAttribute.needsUpdate = true
      sparkColour.needsUpdate = true
      sparks.visible = sparksAlive > 0
      sparkUniforms.uScale.value = ctx.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))

      for (let i = 0; i < shocks.length; i++) {
        const shock = shocks[i]
        const age = simTime - deaths[i].time
        const on = age >= 0 && age < 0.8
        shock.ring.visible = on
        if (on) {
          shock.ring.position.copy(shock.at)
          shock.ring.scale.setScalar(0.2 + 1.6 * smoother(age / 0.8))
          shock.uniforms.uAlpha.value = 1 - age / 0.8
        }
      }
      edgeFlash = ease(edgeFlash, 0, f.dt, 0.35)
      if (edgeFlash !== 0) easing = true
      edgeMaterial.emissiveIntensity = 0.9 + 2.5 * edgeFlash

      for (let i = 0; i < 2; i++) {
        pressed[i] = ease(pressed[i], 0, f.dt, 0.25)
        if (pressed[i] !== 0) easing = true
        fireButtons[i].emissiveIntensity = 0.2 + 2.4 * pressed[i] + (journey && i === chosen && w > 0.02 ? 0.5 : 0)
        for (let k = 0; k < 3; k++) pips[i][k].material = k < score[i] ? pipOn[i] : pipOff
      }

      // The reticle follows the pointer over anything a press would fire at.
      const aiming = journey && w > 0.02 && f.pointer.inside && pick(f.pointer.x, f.pointer.y)
      reticle.visible = aiming
      if (aiming) {
        reticle.position.copy(aim.point).addScaledVector(aim.normal, 0.01)
        reticle.lookAt(world.localToWorld(scratch.copy(reticle.position).add(aim.normal)))
        reticle.scale.setScalar(aim.victim ? 2.4 : 1)
      }

      const rival = players[1 - chosen]
      world.localToWorld(anchorArena.set(0.2, 0.02, 0.35))
      world.localToWorld(centreOf(rival, anchorRival).setY(rival.p.y + 0.5))
      anchors.set('rival', rival.alive ? anchorRival : null)
      world.localToWorld(bounds[0].set(0, -2, 0))
      world.localToWorld(bounds[1].set(-1.95, -0.9, 1.55))
      world.localToWorld(bounds[2].set(1.95, -0.9, 1.3))
      projected.copy(TARGET).project(camera)
      out.focusY = projected.y * 0.5 + 0.5
      out.busy = active || easing
      return out
    },
    press(point) {
      if (!pick(point.x, point.y)) return false
      const shooter = players[chosen]
      if (aim.victim) fire(shooter, null, null, aim.victim)
      else fire(shooter, aim.point, aim.land)
      return true
    },
    command(name, value) {
      if (name !== 'player') return
      chosen = value === 'p2' ? 1 : 0
      const player = players[chosen]
      if (player.alive && player.grounded) {
        player.v.y = 2.2
        player.grounded = false
        wake()
      }
    },
    dispose() {
      geometries.forEach((g) => g.dispose())
      owned.forEach((thing) => thing.dispose())
      ropeSegments.dispose()
      mats.dispose()
    },
  }
}

export default createScene
