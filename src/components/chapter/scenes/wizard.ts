/**
 * Maestro Tarocchi, the app's guide, as a 3D figure for Tarocchi's chapter. The 500 by 500 sprite
 * (public/Tarocchi/chapter/scenes/wizard.webp, from the Tarocchi repository) is sampled to a GRID by GRID mask and
 * inflated into voxel columns, each as deep as its distance from the silhouette's edge, so the flat figure turns as a
 * rounded body. He assembles from a swirl of sparks, floats, breathes, and sways at the robe, and the gold moons and
 * stars on his robe twinkle. An aura of sparks circles him over a rotating circle of runes, a stream of sparks rises
 * from his raised finger to whatever he conjures, and a press casts a spell: a ring of light runs through him and a
 * burst of sparks leaves his hand. All motion runs in the shaders from the frame time, so the figure animates for as
 * long as it is shown, and the caller reports the chapter busy while it is.
 */
import * as THREE from 'three'
import type { SceneContext } from '../types'

/** The figure's side in local world units. The caller scales the group. */
export const WIZARD_SIZE = 1.3
/** Cells across the mask. About 4,400 of the 112 by 112 cells fall inside the silhouette. */
const GRID = 112
/** The raised fingertip and the open palm, as fractions of the sprite from its top left. */
const FINGER = [0.262, 0.372] as const
const PALM = [0.8, 0.66] as const
/** Sparks in the circling aura, the conjuring stream, and a spell's burst. */
const AURA = 360
const STREAM = 140
const BURST = 180
/** Seconds a spell's ring and burst last. */
const SPELL_S = 1.4

/** A sprite fraction as a point in the figure's local space, centred, y up. */
const local = ([u, v]: readonly [number, number], z = 0) => new THREE.Vector3((u - 0.5) * WIZARD_SIZE, (0.5 - v) * WIZARD_SIZE, z)

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
/** A small seeded generator returning floats in [0, 1), so the sparks fall the same way on every visit. */
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

const BODY_VERTEX = /* glsl */ `
attribute vec2 aHome;
attribute float aHalf;
attribute vec3 aColor;
attribute vec4 aSeed;
attribute float aEdge;
attribute float aStar;
uniform float uTime;
uniform float uAssemble;
uniform float uCell;
uniform float uSize;
uniform vec2 uHand;
uniform float uSpell;
uniform float uSpellRadius;
varying vec3 vColor;
varying vec3 vNormal;
varying float vGlow;
varying float vTwinkle;
varying float vEdge;

void main() {
  vec2 h = aHome / uSize;
  // Assembly: each column spirals in from a vortex around the figure, its own moment set by its seed.
  float k = smoothstep(0.0, 1.0, clamp(uAssemble * 1.7 - aSeed.x * 0.7, 0.0, 1.0));
  float angle = aSeed.y * 6.2831853 + (1.0 - k) * 9.0;
  float radius = (1.0 - k) * uSize * (0.22 + aSeed.z * 0.4);
  vec3 vortex = vec3(cos(angle) * radius, aHome.y * 0.4 + (aSeed.w - 0.5) * uSize * 0.5, sin(angle) * radius);
  vec3 p = mix(vortex, vec3(aHome, 0.0), k);
  // The robe sways below the waist, the hat's tip nods, and the chest breathes.
  float lower = smoothstep(0.0, -0.4, h.y);
  p.x += sin(uTime * 1.7 + h.y * 6.0) * 0.012 * uSize * lower;
  p.z += cos(uTime * 1.3 + h.y * 5.0 + h.x * 3.0) * 0.01 * uSize * lower;
  float tip = smoothstep(0.3, 0.46, h.y) * smoothstep(0.0, 0.2, h.x);
  p.x += sin(uTime * 1.4) * 0.02 * uSize * tip;
  float chest = smoothstep(-0.15, 0.0, h.y) * (1.0 - smoothstep(0.15, 0.25, h.y));
  p.xy *= 1.0 + sin(uTime * 2.1) * 0.01 * chest;
  // A spell's ring runs out from the hand and lifts the columns it crosses toward the viewer.
  float wave = uSpell * exp(-pow((distance(aHome, uHand) - uSpellRadius) * 14.0 / uSize, 2.0));
  p.z += wave * 0.1 * uSize;
  // In flight each column is a small cube, and it takes its full depth as it lands.
  vec3 column = position * vec3(uCell * 0.94, uCell * 0.94, mix(uCell, aHalf * 2.0, k));
  vNormal = normalize(normalMatrix * normal);
  vColor = aColor;
  vEdge = aEdge;
  vGlow = (1.0 - k) * 1.2 + wave;
  vTwinkle = aStar * pow(max(0.0, sin(uTime * 2.4 + aSeed.y * 40.0)), 6.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p + column, 1.0);
}
`

