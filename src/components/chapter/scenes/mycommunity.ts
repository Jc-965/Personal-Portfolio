/**
 * MyCommunity's scene. The centrepiece is a paper trail map, folded in half and then in a five-panel accordion,
 * printed on two canvas textures: a kraft cover outside and a topographic map inside. The vertex shader hinges
 * every panel at its crease and the top half at the half fold, so the map opens panel by panel with the scroll and
 * lies flat. Its printed contours then rise into the land they describe: one baked heightmap draws the contours in
 * the fragment shader and displaces the plane in the vertex shader, so the paper becomes the relief, layer by layer
 * from the valleys up. Pointing at the land traces the contour at that height. Troop pins drop onto the land as
 * the app's map markers (red, and azure for the signed-in leader's own troop), and the reader switches between the
 * three camera moves MapFragment makes. The app's screens then spring up out of the land as trailhead signs, which
 * the pointer brings forward. The close sinks the land and folds the map shut. Troop names and places are decorative.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { ChapterScene, SceneFactory, SceneFrame, SceneOutput, ScenePanel } from '../types'

/** The sheet in world units: W wide and D tall, PANELS accordion panels across, one half fold along y = 0. */
const W = 3.4
const D = 2.1
const PANELS = 5
const PANEL_W = W / PANELS
/** Plane segments. Columns fall on every crease and a row on the half fold, so each one bends along a vertex line. */
const SEG_X = PANELS * 40
const SEG_Y = 128
/** The baked heightmap's cells, rows from the south edge (v = 0), and the relief's world height at H = 1. */
const GRID_W = 256
const GRID_H = 160
const RELIEF = 0.62
/** Contour intervals over H 0 to 1, every fifth an index contour. The vertex shader's layered rise uses the same count. */
const LEVELS = 14
/** Crease angle of a shut panel and of the shut half fold, radians. Short of PI so stacked layers never share a plane. */
const SHUT = Math.PI * 0.955
const LID_SHUT = Math.PI * 0.985
/** z offset of the folded-over half, so it rests on the lower half instead of inside it. */
const LID_GAP = 0.006
/** Canvas size of each printed side. Text on the cover stays near one texel per pixel at the arrival's framing. */
const PRINT = { wide: [2048, 1264], narrow: [1536, 948] } as const

/** Places in map uv, u from the west edge and v from the south edge. */
type UV = readonly [number, number]
const SUMMIT: UV = [0.66, 0.64]
const LAKE = { at: [0.2, 0.33] as UV, r: [0.075, 0.115] as UV }
const TRAIL: readonly UV[] = [[0.1, 0.17], [0.16, 0.2], [0.26, 0.24], [0.35, 0.33], [0.44, 0.41], [0.55, 0.46], [0.63, 0.52], [0.71, 0.56], [0.69, 0.62], [0.66, 0.64]]
const STREAM: readonly UV[] = [[0.5, 0.66], [0.45, 0.57], [0.4, 0.5], [0.33, 0.45], [0.27, 0.38], [0.24, 0.35]]
/**
 * Decorative troops in map uv, in the story's panel order. No real troop data is shown. OWN is the signed-in
 * leader's troop, drawn azure as MapFragment draws it (BitmapDescriptorFactory.HUE_AZURE). HINT is the red pin the
 * hover callout points at.
 */
const TROOPS: readonly UV[] = [[0.6, 0.6], [0.46, 0.5], [0.27, 0.25], [0.29, 0.6], [0.8, 0.68], [0.84, 0.3], [0.42, 0.75], [0.62, 0.27]]
const OWN = 1
const HINT = 0
/** The app's screens as signs, in the story's panel order after the troops. */
const SCREENS = ['login', 'troop-map', 'community-service', 'my-troop'] as const
const SIGNS: readonly UV[] = [[0.15, 0.42], [0.385, 0.42], [0.62, 0.42], [0.855, 0.42]]
/**
 * A screen capture's height in world units and its 1080 by 2424 aspect, and the post under it. Signs stand at
 * SIGN_SCALE, large against the map so the captures read, in one row 0.235 of the map's width apart, so no sign
 * stands in front of another.
 */
const SCREEN_H = 0.8
const SCREEN_W = SCREEN_H * (1080 / 2424)
const POST_H = 0.2
const SIGN_SCALE = { wide: 1.6, narrow: 1.5 }
/** A pin's height from its tip to the top of its head, and how far it falls when it drops. */
const PIN_H = 0.2
const PIN_DROP = 0.9
/** Camera moves MapFragment makes after each redraw: fit several markers, zoom to 11 on one, or the default view. */
type Mode = 'many' | 'one' | 'none'
const MODES: readonly Mode[] = ['many', 'one', 'none']
/**
 * The paper fades out from the first to the second fraction: of the width on wide stages, where the copy rail
 * ends near 0.41 and the fitted views start at 0.44, and of the height from the top on phones, where the copy
 * starts under FLOOR_NDC. Only a view zoomed or panned past its fit (one troop, a picked pin) reaches it, and
 * there the fade widens to `soft` so the land falls off into the dark instead of ending at an edge.
 */
const GUARD = { wide: { tight: [0.4, 0.45], soft: [0.36, 0.53] }, narrow: { tight: [0.5, 0.57], soft: [0.47, 0.62] } } as const
/** On phones the copy floor sits at this NDC height for every pose, the bottom of the region the views fit into. */
const FLOOR_NDC = 0
/** Share of the stage height kept clear around the fitted map and its pins. */
const FIT_PAD = { wide: 0.05, narrow: 0.03 }
/** Pointer reach. The shut map turns up to 0.3 rad of yaw and 0.17 of pitch, and the camera orbits the flat map. */
const TILT = { yaw: 0.3, pitch: 0.17, orbit: 0.12, rise: 0.06 }
/** Time constants (seconds) and spring rates (rad/s) of the motions the pointer, a click, or a choice starts. */
const HOVER_EASE = 0.16
const CAMERA_RATE = 3.6
/** Extra camera distance at the middle of a move between modes, so the camera rises and comes back down. */
const ARC = { wide: 2.6, narrow: 4 }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / Math.max(1e-9, b - a))
const smoother = (t: number) => {
  const x = clamp01(t)
  return x * x * x * (x * (x * 6 - 15) + 10)
}
const smoothstep = (a: number, b: number, t: number) => {
  const x = ramp(t, a, b)
  return x * x * (3 - 2 * x)
}
/** Eases `from` toward `to` with time constant `tc` seconds, landing on it once within 1e-4. */
const ease = (from: number, to: number, dt: number, tc: number) => (Math.abs(to - from) < 1e-4 ? to : from + (to - from) * (1 - Math.exp(-dt / tc)))
/** The standard ease-out bounce, 0 to 1, for a pin's drop. */
function bounce(t: number) {
  const n = 7.5625
  const d = 2.75
  if (t < 1 / d) return n * t * t
  if (t < 2 / d) return n * (t - 1.5 / d) ** 2 + 0.75
  if (t < 2.5 / d) return n * (t - 2.25 / d) ** 2 + 0.9375
  return n * (t - 2.625 / d) ** 2 + 0.984375
}

interface Spring { value: number; velocity: number }
/**
 * Steps a critically damped spring toward `goal` at `omega` rad/s with the exact solution, so a move eases in and
 * out without overshoot at any frame rate. Returns true while it moves, and lands on the goal once at rest.
 */
function springStep(s: Spring, goal: number, dt: number, omega: number): boolean {
  if (Math.abs(goal - s.value) < 1e-4 && Math.abs(s.velocity) < 1e-3) {
    s.value = goal
    s.velocity = 0
    return false
  }
  const x0 = s.value - goal
  const decay = Math.exp(-omega * dt)
  const k = s.velocity + omega * x0
  s.value = goal + (x0 + k * dt) * decay
  s.velocity = (s.velocity - k * omega * dt) * decay
  return true
}

/** A lattice hash and smooth value noise in [0, 1). The same seed gives the same land on every visit. */
function hash(ix: number, iy: number, seed: number) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy, seed) + (hash(ix + 1, iy, seed) - hash(ix, iy, seed)) * sx
  const b = hash(ix, iy + 1, seed) + (hash(ix + 1, iy + 1, seed) - hash(ix, iy + 1, seed)) * sx
  return a + (b - a) * sy
}
function fbm(x: number, y: number, seed: number) {
  return (noise(x, y, seed) * 0.53 + noise(x * 2.03, y * 2.03, seed + 1) * 0.27 + noise(x * 4.1, y * 4.1, seed + 2) * 0.13 + noise(x * 8.3, y * 8.3, seed + 3) * 0.07)
}

/** Hills in world units from the south-west corner: centre, spread along and across, turn, and height. */
const HILLS: readonly (readonly [number, number, number, number, number, number])[] = [
  [0.66 * W, 0.64 * D, 0.46, 0.27, 0.5, 1.0],
  [0.36 * W, 0.7 * D, 0.3, 0.25, 0, 0.6],
  [0.84 * W, 0.34 * D, 0.25, 0.36, -0.4, 0.66],
  [0.52 * W, 0.37 * D, 0.36, 0.18, 0.25, 0.3],
  [0.13 * W, 0.74 * D, 0.25, 0.25, 0, 0.42],
  [0.52 * W, 0.86 * D, 0.55, 0.15, 0.05, 0.42],
]
const lakeField = (u: number, v: number) => {
  const du = (u - LAKE.at[0]) / LAKE.r[0]
  const dv = (v - LAKE.at[1]) / LAKE.r[1]
  return 1 - du * du - dv * dv + (noise(u * 14, v * 14, 91) - 0.5) * 0.6
}

interface Terrain {
  /** H, 0 to 1, per cell, rows from the south edge. */
  heights: Float32Array
  /** Woodland cover, 0 or 1, per cell. */
  woods: Float32Array
}

