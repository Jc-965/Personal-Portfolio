/**
 * Maestro Tarocchi, the app's guide, as a jointed 3D voxel figure for Tarocchi's chapter, modelled after the app's
 * wizard sprite: a bell-shaped purple robe sewn with gold stars, a dark face with gold eyes, a curled mustache and a
 * pointed beard, a tall hat whose tip bends and nods, two arms jointed at shoulder and elbow, and a staff whose
 * crystal glows. Lengths inside the figure are in voxels (VOXEL world units each at scale 1), with the origin at the
 * hem's centre, +x to the viewer's right, and the face toward +z.
 *
 * The caller blends three gestures by act: conjure (the near hand raised to the card, flicking out each dealt card),
 * channel (the staff raised over the scenes), and present (both arms open for the reading). Under them the figure
 * floats, its hem ripples, its hat nods, it blinks, and its head follows the pointer, while sparks circle it over a
 * turning rune circle and a stream runs from the conjuring hand to the card. A press makes it thrust the staff and
 * burst sparks from the crystal. The motion runs from the frame time, so the figure animates for as long as it is
 * shown, and the caller reports the chapter busy while it is.
 */
import * as THREE from 'three'
import type { SceneContext } from '../types'

/** One voxel's side in world units at scale 1, and the figure's height in voxels, hem to hat tip. */
export const VOXEL = 0.04
export const HEIGHT_VOXELS = 49
/** The shoulder pivots' x, height, and depth, the upper arm's length, and the forearm's, in voxels. */
const SHOULDER = [5.6, 22.5, 0] as const
const UPPER = 7
const FORE = 6.5
/** The staff's length in voxels, and where along it the hand grips, from its foot. */
const STAFF = 36
const GRIP = 15
/** Sparks in the circling aura, the stream, the spell's burst, and the two hand lights. */
const AURA = 320
const STREAM = 140
const BURST = 200
/** Seconds a spell's thrust and burst last. */
const SPELL_S = 1.3
/** Seconds between blinks, and a blink's length. */
const BLINK_EVERY = 3.7
const BLINK_S = 0.14
/** World units the figure floats up and down. */
const BOB = 0.035

const colour = (hex: string): [number, number, number] => {
  const c = new THREE.Color(hex)
  return [c.r, c.g, c.b]
}
const COLOUR = {
  robe: colour('#3d2a70'),
  robeDeep: colour('#271a4d'),
  trim: colour('#a35f2c'),
  gold: colour('#f0bd55'),
  skin: colour('#8c5a3c'),
  skinDeep: colour('#6e4430'),
  hair: colour('#1b1311'),
  eye: colour('#ffd56b'),
  wood: colour('#6b4423'),
  woodDeep: colour('#4e301a'),
}

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
/** A stable hash of a voxel's place, 0 to 1, so the stars sit in the same places on every visit. */
const hash3 = (x: number, y: number, z: number) => {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return h - Math.floor(h)
}

type Rgb = [number, number, number]
/** Hem ripple, hat-tip nod, star twinkle, and glow, each 0 to 1. */
type Flags = [number, number, number, number]

/** Voxels of one jointed part: centres in voxels, linear colours, and flags. */
class Part {
  readonly cells = new Map<string, { p: Rgb; c: Rgb; f: Flags }>()
  set(x: number, y: number, z: number, c: Rgb, f: Flags = [0, 0, 0, 0]) {
    this.cells.set(`${x},${y},${z}`, { p: [x, y, z], c, f })
  }
  /** Adds the shell of a solid: every inside voxel with an outside neighbour, painted by `paint`. */
  shell(min: readonly number[], max: readonly number[], inside: (x: number, y: number, z: number) => boolean, paint: (x: number, y: number, z: number) => { c: Rgb; f?: Flags }) {
    for (let y = min[1]; y <= max[1]; y++) {
      for (let z = min[2]; z <= max[2]; z++) {
        for (let x = min[0]; x <= max[0]; x++) {
          if (!inside(x, y, z)) continue
          if (inside(x + 1, y, z) && inside(x - 1, y, z) && inside(x, y + 1, z) && inside(x, y - 1, z) && inside(x, y, z + 1) && inside(x, y, z - 1)) continue
          const painted = paint(x, y, z)
          this.set(x, y, z, painted.c, painted.f)
        }
      }
    }
  }
}