const BODY_FRAGMENT = /* glsl */ `
uniform vec3 uKey;
uniform float uTime;
uniform float uLight;
varying vec3 vColor;
varying vec3 vNormal;
varying float vGlow;
varying float vTwinkle;
varying float vEdge;
void main() {
  vec3 n = normalize(vNormal);
  float diffuse = max(dot(n, uKey), 0.0);
  // A violet rim on the columns' sides and the silhouette's edge, pulsing slowly, so the figure reads as charged.
  float rim = pow(1.0 - abs(n.z), 2.0) * (0.35 + 0.65 * vEdge);
  vec3 violet = vec3(0.62, 0.42, 1.0);
  vec3 gold = vec3(1.0, 0.78, 0.36);
  vec3 colour = vColor * (0.55 + 0.85 * diffuse) * 1.15 * uLight;
  colour += violet * rim * (0.5 + 0.2 * sin(uTime * 2.0));
  colour += gold * vTwinkle * 1.6 + mix(violet, gold, 0.5) * vGlow;
  gl_FragColor = vec4(colour, 1.0);
}
`

const SPARK_VERTEX = /* glsl */ `
attribute vec4 aSeed;
attribute float aKind;
uniform float uTime;
uniform float uAppear;
uniform float uStream;
uniform float uSince;
uniform float uScale;
uniform float uSize;
uniform vec3 uFinger;
uniform vec3 uPalm;
uniform vec3 uTarget;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec3 p;
  float alpha;
  float size;
  if (aKind < 0.5) {
    // The aura: sparks rise around the figure on slow, tilted orbits.
    float t = uTime * (0.25 + aSeed.x * 0.35) + aSeed.y * 6.2831853;
    float r = uSize * (0.42 + 0.1 * sin(uTime * 0.6 + aSeed.z * 9.0)) + aSeed.w * 0.1 * uSize;
    float y = fract(aSeed.z + uTime * (0.04 + aSeed.x * 0.05));
    p = vec3(cos(t) * r, (y - 0.5) * uSize * 1.25, sin(t) * r * 0.55);
    alpha = uAppear * smoothstep(0.0, 0.15, y) * (1.0 - smoothstep(0.75, 1.0, y));
    size = 0.012 + aSeed.w * 0.018;
  } else if (aKind < 1.5) {
    // The stream: sparks leave the fingertip, arc, and spiral into the conjured target.
    float f = fract(aSeed.x + uTime * 0.42);
    vec3 mid = mix(uFinger, uTarget, 0.5) + vec3((aSeed.y - 0.5) * 0.3, 0.2, (aSeed.z - 0.5) * 0.3) * uSize;
    vec3 q = mix(mix(uFinger, mid, f), mix(mid, uTarget, f), f);
    float swirl = f * 12.566 + aSeed.w * 6.2831853;
    p = q + vec3(cos(swirl), sin(swirl * 0.5), sin(swirl)) * 0.04 * uSize * sin(f * 3.14159);
    alpha = uStream * sin(f * 3.14159);
    size = 0.012 + aSeed.w * 0.012;
  } else if (aKind < 2.5) {
    // A spell's burst: sparks fly out of the palm, slow, and fall a little before they fade.
    float f = clamp(uSince / ${SPELL_S.toFixed(2)}, 0.0, 1.0);
    vec3 dir = normalize(aSeed.xyz - 0.5 + vec3(0.0, 0.3, 0.15));
    p = uPalm + dir * uSize * (0.05 + 0.9 * (1.0 - pow(1.0 - f, 3.0))) * (0.45 + aSeed.w);
    p.y -= f * f * 0.25 * uSize;
    alpha = uSince >= 0.0 && uSince < ${SPELL_S.toFixed(2)} ? (1.0 - f) * uAppear : 0.0;
    size = 0.018 + aSeed.w * 0.02;
  } else {
    // Two lights at the fingertip and the palm, breathing.
    p = aSeed.x < 0.5 ? uFinger : uPalm;
    alpha = uAppear * (0.55 + 0.25 * sin(uTime * 3.0 + aSeed.x * 4.0)) * (aSeed.x < 0.5 ? 1.0 : 0.6);
    size = 0.09;
  }
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = max(1.0, size * uSize * uScale / -view.z);
  float twinkle = aKind > 2.5 ? 1.0 : 0.6 + 0.4 * sin(uTime * (3.0 + aSeed.y * 4.0) + aSeed.x * 30.0);
  vAlpha = alpha * twinkle;
  vec3 gold = vec3(1.0, 0.78, 0.35);
  vec3 violet = vec3(0.72, 0.5, 1.0);
  vec3 cyan = vec3(0.45, 0.95, 1.0);
  vColor = aKind > 2.5 ? mix(gold, cyan, 0.35) : mix(mix(gold, violet, step(0.55, aSeed.y)), cyan, step(0.86, aSeed.y));
}
`