/** Bakes the land once. The collar (the map's printed border) stays at H = 0 and the lake is flat water at H = 0. */
function bakeTerrain(): Terrain {
  const heights = new Float32Array(GRID_W * GRID_H)
  const woods = new Float32Array(GRID_W * GRID_H)
  let top = 0
  for (let j = 0; j < GRID_H; j++) {
    for (let i = 0; i < GRID_W; i++) {
      const u = (i + 0.5) / GRID_W
      const v = (j + 0.5) / GRID_H
      const x = u * W
      const y = v * D
      let h = 0.05
      for (const [cx, cy, sa, sb, turn, amp] of HILLS) {
        const dx = x - cx
        const dy = y - cy
        const along = (dx * Math.cos(turn) + dy * Math.sin(turn)) / sa
        const across = (-dx * Math.sin(turn) + dy * Math.cos(turn)) / sb
        h += amp * Math.exp(-0.5 * (along * along + across * across))
      }
      h += (fbm(x * 1.7, y * 1.7, 7) - 0.5) * 0.26
      const lake = lakeField(u, v)
      if (lake > -0.6) h *= 1 - smoothstep(-0.6, 0, lake)
      const edge = Math.min(x, W - x, y, D - y)
      h = Math.max(0, h * smoothstep(0.14, 0.42, edge))
      heights[j * GRID_W + i] = h
      top = Math.max(top, h)
    }
  }
  for (let k = 0; k < heights.length; k++) {
    heights[k] /= top
    const i = k % GRID_W
    const j = Math.floor(k / GRID_W)
    const u = (i + 0.5) / GRID_W
    const v = (j + 0.5) / GRID_H
    const wood = fbm(u * W * 2.4, v * D * 2.4, 31)
    woods[k] = wood > 0.5 && heights[k] > 0.05 && heights[k] < 0.8 && lakeField(u, v) < -0.25 ? 1 : 0
  }
  return { heights, woods }
}

/** H at map uv, bilinear between cell centres with the edge clamped, as the GPU samples the height texture. */
function heightAt(terrain: Terrain, u: number, v: number) {
  const x = Math.min(GRID_W - 1, Math.max(0, u * GRID_W - 0.5))
  const y = Math.min(GRID_H - 1, Math.max(0, v * GRID_H - 0.5))
  const i = Math.min(GRID_W - 2, Math.floor(x))
  const j = Math.min(GRID_H - 2, Math.floor(y))
  const fx = x - i
  const fy = y - j
  const at = (a: number, b: number) => terrain.heights[b * GRID_W + a]
  const bottom = at(i, j) + (at(i + 1, j) - at(i, j)) * fx
  const upper = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx
  return bottom + (upper - bottom) * fy
}

/**
 * The world height of H at `rise`. Each contour layer lifts once the rise passes 0.7 of its height, over 0.3 of the
 * rise, so the valleys stand first and a peak ends as a plateau until its layers arrive. PAPER_VERTEX's elevation()
 * must compute the same function, or the pins float above or sink into the land.
 */
function elevation(h: number, rise: number) {
  if (rise <= 0) return 0
  let z = 0
  for (let k = 0; k < LEVELS; k++) {
    const t0 = k / LEVELS
    const lift = smoothstep(0, 1, (rise - 0.7 * (t0 + 0.5 / LEVELS)) / 0.3)
    z += Math.min(Math.max(h - t0, 0), 1 / LEVELS) * lift
  }
  return z * RELIEF
}

interface Fold { creases: number[]; lid: number }
/**
 * A point of the flat sheet at (x, y) and height z, folded: the top half turns about y = 0 first, then each panel
 * right of the first turns about its crease, outermost first. PAPER_VERTEX must fold the same way.
 */
function foldPoint(x: number, y: number, z: number, fold: Fold, out: THREE.Vector3) {
  let px = x
  let py = y
  let pz = z
  if (y > 1e-4) {
    const c = Math.cos(fold.lid)
    const s = Math.sin(fold.lid)
    const qz = pz - LID_GAP / 2
    py = y * c - qz * s
    pz = y * s + qz * c + LID_GAP / 2
  }
  const panel = Math.floor((x + W / 2) / PANEL_W + 1e-3)
  for (let j = PANELS - 1; j >= 1; j--) {
    if (panel < j) continue
    const x0 = -W / 2 + j * PANEL_W
    const c = Math.cos(fold.creases[j - 1])
    const s = Math.sin(fold.creases[j - 1])
    const dx = px - x0
    px = x0 + dx * c + pz * s
    pz = -dx * s + pz * c
  }
  return out.set(px, py, pz)
}

const glsl = (v: number) => (Number.isInteger(v) ? `${v}.0` : `${v}`)

const PAPER_VERTEX = /* glsl */ `
uniform sampler2D uHeight;
uniform vec2 uTexel;
uniform float uCrease[${PANELS - 1}];
uniform float uLid;
uniform float uRise;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;

// elevation() in mycommunity.ts, the layered rise.
float elevation(float h) {
  float z = 0.0;
  for (int k = 0; k < ${LEVELS}; k++) {
    float t0 = float(k) / ${glsl(LEVELS)};
    float lift = smoothstep(0.0, 1.0, (uRise - 0.7 * (t0 + 0.5 / ${glsl(LEVELS)})) / 0.3);
    z += clamp(h - t0, 0.0, 1.0 / ${glsl(LEVELS)}) * lift;
  }
  return z * ${glsl(RELIEF)};
}

void hinge(inout vec3 p, inout vec3 n, float x0, float a) {
  float c = cos(a);
  float s = sin(a);
  float dx = p.x - x0;
  p = vec3(x0 + dx * c + p.z * s, p.y, -dx * s + p.z * c);
  n = vec3(n.x * c + n.z * s, n.y, -n.x * s + n.z * c);
}

void main() {
  vUv = uv;
  vec3 p = vec3(position.xy, 0.0);
  vec3 n = vec3(0.0, 0.0, 1.0);
  if (uRise > 0.0) {
    p.z = elevation(texture2D(uHeight, uv).r);
    float ex = elevation(texture2D(uHeight, uv + vec2(uTexel.x, 0.0)).r) - elevation(texture2D(uHeight, uv - vec2(uTexel.x, 0.0)).r);
    float ey = elevation(texture2D(uHeight, uv + vec2(0.0, uTexel.y)).r) - elevation(texture2D(uHeight, uv - vec2(0.0, uTexel.y)).r);
    n = normalize(vec3(-ex / (2.0 * uTexel.x * ${glsl(W)}), -ey / (2.0 * uTexel.y * ${glsl(D)}), 1.0));
  }
  // foldPoint() in mycommunity.ts: the half fold, then the creases outermost first.
  if (position.y > 1e-4) {
    float c = cos(uLid);
    float s = sin(uLid);
    float qz = p.z - ${glsl(LID_GAP / 2)};
    p = vec3(p.x, p.y * c - qz * s, p.y * s + qz * c + ${glsl(LID_GAP / 2)});
    n = vec3(n.x, n.y * c - n.z * s, n.y * s + n.z * c);
  }
  float panel = floor((position.x + ${glsl(W / 2)}) / ${glsl(PANEL_W)} + 1e-3);
  for (int j = ${PANELS - 1}; j >= 1; j--) {
    if (panel >= float(j)) hinge(p, n, ${glsl(-W / 2)} + float(j) * ${glsl(PANEL_W)}, uCrease[j - 1]);
  }
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const PAPER_FRAGMENT = /* glsl */ `
uniform sampler2D uFront;
uniform sampler2D uBack;
uniform sampler2D uHeight;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uLampAt;
uniform vec3 uLampColor;
uniform float uLamp;
uniform vec4 uProbe;
uniform float uFrontLevel;
uniform float uFrontGlow;
uniform float uGlow;
uniform float uLight;
uniform float uRaised;
uniform vec3 uGuard;
uniform vec2 uRes;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;

const vec3 CONTOUR = vec3(0.32, 0.15, 0.05);
const vec3 GLOW = vec3(0.62, 1.0, 0.3);

float grain(vec2 p) {
  return fract(sin(dot(floor(p), vec2(127.1, 311.7))) * 43758.5453);
}

// Coverage of an iso-line at distance d, in units of the field's screen derivative w, half width r px.
float iso(float d, float w, float r) {
  return 1.0 - smoothstep(r - 0.5, r + 0.7, d / max(w, 1e-5));
}