/** The robe's radius at height y, in voxels, from the hem up to the shoulders. Negative above the robe. */
function robeRadius(y: number) {
  const profile = [[0, 9.6], [3, 8.8], [8, 7.4], [13, 6.1], [18, 5.3], [22, 5.0], [24.5, 4.0]]
  if (y <= 0) return profile[0][1]
  for (let i = 1; i < profile.length; i++) {
    const [y1, r1] = profile[i]
    const [y0, r0] = profile[i - 1]
    if (y <= y1) return r0 + ((y - y0) / (y1 - y0)) * (r1 - r0)
  }
  return -1
}

function buildBody() {
  const body = new Part()
  // A deep purple bell, darker toward the hem, with an orange hem band, a belt with a gold buckle, an orange front
  // seam above the belt, and single gold stars scattered over it.
  body.shell([-11, 0, -11], [11, 25, 11], (x, y, z) => {
    const r = robeRadius(y)
    return y >= 0 && y <= 24 && r > 0 && x * x + (z / 0.86) * (z / 0.86) <= r * r
  }, (x, y, z) => {
    const front = z > 0 && Math.abs(x) <= 0.6
    if (y <= 1) return { c: COLOUR.trim, f: [1, 0, 0, 0] }
    if (y === 12) return { c: front ? COLOUR.gold : COLOUR.trim, f: [0, 0, front ? 1 : 0, 0] }
    if (front && y > 12) return { c: COLOUR.trim }
    const star = hash3(x, y, z) < 0.045 && y > 2
    return { c: star ? COLOUR.gold : y < 8 ? COLOUR.robeDeep : COLOUR.robe, f: [y < 6 ? (6 - y) / 6 : 0, 0, star ? 1 : 0, 0] }
  })
  // The beard: a black wedge from the chin down over the chest, coming to a point.
  for (let y = 15; y <= 25; y++) {
    const half = Math.round(3.3 * Math.pow((y - 15) / 10, 0.75))
    const z0 = Math.round((y < 24 ? robeRadius(y) * 0.86 : 4) + 1)
    for (let x = -half; x <= half; x++) {
      body.set(x, y, z0, COLOUR.hair)
      if (Math.abs(x) < half) body.set(x, y, z0 - 1, COLOUR.hair)
    }
  }
  return body
}

/** The head, its own part so it can turn. Its origin is the neck. */
function buildHead() {
  const head = new Part()
  const cy = 3.8
  head.shell([-5, -1, -5], [5, 9, 6], (x, y, z) => x * x + (y - cy) * (y - cy) + (z - 0.4) * (z - 0.4) <= 4.3 * 4.3, (_x, _y, z) => ({ c: z < -1 ? COLOUR.skinDeep : COLOUR.skin }))
  // Gold eyes under slanted brows, a nose standing out, and a mustache sweeping out and curling up at its tips.
  for (const s of [-1, 1]) {
    head.set(s * 2, Math.round(cy + 0.6), 5, COLOUR.eye, [0, 0, 0, 1])
    head.set(s * 1, Math.round(cy + 1.8), 5, COLOUR.hair)
    head.set(s * 2, Math.round(cy + 2), 5, COLOUR.hair)
    head.set(s * 3, Math.round(cy + 2.4), 4, COLOUR.hair)
    for (let x = 1; x <= 5; x++) head.set(s * x, Math.round(cy - 1.6 + (x > 3 ? 0.6 : 0)), 5, COLOUR.hair)
    head.set(s * 6, Math.round(cy - 0.6), 4, COLOUR.hair)
    head.set(s * 7, Math.round(cy + 0.4), 4, COLOUR.hair)
    head.set(s * 6, Math.round(cy + 1.4), 4, COLOUR.hair)
  }
  head.set(0, Math.round(cy - 0.6), 6, COLOUR.skinDeep)
  head.set(0, Math.round(cy + 0.4), 6, COLOUR.skinDeep)
  head.set(0, Math.round(cy - 2.6), 5, COLOUR.hair)
  return head
}