const SPARK_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = vAlpha * (1.0 - smoothstep(0.1, 0.5, d));
  vec3 colour = vColor * (1.0 + 2.0 * exp(-d * d * 60.0));
  gl_FragColor = vec4(colour * a, a);
}
`

const CIRCLE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const CIRCLE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uAlpha;
varying vec2 vUv;
float ring(float r, float at, float width) { return exp(-pow((r - at) / width, 2.0)); }
// Distance to a regular polygon's outline of n sides, circumradius R, turned by phase.
float polygon(vec2 p, float n, float R, float phase) {
  float a = atan(p.y, p.x) + phase;
  float sector = 6.2831853 / n;
  return length(p) * cos(mod(a, sector) - sector * 0.5) - R * cos(sector * 0.5);
}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float c = ring(r, 0.93, 0.012) + ring(r, 0.81, 0.008) + 0.7 * ring(r, 0.52, 0.01);
  // A band of 28 runes turning between the outer rings, each drawn from a stem, a slash, and a bar chosen by hash.
  float a = atan(p.y, p.x) + uTime * 0.22;
  float seg = a / 6.2831853 * 28.0;
  float id = floor(seg);
  float u = fract(seg);
  float h = fract(sin(id * 91.7 + 3.1) * 4375.5);
  float v = (r - 0.83) / 0.08;
  float band = smoothstep(0.82, 0.84, r) * (1.0 - smoothstep(0.9, 0.92, r));
  float stem = exp(-pow((u - 0.5) * 10.0, 2.0)) * step(0.3, h);
  float slash = exp(-pow((u - v) * 8.0, 2.0)) * step(0.55, h);
  float bar = exp(-pow((v - fract(h * 7.0)) * 9.0, 2.0)) * step(0.2, u) * step(u, 0.8);
  c += band * (stem + slash + bar) * 0.9;
  // A hexagram inside, its two triangles turning against each other.
  float t1 = polygon(p, 3.0, 0.78, uTime * 0.15);
  float t2 = polygon(p, 3.0, 0.78, -uTime * 0.15 + 3.14159);
  c += (exp(-pow(t1 / 0.012, 2.0)) + exp(-pow(t2 / 0.012, 2.0))) * step(r, 0.8) * 0.8;
  vec3 colour = mix(vec3(1.0, 0.75, 0.35), vec3(0.7, 0.5, 1.0), 0.5 + 0.5 * sin(atan(p.y, p.x) * 3.0 + uTime));
  float alpha = clamp(c, 0.0, 1.5) * uAlpha * (0.8 + 0.2 * sin(uTime * 2.0));
  gl_FragColor = vec4(colour * alpha, alpha);
}
`