void main() {
  // Derivatives come first, outside the face branch, since gl_FrontFacing can differ inside one pixel quad.
  float h = texture2D(uHeight, vUv).r;
  float level = h * ${glsl(LEVELS)};
  float lw = fwidth(level);
  float hw = fwidth(h);
  float nearest = floor(level + 0.5);
  float index = 1.0 - step(0.5, mod(nearest, 5.0));
  float contour = iso(abs(level - nearest), lw, 0.75 + 0.6 * index) * smoothstep(0.004, 0.03, h) * step(0.5, nearest);
  float probe = iso(abs(h - uProbe.z), hw, 1.2) * uProbe.w * step(0.004, h);
  float rising = iso(abs(h - uFrontLevel), hw, 1.4) * uFrontGlow * step(0.004, h);
  // The creases stay as faint lines once the sheet is open: four across, one along the half fold.
  vec2 sheet = vUv * vec2(${glsl(W)}, ${glsl(D)});
  vec2 sw = fwidth(sheet);
  float across = abs(fract(sheet.x / ${glsl(PANEL_W)} + 0.5) - 0.5) * ${glsl(PANEL_W)};
  float crease = max(iso(across, sw.x, 0.8) * step(0.01, sheet.x) * step(sheet.x, ${glsl(W - 0.01)}), iso(abs(sheet.y - ${glsl(D / 2)}), sw.y, 0.8));

  vec3 n = normalize(vNormal);
  vec3 albedo;
  float front = gl_FrontFacing ? 1.0 : 0.0;
  if (gl_FrontFacing) {
    albedo = texture2D(uFront, vUv).rgb;
    albedo = mix(albedo, CONTOUR, contour * 0.8);
  } else {
    albedo = texture2D(uBack, vec2(1.0 - vUv.x, vUv.y)).rgb;
    n = -n;
  }
  albedo *= 0.95 + 0.07 * grain(vUv * vec2(1400.0, 865.0)) - 0.12 * crease;

  vec3 view = normalize(cameraPosition - vWorld);
  float key = max(dot(n, uKeyDir), 0.0);
  vec3 hemi = mix(uGround, uSky, n.y * 0.5 + 0.5);
  vec3 toLamp = uLampAt - vWorld;
  float r2 = dot(toLamp, toLamp);
  float lamp = uLamp * max(dot(n, toLamp * inversesqrt(r2)), 0.0) / (1.0 + r2 * 9.0);
  // Valleys of the raised land take less sky, so the relief keeps its depth where the key light is flat.
  float occlusion = 1.0 - 0.3 * uRaised * front * step(0.004, h) * (1.0 - smoothstep(0.0, 0.55, h));
  vec3 lit = albedo * (hemi * occlusion + uKeyColor * key + uLampColor * lamp) * uLight;
  // A faint light from the reader's side keeps a face turned away from the key (the half fold as it stands) readable,
  // and paper takes a little more light at grazing angles, so an edge-on panel still reads against the dark room.
  float facing = max(dot(n, view), 0.0);
  lit += albedo * (vec3(0.16, 0.13, 0.1) * facing + uKeyColor * pow(1.0 - facing, 3.0) * 0.1) * uLight;
  lit += GLOW * front * (contour * index * uGlow * 0.45 + rising * 1.6 + probe * 2.0);
  // The guard fades the paper out before it reaches the copy: across x on wide stages, down y on phones. The
  // material draws without blending, so the output is premultiplied by hand for the composite.
  vec2 at = gl_FragCoord.xy / uRes;
  float guard = uGuard.z < 0.5 ? smoothstep(uGuard.x, uGuard.y, at.x) : 1.0 - smoothstep(uGuard.x, uGuard.y, 1.0 - at.y);
  gl_FragColor = vec4(lit * guard, guard);
}
`

/** A soft disc of shade under a pin. */
const SHADE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const SHADE_FRAGMENT = /* glsl */ `
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = 1.0 - smoothstep(0.0, 1.0, r);
  gl_FragColor = vec4(0.0, 0.0, 0.0, a * a * uOpacity);
}
`

const FONT = {
  title: '"Big Shoulders Stencil Display", "Arial Narrow", sans-serif',
  serif: '"Bitter", Georgia, serif',
  mono: '"Overpass Mono", "Courier New", monospace',
}
const INK = {
  paper: '#efe4c6',
  kraft: '#c39c69',
  wood: '#c9dcaa',
  water: '#b7d6df',
  shore: '#3f7fa8',
  trail: '#b3422a',
  text: '#2a2015',
  forest: '#22392a',
  azure: '#3d8ef0',
  red: '#e5432f',
}

/** The inside of the sheet: a topographic trail map with woodland, water, the trail, place names, and a collar. */
function paintFront(canvas: HTMLCanvasElement, terrain: Terrain) {
  const g = canvas.getContext('2d')
  if (!g) return
  const cw = canvas.width
  const ch = canvas.height
  const k = cw / 2048
  const X = (u: number) => u * cw
  const Y = (v: number) => (1 - v) * ch
  g.save()
  g.fillStyle = INK.paper
  g.fillRect(0, 0, cw, ch)
  // Large soft stains, so the sheet reads as handled paper and not a flat fill.
  for (let s = 0; s < 7; s++) {
    const gx = hash(s, 3, 5) * cw
    const gy = hash(s, 4, 5) * ch
    const gr = (0.15 + hash(s, 5, 5) * 0.3) * cw
    const stain = g.createRadialGradient(gx, gy, 0, gx, gy, gr)
    stain.addColorStop(0, 'rgba(150, 110, 60, 0.07)')
    stain.addColorStop(1, 'rgba(150, 110, 60, 0)')
    g.fillStyle = stain
    g.fillRect(0, 0, cw, ch)
  }
  // Woodland tint from the baked cover, upscaled with smoothing so its edges are soft.
  const cover = document.createElement('canvas')
  cover.width = GRID_W
  cover.height = GRID_H
  const cg = cover.getContext('2d')
  if (cg) {
    const image = cg.createImageData(GRID_W, GRID_H)
    for (let j = 0; j < GRID_H; j++) {
      for (let i = 0; i < GRID_W; i++) {
        const o = ((GRID_H - 1 - j) * GRID_W + i) * 4
        image.data[o] = 186
        image.data[o + 1] = 210
        image.data[o + 2] = 150
        image.data[o + 3] = terrain.woods[j * GRID_W + i] * 210
      }
    }
    cg.putImageData(image, 0, 0)
    g.imageSmoothingEnabled = true
    g.drawImage(cover, 0, 0, cw, ch)
  }
  // The lake, traced from its field along 96 rays.
  g.beginPath()
  for (let s = 0; s <= 96; s++) {
    const angle = (s / 96) * Math.PI * 2
    let lo = 0
    let hi = 2.2
    for (let it = 0; it < 18; it++) {
      const mid = (lo + hi) / 2
      if (lakeField(LAKE.at[0] + Math.cos(angle) * LAKE.r[0] * mid, LAKE.at[1] + Math.sin(angle) * LAKE.r[1] * mid) > 0) lo = mid
      else hi = mid
    }
    const px = X(LAKE.at[0] + Math.cos(angle) * LAKE.r[0] * lo)
    const py = Y(LAKE.at[1] + Math.sin(angle) * LAKE.r[1] * lo)
    if (s === 0) g.moveTo(px, py)
    else g.lineTo(px, py)
  }
  g.closePath()
  g.fillStyle = INK.water
  g.fill()
  g.lineWidth = 3 * k
  g.strokeStyle = INK.shore
  g.stroke()
  const curve = (points: readonly UV[]) => {
    g.beginPath()
    g.moveTo(X(points[0][0]), Y(points[0][1]))
    for (let s = 1; s < points.length - 1; s++) {
      const mx = (X(points[s][0]) + X(points[s + 1][0])) / 2
      const my = (Y(points[s][1]) + Y(points[s + 1][1])) / 2
      g.quadraticCurveTo(X(points[s][0]), Y(points[s][1]), mx, my)
    }
    const last = points[points.length - 1]
    g.lineTo(X(last[0]), Y(last[1]))
  }
  curve(STREAM)
  g.strokeStyle = INK.shore
  g.lineWidth = 3.5 * k
  g.lineCap = 'round'
  g.stroke()
  // A thin grid, as on a printed quadrangle.
  g.strokeStyle = 'rgba(42, 32, 21, 0.13)'
  g.lineWidth = 1.5 * k
  for (let s = 1; s < 10; s++) {
    g.beginPath()
    g.moveTo(X(s / 10), Y(0.05))
    g.lineTo(X(s / 10), Y(0.95))
    g.stroke()
  }
  for (let s = 1; s < 6; s++) {
    g.beginPath()
    g.moveTo(X(0.03), Y(s / 6))
    g.lineTo(X(0.97), Y(s / 6))
    g.stroke()
  }
  // The trail: a cream halo under a rust dash.
  curve(TRAIL)
  g.setLineDash([])
  g.strokeStyle = 'rgba(244, 236, 214, 0.85)'
  g.lineWidth = 11 * k
  g.lineJoin = 'round'
  g.stroke()
  g.setLineDash([16 * k, 10 * k])
  g.strokeStyle = INK.trail
  g.lineWidth = 5.5 * k
  g.stroke()
  g.setLineDash([])
  // Trailhead square and summit triangle.
  g.fillStyle = INK.trail
  g.fillRect(X(TRAIL[0][0]) - 12 * k, Y(TRAIL[0][1]) - 12 * k, 24 * k, 24 * k)
  g.fillStyle = INK.paper
  g.font = `700 ${14 * k}px ${FONT.mono}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('TH', X(TRAIL[0][0]), Y(TRAIL[0][1]) + 1 * k)
  g.fillStyle = INK.text
  g.beginPath()
  g.moveTo(X(SUMMIT[0]), Y(SUMMIT[1]) - 15 * k)
  g.lineTo(X(SUMMIT[0]) + 13 * k, Y(SUMMIT[1]) + 9 * k)
  g.lineTo(X(SUMMIT[0]) - 13 * k, Y(SUMMIT[1]) + 9 * k)
  g.closePath()
  g.fill()
  // Place names, natural features in italic as cartographers set them.
  const name = (text: string, at: UV, size: number, turn = 0, italic = true) => {
    g.save()
    g.translate(X(at[0]), Y(at[1]))
    g.rotate(turn)
    g.font = `${italic ? 'italic ' : ''}${italic ? 400 : 600} ${size * k}px ${FONT.serif}`
    g.lineWidth = 5 * k
    g.strokeStyle = 'rgba(239, 228, 198, 0.8)'
    g.strokeText(text, 0, 0)
    g.fillStyle = INK.text
    g.fillText(text, 0, 0)
    g.restore()
  }
  name('Cedar Ridge', [SUMMIT[0] + 0.005, SUMMIT[1] + 0.055], 34, 0, false)
  name('Lantern Lake', [LAKE.at[0] + 0.005, LAKE.at[1] + 0.005], 26)
  name('Mill Creek', [0.37, 0.5], 24, 0.55)
  name('Birch Hollow', [0.27, 0.66], 26)
  name('Fox Run', [0.81, 0.75], 26)
  name('Granite Falls', [0.85, 0.22], 26)
  name('Pine Bluff', [0.4, 0.82], 26)
  name('Elk Meadow', [0.6, 0.2], 26)
  // The collar: a neatline and its printed border.
  const mu = 0.03
  const mv = (mu * W) / D
  g.strokeStyle = INK.text
  g.lineWidth = 3 * k
  g.strokeRect(X(mu), Y(1 - mv), X(1 - 2 * mu), ch * (1 - 2 * mv))
  g.lineWidth = 1.2 * k
  g.strokeRect(X(mu) - 7 * k, Y(1 - mv) - 7 * k, X(1 - 2 * mu) + 14 * k, ch * (1 - 2 * mv) + 14 * k)
  g.fillStyle = INK.text
  g.textAlign = 'left'
  g.textBaseline = 'middle'
  g.font = `800 ${34 * k}px ${FONT.title}`
  g.fillText('MYCOMMUNITY', X(mu), (Y(1 - mv) - 7 * k) / 2)
  g.textAlign = 'right'
  g.font = `600 ${18 * k}px ${FONT.mono}`
  g.fillText('TROOP MAP', X(1 - mu), (Y(1 - mv) - 7 * k) / 2)
  // Scale bar and north arrow in the bottom collar.
  const barY = (Y(mv) + 7 * k + ch) / 2
  for (let s = 0; s < 4; s++) {
    g.fillStyle = s % 2 ? INK.paper : INK.text
    g.fillRect(X(mu) + s * 60 * k, barY - 5 * k, 60 * k, 10 * k)
  }
  g.strokeStyle = INK.text
  g.lineWidth = 1.5 * k
  g.strokeRect(X(mu), barY - 5 * k, 240 * k, 10 * k)
  g.fillStyle = INK.text
  g.beginPath()
  g.moveTo(X(1 - mu) - 14 * k, barY - 14 * k)
  g.lineTo(X(1 - mu) - 4 * k, barY + 12 * k)
  g.lineTo(X(1 - mu) - 14 * k, barY + 6 * k)
  g.lineTo(X(1 - mu) - 24 * k, barY + 12 * k)
  g.closePath()
  g.fill()
  g.textAlign = 'right'
  g.font = `700 ${18 * k}px ${FONT.mono}`
  g.fillText('N', X(1 - mu) - 34 * k, barY + 1 * k)
  g.restore()
}