/** The hat cone's centre offset toward +x and its radius at height h above the neck, bending as it rises. */
function hatAt(h: number) {
  const t = (h - 8) / 16
  return { x: 4.2 * t * t * t, r: 5.2 * Math.pow(Math.max(0, 1 - t), 0.85) }
}
/** The hat, on the head part, so its heights are from the neck. */
function buildHat() {
  const hat = new Part()
  // A wide brim drooping at its edge, a band of orange, and a bent cone with a gold moon and stars.
  for (let z = -10; z <= 10; z++) {
    for (let x = -10; x <= 10; x++) {
      const r = Math.hypot(x, z)
      if (r > 9.6) continue
      hat.set(x, r > 7.6 ? 6 : 7, z, r > 8.8 ? COLOUR.trim : COLOUR.robe)
    }
  }
  hat.shell([-7, 8, -7], [10, 24, 7], (x, y, z) => {
    const at = hatAt(y)
    return y >= 8 && y <= 24 && at.r > 0.35 && (x - at.x) * (x - at.x) + z * z <= at.r * at.r
  }, (x, y, z) => {
    const tip = Math.max(0, (y - 14) / 10)
    if (y <= 9) return { c: COLOUR.trim, f: [0, tip, 0, 0] }
    const centre = hatAt(y).x
    const moon = z > 2 && y >= 12 && y <= 14 && Math.abs(x - centre) <= 1.5 && !(x > centre && y === 13)
    const star = hash3(x, y, z) < 0.06
    return { c: moon || star ? COLOUR.gold : COLOUR.robe, f: [0, tip, moon || star ? 1 : 0, 0] }
  })
  return hat
}

/** An upper arm, a sleeve from the shoulder pivot down UPPER voxels. */
function buildUpper() {
  const upper = new Part()
  upper.shell([-3, -UPPER, -3], [3, 1, 3], (x, y, z) => y <= 0.5 && y >= -UPPER && x * x + z * z <= 2.1 * 2.1, () => ({ c: COLOUR.robe }))
  return upper
}
/** A forearm from the elbow pivot: a sleeve widening into a bell cuff with an orange trim, and a hand. */
function buildFore() {
  const fore = new Part()
  fore.shell([-4, -FORE - 1, -4], [4, 0, 4], (x, y, z) => {
    const r = 2.0 + 1.3 * Math.max(0, (-y - 2) / (FORE - 2))
    return y <= 0 && y >= -FORE && x * x + z * z <= r * r
  }, (_x, y) => ({ c: y <= -FORE + 0.5 ? COLOUR.trim : COLOUR.robe }))
  for (let y = -FORE - 3; y <= -FORE - 1; y++) {
    for (let z = -1; z <= 1; z++) for (let x = -1; x <= 0; x++) fore.set(x, y, z, COLOUR.skin)
  }
  fore.set(1, -FORE - 1, 1, COLOUR.skin)
  return fore
}
/** The staff from its foot up, with a gold collar under the crystal. */
function buildStaff() {
  const staff = new Part()
  for (let y = 0; y < STAFF; y++) staff.set(0, y, 0, y % 7 === 3 ? COLOUR.woodDeep : COLOUR.wood)
  for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) staff.set(x, STAFF - 1, z, COLOUR.gold, [0, 0, 1, 0])
  return staff
}

const VOXEL_VERTEX = /* glsl */ `
attribute vec3 aPos;
attribute vec3 aColor;
attribute vec4 aFlags;
attribute vec4 aSeed;
uniform float uTime;
uniform float uAssemble;
uniform float uBlink;
varying vec3 vColor;
varying vec3 vNormal;
varying float vStar;
varying float vGlow;
varying float vMake;
void main() {
  vec3 home = aPos;
  // The hem ripples around the robe, and the hat's tip nods, from the frame time.
  float around = atan(aPos.z, aPos.x);
  home.x += sin(uTime * 2.3 + aPos.y * 0.6 + around * 2.0) * 0.55 * aFlags.x;
  home.z += cos(uTime * 1.9 + around * 3.0) * 0.45 * aFlags.x;
  home.y += sin(uTime * 2.7 + around * 4.0) * 0.25 * aFlags.x;
  home.x += sin(uTime * 1.5) * 1.6 * aFlags.y * aFlags.y;
  home.z += cos(uTime * 1.2) * 0.8 * aFlags.y * aFlags.y;
  // The eyes close for a blink.
  vec3 size = vec3(0.96) * mix(1.0, 0.6, 1.0 - smoothstep(0.0, 1.0, clamp(uAssemble * 1.7 - aSeed.x * 0.7, 0.0, 1.0)));
  size.y *= mix(1.0, 0.15, uBlink * aFlags.w);
  // Assembly: each voxel spirals in from a swirl around its part, its own moment set by its seed.
  float k = smoothstep(0.0, 1.0, clamp(uAssemble * 1.7 - aSeed.x * 0.7, 0.0, 1.0));
  float angle = aSeed.y * 6.2831853 + (1.0 - k) * 9.0;
  float radius = (1.0 - k) * (5.0 + aSeed.z * 10.0);
  vec3 swirl = vec3(cos(angle) * radius, home.y * 0.5 + (aSeed.w - 0.5) * 18.0, sin(angle) * radius);
  vec3 p = mix(swirl, home, k) + position * size;
  vNormal = normalize(normalMatrix * normal);
  vColor = aColor;
  vStar = aFlags.z * pow(max(0.0, sin(uTime * 2.4 + aSeed.y * 40.0)), 5.0);
  vGlow = aFlags.w;
  vMake = 1.0 - k;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`

