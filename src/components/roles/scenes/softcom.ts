/**
 * The SoftCom Lab world: a motion-capture stage, a dark slate square ruled in mint, where a jointed wooden mannequin
 * does arm raises, an exercise from a Parkinson's routine, under a glowing pose skeleton of 13 keypoints. A phone on a
 * tripod films it through a frustum of mint light and shows the keypoints it sees on its own screen. A gauge beside
 * the stage fills to the model's 95.4% mean accuracy in controlled video trials, and in the close the published paper,
 * on a mobile platform for Parkinson's care, unfolds from a tri-fold into a large page behind the stage.
 *
 * On the home page the finished stage rests and the mannequin's arms follow the pointer's height. On the journey page
 * the work act switches the phone on, draws the skeleton in, runs the reps with the scroll, and fills the gauge, and the
 * close unfolds the paper. Hovering a keypoint names it, and a click on the mannequin runs one more rep on the clock,
 * which reports busy until it settles.
 *
 * The skeleton's joints are Object3D nodes inside the mannequin's limbs. Every frame reads their world positions once,
 * then poses the glowing bones, the keypoints, and the phone's preview from them, all as instanced meshes.
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GLOW, frame, ramp, smoother, sunlight } from '../kit'
import type { IslandFactory, IslandFrame, IslandOutput, IslandPanel } from '../types'

/** The stage's half width and thickness in world units. Its top is at y 0. */
const STAGE = 1.5
const STAGE_H = 0.09
const TARGET = new THREE.Vector3(0.05, 0.62, -0.1)
/** Where each piece stands on the stage, and its facing in radians about y from +z. */
const FIGURE = { x: -0.25, z: 0.25, yaw: 1.0 }
const RIG = { x: 0.96, z: 0.33 }
const GAUGE = { x: -1.0, z: 0.86, yaw: 0.72 }
const PAPER = { x: 0.48, z: -1.3, yaw: 0.62 }
/** The mannequin's proportions: foot block, thigh, shin, pelvis to neck, upper arm, forearm. */
const BODY = { foot: 0.03, thigh: 0.26, shin: 0.26, spine: 0.36, upper: 0.2, fore: 0.19, shoulder: 0.13, hip: 0.07 }
/** The model's mean accuracy in controlled video trials. */
const ACCURACY = 0.954
/** Seconds one clicked rep takes. */
const REP_S = 1.7
/** The paper's page in world units: three equal panels folded like a letter. */
const PAGE_W = 1.16
const PAGE_H = 1.62
const MINT = new THREE.Color(0.25, 1.5, 1.05)
const PINK = new THREE.Color(1.9, 0.3, 0.55)
/** Keypoint names in skeleton order, the labels hovering shows. */
const KEYPOINTS = ['nose', 'left shoulder', 'right shoulder', 'left elbow', 'right elbow', 'left wrist', 'right wrist', 'left hip', 'right hip', 'left knee', 'right knee', 'left ankle', 'right ankle']
/** Bones as pairs of keypoint indices. */
const BONES: [number, number][] = [[0, 1], [0, 2], [1, 2], [1, 3], [3, 5], [2, 4], [4, 6], [1, 7], [2, 8], [7, 8], [7, 9], [9, 11], [8, 10], [10, 12]]

const GLOW_VERTEX = /* glsl */ `
varying vec3 vColor;
varying float vFacing;
varying vec2 vUv;
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
  vec4 world = modelMatrix * local;
  vFacing = abs(dot(normalize(mat3(modelMatrix) * n), normalize(cameraPosition - world.xyz)));
  gl_Position = projectionMatrix * viewMatrix * world;
}`