/**
 * The outside of the sheet. The folded-over half's outside shows when the sheet is shut or half open, and it turns
 * PI about the half fold to get there, so its five panels are drawn upright on their own canvas and then set into
 * the top half of this one turned 180 degrees. Panel 0 is the cover, then the legend, the troop record, the
 * service list, and the news tab, all from the app.
 */
function paintBack(canvas: HTMLCanvasElement) {
  const g = canvas.getContext('2d')
  if (!g) return
  const cw = canvas.width
  const ch = canvas.height
  const k = cw / 2048
  g.save()
  g.fillStyle = INK.kraft
  g.fillRect(0, 0, cw, ch)
  // Fibres: short, faint strokes at fixed seeded places.
  g.lineWidth = 1.2 * k
  for (let s = 0; s < 900; s++) {
    const fx = hash(s, 1, 77) * cw
    const fy = hash(s, 2, 77) * ch
    const turn = hash(s, 3, 77) * Math.PI
    const len = (6 + hash(s, 4, 77) * 16) * k
    g.strokeStyle = hash(s, 5, 77) > 0.5 ? 'rgba(255, 240, 210, 0.16)' : 'rgba(90, 60, 30, 0.14)'
    g.beginPath()
    g.moveTo(fx, fy)
    g.lineTo(fx + Math.cos(turn) * len, fy + Math.sin(turn) * len)
    g.stroke()
  }
  const half = document.createElement('canvas')
  half.width = cw
  half.height = Math.round(ch / 2)
  const h = half.getContext('2d')
  if (h) {
    const pw = cw / PANELS
    const ph = half.height
    const pad = 34 * k
    const heading = (text: string, x: number, y: number) => {
      h.fillStyle = INK.forest
      h.font = `800 ${46 * k}px ${FONT.title}`
      h.textAlign = 'left'
      h.textBaseline = 'alphabetic'
      h.fillText(text, x, y)
      h.fillStyle = INK.trail
      h.fillRect(x, y + 12 * k, 64 * k, 5 * k)
    }
    const line = (text: string, x: number, y: number, size = 21, colour = INK.text) => {
      h.fillStyle = colour
      h.font = `600 ${size * k}px ${FONT.mono}`
      h.textAlign = 'left'
      h.textBaseline = 'middle'
      h.fillText(text, x, y)
    }
    // Panel 0, the cover: a forest band with the name, a topographic badge, and the login headline.
    h.fillStyle = INK.forest
    h.fillRect(0, 0, pw, ph * 0.3)
    h.fillStyle = '#efe4c6'
    h.font = `800 ${74 * k}px ${FONT.title}`
    h.textAlign = 'center'
    h.textBaseline = 'middle'
    h.fillText('MYCOMMUNITY', pw / 2, ph * 0.13)
    h.fillStyle = '#e2774a'
    h.font = `600 ${22 * k}px ${FONT.mono}`
    h.fillText('TROOP MAP · ANDROID', pw / 2, ph * 0.23)
    const cx = pw / 2
    const cy = ph * 0.56
    for (let ring = 7; ring >= 1; ring--) {
      h.beginPath()
      for (let s = 0; s <= 64; s++) {
        const angle = (s / 64) * Math.PI * 2
        const wobble = 1 + (noise(Math.cos(angle) * 2 + ring, Math.sin(angle) * 2, 13) - 0.5) * 0.35
        const r = ring * 19 * k * wobble
        const px = cx + Math.cos(angle) * r * 1.1
        const py = cy + Math.sin(angle) * r * 0.9
        if (s === 0) h.moveTo(px, py)
        else h.lineTo(px, py)
      }
      h.closePath()
      h.strokeStyle = ring % 5 === 0 ? 'rgba(80, 45, 20, 0.85)' : 'rgba(80, 45, 20, 0.55)'
      h.lineWidth = (ring % 5 === 0 ? 3.2 : 1.8) * k
      h.stroke()
    }
    h.fillStyle = INK.red
    h.beginPath()
    h.arc(cx, cy - 22 * k, 15 * k, Math.PI * 0.85, Math.PI * 0.15)
    h.lineTo(cx, cy + 8 * k)
    h.closePath()
    h.fill()
    h.fillStyle = '#5a140c'
    h.beginPath()
    h.arc(cx, cy - 23 * k, 5.5 * k, 0, Math.PI * 2)
    h.fill()
    h.textAlign = 'center'
    h.fillStyle = INK.text
    h.font = `600 ${21 * k}px ${FONT.mono}`
    ;['FIND TROOPS.', 'FOLLOW COMMUNITY NEEDS.', 'ORGANIZE SERVICE.'].forEach((text, i) => h.fillText(text, cx, ph * 0.84 + i * 30 * k))
    h.strokeStyle = 'rgba(42, 32, 21, 0.55)'
    h.lineWidth = 2 * k
    h.strokeRect(14 * k, 14 * k, pw - 28 * k, ph - 28 * k)
    // Panel 1, the legend, with the app's two marker colours.
    let x = pw + pad
    heading('LEGEND', x, 96 * k)
    const pin = (px: number, py: number, colour: string) => {
      h.fillStyle = colour
      h.beginPath()
      h.arc(px, py - 10 * k, 12 * k, Math.PI * 0.85, Math.PI * 0.15)
      h.lineTo(px, py + 14 * k)
      h.closePath()
      h.fill()
      h.fillStyle = 'rgba(0, 0, 0, 0.55)'
      h.beginPath()
      h.arc(px, py - 11 * k, 4.5 * k, 0, Math.PI * 2)
      h.fill()
    }
    const rows: [string, () => void][] = [
      ['TROOP', () => pin(x + 20 * k, 190 * k, INK.red)],
      ['YOUR TROOP', () => pin(x + 20 * k, 260 * k, INK.azure)],
      ['TRAIL', () => { h.setLineDash([16 * k, 9 * k]); h.strokeStyle = INK.trail; h.lineWidth = 5 * k; h.beginPath(); h.moveTo(x, 330 * k); h.lineTo(x + 44 * k, 330 * k); h.stroke(); h.setLineDash([]) }],
      ['CONTOUR', () => { h.strokeStyle = '#7a4a22'; h.lineWidth = 3 * k; h.beginPath(); h.moveTo(x, 400 * k); h.bezierCurveTo(x + 14 * k, 388 * k, x + 30 * k, 412 * k, x + 44 * k, 398 * k); h.stroke() }],
      ['WATER', () => { h.fillStyle = INK.water; h.fillRect(x, 452 * k, 44 * k, 24 * k); h.strokeStyle = INK.shore; h.lineWidth = 2 * k; h.strokeRect(x, 452 * k, 44 * k, 24 * k) }],
      ['SUMMIT', () => { h.fillStyle = INK.text; h.beginPath(); h.moveTo(x + 22 * k, 518 * k); h.lineTo(x + 38 * k, 546 * k); h.lineTo(x + 6 * k, 546 * k); h.closePath(); h.fill() }],
    ]
    rows.forEach(([label, draw], i) => {
      draw()
      line(label, x + 64 * k, (190 + i * 70) * k - (i < 2 ? 6 * k : 0))
    })
    // Panel 2, the troop record the My Troop form writes.
    x = pw * 2 + pad
    heading('MY TROOP', x, 96 * k)
    ;['TROOP NAME', 'CONTACT EMAIL', 'LATITUDE', 'LONGITUDE', 'DESCRIPTION'].forEach((label, i) => {
      const y = (180 + i * 82) * k
      line(label, x, y, 18, 'rgba(42, 32, 21, 0.75)')
      h.fillStyle = 'rgba(42, 32, 21, 0.5)'
      h.fillRect(x, y + 34 * k, pw - pad * 2, 2 * k)
    })
    // Panel 3, the five organizations on the Community Service screen.
    x = pw * 3 + pad
    heading('SERVICE', x, 96 * k)
    ;['HABITAT FOR', 'HUMANITY', '', 'RED CROSS', 'DISASTER RELIEF', '', 'MEALS ON WHEELS', '', 'BIG BROTHERS', 'BIG SISTERS', '', 'ENVIRONMENTAL', 'CLEANUP'].forEach((text, i) => {
      if (text) line(text, x, (176 + i * 34) * k, 19)
    })
    // Panel 4, the news tab: headline rules standing in for stories.
    x = pw * 4 + pad
    heading('NEWS', x, 96 * k)
    line('TOP STORIES · WORLD', x, 170 * k, 18, 'rgba(42, 32, 21, 0.75)')
    for (let s = 0; s < 5; s++) {
      const y = (230 + s * 92) * k
      h.fillStyle = 'rgba(42, 32, 21, 0.62)'
      h.fillRect(x, y, (pw - pad * 2) * (0.92 - (s % 3) * 0.12), 13 * k)
      h.fillStyle = 'rgba(42, 32, 21, 0.3)'
      h.fillRect(x, y + 26 * k, (pw - pad * 2) * 0.86, 8 * k)
      h.fillRect(x, y + 44 * k, (pw - pad * 2) * 0.64, 8 * k)
    }
    g.translate(cw, half.height)
    g.rotate(Math.PI)
    g.drawImage(half, 0, 0)
  }
  g.restore()
}