const VOXEL_FRAGMENT = /* glsl */ `
uniform vec3 uKey;
uniform float uLight;
uniform float uTime;
uniform float uFlash;
varying vec3 vColor;
varying vec3 vNormal;
varying float vStar;
varying float vGlow;
varying float vMake;
void main() {
  vec3 n = normalize(vNormal);
  float diffuse = max(dot(n, uKey), 0.0);
  // Faces turned down sit in shadow and side faces catch a violet rim, so every voxel reads as a solid block.
  float under = smoothstep(0.0, -0.8, n.y);
  vec3 violet = vec3(0.6, 0.42, 1.0);
  vec3 gold = vec3(1.0, 0.8, 0.4);
  vec3 lit = vColor * (0.5 + 0.8 * diffuse - 0.2 * under) * uLight;
  lit += violet * pow(1.0 - abs(n.z), 3.0) * 0.18;
  lit += gold * vStar * 1.5 + vColor * vGlow * (1.2 + 0.4 * sin(uTime * 3.0));
  lit += mix(violet, gold, 0.4) * (vMake * 0.55 + uFlash * 0.35);
  gl_FragColor = vec4(lit, 1.0);
}
`

const CRYSTAL_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-view.xyz);
  gl_Position = projectionMatrix * view;
}
`
const CRYSTAL_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uPower;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float facing = abs(dot(normalize(vNormal), normalize(vView)));
  vec3 core = mix(vec3(0.45, 0.95, 1.0), vec3(0.8, 0.55, 1.0), 0.5 + 0.5 * sin(uTime * 1.7));
  gl_FragColor = vec4(core * (0.6 + 1.4 * pow(1.0 - facing, 2.0)) * (0.8 + 0.6 * uPower), 1.0);
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
uniform vec3 uHand;
uniform vec3 uCrystal;
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
    float r = 11.0 + 3.0 * sin(uTime * 0.6 + aSeed.z * 9.0) + aSeed.w * 4.0;
    float y = fract(aSeed.z + uTime * (0.04 + aSeed.x * 0.05));
    p = vec3(cos(t) * r, y * 46.0, sin(t) * r * 0.6);
    alpha = uAppear * smoothstep(0.0, 0.15, y) * (1.0 - smoothstep(0.75, 1.0, y));
    size = 0.5 + aSeed.w * 0.8;
  } else if (aKind < 1.5) {
    // The stream: sparks leave the conjuring hand, arc, and spiral into the target.
    float f = fract(aSeed.x + uTime * 0.45);
    vec3 mid = mix(uHand, uTarget, 0.5) + vec3((aSeed.y - 0.5) * 8.0, 6.0, (aSeed.z - 0.5) * 8.0);
    vec3 q = mix(mix(uHand, mid, f), mix(mid, uTarget, f), f);
    float swirl = f * 12.566 + aSeed.w * 6.2831853;
    p = q + vec3(cos(swirl), sin(swirl * 0.5), sin(swirl)) * 1.4 * sin(f * 3.14159);
    alpha = uStream * sin(f * 3.14159);
    size = 0.5 + aSeed.w * 0.5;
  } else if (aKind < 2.5) {
    // A spell's burst: sparks fly out of the crystal, slow, and fall a little before they fade.
    float f = clamp(uSince / ${SPELL_S.toFixed(2)}, 0.0, 1.0);
    vec3 dir = normalize(aSeed.xyz - 0.5 + vec3(0.0, 0.25, 0.2));
    p = uCrystal + dir * (2.0 + 26.0 * (1.0 - pow(1.0 - f, 3.0))) * (0.45 + aSeed.w);
    p.y -= f * f * 8.0;
    alpha = uSince >= 0.0 && uSince < ${SPELL_S.toFixed(2)} ? (1.0 - f) * uAppear : 0.0;
    size = 0.7 + aSeed.w * 0.8;
  } else {
    // Two lights, at the conjuring hand and the crystal, breathing.
    p = aSeed.x < 0.5 ? uHand : uCrystal;
    alpha = uAppear * (0.55 + 0.25 * sin(uTime * 3.0 + aSeed.x * 4.0));
    size = aSeed.x < 0.5 ? 3.2 : 4.5;
  }
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * view;
  // Sizes are in voxels. uScale turns one voxel at unit distance into drawing-buffer pixels.
  gl_PointSize = max(1.0, size * uScale / -view.z);
  float twinkle = aKind > 2.5 ? 1.0 : 0.6 + 0.4 * sin(uTime * (3.0 + aSeed.y * 4.0) + aSeed.x * 30.0);
  vAlpha = alpha * twinkle;
  vec3 gold = vec3(1.0, 0.78, 0.35);
  vec3 violet = vec3(0.72, 0.5, 1.0);
  vec3 cyan = vec3(0.45, 0.95, 1.0);
  vColor = aKind > 2.5 ? mix(gold, cyan, 0.4) : mix(mix(gold, violet, step(0.55, aSeed.y)), cyan, step(0.86, aSeed.y));
}
`
const SPARK_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = vAlpha * (1.0 - smoothstep(0.1, 0.5, d));
  gl_FragColor = vec4(vColor * (1.0 + 2.0 * exp(-d * d * 60.0)) * a, a);
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
uniform float uFlash;
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
  float spin = uTime * 0.22 + uFlash * 2.0;
  float c = ring(r, 0.93, 0.012) + ring(r, 0.81, 0.008) + 0.7 * ring(r, 0.52, 0.01);
  // A band of 28 runes turning between the outer rings, each drawn from a stem, a slash, and a bar chosen by hash.
  float a = atan(p.y, p.x) + spin;
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
  float t1 = polygon(p, 3.0, 0.78, spin * 0.7);
  float t2 = polygon(p, 3.0, 0.78, -spin * 0.7 + 3.14159);
  c += (exp(-pow(t1 / 0.012, 2.0)) + exp(-pow(t2 / 0.012, 2.0))) * step(r, 0.8) * 0.8;
  vec3 tint = mix(vec3(1.0, 0.75, 0.35), vec3(0.7, 0.5, 1.0), 0.5 + 0.5 * sin(atan(p.y, p.x) * 3.0 + uTime));
  float alpha = clamp(c, 0.0, 1.5) * uAlpha * (0.8 + 0.2 * sin(uTime * 2.0) + uFlash);
  gl_FragColor = vec4(tint * alpha, alpha);
}
`

type V3 = readonly [number, number, number]
/** An arm's pose: the upper arm's and the forearm's directions in the figure's space, normalised when applied. */
interface ArmPose { upper: V3; fore: V3 }
/** The conjuring arm (the viewer's left) and the staff arm (the viewer's right) for each gesture. */
const POSES: Record<'rest' | 'conjure' | 'channel' | 'present' | 'thrust', { near: ArmPose; staff: ArmPose }> = {
  rest: { near: { upper: [-0.25, -1, 0.15], fore: [0.1, -0.6, 0.8] }, staff: { upper: [0.25, -1, 0.1], fore: [0.05, 0.1, 1] } },
  conjure: { near: { upper: [-0.65, 0.55, 0.45], fore: [-0.25, 0.9, 0.35] }, staff: { upper: [0.25, -1, 0.1], fore: [0.05, 0.1, 1] } },
  channel: { near: { upper: [-0.5, 0, 0.85], fore: [0.5, 0.2, 0.85] }, staff: { upper: [0.65, 0.65, 0.3], fore: [0.35, 0.9, 0.2] } },
  present: { near: { upper: [-0.8, -0.1, 0.55], fore: [-0.6, 0.5, 0.6] }, staff: { upper: [0.8, -0.1, 0.55], fore: [0.6, 0.5, 0.6] } },
  thrust: { near: { upper: [-0.25, -1, 0.15], fore: [0.1, -0.6, 0.8] }, staff: { upper: [0.3, 0.1, 1], fore: [0.1, 0.2, 1] } },
}
const DOWN = new THREE.Vector3(0, -1, 0)

export interface WizardState {
  /** 0 scattered to 1 assembled. Below 0.002 the figure is hidden. */
  appear: number
  /** Weights of the three gestures, each 0 to 1, applied in order. What they leave is the rest pose. */
  conjure: number
  channel: number
  present: number
  /** A flick of the conjuring hand toward the spread, 0 to 1 and back, as each card leaves it. */
  flick: number
  /** Strength of the stream to `target`, 0 to 1. */
  stream: number
  /** World point the stream flows to. */
  target: THREE.Vector3
  /** Where the head looks, -1 to 1 on each axis, as the pointer's tilt. */
  lookX: number
  lookY: number
  /** Seconds on the frame clock, and the scale on the lit body. */
  time: number
  light: number
}

export interface Wizard {
  group: THREE.Group
  /** Poses the figure for a frame. Returns true while it is shown, since it animates continuously. */
  update(state: WizardState, camera: THREE.PerspectiveCamera): boolean
  hit(raycaster: THREE.Raycaster): boolean
  /** Casts a spell from `time` on the frame clock. */
  cast(time: number): void
  /** World points of the conjuring hand and the crystal. Valid after update. */
  hand(target: THREE.Vector3): THREE.Vector3
  crystal(target: THREE.Vector3): THREE.Vector3
  dispose(): void
}

export function createWizard(ctx: SceneContext): Wizard {
  // `group` is in world units for the caller to place and scale, and `figure` scales voxels into it.
  const group = new THREE.Group()
  group.visible = false
  const figure = new THREE.Group()
  figure.scale.setScalar(VOXEL)
  group.add(figure)

  const uniforms = {
    uTime: { value: 0 },
    uAssemble: { value: 0 },
    uBlink: { value: 0 },
    uKey: { value: new THREE.Vector3(-0.45, 0.6, 0.66).normalize() },
    uLight: { value: 1 },
    uFlash: { value: 0 },
  }
  const material = new THREE.ShaderMaterial({ vertexShader: VOXEL_VERTEX, fragmentShader: VOXEL_FRAGMENT, uniforms })
  const cube = new THREE.BoxGeometry(1, 1, 1)
  const geometries: THREE.InstancedBufferGeometry[] = []
  const random = mulberry32(4848)
  const mesh = (part: Part) => {
    const list = [...part.cells.values()]
    const pos = new Float32Array(list.length * 3)
    const col = new Float32Array(list.length * 3)
    const flags = new Float32Array(list.length * 4)
    const seed = new Float32Array(list.length * 4)
    list.forEach((cell, i) => {
      pos.set(cell.p, i * 3)
      col.set(cell.c, i * 3)
      flags.set(cell.f, i * 4)
      seed.set([random(), random(), random(), random()], i * 4)
    })
    const geometry = new THREE.InstancedBufferGeometry()
    geometry.index = cube.index
    geometry.setAttribute('position', cube.getAttribute('position'))
    geometry.setAttribute('normal', cube.getAttribute('normal'))
    geometry.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3))
    geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 3))
    geometry.setAttribute('aFlags', new THREE.InstancedBufferAttribute(flags, 4))
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4))
    geometry.instanceCount = list.length
    geometries.push(geometry)
    const result = new THREE.Mesh(geometry, material)
    result.frustumCulled = false
    return result
  }

  // The jointed parts: the body, the head with its hat, each arm's shoulder and elbow, and the staff.
  const head = new THREE.Group()
  head.position.set(0, 24.5, 0.4)
  head.add(mesh(buildHead()), mesh(buildHat()))
  const arms = ([-1, 1] as const).map((side) => {
    const shoulder = new THREE.Group()
    shoulder.position.set(side * SHOULDER[0], SHOULDER[1], SHOULDER[2])
    shoulder.add(mesh(buildUpper()))
    const elbow = new THREE.Group()
    elbow.position.set(0, -UPPER, 0)
    elbow.add(mesh(buildFore()))
    shoulder.add(elbow)
    return { shoulder, elbow }
  })
  const [near, holder] = arms
  const staff = new THREE.Group()
  staff.add(mesh(buildStaff()))
  const crystalGeometry = new THREE.OctahedronGeometry(2.4, 0)
  const crystalUniforms = { uTime: { value: 0 }, uPower: { value: 0 } }
  const crystalMaterial = new THREE.ShaderMaterial({ vertexShader: CRYSTAL_VERTEX, fragmentShader: CRYSTAL_FRAGMENT, uniforms: crystalUniforms })
  const crystal = new THREE.Mesh(crystalGeometry, crystalMaterial)
  crystal.position.set(0, STAFF + 2.2, 0)
  staff.add(crystal)
  figure.add(mesh(buildBody()), head, near.shoulder, holder.shoulder, staff)

  // The sparks: aura, stream, burst, and the two lights, in one draw in voxel units.
  const sparkCount = AURA + STREAM + BURST + 2
  const sparkSeed = new Float32Array(sparkCount * 4)
  const sparkKind = new Float32Array(sparkCount)
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
    uHand: { value: new THREE.Vector3() },
    uCrystal: { value: new THREE.Vector3() },
    uTarget: { value: new THREE.Vector3() },
  }
  const sparkMaterial = new THREE.ShaderMaterial({ vertexShader: SPARK_VERTEX, fragmentShader: SPARK_FRAGMENT, uniforms: sparkUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true })
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial)
  sparks.frustumCulled = false
  sparks.renderOrder = 5
  figure.add(sparks)

  // The rune circle, flat under the hem.
  const circleGeometry = new THREE.PlaneGeometry(34, 34)
  const circleUniforms = { uTime: { value: 0 }, uAlpha: { value: 0 }, uFlash: { value: 0 } }
  const circleMaterial = new THREE.ShaderMaterial({ vertexShader: CIRCLE_VERTEX, fragmentShader: CIRCLE_FRAGMENT, uniforms: circleUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true, side: THREE.DoubleSide })
  const circle = new THREE.Mesh(circleGeometry, circleMaterial)
  circle.rotation.x = -Math.PI / 2
  circle.position.y = -2.5
  circle.renderOrder = 4
  figure.add(circle)

  // An unseen box for presses on the figure.
  const hitGeometry = new THREE.BoxGeometry(20, 46, 16)
  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false })
  const hitBox = new THREE.Mesh(hitGeometry, hitMaterial)
  hitBox.position.y = 23
  figure.add(hitBox)

  let castAt = -1
  const buffer = new THREE.Vector2()
  const grip = new THREE.Vector3()
  const handLocal = new THREE.Vector3(-0.5, -FORE - 2, 0)
  const gripLocal = new THREE.Vector3(0, -FORE - 2, 0.5)
  const upperDir = new THREE.Vector3()
  const foreDir = new THREE.Vector3()
  const inverse = new THREE.Quaternion()
  const work = new THREE.Vector3()
  /** Sets `out` to the weighted sum of the gestures' directions for one arm and one segment. */
  const mixDir = (out: THREE.Vector3, pick: (pose: { near: ArmPose; staff: ArmPose }) => V3, weights: [number, number, number, number, number]) => {
    out.set(0, 0, 0)
    const keys = ['rest', 'conjure', 'channel', 'present', 'thrust'] as const
    keys.forEach((key, i) => {
      const v = pick(POSES[key])
      out.add(work.set(v[0], v[1], v[2]).normalize().multiplyScalar(weights[i]))
    })
    return out
  }
  const poseArm = (arm: (typeof arms)[number], upper: THREE.Vector3, fore: THREE.Vector3) => {
    arm.shoulder.quaternion.setFromUnitVectors(DOWN, upper.normalize())
    inverse.copy(arm.shoulder.quaternion).invert()
    arm.elbow.quaternion.setFromUnitVectors(DOWN, fore.normalize()).premultiply(inverse)
  }

  return {
    group,
    update(state, camera) {
      const shown = state.appear > 0.002
      group.visible = shown
      if (!shown) return false
      const t = state.time
      const since = castAt < 0 ? -1 : t - castAt
      if (since > SPELL_S) castAt = -1
      // A spell thrusts the staff forward over its first 0.35 s and lets it settle back.
      const thrust = since >= 0 ? Math.sin(Math.PI * Math.min(1, since / 0.35) * 0.5) * Math.exp(-Math.max(0, since - 0.35) * 3) : 0

      // Gestures blend in order, each taking its share from what the earlier ones left.
      const conjure = state.conjure
      const channel = state.channel * (1 - conjure)
      const present = state.present * (1 - conjure - channel)
      const rest = Math.max(0, 1 - conjure - channel - present)
      const weights: [number, number, number, number, number] = [rest, conjure, channel, present, 0]
      const staffWeights: [number, number, number, number, number] = [rest * (1 - thrust), conjure * (1 - thrust), channel * (1 - thrust), present * (1 - thrust), thrust]
      // The conjuring hand circles while it holds the card up and flicks out toward the spread per card.
      mixDir(upperDir, (p) => p.near.upper, weights).add(work.set(0.6, -0.3, 0.3).multiplyScalar(state.flick))
      mixDir(foreDir, (p) => p.near.fore, weights).add(work.set(0.9, -0.2, 0.4).multiplyScalar(state.flick))
      foreDir.add(work.set(Math.cos(t * 1.9), Math.sin(t * 1.9), 0).multiplyScalar(0.12 * conjure))
      upperDir.x -= Math.sin(t * 2.1) * 0.03
      poseArm(near, upperDir, foreDir)
      mixDir(upperDir, (p) => p.staff.upper, staffWeights)
      mixDir(foreDir, (p) => p.staff.fore, staffWeights)
      upperDir.x += Math.sin(t * 2.1) * 0.03
      const staffLean = foreDir.x
      poseArm(holder, upperDir, foreDir)

      // The head follows the pointer, and tips back to watch the card while he conjures.
      head.rotation.set(-state.lookY * 0.18 - 0.2 * conjure + Math.sin(t * 0.9) * 0.03, state.lookX * 0.45 - 0.25 * conjure, Math.sin(t * 0.7) * 0.05)
      // He floats and sways a little about his hem.
      figure.position.y = Math.sin(t * 1.25) * BOB
      figure.rotation.z = Math.sin(t * 0.8) * 0.03

      // The staff stands in the staff hand, upright, leaning with the forearm.
      figure.updateMatrixWorld(true)
      holder.elbow.localToWorld(grip.copy(gripLocal))
      figure.worldToLocal(grip)
      staff.position.set(grip.x, grip.y - GRIP, grip.z)
      staff.rotation.set(-0.1 - 0.35 * thrust, 0, -0.3 * staffLean)
      staff.updateMatrixWorld(true)

      uniforms.uTime.value = t
      uniforms.uAssemble.value = state.appear
      uniforms.uBlink.value = t % BLINK_EVERY < BLINK_S ? 1 : 0
      uniforms.uLight.value = state.light
      uniforms.uFlash.value = thrust
      crystalUniforms.uTime.value = t
      crystalUniforms.uPower.value = 0.4 + 0.6 * state.channel + thrust
      crystal.rotation.set(t * 0.7, t * 1.1, 0)
      crystal.scale.setScalar(1 + 0.12 * Math.sin(t * 3) + 0.5 * thrust)
      crystal.updateMatrixWorld()

      sparkUniforms.uTime.value = t
      sparkUniforms.uAppear.value = state.appear
      sparkUniforms.uStream.value = state.stream * state.appear
      sparkUniforms.uSince.value = since
      ctx.renderer.getDrawingBufferSize(buffer)
      sparkUniforms.uScale.value = (buffer.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * VOXEL * group.scale.x
      figure.worldToLocal(near.elbow.localToWorld(sparkUniforms.uHand.value.copy(handLocal)))
      figure.worldToLocal(crystal.getWorldPosition(sparkUniforms.uCrystal.value))
      figure.worldToLocal(sparkUniforms.uTarget.value.copy(state.target))
      circleUniforms.uTime.value = t
      circleUniforms.uAlpha.value = state.appear * state.appear
      circleUniforms.uFlash.value = thrust
      return true
    },
    hit(raycaster) {
      return group.visible && raycaster.intersectObject(hitBox, false).length > 0
    },
    cast(time) {
      castAt = time
    },
    hand(target) {
      return near.elbow.localToWorld(target.copy(handLocal))
    },
    crystal(target) {
      return crystal.getWorldPosition(target)
    },
    dispose() {
      cube.dispose()
      for (const geometry of geometries) geometry.dispose()
      material.dispose()
      crystalGeometry.dispose()
      crystalMaterial.dispose()
      sparkGeometry.dispose()
      sparkMaterial.dispose()
      circleGeometry.dispose()
      circleMaterial.dispose()
      hitGeometry.dispose()
      hitMaterial.dispose()
    },
  }
}