export interface WizardState {
  /** 0 scattered to 1 assembled. Below 0.002 the figure is hidden. */
  appear: number
  /** Strength of the stream to `target`, 0 to 1. */
  stream: number
  /** World point the stream flows to. */
  target: THREE.Vector3
  /** Seconds on the frame clock. */
  time: number
  /** Scale on the lit body, for the chapter's launch flare. */
  light: number
}

export interface Wizard {
  group: THREE.Group
  /** True once the figure is built. */
  ready(): boolean
  /** Poses the figure for a frame. Returns true while it is shown, since its shaders animate continuously. */
  update(state: WizardState, camera: THREE.PerspectiveCamera): boolean
  /** Whether a ray from the camera meets the figure. */
  hit(raycaster: THREE.Raycaster): boolean
  /** Casts a spell from `time` on the frame clock. */
  cast(time: number): void
  /** World point of the fingertip, for a callout. */
  fingertip(target: THREE.Vector3): THREE.Vector3
  dispose(): void
}

export function createWizard(ctx: SceneContext): Wizard {
  const group = new THREE.Group()
  group.visible = false
  const finger = local(FINGER, 0.08)
  const palm = local(PALM, 0.08)

  const bodyUniforms = {
    uTime: { value: 0 },
    uAssemble: { value: 0 },
    uCell: { value: WIZARD_SIZE / GRID },
    uSize: { value: WIZARD_SIZE },
    uHand: { value: new THREE.Vector2(palm.x, palm.y) },
    uSpell: { value: 0 },
    uSpellRadius: { value: 0 },
    uKey: { value: new THREE.Vector3(-0.45, 0.55, 0.7).normalize() },
    uLight: { value: 1 },
  }
  const bodyMaterial = new THREE.ShaderMaterial({ vertexShader: BODY_VERTEX, fragmentShader: BODY_FRAGMENT, uniforms: bodyUniforms })
  let bodyGeometry: THREE.InstancedBufferGeometry | null = null
  let body: THREE.Mesh | null = null
  let disposed = false

  // The sparks: aura, stream, burst, and the two hand lights, in one draw.
  const sparkCount = AURA + STREAM + BURST + 2
  const sparkSeed = new Float32Array(sparkCount * 4)
  const sparkKind = new Float32Array(sparkCount)
  const random = mulberry32(500500)
  for (let i = 0; i < sparkCount; i++) {
    for (let j = 0; j < 4; j++) sparkSeed[i * 4 + j] = random()
    sparkKind[i] = i < AURA ? 0 : i < AURA + STREAM ? 1 : i < AURA + STREAM + BURST ? 2 : 3
  }
  sparkSeed[(sparkCount - 2) * 4] = 0.25
  sparkSeed[(sparkCount - 1) * 4] = 0.75
  const sparkGeometry = new THREE.BufferGeometry()
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sparkCount * 3), 3))
  sparkGeometry.setAttribute('aSeed', new THREE.BufferAttribute(sparkSeed, 4))
  sparkGeometry.setAttribute('aKind', new THREE.BufferAttribute(sparkKind, 1))
  const sparkUniforms = {
    uTime: { value: 0 },
    uAppear: { value: 0 },
    uStream: { value: 0 },
    uSince: { value: -1 },
    uScale: { value: 800 },
    uSize: { value: WIZARD_SIZE },
    uFinger: { value: finger.clone() },
    uPalm: { value: palm.clone() },
    uTarget: { value: new THREE.Vector3() },
  }
  const sparkMaterial = new THREE.ShaderMaterial({
    vertexShader: SPARK_VERTEX,
    fragmentShader: SPARK_FRAGMENT,
    uniforms: sparkUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    premultipliedAlpha: true,
  })
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial)
  sparks.frustumCulled = false
  sparks.renderOrder = 5
  group.add(sparks)

  // The rune circle, flat under the figure and tipped toward the viewer.
  const circleGeometry = new THREE.PlaneGeometry(WIZARD_SIZE * 1.15, WIZARD_SIZE * 1.15)
  const circleUniforms = { uTime: { value: 0 }, uAlpha: { value: 0 } }
  const circleMaterial = new THREE.ShaderMaterial({
    vertexShader: CIRCLE_VERTEX,
    fragmentShader: CIRCLE_FRAGMENT,
    uniforms: circleUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    premultipliedAlpha: true,
    side: THREE.DoubleSide,
  })
  const circle = new THREE.Mesh(circleGeometry, circleMaterial)
  circle.rotation.x = -Math.PI / 2 + 0.32
  circle.position.set(0, -0.47 * WIZARD_SIZE, 0)
  circle.renderOrder = 4
  group.add(circle)

  // An unseen plane for presses on the figure.
  const hitGeometry = new THREE.PlaneGeometry(WIZARD_SIZE * 0.8, WIZARD_SIZE * 0.95)
  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false })
  const hitPlane = new THREE.Mesh(hitGeometry, hitMaterial)
  hitPlane.position.y = -0.02 * WIZARD_SIZE
  group.add(hitPlane)

  fetch('/Tarocchi/chapter/scenes/wizard.webp')
    .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(`${response.status}`))))
    .then((blob) => createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
    .then((bitmap) => {
      if (disposed) { bitmap.close(); return }
      const canvas = new OffscreenCanvas(GRID, GRID)
      const draw = canvas.getContext('2d')
      if (!draw) return
      draw.imageSmoothingEnabled = true
      draw.imageSmoothingQuality = 'high'
      draw.drawImage(bitmap, 0, 0, GRID, GRID)
      bitmap.close()
      const { data } = draw.getImageData(0, 0, GRID, GRID)
      // Chamfer distance, in cells, from each inside cell to the nearest outside one.
      const inside = new Uint8Array(GRID * GRID)
      const dist = new Float32Array(GRID * GRID)
      for (let i = 0; i < GRID * GRID; i++) {
        inside[i] = data[i * 4 + 3] > 120 ? 1 : 0
        dist[i] = inside[i] ? 1e4 : 0
      }
      const at = (x: number, y: number) => (x < 0 || y < 0 || x >= GRID || y >= GRID ? 0 : dist[y * GRID + x])
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          const i = y * GRID + x
          if (!inside[i]) continue
          dist[i] = Math.min(dist[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.4, at(x + 1, y - 1) + 1.4)
        }
      }
      for (let y = GRID - 1; y >= 0; y--) {
        for (let x = GRID - 1; x >= 0; x--) {
          const i = y * GRID + x
          if (!inside[i]) continue
          dist[i] = Math.min(dist[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.4, at(x - 1, y + 1) + 1.4)
        }
      }
      const cell = WIZARD_SIZE / GRID
      const home: number[] = []
      const half: number[] = []
      const colour: number[] = []
      const seed: number[] = []
      const edge: number[] = []
      const star: number[] = []
      const random = mulberry32(112112)
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          const i = y * GRID + x
          if (!inside[i]) continue
          home.push(((x + 0.5) / GRID - 0.5) * WIZARD_SIZE, (0.5 - (y + 0.5) / GRID) * WIZARD_SIZE)
          // Columns deepen with the square root of their distance from the edge, so the body rounds like cloth.
          half.push(cell * (0.6 + 1.6 * Math.sqrt(dist[i])))
          const r = data[i * 4] / 255
          const g = data[i * 4 + 1] / 255
          const b = data[i * 4 + 2] / 255
          colour.push(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b))
          seed.push(random(), random(), random(), random())
          edge.push(1 - Math.min(1, dist[i] / 3))
          // The gold moons, stars, and trim twinkle.
          star.push(r > 0.72 && g > 0.48 && b < 0.4 ? 1 : 0)
        }
      }
      const box = new THREE.BoxGeometry(1, 1, 1)
      bodyGeometry = new THREE.InstancedBufferGeometry()
      bodyGeometry.index = box.index
      bodyGeometry.setAttribute('position', box.getAttribute('position'))
      bodyGeometry.setAttribute('normal', box.getAttribute('normal'))
      bodyGeometry.setAttribute('aHome', new THREE.InstancedBufferAttribute(new Float32Array(home), 2))
      bodyGeometry.setAttribute('aHalf', new THREE.InstancedBufferAttribute(new Float32Array(half), 1))
      bodyGeometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(colour), 3))
      bodyGeometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seed), 4))
      bodyGeometry.setAttribute('aEdge', new THREE.InstancedBufferAttribute(new Float32Array(edge), 1))
      bodyGeometry.setAttribute('aStar', new THREE.InstancedBufferAttribute(new Float32Array(star), 1))
      bodyGeometry.instanceCount = half.length
      box.dispose()
      body = new THREE.Mesh(bodyGeometry, bodyMaterial)
      body.frustumCulled = false
      group.add(body)
      ctx.invalidate()
    })
    .catch((error) => console.warn('[chapter] the wizard failed to load', error))

  let castAt = -1
  const buffer = new THREE.Vector2()
  const targetLocal = new THREE.Vector3()

  return {
    group,
    ready: () => body !== null,
    update(state, camera) {
      const shown = state.appear > 0.002 && body !== null
      group.visible = shown
      if (!shown) return false
      const t = state.time
      bodyUniforms.uTime.value = t
      bodyUniforms.uAssemble.value = state.appear
      bodyUniforms.uLight.value = state.light
      const since = castAt < 0 ? -1 : t - castAt
      if (since > SPELL_S) castAt = -1
      const spell = since >= 0 && since <= SPELL_S ? Math.sin(Math.PI * Math.min(1, since / 0.2) * 0.5) * (1 - since / SPELL_S) : 0
      bodyUniforms.uSpell.value = spell
      bodyUniforms.uSpellRadius.value = Math.max(0, since) * WIZARD_SIZE * 1.1
      sparkUniforms.uTime.value = t
      sparkUniforms.uAppear.value = state.appear
      sparkUniforms.uStream.value = state.stream * state.appear
      sparkUniforms.uSince.value = since
      ctx.renderer.getDrawingBufferSize(buffer)
      sparkUniforms.uScale.value = buffer.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
      group.updateMatrixWorld()
      sparkUniforms.uTarget.value.copy(group.worldToLocal(targetLocal.copy(state.target)))
      circleUniforms.uTime.value = t
      circleUniforms.uAlpha.value = state.appear * state.appear
      return true
    },
    hit(raycaster) {
      return group.visible && raycaster.intersectObject(hitPlane, false).length > 0
    },
    cast(time) {
      castAt = time
    },
    fingertip(target) {
      return group.localToWorld(target.copy(finger))
    },
    dispose() {
      disposed = true
      bodyGeometry?.dispose()
      bodyMaterial.dispose()
      sparkGeometry.dispose()
      sparkMaterial.dispose()
      circleGeometry.dispose()
      circleMaterial.dispose()
      hitGeometry.dispose()
      hitMaterial.dispose()
    },
  }
}