/** A Google Maps marker: a teardrop head over a point, with a dark dot, built along +y with its tip at the origin. */
function pinGeometry() {
  const c = 1
  const r = 0.42
  const tangent = Math.sqrt(c * c - r * r)
  const tipR = (tangent * r) / c
  const tipY = (tangent * tangent) / c
  const profile: THREE.Vector2[] = []
  for (let s = 0; s <= 6; s++) profile.push(new THREE.Vector2((tipR * s) / 6, (tipY * s) / 6))
  const start = Math.atan2(tipY - c, tipR)
  for (let s = 1; s <= 18; s++) {
    const angle = start + ((Math.PI / 2 - start) * s) / 18
    profile.push(new THREE.Vector2(Math.max(0, Math.cos(angle) * r), c + Math.sin(angle) * r))
  }
  const head = new THREE.LatheGeometry(profile, 28)
  const dot = new THREE.CircleGeometry(0.15, 24)
  dot.translate(0, c, r + 0.004)
  const paint = (geometry: THREE.BufferGeometry, shade: number) => {
    const count = geometry.getAttribute('position').count
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(shade), 3))
    return geometry
  }
  const merged = mergeGeometries([paint(head, 1), paint(dot, 0.12)])
  head.dispose()
  dot.dispose()
  if (!merged) throw new Error('pin geometry failed to merge')
  merged.scale(PIN_H / (c + r), PIN_H / (c + r), PIN_H / (c + r))
  return merged
}

/** A trailhead sign's woodwork around a screen: two posts, a board behind it, and a small gable roof, base at the origin. */
function signGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const add = (geometry: THREE.BufferGeometry, colour: string, at: [number, number, number], roll = 0) => {
    geometry.rotateZ(roll)
    geometry.translate(...at)
    const c = new THREE.Color(colour)
    const count = geometry.getAttribute('position').count
    const colours = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) colours.set([c.r, c.g, c.b], i * 3)
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3))
    parts.push(geometry.index ? geometry.toNonIndexed() : geometry)
  }
  const postH = POST_H + SCREEN_H + 0.04
  add(new THREE.BoxGeometry(0.04, postH, 0.04), '#5b3d24', [-SCREEN_W / 2 - 0.035, postH / 2, -0.03])
  add(new THREE.BoxGeometry(0.04, postH, 0.04), '#5b3d24', [SCREEN_W / 2 + 0.035, postH / 2, -0.03])
  add(new THREE.BoxGeometry(SCREEN_W + 0.07, SCREEN_H + 0.07, 0.025), '#7a5534', [0, POST_H + SCREEN_H / 2, -0.016])
  const roofW = SCREEN_W * 0.62 + 0.06
  const roofY = POST_H + SCREEN_H + 0.1
  add(new THREE.BoxGeometry(roofW, 0.024, 0.1), '#3b2717', [-roofW * 0.44, roofY, -0.02], 0.42)
  add(new THREE.BoxGeometry(roofW, 0.024, 0.1), '#3b2717', [roofW * 0.44, roofY, -0.02], -0.42)
  const merged = mergeGeometries(parts)
  for (const part of parts) part.dispose()
  if (!merged) throw new Error('sign geometry failed to merge')
  return merged
}

interface Pose { x: number; y: number; z: number; dist: number; elev: number; az: number; fx: number; fy: number; fov: number }
const POSE_KEYS = ['x', 'y', 'z', 'dist', 'elev', 'az', 'fx', 'fy', 'fov'] as const
const mixPose = (out: Pose, to: Pose, t: number) => {
  for (const key of POSE_KEYS) out[key] += (to[key] - out[key]) * t
  return out
}

/** Orbits `camera` around the pose's target and shifts its frustum so the target sits at (fx, fy) of the frame. */
function placeCamera(camera: THREE.PerspectiveCamera, pose: Pose, aspect: number) {
  const ring = pose.dist * Math.cos(pose.elev)
  camera.position.set(pose.x + ring * Math.sin(pose.az), pose.y + pose.dist * Math.sin(pose.elev), pose.z + ring * Math.cos(pose.az))
  camera.lookAt(pose.x, pose.y, pose.z)
  camera.fov = pose.fov
  camera.setViewOffset(aspect, 1, aspect * (0.5 - pose.fx), 0.5 - pose.fy, aspect, 1)
}