const GLOW_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uGain;
varying vec3 vColor;
varying float vFacing;
varying vec2 vUv;
void main() {
#ifdef ALONG
  float a = uGain * (0.35 + 0.65 * vFacing) * (1.0 - vUv.y) * smoothstep(0.0, 0.08, vUv.y);
#else
  float a = uGain * vFacing * vFacing;
#endif
  vec3 c = uColor * vColor * a;
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

/** The stage's top: dark slate ruled in mint every quarter unit, brighter every unit, with the capture square lit. */
const STAGE_FRAGMENT = /* glsl */ `
uniform float uOn;
uniform vec2 uZone;
varying vec2 vXZ;
float line(float v, float step, float width) {
  float d = abs(fract(v / step + 0.5) - 0.5) * step;
  return 1.0 - smoothstep(width * 0.5, width, d);
}
void main() {
  float fine = max(line(vXZ.x, 0.25, 0.006), line(vXZ.y, 0.25, 0.006));
  float bold = max(line(vXZ.x, 1.0, 0.012), line(vXZ.y, 1.0, 0.012));
  vec2 z = abs(vXZ - uZone);
  float zone = (1.0 - smoothstep(0.004, 0.012, abs(max(z.x, z.y) - 0.62))) ;
  vec3 c = vec3(0.012, 0.03, 0.03);
  c += vec3(0.05, 0.3, 0.22) * fine + vec3(0.1, 0.55, 0.42) * bold;
  c += vec3(0.25, 1.4, 1.0) * zone * (0.35 + 0.65 * uOn);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const STAGE_VERTEX = /* glsl */ `
varying vec2 vXZ;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vXZ = position.xz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`

/** The gauge's ring: mint from the top clockwise up to uFill of the way round, a dim track after it. */
const RING_FRAGMENT = /* glsl */ `
uniform float uFill;
varying vec3 vLocal;
void main() {
  float turn = fract(atan(vLocal.x, vLocal.y) / 6.28318530718 + 1.0);
  float on = 1.0 - smoothstep(uFill - 0.002, uFill + 0.002, turn);
  vec3 c = mix(vec3(0.04, 0.08, 0.08), vec3(0.3, 1.7, 1.2) * (0.75 + 0.25 * turn), on * step(0.001, uFill));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const LOCAL_VERTEX = /* glsl */ `
varying vec3 vLocal;
void main() {
  vLocal = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

/** The paper's page, 512 by 712 px: venue line, title, authors, abstract, a figure of the phone and its skeleton, two columns. */
function drawPage(accent: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 712
  const g = canvas.getContext('2d')
  if (!g) return canvas
  const bar = (x: number, y: number, w: number, h: number, fill: string) => {
    g.fillStyle = fill
    g.fillRect(x, y, w, h)
  }
  g.fillStyle = '#fbfbf8'
  g.fillRect(0, 0, 512, 712)
  g.fillStyle = '#5b6b68'
  g.font = '600 17px "JetBrains Mono", "IBM Plex Mono", ui-monospace, Menlo, monospace'
  g.textBaseline = 'top'
  g.fillText('CS & IT-CSCP 2024', 40, 34)
  bar(40, 60, 432, 2, '#d7dedc')
  bar(56, 86, 400, 20, '#1d2826')
  bar(110, 114, 292, 20, '#1d2826')
  bar(150, 150, 70, 9, accent)
  bar(228, 150, 64, 9, '#9aa7a4')
  bar(300, 150, 60, 9, '#9aa7a4')
  for (let i = 0; i < 6; i++) bar(64, 182 + i * 14, i === 5 ? 220 : 384, 6, '#b9c3c1')
  // The figure: a phone filming a figure, with its keypoints.
  bar(56, 286, 400, 182, '#eef3f2')
  g.strokeStyle = '#1d2826'
  g.lineWidth = 4
  g.strokeRect(318, 304, 86, 146)
  bar(326, 314, 70, 126, '#0c1715')
  const joints: [number, number][] = [[361, 330], [347, 350], [375, 350], [337, 334], [385, 334], [333, 318], [389, 318], [352, 392], [370, 392], [350, 414], [372, 414], [349, 434], [373, 434]]
  g.strokeStyle = '#3ff2c2'
  g.lineWidth = 3
  for (const [a, b] of BONES) {
    g.beginPath()
    g.moveTo(joints[a][0], joints[a][1])
    g.lineTo(joints[b][0], joints[b][1])
    g.stroke()
  }
  g.fillStyle = accent
  for (const [x, y] of joints) {
    g.beginPath()
    g.arc(x, y, 3.5, 0, Math.PI * 2)
    g.fill()
  }
  const figure: [number, number][] = joints.map(([x, y]) => [x - 210, y + 4])
  g.strokeStyle = '#3c4a47'
  g.lineWidth = 7
  g.lineCap = 'round'
  for (const [a, b] of BONES) {
    g.beginPath()
    g.moveTo(figure[a][0], figure[a][1])
    g.lineTo(figure[b][0], figure[b][1])
    g.stroke()
  }
  g.beginPath()
  g.arc(figure[0][0], figure[0][1] - 4, 11, 0, Math.PI * 2)
  g.fillStyle = '#3c4a47'
  g.fill()
  bar(64, 480, 300, 6, '#b9c3c1')
  for (let col = 0; col < 2; col++) {
    for (let i = 0; i < 12; i++) bar(40 + col * 226, 508 + i * 14, i % 5 === 4 ? 120 : 206, 6, '#c8d0ce')
  }
  bar(244, 690, 24, 6, '#c8d0ce')
  return canvas
}

/** The gauge's face: the accuracy and its caption in mint on a transparent 256 by 256 canvas. */
function drawGaugeFace() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const g = canvas.getContext('2d')
  if (!g) return canvas
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#c9fff0'
  g.font = '600 64px "JetBrains Mono", "IBM Plex Mono", ui-monospace, Menlo, monospace'
  g.fillText('95.4%', 128, 116)
  g.fillStyle = '#5fe6bf'
  g.font = '500 22px "JetBrains Mono", "IBM Plex Mono", ui-monospace, Menlo, monospace'
  g.fillText('mean accuracy', 128, 172)
  return canvas
}

/** The phone's viewfinder: corner brackets and a recording dot on a near-black 128 by 256 canvas. */
function drawViewfinder(accent: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 256
  const g = canvas.getContext('2d')
  if (!g) return canvas
  g.fillStyle = '#050b0a'
  g.fillRect(0, 0, 128, 256)
  g.strokeStyle = '#2f8f74'
  g.lineWidth = 3
  const corner = (x: number, y: number, dx: number, dy: number) => {
    g.beginPath()
    g.moveTo(x, y + dy * 16)
    g.lineTo(x, y)
    g.lineTo(x + dx * 16, y)
    g.stroke()
  }
  corner(12, 30, 1, 1)
  corner(116, 30, -1, 1)
  corner(12, 226, 1, -1)
  corner(116, 226, -1, -1)
  g.fillStyle = accent
  g.beginPath()
  g.arc(20, 14, 5, 0, Math.PI * 2)
  g.fill()
  return canvas
}

const createScene: IslandFactory = (ctx) => {
  const scene = new THREE.Scene()
  scene.environment = ctx.environment
  scene.environmentIntensity = 0.45
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80)
  // An even, cool light: a white key from the front left, a mint sky fill, and a pale rim.
  const lights = sunlight(scene, { sun: '#f5fffb', sky: '#bff0e2', ground: '#0a1312' })
  lights[0].light.position.set(-3.2, 5.4, 3.4)
  lights[0].base = 2.2
  lights[1].base = 1.0
  lights[2].light.color.set('#9ff5dc')
  lights[2].base = 1.2

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
  const matte = (color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) =>
    own(new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...extra }))
  const glow = (color: THREE.Color, gain: number, along = false, side: THREE.Side = THREE.FrontSide) =>
    own(new THREE.ShaderMaterial({
      ...GLOW,
      side,
      defines: along ? { ALONG: '' } : {},
      uniforms: { uColor: { value: color.clone() }, uGain: { value: gain } },
      vertexShader: GLOW_VERTEX,
      fragmentShader: GLOW_FRAGMENT,
    }))
  const accent = ctx.facts.accent
  const slate = matte('#1d2b2a', { roughness: 0.5, metalness: 0.3 })
  const white = matte('#eef4f2', { roughness: 0.45 })
  const scratch = new THREE.Matrix4()
  const tint = new THREE.Color()

  const placed = <T extends THREE.Object3D>(object: T, x: number, z: number, yaw = 0) => {
    object.position.set(x, 0, z)
    object.rotation.y = yaw
    object.updateMatrix()
    world.add(object)
    return object
  }

  // The capture stage.
  const stageUniforms = { uOn: { value: 0 }, uZone: { value: new THREE.Vector2(FIGURE.x, FIGURE.z) } }
  {
    const slab = mesh(keep(new RoundedBoxGeometry(STAGE * 2, STAGE_H, STAGE * 2, 3, 0.03)), white, false)
    slab.position.y = -STAGE_H / 2 - 0.002
    const topGeometry = keep(new THREE.PlaneGeometry(STAGE * 2 - 0.08, STAGE * 2 - 0.08))
    topGeometry.rotateX(-Math.PI / 2)
    const top = new THREE.Mesh(topGeometry, own(new THREE.ShaderMaterial({ uniforms: stageUniforms, vertexShader: STAGE_VERTEX, fragmentShader: STAGE_FRAGMENT })))
    top.position.y = 0.0005
    top.receiveShadow = false
    const rimGeometry = keep(new THREE.BoxGeometry(STAGE * 2 - 0.04, 0.012, 0.012))
    const rimMaterial = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.5, 1.05) }))
    const rims = [0, 1, 2, 3].map((k) => {
      const rim = new THREE.Mesh(rimGeometry, rimMaterial)
      rim.rotation.y = (k * Math.PI) / 2
      rim.position.set(Math.sin((k * Math.PI) / 2) * (STAGE - 0.02), 0.004, Math.cos((k * Math.PI) / 2) * (STAGE - 0.02))
      return rim
    })
    world.add(slab, top, ...rims)
    // A shadow catcher: the shader top takes no light, so a shadow-only plane darkens it under the pieces.
    const catcherGeometry = keep(new THREE.PlaneGeometry(STAGE * 2 - 0.08, STAGE * 2 - 0.08))
    catcherGeometry.rotateX(-Math.PI / 2)
    const catcher = new THREE.Mesh(catcherGeometry, own(new THREE.ShadowMaterial({ opacity: 0.55 })))
    catcher.position.y = 0.002
    catcher.receiveShadow = true
    world.add(catcher)
  }

  // The mannequin: birch segments on darker joints, posed by angles each frame.
  const birch = matte('#ead7b8', { roughness: 0.55, flatShading: true })
  const knot = matte('#a97e52', { roughness: 0.5, flatShading: true })
  const figure = placed(new THREE.Group(), FIGURE.x, FIGURE.z, FIGURE.yaw)
  const ball = keep(new THREE.IcosahedronGeometry(1, 1))
  // One capsule per limb size, shared by both sides. A capsule scaled unevenly would stretch its rounded ends.
  const capsules = new Map<string, THREE.CapsuleGeometry>()
  const capsule = (length: number, radius: number) => {
    const id = `${length}|${radius}`
    let geometry = capsules.get(id)
    if (!geometry) {
      geometry = keep(new THREE.CapsuleGeometry(radius, Math.max(0.001, length - radius * 2), 3, 8))
      capsules.set(id, geometry)
    }
    return geometry
  }
  const limb = (parent: THREE.Object3D, length: number, radius: number) => {
    const m = mesh(capsule(length, radius), birch)
    m.position.y = -length / 2
    parent.add(m)
    return m
  }
  const joint = (parent: THREE.Object3D, radius: number, y = 0) => {
    const m = mesh(ball, knot)
    m.scale.setScalar(radius)
    m.position.y = y
    parent.add(m)
  }
  const pelvis = new THREE.Group()
  figure.add(pelvis)
  const hips = mesh(ball, birch)
  hips.scale.set(0.11, 0.07, 0.075)
  pelvis.add(hips)
  const spine = new THREE.Group()
  pelvis.add(spine)
  const belly = mesh(ball, birch)
  belly.scale.set(0.085, 0.1, 0.065)
  belly.position.y = 0.11
  const chest = mesh(ball, birch)
  chest.scale.set(0.13, 0.13, 0.085)
  chest.position.y = 0.25
  const neck = mesh(capsule(0.09, 0.028), birch)
  neck.position.y = BODY.spine + 0.02
  const head = mesh(ball, birch)
  head.scale.set(0.072, 0.09, 0.078)
  head.position.y = BODY.spine + 0.12
  spine.add(belly, chest, neck, head)
  joint(spine, 0.035, 0.18)
  const noseNode = new THREE.Object3D()
  noseNode.position.set(0, BODY.spine + 0.12, 0.075)
  spine.add(noseNode)
  /** The joints the skeleton reads, in KEYPOINTS order. */
  const nodes: THREE.Object3D[] = [noseNode]
  const shoulders: THREE.Group[] = []
  const elbows: THREE.Group[] = []
  const hipsJ: THREE.Group[] = []
  const knees: THREE.Group[] = []
  const wrists: THREE.Object3D[] = []
  const ankles: THREE.Object3D[] = []
  for (const side of [1, -1]) {
    const shoulder = new THREE.Group()
    shoulder.position.set(side * BODY.shoulder, BODY.spine - 0.05, 0)
    spine.add(shoulder)
    joint(shoulder, 0.04)
    limb(shoulder, BODY.upper, 0.035)
    const elbow = new THREE.Group()
    elbow.position.y = -BODY.upper
    shoulder.add(elbow)
    joint(elbow, 0.032)
    limb(elbow, BODY.fore, 0.03)
    const wrist = new THREE.Object3D()
    wrist.position.y = -BODY.fore
    elbow.add(wrist)
    const hand = mesh(ball, birch)
    hand.scale.set(0.03, 0.045, 0.022)
    hand.position.y = -BODY.fore - 0.035
    elbow.add(hand)
    shoulders.push(shoulder)
    elbows.push(elbow)
    wrists.push(wrist)

    const hip = new THREE.Group()
    hip.position.set(side * BODY.hip, -0.02, 0)
    pelvis.add(hip)
    joint(hip, 0.042)
    limb(hip, BODY.thigh, 0.045)
    const knee = new THREE.Group()
    knee.position.y = -BODY.thigh
    hip.add(knee)
    joint(knee, 0.038)
    limb(knee, BODY.shin, 0.037)
    const ankle = new THREE.Object3D()
    ankle.position.y = -BODY.shin
    knee.add(ankle)
    const foot = mesh(ball, birch)
    foot.scale.set(0.035, 0.025, 0.07)
    foot.position.set(0, -BODY.shin - 0.005, 0.035)
    knee.add(foot)
    hipsJ.push(hip)
    knees.push(knee)
    ankles.push(ankle)
  }
  nodes.push(shoulders[0], shoulders[1], elbows[0], elbows[1], wrists[0], wrists[1], hipsJ[0], hipsJ[1], knees[0], knees[1], ankles[0], ankles[1])
  const standing = BODY.foot + BODY.thigh + BODY.shin + 0.02
  pelvis.position.y = standing

  /** Poses the mannequin at `u` of an arm raise, 0 with the arms down to 1 with them overhead and the chest lifted 0.012. */
  const pose = (u: number) => {
    const raise = 0.12 + 2.78 * u
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? 1 : -1
      shoulders[k].rotation.set(-raise, 0, side * (0.1 + 0.12 * Math.sin(Math.PI * u)))
      elbows[k].rotation.set(-(0.28 - 0.22 * u), 0, 0)
      hipsJ[k].rotation.set(0, 0, side * 0.03)
      knees[k].rotation.set(0.02, 0, 0)
    }
    spine.rotation.x = -0.06 * u
    pelvis.position.y = standing + 0.012 * u
    head.rotation.x = -0.18 * u
  }

  // The skeleton: mint bones and pink keypoints drawn over the mannequin.
  const boneGeometry = keep(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true))
  const bones = new THREE.InstancedMesh(boneGeometry, glow(MINT, 1, false, THREE.DoubleSide), BONES.length)
  const keyGeometry = keep(new THREE.IcosahedronGeometry(1, 2))
  const keys = new THREE.InstancedMesh(keyGeometry, own(new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true })), KEYPOINTS.length)
  const keyHalos = new THREE.InstancedMesh(keyGeometry, glow(PINK, 1), KEYPOINTS.length)
  for (const m of [bones, keys, keyHalos]) {
    ;(m.material as THREE.Material).depthTest = false
    m.renderOrder = 6
    m.frustumCulled = false
  }
  for (let i = 0; i < KEYPOINTS.length; i++) {
    keys.setColorAt(i, PINK)
    keyHalos.setColorAt(i, PINK)
  }
  for (let i = 0; i < BONES.length; i++) bones.setColorAt(i, MINT)
  world.add(bones, keys, keyHalos)

  // The rig: a phone on a tripod facing away from the mannequin, so its rear camera films it and its screen faces the
  // viewer. Its screen shows the keypoints it sees.
  const rig = new THREE.Group()
  const lensHeight = 0.98
  const rigTarget = new THREE.Vector3(FIGURE.x, 0.62, FIGURE.z)
  placed(rig, RIG.x, RIG.z, Math.atan2(RIG.x - FIGURE.x, RIG.z - FIGURE.z))
  const PHONE = { w: 0.32, h: 0.6, d: 0.032 }
  const screenW = PHONE.w - 0.03
  const screenH = PHONE.h - 0.05
  {
    const legGeometry = keep(new THREE.CylinderGeometry(0.012, 0.009, 1, 6))
    legGeometry.translate(0, -0.5, 0)
    for (let k = 0; k < 3; k++) {
      const leg = mesh(legGeometry, slate)
      const angle = (k / 3) * Math.PI * 2 + 0.4
      leg.position.y = 0.66
      leg.rotation.set(Math.cos(angle) * 0.42, 0, Math.sin(angle) * 0.42)
      leg.scale.y = 0.72
      rig.add(leg)
    }
    const column = mesh(keep(new THREE.CylinderGeometry(0.016, 0.016, 0.28, 8)), slate)
    column.position.y = 0.66 + 0.14 - 0.02
    const clamp = mesh(keep(new RoundedBoxGeometry(0.12, 0.05, 0.05, 2, 0.012)), slate)
    clamp.position.y = lensHeight - PHONE.h / 2 + 0.01
    const body = mesh(keep(new RoundedBoxGeometry(PHONE.w, PHONE.h, PHONE.d, 4, 0.035)), matte('#e9eeee', { roughness: 0.3, metalness: 0.2 }))
    body.position.y = lensHeight
    const lens = mesh(keep(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 20)), matte('#0c1110', { roughness: 0.2 }))
    lens.rotation.x = Math.PI / 2
    lens.position.set(0.08, lensHeight + 0.21, -PHONE.d / 2 - 0.004)
    rig.add(column, clamp, body, lens)
    const viewfinder = own(new THREE.CanvasTexture(drawViewfinder(accent)))
    viewfinder.colorSpace = THREE.SRGBColorSpace
    const screen = new THREE.Mesh(keep(new THREE.PlaneGeometry(screenW, screenH)), own(new THREE.MeshBasicMaterial({ map: viewfinder })))
    screen.position.set(0, lensHeight, PHONE.d / 2 + 0.002)
    rig.add(screen)
  }
  const lensLocal = new THREE.Vector3(0.08, lensHeight + 0.21, -PHONE.d / 2 - 0.01)
  const lensWorld = lensLocal.clone().applyMatrix4(rig.matrix)
  const rigInverse = rig.matrix.clone().invert()
  /** The preview's scale, so the mannequin's height fills 70% of the screen, and its centre, the target's projection. */
  const previewScale = (screenH * 0.7) / (1.15 / lensWorld.distanceTo(rigTarget))
  const targetLocal = rigTarget.clone().applyMatrix4(rigInverse)
  const previewCentre = new THREE.Vector2(
    ((targetLocal.x - lensLocal.x) / (lensLocal.z - targetLocal.z)) * previewScale,
    ((targetLocal.y - lensLocal.y) / (lensLocal.z - targetLocal.z)) * previewScale,
  )
  const previewKeys = new THREE.InstancedMesh(keep(new THREE.CircleGeometry(1, 10)), own(new THREE.MeshBasicMaterial({ color: '#ffffff' })), KEYPOINTS.length)
  const previewBones = new THREE.InstancedMesh(keep(new THREE.PlaneGeometry(1, 1)), own(new THREE.MeshBasicMaterial({ color: '#ffffff' })), BONES.length)
  for (let i = 0; i < KEYPOINTS.length; i++) previewKeys.setColorAt(i, PINK)
  for (let i = 0; i < BONES.length; i++) previewBones.setColorAt(i, MINT)
  previewKeys.frustumCulled = false
  previewBones.frustumCulled = false
  rig.add(previewBones, previewKeys)

  // The frustum: four mint edges from the lens to a frame around the mannequin, and a faint fill between them.
  const frustum = new THREE.Group()
  const frustumLength = lensWorld.distanceTo(rigTarget) + 0.1
  {
    const halfW = 0.42
    const halfH = 0.62
    const fill = keep(new THREE.ConeGeometry(Math.hypot(halfW, halfH), 1, 4, 1, true))
    fill.rotateY(Math.PI / 4)
    fill.translate(0, -0.5, 0)
    fill.rotateX(-Math.PI / 2)
    fill.scale(halfW / Math.hypot(halfW, halfH) * Math.SQRT2, halfH / Math.hypot(halfW, halfH) * Math.SQRT2, frustumLength)
    // Its uv's v runs 0 at the lens to 1 at the far frame, which the ALONG glow fades over.
    const uv = fill.getAttribute('uv') as THREE.BufferAttribute
    const position = fill.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setY(i, Math.min(1, Math.max(0, position.getZ(i) / frustumLength)))
    const cone = new THREE.Mesh(fill, glow(MINT, 0.35, true, THREE.DoubleSide))
    cone.renderOrder = 4
    frustum.add(cone)
    const edgeGeometry = keep(new THREE.CylinderGeometry(0.004, 0.004, 1, 5, 1, true))
    edgeGeometry.translate(0, 0.5, 0)
    edgeGeometry.rotateX(Math.PI / 2)
    const edgeMaterial = own(new THREE.MeshBasicMaterial({ color: MINT.clone().multiplyScalar(0.8), transparent: true }))
    const far = new THREE.Vector3()
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      far.set(sx * halfW, sy * halfH, frustumLength)
      const edgeMesh = new THREE.Mesh(edgeGeometry, edgeMaterial)
      edgeMesh.scale.set(1, 1, far.length())
      edgeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), far.clone().normalize())
      frustum.add(edgeMesh)
    }
    frustum.position.copy(lensWorld)
    frustum.lookAt(rigTarget)
    world.add(frustum)
  }
  const frustumFill = (frustum.children[0] as THREE.Mesh).material as THREE.ShaderMaterial
  const frustumEdges = (frustum.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial

  // The gauge: a slate disc on a stand, its ring filling to the accuracy, the figure printed in its centre.
  const gauge = placed(new THREE.Group(), GAUGE.x, GAUGE.z, GAUGE.yaw)
  const ringUniforms = { uFill: { value: 0 } }
  const gaugeFaceMaterial = own(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }))
  {
    const centreY = 0.98
    const base = mesh(keep(new THREE.CylinderGeometry(0.2, 0.24, 0.05, 32)), slate)
    base.position.y = 0.025
    const post = mesh(keep(new THREE.CylinderGeometry(0.022, 0.022, centreY - 0.45, 10)), slate)
    post.position.y = 0.05 + (centreY - 0.45) / 2
    const disc = mesh(keep(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 64)), slate)
    disc.rotation.x = Math.PI / 2
    disc.position.y = centreY
    const ringGeometry = keep(new THREE.TorusGeometry(0.42, 0.04, 10, 128))
    const ring = new THREE.Mesh(ringGeometry, own(new THREE.ShaderMaterial({ uniforms: ringUniforms, vertexShader: LOCAL_VERTEX, fragmentShader: RING_FRAGMENT })))
    ring.position.set(0, centreY, 0.04)
    const ticks = merge(Array.from({ length: 20 }, (_, k) => {
      const tick = new THREE.BoxGeometry(0.008, k % 5 === 0 ? 0.05 : 0.028, 0.006)
      tick.translate(0, 0.33, 0)
      tick.rotateZ(-(k / 20) * Math.PI * 2)
      return tick
    }))
    const tickMesh = new THREE.Mesh(ticks, own(new THREE.MeshBasicMaterial({ color: '#5d8f82' })))
    tickMesh.position.set(0, centreY, 0.03)
    const faceTexture = own(new THREE.CanvasTexture(drawGaugeFace()))
    faceTexture.colorSpace = THREE.SRGBColorSpace
    gaugeFaceMaterial.map = faceTexture
    const face = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.56, 0.56)), gaugeFaceMaterial)
    face.position.set(0, centreY, 0.031)
    gauge.add(base, post, disc, ring, tickMesh, face)
  }

  // The paper: a tri-fold page that lies folded on a low lectern and unfolds upright behind the stage.
  const paper = placed(new THREE.Group(), PAPER.x, PAPER.z, PAPER.yaw)
  const page = new THREE.Group()
  const hingeTop = new THREE.Group()
  const hingeBottom = new THREE.Group()
  {
    const lectern = mesh(keep(new RoundedBoxGeometry(0.5, 0.16, 0.36, 3, 0.03)), slate)
    lectern.position.y = 0.08
    paper.add(lectern)
    const pageTexture = own(new THREE.CanvasTexture(drawPage(accent)))
    pageTexture.colorSpace = THREE.SRGBColorSpace
    pageTexture.anisotropy = 4
    const face = own(new THREE.MeshBasicMaterial({ map: pageTexture }))
    face.color.setScalar(0.92)
    const edgeMaterial = matte('#dfe6e3')
    const third = PAGE_H / 3
    /** A panel's box with its front face showing the page's `k`th third from the bottom. */
    const panel = (k: number) => {
      const geometry = keep(new THREE.BoxGeometry(PAGE_W, third, 0.006))
      // A one-segment box lists its faces' vertices in the order +x, -x, +y, -y, +z, -z, four each.
      const uv = geometry.getAttribute('uv') as THREE.BufferAttribute
      for (let vertex = 16; vertex < 20; vertex++) uv.setY(vertex, (k + uv.getY(vertex)) / 3)
      return mesh(geometry, [edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, face, edgeMaterial])
    }
    const middle = panel(1)
    const topPanel = panel(2)
    topPanel.position.y = third / 2
    hingeTop.position.set(0, third / 2, 0.004)
    hingeTop.add(topPanel)
    const bottomPanel = panel(0)
    bottomPanel.position.y = -third / 2
    hingeBottom.position.set(0, -third / 2, 0.008)
    hingeBottom.add(bottomPanel)
    page.add(middle, hingeTop, hingeBottom)
    paper.add(page)
  }

  // Frame state, reused every frame.
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const hits: THREE.Intersection[] = []
  const pickFigure: THREE.Object3D[] = [figure]
  const joints = KEYPOINTS.map(() => new THREE.Vector3())
  const local = new THREE.Vector3()
  const mid = new THREE.Vector3()
  const dir = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const preview = KEYPOINTS.map(() => new THREE.Vector2())
  const projected = new THREE.Vector3()
  let repAt = -1
  let hovered = -1
  let clock = 0

  const view = (f: IslandFrame) => {
    if (f.mode === 'home') return { distance: 9 - 0.4 * f.hover, yaw: 0.66 + f.tiltX * 0.28, pitch: 0.42 - f.tiltY * 0.1, focusX: 0.5, focusY: 0.5 }
    const a = f.local('arrival')
    const w = f.local('work')
    const c = f.local('impact')
    const dive = smoother(ramp(a, 0, 0.8))
    const work = smoother(ramp(w, 0, 0.25)) * (1 - smoother(ramp(c, 0, 0.5)))
    const distance = (f.narrow ? 30 : 17) - (f.narrow ? 6 : 5.5) * dive - 1.6 * work + 0.9 * smoother(ramp(c, 0.15, 0.7)) + 0.6 * f.push
    const yaw = 0.5 + 0.26 * dive + 0.2 * w + 0.06 * c + f.tiltX * 0.16 + f.dragYaw
    const pitch = 0.56 - 0.14 * dive + 0.04 * work - f.tiltY * 0.08
    return { distance, yaw, pitch, focusX: f.narrow ? 0.5 : 0.36, focusY: f.narrow ? 0.7 : 0.5 }
  }

  // One label, the hovered keypoint's name.
  const HIDDEN = new THREE.Vector3(0, -50, 0)
  const panels: IslandPanel[] = KEYPOINTS.map(() => ({ center: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), halfH: 0, corners: [new THREE.Vector3()], develop: 0, opacity: 0 }))
  const anchors = new Map<string, THREE.Vector3 | null>()
  const figureAnchor = new THREE.Vector3()
  const wristAnchor = new THREE.Vector3()
  const bounds = Array.from({ length: 4 }, () => new THREE.Vector3())

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

      // The exercise: on the home page the arms follow the pointer's height, on the journey the reps follow the
      // scroll, and a clicked rep plays one more on top.
      let u: number
      if (home) u = 0.85 + (Math.min(1, Math.max(0, 0.5 - 0.75 * f.tiltY)) - 0.85) * f.hover
      else {
        const reps = 2.5 * ramp(w, 0.14, 0.8)
        u = 0.5 - 0.5 * Math.cos(Math.PI * 2 * reps)
        if (w <= 0.14) u = 0
      }
      let flash = 0
      if (repAt >= 0) {
        const e = (clock - repAt) / REP_S
        if (e < 1) {
          busy = true
          const extra = 0.5 - 0.5 * Math.cos(Math.PI * 2 * smoother(e))
          u = Math.max(u, extra)
          flash = Math.sin(Math.PI * Math.min(1, e * 1.2))
        } else repAt = -1
      }
      pose(u)

      // The phone switches on, then the skeleton draws in keypoint by keypoint.
      const on = home ? 1 : smoother(ramp(w, 0.0, 0.1))
      stageUniforms.uOn.value = on
      frustum.visible = on > 0.01
      frustumFill.uniforms.uGain.value = 0.32 * on
      frustumEdges.opacity = on
      scene.updateMatrixWorld()
      for (let i = 0; i < KEYPOINTS.length; i++) world.worldToLocal(nodes[i].getWorldPosition(joints[i]))
      for (let i = 0; i < KEYPOINTS.length; i++) {
        const shown = home ? 1 : smoother(ramp(w, 0.04 + i * 0.008, 0.07 + i * 0.008))
        const size = 0.022 * shown * (i === hovered ? 1.5 : 1)
        scratch.makeScale(size, size, size).setPosition(joints[i])
        keys.setMatrixAt(i, scratch)
        const halo = 0.06 * shown * (1 + 0.6 * flash + (i === hovered ? 0.6 : 0))
        scratch.makeScale(halo, halo, halo).setPosition(joints[i])
        keyHalos.setMatrixAt(i, scratch)
        keys.setColorAt(i, tint.copy(PINK).lerp(MINT, flash))
        keyHalos.setColorAt(i, tint.copy(PINK).lerp(MINT, flash).multiplyScalar(0.8))
      }
      for (let k = 0; k < BONES.length; k++) {
        const [i, j] = BONES[k]
        const drawn = home ? 1 : smoother(ramp(w, 0.1 + k * 0.006, 0.14 + k * 0.006))
        dir.subVectors(joints[j], joints[i])
        const length = dir.length() * drawn
        mid.copy(joints[i]).addScaledVector(dir, drawn * 0.5)
        quaternion.setFromUnitVectors(up, dir.normalize())
        scale.set(0.009, Math.max(1e-4, length), 0.009)
        scratch.compose(mid, quaternion, scale)
        bones.setMatrixAt(k, scratch)
      }
      keys.instanceMatrix.needsUpdate = true
      keyHalos.instanceMatrix.needsUpdate = true
      bones.instanceMatrix.needsUpdate = true
      if (keys.instanceColor) keys.instanceColor.needsUpdate = true
      if (keyHalos.instanceColor) keyHalos.instanceColor.needsUpdate = true

      // The phone's preview: each keypoint as its rear camera sees it, drawn flat on the screen.
      for (let i = 0; i < KEYPOINTS.length; i++) {
        local.copy(joints[i]).applyMatrix4(rigInverse)
        const depth = Math.max(0.05, lensLocal.z - local.z)
        preview[i].set(((local.x - lensLocal.x) / depth) * previewScale - previewCentre.x, ((local.y - lensLocal.y) / depth) * previewScale - previewCentre.y)
        const shown = on * (home ? 1 : smoother(ramp(w, 0.04 + i * 0.008, 0.07 + i * 0.008)))
        const r = 0.009 * shown
        scratch.makeScale(r, r, r).setPosition(preview[i].x, lensHeight + preview[i].y, PHONE.d / 2 + 0.004)
        previewKeys.setMatrixAt(i, scratch)
      }
      for (let k = 0; k < BONES.length; k++) {
        const [i, j] = BONES[k]
        const drawn = on * (home ? 1 : smoother(ramp(w, 0.1 + k * 0.006, 0.14 + k * 0.006)))
        const dx = preview[j].x - preview[i].x
        const dy = preview[j].y - preview[i].y
        quaternion.setFromAxisAngle(dir.set(0, 0, 1), Math.atan2(dy, dx))
        scale.set(Math.max(1e-4, Math.hypot(dx, dy) * drawn), 0.0035, 1)
        mid.set(preview[i].x + dx * 0.5 * drawn, lensHeight + preview[i].y + dy * 0.5 * drawn, PHONE.d / 2 + 0.003)
        scratch.compose(mid, quaternion, scale)
        previewBones.setMatrixAt(k, scratch)
      }
      previewKeys.instanceMatrix.needsUpdate = true
      previewBones.instanceMatrix.needsUpdate = true

      // The gauge fills to the accuracy, and its figure prints once it is full.
      const fill = home ? 1 : smoother(ramp(w, 0.46, 0.86))
      ringUniforms.uFill.value = ACCURACY * fill
      gaugeFaceMaterial.opacity = home ? 1 : smoother(ramp(w, 0.84, 0.92))

      // The paper rises off the lectern, grows, and unfolds its bottom then its top third.
      const rise = home ? 1 : smoother(ramp(c, 0.05, 0.4))
      const lower = home ? 1 : smoother(ramp(c, 0.3, 0.56))
      const upper = home ? 1 : smoother(ramp(c, 0.46, 0.72))
      const grown = (home ? 0.8 : 1) * (0.3 + 0.7 * rise)
      page.scale.setScalar(grown)
      page.rotation.x = -Math.PI / 2 * (1 - rise)
      page.position.set(0, 0.18 + (0.04 + (PAGE_H / 2) * grown) * rise, 0)
      hingeBottom.rotation.x = Math.PI * (1 - lower)
      hingeTop.rotation.x = -Math.PI * (1 - upper)

      // Hovering a keypoint names it: the nearest one within 22 px of the pointer.
      hovered = -1
      if (!home && f.pointer.inside) {
        let best = 0.05
        for (let i = 0; i < KEYPOINTS.length; i++) {
          world.localToWorld(projected.copy(joints[i])).project(camera)
          const d = Math.hypot((projected.x - f.pointer.x) * f.aspect, projected.y - f.pointer.y)
          if (d < best) {
            best = d
            hovered = i
          }
        }
      }
      for (let i = 0; i < KEYPOINTS.length; i++) {
        const panel = panels[i]
        const shown = i === hovered
        if (shown) world.localToWorld(panel.center.copy(joints[i]).setY(joints[i].y + 0.16))
        else panel.center.copy(HIDDEN)
        panel.corners[0].copy(panel.center)
        panel.halfH = shown ? -0.04 : 0
        panel.develop = shown ? 1 : 0
        panel.opacity = shown ? 1 : 0
      }

      anchors.set('figure', world.localToWorld(figureAnchor.copy(joints[1]).lerp(joints[2], 0.5).setY(joints[1].y - 0.12)))
      anchors.set('joint', world.localToWorld(wristAnchor.copy(joints[5])))
      for (let k = 0; k < bounds.length; k++) world.localToWorld(bounds[k].set(k & 1 ? STAGE : -STAGE, -STAGE_H, k & 2 ? STAGE : -STAGE))
      return { anchors, panels, bounds, focusY: 0.5, busy, ready: true }
    },
    press(point) {
      ndc.set(point.x, point.y)
      raycaster.setFromCamera(ndc, camera)
      hits.length = 0
      raycaster.intersectObjects(pickFigure, true, hits)
      if (!hits.length && hovered < 0) return false
      repAt = ctx.now()
      return true
    },
    dispose() {
      geometries.forEach((g) => g.dispose())
      owned.forEach((o) => o.dispose())
      for (const instanced of [bones, keys, keyHalos, previewKeys, previewBones]) instanced.dispose()
    },
  }
}

export default createScene