const createScene: SceneFactory = (ctx) => {
  const scene = new THREE.Scene()
  scene.environment = ctx.environment
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80)
  // A warm low key from the lantern's side, a dusk sky over dark ground, and a lamp that follows the pointer.
  const key = new THREE.DirectionalLight('#ffd2a0', 1.9)
  // The key faces the standing map from the front left, and rakes the flat map from the west-northwest so slopes
  // shade as on a hillshaded chart.
  const keyStanding = new THREE.Vector3(-2.6, 3.2, 3.4)
  const keyFlat = new THREE.Vector3(-3.6, 2.1, -1.4)
  key.position.copy(keyStanding)
  const fill = new THREE.HemisphereLight('#b9b4cf', '#18210f', 0.75)
  const lamp = new THREE.PointLight('#d9ff8a', 0, 2.4, 2)
  scene.add(key, fill, lamp)
  const lights = [key, fill].map((light) => ({ light, base: light.intensity }))

  const terrain = bakeTerrain()
  const halfs = new Uint16Array(GRID_W * GRID_H)
  for (let k = 0; k < halfs.length; k++) halfs[k] = THREE.DataUtils.toHalfFloat(terrain.heights[k])
  const heightTexture = new THREE.DataTexture(halfs, GRID_W, GRID_H, THREE.RedFormat, THREE.HalfFloatType)
  heightTexture.magFilter = THREE.LinearFilter
  heightTexture.minFilter = THREE.LinearFilter
  heightTexture.wrapS = THREE.ClampToEdgeWrapping
  heightTexture.wrapT = THREE.ClampToEdgeWrapping
  heightTexture.needsUpdate = true

  const [printW, printH] = ctx.narrow ? PRINT.narrow : PRINT.wide
  const printCanvas = () => {
    const canvas = document.createElement('canvas')
    canvas.width = printW
    canvas.height = printH
    return canvas
  }
  const frontCanvas = printCanvas()
  const backCanvas = printCanvas()
  paintFront(frontCanvas, terrain)
  paintBack(backCanvas)
  const printTexture = (canvas: HTMLCanvasElement) => {
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = ctx.anisotropy
    ctx.renderer.initTexture(texture)
    return texture
  }
  const frontTexture = printTexture(frontCanvas)
  const backTexture = printTexture(backCanvas)
  let disposed = false
  // The theme's faces arrive after the scene is built, so the prints are painted again once the stylesheet's
  // faces are known and loaded. The poll stops after 6 s and leaves the fallback faces.
  const repaint = async () => {
    for (let tries = 0; tries < 12 && !disposed; tries++) {
      const known = Array.from(document.fonts).some((face) => face.family.replace(/"/g, '') === 'Big Shoulders Stencil Display')
      if (known) {
        await Promise.all([
          document.fonts.load(`800 40px ${FONT.title}`, 'MYCOMMUNITY'),
          document.fonts.load(`italic 400 20px ${FONT.serif}`, 'Lake'),
          document.fonts.load(`600 20px ${FONT.serif}`, 'Ridge'),
          document.fonts.load(`600 20px ${FONT.mono}`, 'TROOP'),
        ])
        if (disposed) return
        // The two prints upload on separate frames, so the repaint adds at most one texture upload to a frame.
        paintFront(frontCanvas, terrain)
        frontTexture.needsUpdate = true
        ctx.invalidate()
        await new Promise((resolve) => requestAnimationFrame(resolve))
        if (disposed) return
        paintBack(backCanvas)
        backTexture.needsUpdate = true
        ctx.invalidate()
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  repaint().catch(() => undefined)

  const paperUniforms = {
    uHeight: { value: heightTexture },
    uTexel: { value: new THREE.Vector2(1 / GRID_W, 1 / GRID_H) },
    uCrease: { value: [SHUT, -SHUT, SHUT, -SHUT] },
    uLid: { value: LID_SHUT },
    uRise: { value: 0 },
    uFront: { value: frontTexture },
    uBack: { value: backTexture },
    uKeyDir: { value: key.position.clone().normalize() },
    uKeyColor: { value: new THREE.Vector3() },
    uSky: { value: new THREE.Vector3() },
    uGround: { value: new THREE.Vector3() },
    uLampAt: { value: new THREE.Vector3() },
    uLampColor: { value: new THREE.Vector3() },
    uLamp: { value: 0 },
    uProbe: { value: new THREE.Vector4(0, 0, -1, 0) },
    uFrontLevel: { value: -1 },
    uFrontGlow: { value: 0 },
    uGlow: { value: 0 },
    uLight: { value: 1 },
    uRaised: { value: 0 },
    uGuard: { value: new THREE.Vector3() },
    uRes: { value: new THREE.Vector2(1, 1) },
  }
  const paperMaterial = new THREE.ShaderMaterial({ vertexShader: PAPER_VERTEX, fragmentShader: PAPER_FRAGMENT, uniforms: paperUniforms, side: THREE.DoubleSide, blending: THREE.NoBlending })
  const paperGeometry = new THREE.PlaneGeometry(W, D, SEG_X, SEG_Y)
  const paper = new THREE.Mesh(paperGeometry, paperMaterial)
  // The vertex shader moves every vertex, so the plane's own bounds say nothing about where it draws.
  paper.frustumCulled = false
  const sheet = new THREE.Group()
  sheet.add(paper)
  scene.add(sheet)
  const fold: Fold = { creases: [SHUT, -SHUT, SHUT, -SHUT], lid: LID_SHUT }

  // The troop pins and their shade.
  const pinGeo = pinGeometry()
  const redPin = new THREE.MeshStandardMaterial({ color: INK.red, roughness: 0.32, vertexColors: true, envMapIntensity: 0.7 })
  const azurePin = new THREE.MeshStandardMaterial({ color: INK.azure, roughness: 0.32, vertexColors: true, envMapIntensity: 0.7 })
  const shadeGeometry = new THREE.PlaneGeometry(1, 1)
  shadeGeometry.rotateX(-Math.PI / 2)
  const proxyGeometry = new THREE.SphereGeometry(PIN_H * 0.42, 8, 6)
  const proxyMaterial = new THREE.MeshBasicMaterial()
  const pins = TROOPS.map(([u, v], i) => {
    const mesh = new THREE.Mesh(pinGeo, i === OWN ? azurePin : redPin)
    // A larger invisible sphere at the head takes the pointer, since the head alone is a small target.
    const proxy = new THREE.Mesh(proxyGeometry, proxyMaterial)
    proxy.visible = false
    proxy.position.y = PIN_H * 0.7
    mesh.add(proxy)
    const shadeMaterial = new THREE.ShaderMaterial({ vertexShader: SHADE_VERTEX, fragmentShader: SHADE_FRAGMENT, uniforms: { uOpacity: { value: 0 } }, transparent: true, depthWrite: false })
    const shade = new THREE.Mesh(shadeGeometry, shadeMaterial)
    mesh.visible = false
    shade.visible = false
    scene.add(mesh, shade)
    const ground = new THREE.Vector3((u - 0.5) * W, elevation(heightAt(terrain, u, v), 1), -(v - 0.5) * D)
    return { mesh, proxy, shade, shadeMaterial, ground, hover: 0, shown: 0 }
  })
  const proxies = pins.map((pin) => pin.proxy)

  // The app's screens as trail signs.
  const woodGeometry = signGeometry()
  const woodMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 })
  const screenGeometry = new THREE.PlaneGeometry(SCREEN_W, SCREEN_H)
  const signs = SCREENS.map((name, i) => {
    const art = ctx.load(`/MyCommunity/chapter/screens/${name}.webp`, { journeyOnly: true })
    const material = new THREE.MeshBasicMaterial({ map: art.texture, toneMapped: false })
    const screen = new THREE.Mesh(screenGeometry, material)
    screen.position.set(0, POST_H + SCREEN_H / 2, 0)
    const group = new THREE.Group()
    group.add(new THREE.Mesh(woodGeometry, woodMaterial), screen)
    group.rotation.order = 'YXZ'
    group.visible = false
    scene.add(group)
    const [u, v] = SIGNS[i]
    const ground = new THREE.Vector3((u - 0.5) * W, elevation(heightAt(terrain, u, v), 1), -(v - 0.5) * D)
    return { art, material, screen, group, ground, hover: 0 }
  })
  const screens = signs.map((sign) => sign.screen)

  let narrow = ctx.narrow
  let mode: Mode = 'many'
  const weights: Record<Mode, Spring> = { many: { value: 1, velocity: 0 }, one: { value: 0, velocity: 0 }, none: { value: 0, velocity: 0 } }
  /** A pin the reader clicked, which the camera centres on, and the eased pan toward it in world x and z. */
  let picked = -1
  const pan = { x: { value: 0, velocity: 0 } as Spring, z: { value: 0, velocity: 0 } as Spring }
  /** A sign a tap holds forward on a touch screen, where there is no hover. */
  let held = -1
  const probe = { u: 0, v: 0, h: 0, on: 0 }

  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const scratch = new THREE.Vector3()
  const toLocal = new THREE.Matrix4()
  const rayOrigin = new THREE.Vector3()
  const rayDir = new THREE.Vector3()
  const uprightQ = new THREE.Quaternion()
  const flatQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
  const euler = new THREE.Euler()
  const fitCamera = new THREE.PerspectiveCamera(30, 1, 0.05, 80)
  const pose: Pose = { x: 0, y: 0, z: 0, dist: 4, elev: 0, az: 0, fx: 0.5, fy: 0.5, fov: 30 }
  const posed: Pose = { ...pose }

  /** The panel corners of both layers, folded, in the sheet's frame: 40 points that bound the paper at rise 0. */
  const corners = (out: THREE.Vector3[]) => {
    let k = 0
    for (let p = 0; p < PANELS; p++) {
      const x0 = -W / 2 + p * PANEL_W + 1e-3
      const x1 = -W / 2 + (p + 1) * PANEL_W - 1e-3
      for (const y of [-D / 2, -1e-3, 2e-4, D / 2]) {
        foldPoint(x0, y, 0, fold, out[k++])
        foldPoint(x1, y, 0, fold, out[k++])
      }
    }
    return out
  }
  const sheetCorners = Array.from({ length: PANELS * 8 }, () => new THREE.Vector3())
  /** The folded corners in world space and, last, the summit, for the unfold's fitted view. */
  const worldCorners = Array.from({ length: PANELS * 8 + 1 }, () => new THREE.Vector3())
  const summitH = heightAt(terrain, SUMMIT[0], SUMMIT[1])
  /** The summit in the sheet's flat frame, x east and y north. */
  const summitFlat = new THREE.Vector2((SUMMIT[0] - 0.5) * W, (SUMMIT[1] - 0.5) * D)
  const signScale = () => (narrow ? SIGN_SCALE.narrow : SIGN_SCALE.wide)
  const centre = new THREE.Vector3()
  const box = new THREE.Box3()

  const arrivalPose = (): Pose => (narrow
    ? { x: 0, y: 0, z: 0, dist: 4.4, elev: 0.04, az: 0, fx: 0.5, fy: 0.3, fov: 34 }
    : { x: 0, y: 0, z: 0, dist: 3.25, elev: 0.04, az: 0, fx: 0.67, fy: 0.5, fov: 30 })

  /**
   * Fits `points` into the scene's region: right of the copy on wide stages, the top half on phones, with `pad` of
   * the stage height clear on every side. The distance is found by bisection and the focus then re-centres the
   * projected bounds in the region, twice, since the near edge of a tilted map projects larger than the far one.
   */
  const fitView = (points: readonly THREE.Vector3[], base: Pose, aspect: number, pad: number): Pose => {
    const padY = 2 * pad
    const padX = padY / aspect
    const region = narrow ? [-1 + padX, 1 - padX, FLOOR_NDC + padY, 1 - padY] : [-0.12 + padX, 0.97 - padX, -1 + padY, 1 - padY]
    const out: Pose = { ...base }
    const bounds = () => {
      placeCamera(fitCamera, out, aspect)
      fitCamera.updateMatrixWorld()
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const point of points) {
        scratch.copy(point).project(fitCamera)
        x0 = Math.min(x0, scratch.x)
        x1 = Math.max(x1, scratch.x)
        y0 = Math.min(y0, scratch.y)
        y1 = Math.max(y1, scratch.y)
      }
      return [x0, x1, y0, y1]
    }
    for (let pass = 0; pass < 2; pass++) {
      let lo = 0.5
      let hi = 60
      for (let it = 0; it < 22; it++) {
        out.dist = (lo + hi) / 2
        const [x0, x1, y0, y1] = bounds()
        if (x1 - x0 <= region[1] - region[0] && y1 - y0 <= region[3] - region[2]) hi = out.dist
        else lo = out.dist
      }
      out.dist = hi
      const [x0, x1, y0, y1] = bounds()
      out.fx += ((region[0] + region[1]) / 2 - (x0 + x1) / 2) / 2
      out.fy -= ((region[2] + region[3]) / 2 - (y0 + y1) / 2) / 2
    }
    return out
  }
  /** The flat map's corners and summit at full relief, in world space, for the fitted views. */
  const mapPoints = [
    new THREE.Vector3(-W / 2, 0, -D / 2), new THREE.Vector3(W / 2, 0, -D / 2), new THREE.Vector3(W / 2, 0, D / 2), new THREE.Vector3(-W / 2, 0, D / 2),
    new THREE.Vector3((SUMMIT[0] - 0.5) * W, RELIEF, -(SUMMIT[1] - 0.5) * D),
  ]
  const lens = () => (narrow ? { fov: 36, fx: 0.5, fy: 0.27 } : { fov: 30, fx: 0.71, fy: 0.5 })
  const cached = new Map<string, Pose>()
  const once = (name: string, aspect: number, build: () => Pose) => {
    const cacheKey = `${name}:${narrow}:${aspect.toFixed(3)}`
    let found = cached.get(cacheKey)
    if (!found) cached.set(cacheKey, (found = build()))
    return found
  }
  /** The pins' view, as newLatLngBounds: the whole map with every pin on it inside the region. */
  const manyPose = (aspect: number) => once('many', aspect, () => {
    const points = [...mapPoints, ...pins.map((pin) => pin.ground.clone().setY(pin.ground.y + PIN_H * 1.35))]
    return fitView(points, { x: 0, y: 0.12, z: 0, dist: 8, elev: 0.85, az: 0, ...lens() }, aspect, narrow ? FIT_PAD.narrow : FIT_PAD.wide)
  })
  /** The signs' view, low across the trail, with the map and every sign's roof inside the region. */
  const appPose = (aspect: number) => once('app', aspect, () => {
    const half = (SCREEN_W / 2 + 0.06) * signScale()
    const top = (POST_H + SCREEN_H + 0.16) * signScale()
    const points = [...mapPoints, ...signs.flatMap((sign) => [-half, half].map((dx) => sign.ground.clone().add(new THREE.Vector3(dx, top, 0))))]
    return fitView(points, { x: 0, y: 0.3, z: 0, dist: 6, elev: 0.27, az: 0, ...lens() }, aspect, narrow ? 0.03 : 0.05)
  })
  const modePose = (m: Mode, aspect: number): Pose => {
    if (m === 'many') return manyPose(aspect)
    const own = pins[OWN].ground
    const many = manyPose(aspect)
    if (m === 'one') return { ...many, x: own.x, y: own.y + 0.08, z: own.z, dist: narrow ? 3.6 : 2.4, elev: 0.6, az: 0.2 }
    return { ...many, dist: many.dist * 1.7, elev: 1.2 }
  }

  /** The point of the risen land under the pointer, marched along the ray in the sheet's frame, or false. */
  const probeLand = (rise: number) => {
    toLocal.copy(paper.matrixWorld).invert()
    rayOrigin.copy(raycaster.ray.origin).applyMatrix4(toLocal)
    rayDir.copy(raycaster.ray.direction).transformDirection(toLocal)
    if (rayDir.z >= -1e-4) return false
    const top = RELIEF * rise + 0.01
    const t0 = Math.max(0, (top - rayOrigin.z) / rayDir.z)
    const t1 = (0 - rayOrigin.z) / rayDir.z
    const at = (t: number) => {
      const x = rayOrigin.x + rayDir.x * t
      const y = rayOrigin.y + rayDir.y * t
      const u = x / W + 0.5
      const v = y / D + 0.5
      const h = u < 0 || u > 1 || v < 0 || v > 1 ? 0 : heightAt(terrain, u, v)
      return { u, v, h, above: rayOrigin.z + rayDir.z * t - elevation(h, rise) }
    }
    let prev = t0
    for (let s = 1; s <= 64; s++) {
      const t = t0 + ((t1 - t0) * s) / 64
      if (at(t).above <= 0) {
        let lo = prev
        let hi = t
        for (let it = 0; it < 8; it++) {
          const mid = (lo + hi) / 2
          if (at(mid).above > 0) lo = mid
          else hi = mid
        }
        const hit = at(hi)
        if (hit.u < 0.04 || hit.u > 0.96 || hit.v < 0.06 || hit.v > 0.94) return false
        probe.u = hit.u
        probe.v = hit.v
        probe.h = hit.h
        return true
      }
      prev = t
    }
    return false
  }

  const hiddenPanel = (): ScenePanel => {
    const at = sheet.getWorldPosition(new THREE.Vector3())
    return { center: at, up: new THREE.Vector3(0, 1, 0), halfH: 0, corners: [at], develop: 0, opacity: 0 }
  }
  const linear = (colour: THREE.Color, scale: number, out: THREE.Vector3) => out.set(colour.r * scale, colour.g * scale, colour.b * scale)

  const update = (f: SceneFrame): SceneOutput => {
    const a = f.local('arrival')
    const u = f.local('unfold')
    const t = f.local('troops')
    const p = f.local('app')
    const c = f.local('close')
    const dt = f.dt
    let busy = false
    // A picked pin belongs to the pins' act and a held sign to the signs' act, so leaving either act drops it.
    if (t < 0.08 || p > 0) picked = -1
    if (p < 0.1 || c > 0) held = -1

    // The fold. The shut map springs open a little as the arrival's copy leaves. The unfold opens the creases one
    // after another from the cover outward, then the half fold, then the land rises. The close sinks the land,
    // shuts the half fold, and closes the creases in reverse, the outermost first.
    const sprung = smoother(ramp(a, 0.68, 1)) * 0.1
    let opened = 0
    for (let j = 0; j < PANELS - 1; j++) {
      const open = smoother(ramp(u, 0.06 + 0.07 * j, 0.2 + 0.07 * j)) * (1 - smoother(ramp(c, 0.42 - 0.04 * j, 0.52 - 0.04 * j)))
      fold.creases[j] = (j % 2 === 0 ? 1 : -1) * (SHUT - sprung) * (1 - open)
      opened += open / (PANELS - 1)
    }
    const lidOpen = smoother(ramp(u, 0.38, 0.54)) * (1 - smoother(ramp(c, 0.2, 0.32)))
    fold.lid = (LID_SHUT - sprung * 0.4) * (1 - lidOpen)
    const rise = ramp(u, 0.5, 0.78) * (1 - ramp(c, 0.04, 0.2))
    const lay = smoother(ramp(u, 0, 0.18)) * (1 - smoother(ramp(c, 0.36, 0.54)))
    const formed = smoother(ramp(a, 0, 0.6))

    // The sheet. Shut, it stands facing the reader and turns toward the pointer. Open, it lies flat, and the pointer
    // and a drag orbit the camera instead.
    const yaw = -f.interaction.tiltX * TILT.yaw + f.interaction.dragYaw
    const pitch = -f.interaction.tiltY * TILT.pitch
    euler.set(-0.08 + pitch, -0.4 + yaw + 0.25 * (1 - formed), 0.035, 'XYZ')
    uprightQ.setFromEuler(euler)
    sheet.quaternion.slerpQuaternions(uprightQ, flatQ, lay)
    sheet.position.set(0, -0.12 * (1 - formed) * (1 - lay), 0)
    // The paper's folded bounds stay centred on the sheet's origin, so the opening map grows about the middle.
    box.setFromPoints(corners(sheetCorners))
    box.getCenter(centre)
    paper.position.set(-centre.x, -centre.y, -centre.z)
    sheet.updateMatrixWorld(true)

    // The camera, act by act: close on the shut map, high over the opening one, the mode's view over the pins, low
    // across the trail for the signs, and back to the shut map.
    const aspect = f.aspect
    for (const m of MODES) if (springStep(weights[m], m === mode ? 1 : 0, dt, CAMERA_RATE)) busy = true
    // A picked pin pans the mode's view onto it, measured from the current mode's target.
    const modeAt = modePose(mode, aspect)
    if (springStep(pan.x, picked >= 0 ? pins[picked].ground.x - modeAt.x : 0, dt, CAMERA_RATE)) busy = true
    if (springStep(pan.z, picked >= 0 ? pins[picked].ground.z - modeAt.z : 0, dt, CAMERA_RATE)) busy = true
    // Each act's view replaces the one before it as its weight reaches 1, so a view is only built while it shows.
    const wUnfold = smoother(ramp(u, 0, 0.1))
    const wTroops = smoother(ramp(t, 0, 0.16))
    const wApp = smoother(ramp(p, 0, 0.2))
    const wFold = smoother(ramp(c, 0.06, 0.24))
    const wHome = smoother(ramp(c, 0.36, 0.56))
    Object.assign(pose, arrivalPose())
    // The opening and closing map is fitted every frame, since its folded bounds change with the scroll. Opening,
    // the camera climbs over it as it lies down and swings west and lower as the land rises, so the relief reads
    // against the key light. Closing, it rises again to watch the halves and panels fold.
    for (let k = 0; k < sheetCorners.length; k++) paper.localToWorld(worldCorners[k].copy(sheetCorners[k]))
    paper.localToWorld(foldPoint(summitFlat.x, summitFlat.y, elevation(summitH, rise), fold, worldCorners[sheetCorners.length]))
    box.setFromPoints(worldCorners)
    box.getCenter(centre)
    const sheetPad = narrow ? 0.03 : 0.07
    if (wUnfold > 0 && wTroops < 1) {
      const climb = smoother(ramp(u, 0, 0.3))
      const base: Pose = { x: centre.x, y: centre.y, z: centre.z, dist: 6, elev: 0.04 + 0.92 * climb - 0.34 * smoother(rise), az: 0.08 * (u - 0.5) - 0.28 * smoother(rise), ...lens() }
      mixPose(pose, fitView(worldCorners, base, aspect, sheetPad), wUnfold)
    }
    if (wTroops > 0 && wApp < 1) {
      const total = MODES.reduce((sum, m) => sum + weights[m].value, 0) || 1
      const troopsPose: Pose = { x: 0, y: 0, z: 0, dist: 0, elev: 0, az: 0, fx: 0, fy: 0, fov: 0 }
      for (const m of MODES) {
        const target = modePose(m, aspect)
        for (const k of POSE_KEYS) troopsPose[k] += (target[k] * weights[m].value) / total
      }
      // Between two modes the camera rises and comes back down, as a map's fly-to does.
      const between = weights.many.value * weights.one.value + weights.many.value * weights.none.value + weights.one.value * weights.none.value
      troopsPose.dist += between * 4 * (narrow ? ARC.narrow : ARC.wide)
      troopsPose.x += pan.x.value
      troopsPose.z += pan.z.value
      mixPose(pose, troopsPose, wTroops)
    }
    if (wApp > 0 && wFold < 1) mixPose(pose, appPose(aspect), wApp)
    if (wFold > 0 && wHome < 1) mixPose(pose, fitView(worldCorners, { x: centre.x, y: centre.y, z: centre.z, dist: 6, elev: 0.8, az: 0, ...lens() }, aspect, sheetPad), wFold)
    if (wHome > 0) mixPose(pose, arrivalPose(), wHome)
    Object.assign(posed, pose)
    posed.az += (-f.interaction.tiltX * TILT.orbit + f.interaction.dragYaw) * lay
    posed.elev += f.interaction.tiltY * TILT.rise * lay
    posed.dist *= 1 - 0.05 * f.push
    placeCamera(camera, posed, aspect)
    camera.updateMatrixWorld()

    // The pointer: a pin, a sign, or the land under it.
    let overPin = -1
    let overSign = -1
    if (f.pointer.inside) {
      ndc.set(f.pointer.x, f.pointer.y)
      raycaster.setFromCamera(ndc, camera)
      const [pinHit] = raycaster.intersectObjects(proxies, false)
      const pinIndex = pinHit ? proxies.findIndex((proxy) => proxy === pinHit.object) : -1
      if (pinIndex >= 0 && pins[pinIndex].mesh.visible && pins[pinIndex].shown > 0.9) overPin = pinIndex
      const [signHit] = raycaster.intersectObjects(screens, false)
      const signIndex = signHit ? screens.findIndex((screen) => screen === signHit.object) : -1
      if (signIndex >= 0 && signs[signIndex].group.visible && signs[signIndex].group.rotation.x > -0.05) overSign = signIndex
    }
    const probing = f.pointer.inside && overPin < 0 && overSign < 0 && rise > 0.98 && lay > 0.99 && probeLand(rise)
    const on = ease(probe.on, probing ? 1 : 0, dt, HOVER_EASE)
    if (on !== probe.on) busy = true
    probe.on = on

    // Pins drop one after another with a bounce, the mode keeps or sinks each one, and the app act sinks them all.
    const sink = smoother(ramp(p, 0, 0.14))
    const camYaw = posed.az
    pins.forEach((pin, i) => {
      const drop = ramp(t, 0.08 + 0.035 * i, 0.22 + 0.035 * i)
      const shown = weights.many.value + (i === OWN ? weights.one.value : 0)
      pin.shown = shown
      const lifted = ease(pin.hover, (overPin === i || picked === i) && drop >= 1 ? 1 : 0, dt, HOVER_EASE)
      if (lifted !== pin.hover) busy = true
      pin.hover = lifted
      const under = Math.max(sink, 1 - shown)
      pin.mesh.visible = drop > 0.001 && under < 0.999 && rise > 0.99
      pin.shade.visible = pin.mesh.visible
      if (!pin.mesh.visible) return
      const fall = PIN_DROP * (1 - bounce(drop))
      pin.mesh.position.copy(pin.ground)
      pin.mesh.position.y += fall + 0.07 * lifted - PIN_H * 1.1 * smoother(under)
      pin.mesh.rotation.set(0, camYaw, 0)
      pin.mesh.scale.setScalar((narrow ? 1.35 : 1) * (1 + 0.3 * lifted))
      pin.shade.position.copy(pin.ground)
      pin.shade.position.y += 0.004
      const near = 1 - Math.min(1, (fall + 0.07 * lifted) / PIN_DROP)
      pin.shade.scale.setScalar((narrow ? 0.12 : 0.09) * (0.6 + 0.4 * near))
      pin.shadeMaterial.uniforms.uOpacity.value = 0.42 * near * (1 - smoother(under))
    })

    // A hovered or held sign comes toward the reader and the others dim.
    let lead = 0
    signs.forEach((sign, i) => {
      const goal = (overSign === i || held === i) ? 1 : 0
      const next = ease(sign.hover, goal, dt, HOVER_EASE)
      if (next !== sign.hover) busy = true
      sign.hover = next
      lead = Math.max(lead, next)
    })
    signs.forEach((sign, i) => {
      // Each sign springs up from its post's foot, tipped back at first, and overshoots its height by about 10%
      // before it settles. The close folds them back down in order.
      const up = ramp(p, 0.1 + 0.07 * i, 0.26 + 0.07 * i) * (1 - smoother(ramp(c, 0.02 * i, 0.12 + 0.02 * i)))
      sign.group.visible = up > 0.001 && sign.art.ready
      if (!sign.group.visible) return
      const spring = 1 + 2.70158 * (up - 1) ** 3 + 1.70158 * (up - 1) ** 2
      const toward = sign.hover * (narrow ? 3.2 : 0.9)
      sign.group.position.set(sign.ground.x + Math.sin(camYaw) * toward, sign.ground.y + 0.06 * sign.hover, sign.ground.z + Math.cos(camYaw) * toward)
      sign.group.rotation.set(-0.9 * (1 - smoother(up)), camYaw * 0.8, 0)
      sign.group.scale.set(1, spring, 1).multiplyScalar(signScale() * Math.min(1, up * 3) * (1 + 0.12 * sign.hover))
      sign.material.color.setScalar(1 - 0.35 * lead * (1 - sign.hover))
    })

    // Lights and the paper's glow. The rising land's top layer burns as it climbs, the index contours keep a faint
    // glow while the land stands, and the lamp hangs 0.3 over the land under the pointer.
    const flare = 1 + 0.25 * f.push
    for (const { light, base } of lights) light.intensity = base * flare
    key.position.lerpVectors(keyStanding, keyFlat, lay)
    paperUniforms.uCrease.value = fold.creases
    paperUniforms.uLid.value = fold.lid
    paperUniforms.uRise.value = rise
    paperUniforms.uRaised.value = smoother(rise)
    const guard = narrow ? GUARD.narrow : GUARD.wide
    const loose = clamp01(weights.one.value + Math.hypot(pan.x.value, pan.z.value) / 0.4) * wTroops * (1 - wApp)
    paperUniforms.uGuard.value.set(guard.tight[0] + (guard.soft[0] - guard.tight[0]) * loose, guard.tight[1] + (guard.soft[1] - guard.tight[1]) * loose, narrow ? 1 : 0)
    ctx.renderer.getDrawingBufferSize(paperUniforms.uRes.value)
    paperUniforms.uLight.value = flare
    paperUniforms.uKeyDir.value.copy(key.position).normalize()
    linear(key.color, key.intensity * 0.42, paperUniforms.uKeyColor.value)
    linear(fill.color, fill.intensity * 0.55, paperUniforms.uSky.value)
    linear(fill.groundColor, fill.intensity * 0.55, paperUniforms.uGround.value)
    paperUniforms.uFrontLevel.value = (rise - 0.3) / 0.7
    paperUniforms.uFrontGlow.value = rise > 0 && rise < 1 ? Math.sin(Math.PI * rise) : 0
    paperUniforms.uGlow.value = rise * (1 - 0.6 * smoother(ramp(p, 0, 0.2)))
    paperUniforms.uProbe.value.set(probe.u, probe.v, probe.h, probe.on)
    scene.updateMatrixWorld()
    if (probe.on > 0.001) {
      paper.localToWorld(scratch.set((probe.u - 0.5) * W, (probe.v - 0.5) * D, elevation(probe.h, rise) + 0.3))
      lamp.position.copy(scratch)
      lamp.intensity = 1.6 * probe.on
      paperUniforms.uLampAt.value.copy(scratch)
      linear(lamp.color, 1.6, paperUniforms.uLampColor.value)
      paperUniforms.uLamp.value = probe.on
    } else {
      lamp.intensity = 0
      paperUniforms.uLamp.value = 0
    }

    // Panels: the eight pins, labelled while hovered, picked, or (the leader's own) settled in view, then the signs.
    const panels: ScenePanel[] = []
    pins.forEach((pin, i) => {
      if (!pin.mesh.visible) { panels.push(hiddenPanel()); return }
      const tip = pin.mesh.getWorldPosition(new THREE.Vector3())
      const s = pin.mesh.scale.x
      const named = pin.hover > 0.5 || picked === i || (i === OWN && overPin < 0)
      panels.push({
        center: tip,
        up: new THREE.Vector3(0, 1, 0),
        halfH: 0.03,
        corners: [tip, tip.clone().add(new THREE.Vector3(-0.06 * s, PIN_H * s, 0)), tip.clone().add(new THREE.Vector3(0.06 * s, PIN_H * s, 0))],
        develop: named && sink <= 0 && ramp(t, 0.08 + 0.035 * i, 0.22 + 0.035 * i) >= 1 && pin.shown > 0.98 ? 1 : 0,
        opacity: 1,
      })
    })
    signs.forEach((sign, i) => {
      if (!sign.group.visible) { panels.push(hiddenPanel()); return }
      const quaternion = sign.screen.getWorldQuaternion(new THREE.Quaternion())
      const s = sign.group.scale.x
      panels.push({
        center: sign.screen.getWorldPosition(new THREE.Vector3()),
        up: new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion),
        halfH: (SCREEN_H / 2) * s,
        corners: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => sign.screen.localToWorld(new THREE.Vector3((x * SCREEN_W) / 2, (y * SCREEN_H) / 2, 0))),
        // Four labels overflow one row on a phone, so there only the held sign is named.
        develop: sign.group.rotation.x > -0.002 && Math.abs(sign.group.scale.y - sign.group.scale.x) < 1e-3 && (!narrow || held === i) ? 1 : 0,
        opacity: 1,
      })
    })

    const hit = corners(sheetCorners).map((point) => paper.localToWorld(point.clone()))
    const bounds = [...hit]
    const summit = worldCorners[sheetCorners.length].clone()
    bounds.push(summit)
    for (const pin of pins) if (pin.mesh.visible) bounds.push(pin.mesh.localToWorld(new THREE.Vector3(0, PIN_H, 0)))
    for (const sign of signs) if (sign.group.visible) bounds.push(sign.group.localToWorld(new THREE.Vector3(0, POST_H + SCREEN_H + 0.16, 0)), sign.group.getWorldPosition(new THREE.Vector3()))

    // Every phone view fits above FLOOR_NDC, so the copy floor stays put through every act and choice.
    if (narrow) bounds.splice(0, bounds.length, new THREE.Vector3(0, FLOOR_NDC, 0.5).unproject(camera))

    const anchors = new Map<string, THREE.Vector3 | null>()
    anchors.set('summit', summit.clone())
    const head = (i: number) => (pins[i].mesh.visible && pins[i].shown > 0.9 ? pins[i].mesh.localToWorld(new THREE.Vector3(0, PIN_H * 0.7, 0)) : null)
    anchors.set('pin', head(HINT))
    anchors.set('sign', signs[0].group.visible ? signs[0].screen.localToWorld(new THREE.Vector3(-SCREEN_W / 2, 0, 0)) : null)

    return {
      decode: f.base.decode,
      gather: f.base.gather,
      backdrop: f.base.backdrop,
      revealAt: sheet.getWorldPosition(new THREE.Vector3()),
      anchors,
      hit,
      panels,
      bounds,
      bodyLight: flare,
      busy,
      ready: signs.every((sign) => !sign.group.visible || sign.art.ready),
    }
  }

  const press = (point: { x: number; y: number }) => {
    ndc.set(point.x, point.y)
    raycaster.setFromCamera(ndc, camera)
    const [pinHit] = raycaster.intersectObjects(proxies, false)
    const pinIndex = pinHit ? proxies.findIndex((proxy) => proxy === pinHit.object) : -1
    if (pinIndex >= 0 && pins[pinIndex].mesh.visible && pins[pinIndex].shown > 0.9) {
      picked = picked === pinIndex ? -1 : pinIndex
      return true
    }
    const [signHit] = raycaster.intersectObjects(screens, false)
    const signIndex = signHit ? screens.findIndex((screen) => screen === signHit.object) : -1
    if (signIndex >= 0 && signs[signIndex].group.visible) {
      held = held === signIndex ? -1 : signIndex
      return true
    }
    return false
  }

  const command = (name: string, value: string) => {
    if (name !== 'troops' || !MODES.includes(value as Mode)) return
    mode = value as Mode
    picked = -1
  }

  const chapter: ChapterScene = {
    scene,
    camera,
    update,
    press,
    command,
    setNarrow: (next) => {
      narrow = next
      cached.clear()
    },
    dispose: () => {
      disposed = true
      paperGeometry.dispose()
      paperMaterial.dispose()
      heightTexture.dispose()
      frontTexture.dispose()
      backTexture.dispose()
      pinGeo.dispose()
      redPin.dispose()
      azurePin.dispose()
      shadeGeometry.dispose()
      proxyGeometry.dispose()
      proxyMaterial.dispose()
      for (const pin of pins) pin.shadeMaterial.dispose()
      woodGeometry.dispose()
      woodMaterial.dispose()
      screenGeometry.dispose()
      for (const sign of signs) sign.material.dispose()
    },
  }
  return chapter
}

export default createScene
