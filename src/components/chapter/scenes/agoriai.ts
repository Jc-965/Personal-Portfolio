/**
 * Agoriai's scene. The centrepiece is the app's Nexus graph (its /api/graph response for the seed data, saved as
 * public/Agoriai/chapter/nexus-graph.json) as a 3D constellation: companies are faceted glass solids in their
 * sector's shape (a hexagonal prism for tech, a diamond for finance, a tile for business), students are glowing
 * orbs, and links are light whose brightness follows their weight. The identity act lifts SwiftCedar, the seed's one
 * student with a real name, out of the graph inside three glass shells that the four visibility levels open, above
 * the messages screen under a frosted pane that breaks into the app's 28 shards when the reader accepts the reveal.
 * The nexus act pulls the graph's two connected components apart, lights a hovered node's neighbours as the app
 * does, and plucks a clicked node through its links. The stack act sinks the graph into its tables and sends a real
 * request from a screen through the ring of 36 routes to the tables it touches and back. The close gathers the
 * constellation again.
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { ChapterScene, SceneFactory, SceneFrame, SceneOutput, ScenePanel } from '../types'

interface NexusNode { id: string; type: 'company' | 'user'; label: string; size: number; group: string }
interface NexusEdge { source: string; target: string; weight: number }
interface NexusGraph { nodes: NexusNode[]; edges: NexusEdge[] }

const GRAPH_SRC = '/Agoriai/chapter/nexus-graph.json'
/** Captures of the real app at 3200 by 1800. */
const SCREEN_SRC = {
  feed: '/Agoriai/chapter/screens/feed.webp',
  nexus: '/Agoriai/chapter/screens/nexus.webp',
  messages: '/Agoriai/chapter/screens/messages-identity-revealed.webp',
} as const
type ScreenKey = keyof typeof SCREEN_SRC
const SCREEN_ASPECT = 16 / 9

/** Sector colours from graphUtils.ts's dark palette. Companies take the first shade and students the second. */
const PALETTE: Record<string, readonly [string, string]> = {
  tech: ['#4f7cff', '#60a5fa'],
  finance: ['#22c55e', '#34d399'],
  business: ['#f59e0b', '#fbbf24'],
  community: ['#8b5cf6', '#a78bfa'],
}
/** World radius of a node from its API size. graphUtils.ts draws companies at 22 to 42 px and students at 9 to 18. */
const nodeRadius = (node: NexusNode) => (node.type === 'company' ? 0.07 + 0.016 * node.size : 0.038 + 0.006 * node.size)

/**
 * The layout's forces in world units, scaled from Nexus.tsx. A link rests at LAYOUT.link / weight (weights under
 * 0.45 count as 0.45), a pair repels with LAYOUT.charge times its radii over the squared distance, a pair keeps
 * LAYOUT.collide apart beyond its radii, and every node is pulled weakly to its component's centre. Each component is then scaled so its
 * farthest node sits COMPONENT_R from its centre.
 */
const LAYOUT = { link: 0.95, charge: 0.006, collide: 0.14, steps: 300 }
const COMPONENT_R = 0.82
/**
 * Where each component sits, by component order (the one holding the graph's first node first). In the ball both
 * overlap into one constellation, each turned so their links cross. The split pulls them apart, wide on wide screens
 * and closer and smaller on phones.
 */
const BALL = [{ at: [-0.2, 0.1, -0.1], turn: [0, 0, 0] }, { at: [0.22, -0.12, 0.12], turn: [0.5, 1.9, 0.2] }] as const
const SPLIT_WIDE = [[-0.62, 0.4, 0], [1.08, -0.4, 0]] as const
const SPLIT_NARROW = [[-0.64, 0.3, 0], [0.68, -0.24, 0]] as const
/** Phones draw each island at this share of its size, and its nodes at SPLIT_NODE_NARROW of theirs, to fit side by side. */
const SPLIT_SCALE_NARROW = 0.6
const SPLIT_NODE_NARROW = 0.78
/** Radius of the whole ball, for the preview's hit target and the close. */
const BALL_R = 1.05

/** SwiftCedar (u5), the one seeded student with a real name, and the fields each visibility level adds (seed.ts). */
const IDENTITY = 'SwiftCedar'
const FIELDS = ['alias · SwiftCedar', 'field · finance', 'school · Harvard, 2025', 'name · Jamie Rivera'] as const
const TIERS = ['anonymous', 'role', 'school', 'realName'] as const
/** The shells around the lifted orb, outermost first, in orb radii. The outermost opens at role, the innermost at realName. */
const SHELLS = [2.3, 1.9, 1.5] as const
/** How much larger the lifted orb draws than its node. */
const ORB_GROW = 0.55
/** The messages pane's width in world units. */
const PANE_W = 2.3

/**
 * The app's shatter timeline (GlassShatterOverlay.tsx, the chat variant), seconds: the whole overlay, the crack and
 * flash, and each shard's flight as a share of the whole. CHAT_PX is about the chat panel's width in CSS px, which
 * the shards' px drifts are measured against.
 */
const SHATTER = { app: 2.85, crack: 0.62, flight: 0.9, rays: 16 }
const CHAT_PX = 1100
/** Seconds a click's shatter or repair takes here. */
const SHATTER_S = 1.9

/** The stack, in its own units before its pitch toward the camera: the layers' heights, their plates, and the ring. */
const STACK = { client: 1.12, api: 0, db: -1.12, pitch: 0.42 }
const PLATE = { w: 2.5, d: 1.5 }
const RING_R = 0.82
/** The 36 /api routes by group in index.ts's order: stats, auth, users and search, companies, posts and comments, graph, conversations. */
const ROUTE_GROUPS = [1, 5, 7, 3, 13, 1, 6] as const
/** The 13 Drizzle tables in schema.ts's order, laid on the database plate five, four, and four to a row. */
const TABLES = [
  'users', 'auth_accounts', 'auth_sessions', 'companies', 'internships', 'posts', 'comments', 'post_votes',
  'comment_votes', 'connections', 'conversations', 'conversation_participants', 'messages',
] as const
type Table = (typeof TABLES)[number]
const TABLE_ROWS = [5, 4, 4] as const
const SLAB = { w: 0.36, h: 0.07, d: 0.18, gap: 0.46, row: 0.44 }
/** The three screens on the client plate, left to right, and their width in world units. */
const CLIENT_SCREENS: readonly ScreenKey[] = ['feed', 'nexus', 'messages']
const CLIENT_W = 0.74
type RequestKey = 'posts' | 'graph' | 'reveal'
/**
 * The requests the stack act sends: the screen that sends each, its route's index among the 36 /api routes in
 * index.ts's order, and the tables its handler reads or writes (fetchPosts, the /api/graph handler, and the identity
 * request handler, each after getAuthSession where it authenticates). No request touches more than FAN tables,
 * since FAN is the number of packet slots.
 */
const REQUESTS: Record<RequestKey, { screen: ScreenKey; route: number; tables: readonly Table[] }> = {
  posts: { screen: 'feed', route: 18, tables: ['auth_sessions', 'users', 'posts', 'companies', 'post_votes'] },
  graph: { screen: 'nexus', route: 29, tables: ['users', 'companies', 'connections', 'posts'] },
  reveal: { screen: 'messages', route: 33, tables: ['auth_sessions', 'users', 'conversation_participants', 'conversations', 'messages'] },
}
const FAN = 5
/** Seconds a clicked request's round trip takes. */
const TRIP_S = 2.6
/** Layer labels, top to bottom. */
const LAYERS = ['client · React 19', 'server · Elysia on Bun', 'database · PostgreSQL'] as const
const ISLANDS = ['tech · 4 companies, 5 students', 'finance and consulting · 4 companies, 3 students'] as const

/** Pointer reach, as ParkiWell's rig: the graph turns up to 0.3 rad of yaw and 0.17 of pitch toward the cursor. */
const TILT = { yaw: 0.3, pitch: 0.17 }
/** Time constants of the motions a hover, a click, or a choice starts, seconds. */
const HOVER_EASE = 0.14
/** Seconds a hovered node stays active after the pointer leaves it, so crossing a gap between nodes never blinks. */
const HOVER_HOLD = 0.35
const LIT_EASE = 0.2
const SHELL_EASE = 0.3
const DIAL_EASE = 0.35
/**
 * A pluck displaces nodes from their pose. Each offset springs home with PLUCK.home, linked offsets pull each other
 * with PLUCK.link times the link's weight (both per second squared), and PLUCK.damp bleeds the speed per second. A
 * click throws the node at PLUCK.kick world units per second, and the network rests once every offset and speed is
 * under PLUCK.rest.
 */
const PLUCK = { home: 16, link: 2.6, damp: 3.4, kick: 4, step: 1 / 120, rest: 2e-4 }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / Math.max(1e-9, b - a))
const smoother = (t: number) => {
  const x = clamp01(t)
  return x * x * x * (x * (x * 6 - 15) + 10)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** Eases `from` toward `to` with time constant `tc` seconds, landing on it once within 1e-4. */
const ease = (from: number, to: number, dt: number, tc: number) => (Math.abs(to - from) < 1e-4 ? to : from + (to - from) * (1 - Math.exp(-dt / tc)))
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
/** GlassShatterOverlay.tsx's noise, so every shard keeps the app's shape, drift, turn, and delay. */
const shardNoise = (seed: number) => {
  const x = Math.sin(seed * 97.137) * 43758.5453
  return x - Math.floor(x)
}

/** Facet glass for the companies, the orbs, the shells, the slabs, and the frames. Output is premultiplied. */
const GLASS_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vView = cameraPosition - world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`
const GLASS_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uLight;
uniform float uGlow;
uniform float uCore;
uniform vec3 uKey;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(vView);
  float facing = clamp(dot(n, v), 0.0, 1.0);
  float rim = pow(1.0 - facing, 2.2);
  float key = max(dot(n, uKey), 0.0);
  float spec = pow(max(dot(reflect(-uKey, n), v), 0.0), 28.0);
  // An orb (uCore 1) burns from its middle, so it reads as a light inside glass.
  float core = uCore * pow(facing, 2.5);
  vec3 colour = uColor * (0.16 + 0.5 * key + 1.3 * rim + 1.7 * core + uGlow) * uLight + vec3(1.0, 0.97, 0.92) * spec * 1.1 * uLight;
  float alpha = clamp(0.2 + 0.7 * rim + 0.7 * spec + 0.85 * core + 0.3 * uGlow, 0.0, 1.0) * uOpacity;
  gl_FragColor = vec4(colour * alpha, alpha);
}
`

/**
 * A camera-facing ribbon between two world points, one instance per link or beam. A light runs along each with the
 * scroll (uPhase) at the instance's own offset. Colour adds, and alpha keeps the coverage for the composite.
 */
const RIBBON_VERTEX = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aEnd;
attribute vec3 aColorA;
attribute vec3 aColorB;
attribute float aLight;
attribute float aSeed;
uniform float uWidth;
varying float vAlong;
varying float vAcross;
varying vec3 vColor;
varying float vLight;
varying float vSeed;
void main() {
  vec3 p = mix(aStart, aEnd, position.x);
  vec3 side = cross(aEnd - aStart, cameraPosition - p);
  float len = length(side);
  side = len > 1e-6 ? side / len : vec3(0.0, 1.0, 0.0);
  p += side * position.y * uWidth * (0.7 + 0.3 * min(aLight, 2.0));
  vAlong = position.x;
  vAcross = position.y;
  vColor = mix(aColorA, aColorB, position.x);
  vLight = aLight;
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`
const RIBBON_FRAGMENT = /* glsl */ `
uniform float uPhase;
uniform float uPulse;
varying float vAlong;
varying float vAcross;
varying vec3 vColor;
varying float vLight;
varying float vSeed;
void main() {
  float core = exp(-vAcross * vAcross * 3.5);
  float head = fract(uPhase + vSeed);
  float pulse = uPulse * exp(-pow((vAlong - head) * 7.0, 2.0)) * step(0.02, vLight);
  float k = (vLight + pulse) * core;
  gl_FragColor = vec4(vColor * k, min(k * 0.6, 1.0));
}
`

/**
 * The frosted pane over the messages screen, as GlassShatterOverlay.tsx's 28 clip-path shards on a 7 by 4 grid plus
 * the frosted backing (aFlight.w below 0). Each shard samples the screen under it at a coarse mip, so the glass hides
 * the names. uTime is the app's own timeline in seconds: the backing clears over the crack, and each shard flies
 * its px drift (aFlight.xy, already in world units), turns by aFlight.z, tumbles about aTumble, shrinks to 0.66,
 * and fades after its delay (aFlight.w).
 */
const SHARD_VERTEX = /* glsl */ `
attribute vec2 aCentre;
attribute vec4 aFlight;
attribute vec3 aTumble;
attribute float aRim;
uniform float uTime;
uniform vec2 uPane;
varying vec2 vUv;
varying float vRim;
varying float vFade;
varying float vBacking;
varying vec3 vNormal;
varying vec3 vView;

vec3 turn(vec3 p, vec3 axis, float angle) {
  return p * cos(angle) + cross(axis, p) * sin(angle) + axis * dot(axis, p) * (1.0 - cos(angle));
}

void main() {
  vUv = (aCentre + position.xy) / uPane + 0.5;
  vRim = aRim;
  vec3 local = position;
  vec3 n = vec3(0.0, 0.0, 1.0);
  vec3 centre = vec3(aCentre, 0.0);
  vBacking = aFlight.w < 0.0 ? 1.0 : 0.0;
  if (aFlight.w < 0.0) {
    vFade = 1.0 - smoothstep(0.0, ${SHATTER.crack.toFixed(2)}, uTime);
  } else {
    float t = clamp((uTime - aFlight.w) / ${(SHATTER.app * SHATTER.flight).toFixed(3)}, 0.0, 1.0);
    float e = 1.0 - pow(1.0 - t, 3.0);
    local = turn(local * mix(1.0, 0.66, e), vec3(0.0, 0.0, 1.0), aFlight.z * e);
    local = turn(local, aTumble, e * 2.2);
    n = turn(n, aTumble, e * 2.2);
    centre += vec3(aFlight.xy, (0.35 + 0.5 * abs(aTumble.x)) * e) * e;
    vFade = 1.0 - e;
  }
  vec4 world = modelMatrix * vec4(centre + local, 1.0);
  vNormal = normalize(mat3(modelMatrix) * n);
  vView = cameraPosition - world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`
const SHARD_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime;
uniform float uOpacity;
uniform vec2 uPointer;
uniform float uHover;
uniform vec3 uKey;
varying vec2 vUv;
varying float vRim;
varying float vFade;
varying float vBacking;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  // A coarse mip of the screen behind, so the glass shows its colours and none of its words.
  vec3 frost = texture2D(uMap, vUv, 4.5).rgb;
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(vView);
  float sheen = pow(max(dot(n, normalize(uKey + v)), 0.0), 40.0);
  // The overlay's 120 degree white streak, and a glint that follows the pointer while it is over the pane.
  float streak = exp(-pow((vUv.x * 0.85 - vUv.y * 0.5 - 0.12) * 4.0, 2.0)) * 0.1;
  vec2 off = (vUv - uPointer) * vec2(1.78, 1.0);
  float glint = uHover * exp(-dot(off, off) * 30.0) * 0.32;
  // A seam about 1.5 px wide along each shard's outline, as the app's white/35 border.
  float rim = 1.0 - smoothstep(0.0, 1.5, (1.0 - vRim) / max(fwidth(vRim), 1e-5));
  // Dark navy glass carrying a quarter of the coarse sample, so the pane reads as a lid over the messages screen.
  // At full strength the coarse mip lifts the whole pane to a pale lavender.
  vec3 tinted = vec3(0.02, 0.035, 0.085) + frost * 0.25;
  // The whole pane shows only faint crazing. Once the crack starts, each shard takes the app's white/14 fill and
  // white/35 border.
  float live = smoothstep(0.0, 0.08, uTime);
  vec3 colour;
  float alpha;
  if (vBacking > 0.5) {
    colour = tinted + vec3(0.9, 0.95, 1.0) * (streak + glint + 0.5 * rim);
    alpha = 0.9 + 0.1 * rim;
  } else {
    colour = mix(tinted, vec3(0.85, 0.92, 1.0), 0.35) + vec3(0.9, 0.95, 1.0) * (sheen * 0.8 * live + glint);
    alpha = 0.16 * live + (0.12 + 0.38 * live) * rim + 0.4 * sheen * live;
  }
  alpha *= uOpacity * vFade;
  gl_FragColor = vec4(colour * alpha, alpha);
}
`

/** The crack: a white flash and SHATTER.rays rays through the press point, which grow and fade over the crack. */
const CRACK_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const CRACK_FRAGMENT = /* glsl */ `
uniform float uCrack;
uniform vec2 uOrigin;
uniform vec2 uPane;
uniform float uOpacity;
varying vec2 vUv;
float noise(float seed) {
  return fract(sin(seed * 97.137) * 43758.5453);
}
void main() {
  if (uCrack <= 0.0 || uCrack >= 1.0) discard;
  vec2 p = (vUv - uOrigin) * uPane;
  float reach = uPane.x * 0.8 * mix(0.2, 1.0, uCrack);
  float light = 0.0;
  for (int i = 0; i < ${SHATTER.rays}; i++) {
    float angle = radians(${(360 / SHATTER.rays).toFixed(1)} * float(i) + noise(float(i) + 401.0) * 10.0);
    vec2 dir = vec2(cos(angle), sin(angle));
    float across = abs(p.x * dir.y - p.y * dir.x);
    float along = abs(dot(p, dir)) / reach;
    light += exp(-across * across / 0.00006) * smoothstep(1.0, 0.3, along) * (0.6 + 0.4 * smoothstep(0.0, 0.4, along));
  }
  float flash = 0.82 * (1.0 - smoothstep(0.0, uPane.x * 0.36, length(p))) * (1.0 - smoothstep(0.0, 0.35, uCrack));
  float k = (light * 0.9 + flash) * (1.0 - uCrack) * uOpacity;
  gl_FragColor = vec4(vec3(0.9, 0.95, 1.0) * k, min(k, 1.0) * 0.8);
}
`

/** A layer's plate: a lit border, a faint 0.2 unit grid, and a thin fill. */
const PLATE_VERTEX = CRACK_VERTEX
const PLATE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform vec2 uSize;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  vec2 edge = uSize * 0.5 - abs(p);
  float d = min(edge.x, edge.y);
  float border = exp(-d * d / 0.00015);
  vec2 cell = abs(fract(p / 0.2) - 0.5) * 0.2;
  float grid = exp(-pow(min(cell.x, cell.y), 2.0) / 0.00002) * 0.16;
  float k = (border * 0.95 + grid + 0.06) * uOpacity;
  gl_FragColor = vec4(uColor * k, min(k, 1.0) * 0.75);
}
`

/** The request packets: glowing points sized in world units. uScale is drawing-buffer px per world unit at depth 1. */
const PACKET_VERTEX = /* glsl */ `
attribute float aSize;
attribute float aLight;
uniform float uScale;
varying float vLight;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(-view.z, 0.1);
  vLight = aLight;
  gl_Position = projectionMatrix * view;
}
`
const PACKET_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vLight;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d2 = dot(c, c) * 4.0;
  float hot = exp(-d2 * 26.0);
  float k = (exp(-d2 * 4.0) * 0.8 + hot) * vLight;
  gl_FragColor = vec4(mix(uColor, vec3(1.0, 0.96, 0.88), hot) * k, min(k, 1.0) * 0.8);
}
`

/** Additive colour with coverage kept in alpha, for light that sits over the glass. */
const ADDITIVE = {
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
} as const

/** Settles one component under LAYOUT's forces, from a seeded start, and centres it on the origin. */
function relax(radii: number[], links: { a: number; b: number; w: number }[], seed: number): THREE.Vector3[] {
  const random = mulberry32(seed)
  const p = radii.map(() => new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(1.2))
  const v = radii.map(() => new THREE.Vector3())
  const d = new THREE.Vector3()
  for (let step = 0; step < LAYOUT.steps; step++) {
    const alpha = 1 - step / LAYOUT.steps
    for (const { a, b, w } of links) {
      d.subVectors(p[b], p[a])
      const len = d.length() || 1e-6
      const k = ((len - LAYOUT.link / Math.max(w, 0.45)) / len) * 0.25 * alpha
      v[a].addScaledVector(d, k)
      v[b].addScaledVector(d, -k)
    }
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        d.subVectors(p[j], p[i])
        const len2 = d.lengthSq() + 1e-4
        const len = Math.sqrt(len2)
        const charge = (LAYOUT.charge * (2 + 12 * (radii[i] + radii[j])) * alpha) / len2 / len
        v[i].addScaledVector(d, -charge)
        v[j].addScaledVector(d, charge)
        const min = radii[i] + radii[j] + LAYOUT.collide
        if (len < min) {
          const push = ((min - len) * 0.5) / len
          v[i].addScaledVector(d, -push)
          v[j].addScaledVector(d, push)
        }
      }
    }
    for (let i = 0; i < p.length; i++) {
      v[i].addScaledVector(p[i], -0.05 * alpha)
      p[i].add(v[i])
      v[i].multiplyScalar(0.6)
    }
  }
  const centre = p.reduce((sum, q) => sum.add(q), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, p.length))
  for (const q of p) q.sub(centre)
  return p
}

/** An instanced ribbon set whose endpoints, colours, and light the caller writes in place each frame. */
function ribbons(count: number, width: number) {
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0]), 3))
  geometry.setIndex([0, 1, 2, 2, 1, 3])
  const attribute = (size: number) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(count * size), size)
    a.setUsage(THREE.DynamicDrawUsage)
    return a
  }
  const start = attribute(3)
  const end = attribute(3)
  const colorA = attribute(3)
  const colorB = attribute(3)
  const light = attribute(1)
  const seed = attribute(1)
  geometry.setAttribute('aStart', start)
  geometry.setAttribute('aEnd', end)
  geometry.setAttribute('aColorA', colorA)
  geometry.setAttribute('aColorB', colorB)
  geometry.setAttribute('aLight', light)
  geometry.setAttribute('aSeed', seed)
  geometry.instanceCount = count
  const uniforms = { uWidth: { value: width }, uPhase: { value: 0 }, uPulse: { value: 0 } }
  // The quad's winding flips with the link's direction on screen, so both faces draw.
  const material = new THREE.ShaderMaterial({ vertexShader: RIBBON_VERTEX, fragmentShader: RIBBON_FRAGMENT, uniforms, ...ADDITIVE, side: THREE.DoubleSide })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  const commit = () => {
    start.needsUpdate = true
    end.needsUpdate = true
    light.needsUpdate = true
  }
  return { mesh, geometry, material, uniforms, start, end, colorA, colorB, light, seed, commit }
}
type Ribbons = ReturnType<typeof ribbons>

/** The 28 shards of GlassShatterOverlay.tsx and the frosted backing as one geometry, in pane-local world units. */
function shardGeometry(paneW: number, paneH: number) {
  const position: number[] = []
  const centre: number[] = []
  const flight: number[] = []
  const tumble: number[] = []
  const rim: number[] = []
  const toWorld = (xPct: number, yPct: number): [number, number] => [(xPct / 100 - 0.5) * paneW, (0.5 - yPct / 100) * paneH]
  const fan = (points: [number, number][], at: [number, number], fly: [number, number, number, number], axis: [number, number, number]) => {
    const mid = points.reduce((sum, q) => [sum[0] + q[0] / points.length, sum[1] + q[1] / points.length], [0, 0])
    for (let k = 0; k < points.length; k++) {
      const q = points[k]
      const r = points[(k + 1) % points.length]
      for (const [x, y, edge] of [[mid[0], mid[1], 0], [q[0], q[1], 1], [r[0], r[1], 1]] as const) {
        position.push(x - at[0], y - at[1], 0)
        centre.push(...at)
        flight.push(...fly)
        tumble.push(...axis)
        rim.push(edge)
      }
    }
  }
  // The backing: the whole pane, fading over the crack without moving.
  const corners: [number, number][] = [toWorld(0, 0), toWorld(100, 0), toWorld(100, 100), toWorld(0, 100)]
  fan(corners, [0, 0], [0, 0, 0, -1], [0, 0, 1])
  // The shards, with the app's formulas: a 7 by 4 grid of boxes, each cut to a six-point polygon given in percent of
  // its box, drifting from the centre by 96 to 184 px plus noise, turning by up to about 84 degrees.
  for (let index = 0; index < 28; index++) {
    const col = index % 7
    const row = Math.floor(index / 7)
    const centerX = (col + 0.5) * (100 / 7)
    const centerY = (row + 0.5) * (100 / 4)
    const fromCenterX = centerX - 50
    const fromCenterY = centerY - 50
    const spread = 96 + shardNoise(index + 1) * 88
    const driftX = Math.round((fromCenterX / 50) * spread + (shardNoise(index + 11) - 0.5) * 70)
    const driftY = Math.round((fromCenterY / 50) * spread + (shardNoise(index + 17) - 0.5) * 82)
    const rotate = Math.round((shardNoise(index + 23) - 0.5) * 84 + (fromCenterX / 50) * 42)
    const width = 14 + shardNoise(index + 29) * 12
    const height = 18 + shardNoise(index + 31) * 15
    const box: [number, number][] = [
      [8 + shardNoise(index + 37) * 18, shardNoise(index + 41) * 14],
      [92 - shardNoise(index + 43) * 13, 6 + shardNoise(index + 47) * 24],
      [100 - shardNoise(index + 53) * 20, 66 + shardNoise(index + 59) * 30],
      [58 + shardNoise(index + 61) * 30, 96 - shardNoise(index + 67) * 8],
      [6 + shardNoise(index + 71) * 30, 80 + shardNoise(index + 73) * 18],
      [shardNoise(index + 79) * 12, 24 + shardNoise(index + 83) * 40],
    ]
    const delay = 0.015 + shardNoise(index + 89) * 0.19
    const left = centerX - width / 2
    const top = centerY - height / 2
    const points = box.map(([px, py]) => toWorld(left + (px / 100) * width, top + (py / 100) * height))
    // The px drift is measured on the chat panel, about CHAT_PX wide, and doubled, since the pane flies toward the
    // camera as well and perspective shortens it.
    const scale = (2 * paneW) / CHAT_PX
    const axis = new THREE.Vector3(shardNoise(index + 5) - 0.5, shardNoise(index + 7) - 0.5, 0.25).normalize()
    fan(points, toWorld(centerX, centerY), [driftX * scale, -driftY * scale, THREE.MathUtils.degToRad(-rotate), delay], [axis.x, axis.y, axis.z])
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geometry.setAttribute('aCentre', new THREE.Float32BufferAttribute(centre, 2))
  geometry.setAttribute('aFlight', new THREE.Float32BufferAttribute(flight, 4))
  geometry.setAttribute('aTumble', new THREE.Float32BufferAttribute(tumble, 3))
  geometry.setAttribute('aRim', new THREE.Float32BufferAttribute(rim, 1))
  return geometry
}

const flat = (geometry: THREE.BufferGeometry) => {
  const out = geometry.index ? geometry.toNonIndexed() : geometry
  out.computeVertexNormals()
  return out
}

interface GraphNodeState {
  data: NexusNode
  radius: number
  colour: THREE.Color
  mesh: THREE.Mesh
  material: THREE.ShaderMaterial
  outlineMaterial: THREE.LineBasicMaterial | null
  component: number
  /** Position in its component's own frame, and in the ball and split before the pose's turn. */
  local: THREE.Vector3
  neighbours: Set<number>
  spin: THREE.Vector3
  lit: number
  grow: number
  offset: THREE.Vector3
  velocity: THREE.Vector3
  world: THREE.Vector3
  size: number
  panel: number
}

const createScene: SceneFactory = (ctx) => {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80)
  const root = new THREE.Group()
  scene.add(root)
  const keyDir = new THREE.Vector3(-0.45, 0.6, 0.66).normalize()
  const disposables: { dispose(): void }[] = []
  const own = <T extends { dispose(): void }>(item: T): T => {
    disposables.push(item)
    return item
  }
  const panelAt = new Map(ctx.story.panels.map((label, i) => [label, i]))
  const screens = {
    feed: ctx.load(SCREEN_SRC.feed),
    nexus: ctx.load(SCREEN_SRC.nexus),
    messages: ctx.load(SCREEN_SRC.messages),
  }

  const glass = (colour: THREE.ColorRepresentation, core = 0) => own(new THREE.ShaderMaterial({
    vertexShader: GLASS_VERTEX,
    fragmentShader: GLASS_FRAGMENT,
    uniforms: {
      uColor: { value: new THREE.Color(colour) },
      uOpacity: { value: 1 },
      uLight: { value: 1 },
      uGlow: { value: 0 },
      uCore: { value: core },
      uKey: { value: keyDir },
    },
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }))
  const shapes = {
    hex: own(flat(new THREE.CylinderGeometry(1, 1, 0.78, 6, 1).rotateX(Math.PI / 2))),
    diamond: own(flat(new THREE.OctahedronGeometry(1, 0).scale(0.82, 1.2, 0.82))),
    tile: own(new RoundedBoxGeometry(1.45, 1.45, 0.5, 2, 0.14)),
    kite: own(flat(new THREE.OctahedronGeometry(1, 0).scale(0.7, 1.3, 0.45))),
    orb: own(new THREE.IcosahedronGeometry(1, 3)),
  }
  const outlines = {
    hex: own(new THREE.EdgesGeometry(shapes.hex, 20)),
    diamond: own(new THREE.EdgesGeometry(shapes.diamond, 20)),
    tile: own(new THREE.EdgesGeometry(shapes.tile, 30)),
    kite: own(new THREE.EdgesGeometry(shapes.kite, 20)),
  }
  const SHAPE_OF: Record<string, keyof typeof outlines> = { tech: 'hex', finance: 'diamond', business: 'tile', community: 'kite' }

  // The graph, built once nexus-graph.json arrives.
  let nodes: GraphNodeState[] = []
  let links: { a: number; b: number; weight: number; lit: number }[] = []
  let edgeSet: Ribbons | null = null
  let identity = -1
  let hub = -1
  let pluckAnchor = -1
  let components: number[][] = []
  let disposed = false

  const build = (graph: NexusGraph) => {
    const index = new Map(graph.nodes.map((n, i) => [n.id, i]))
    links = graph.edges.flatMap((e) => {
      const a = index.get(e.source)
      const b = index.get(e.target)
      return a === undefined || b === undefined ? [] : [{ a, b, weight: e.weight, lit: 1 }]
    })
    // Connected components, by union-find, in order of their first node.
    const parent = graph.nodes.map((_, i) => i)
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
    for (const { a, b } of links) parent[find(a)] = find(b)
    const groups = new Map<number, number[]>()
    graph.nodes.forEach((_, i) => {
      const r = find(i)
      if (!groups.has(r)) groups.set(r, [])
      groups.get(r)?.push(i)
    })
    components = [...groups.values()]
    const local: THREE.Vector3[] = graph.nodes.map(() => new THREE.Vector3())
    const componentOf: number[] = graph.nodes.map(() => 0)
    components.forEach((members, k) => {
      const at = new Map(members.map((g, j) => [g, j]))
      const placed = relax(
        members.map((g) => nodeRadius(graph.nodes[g])),
        links.filter((l) => at.has(l.a)).map((l) => ({ a: at.get(l.a) ?? 0, b: at.get(l.b) ?? 0, w: l.weight })),
        7 + members[0],
      )
      const extent = Math.max(1e-3, ...placed.map((q) => q.length()))
      members.forEach((g, j) => {
        local[g].copy(placed[j]).multiplyScalar(COMPONENT_R / extent)
        componentOf[g] = k
      })
    })
    const random = mulberry32(2026)
    nodes = graph.nodes.map((data, i) => {
      const [companyShade, userShade] = PALETTE[data.group] ?? PALETTE.tech
      const colour = new THREE.Color(data.type === 'company' ? companyShade : userShade)
      const shape = SHAPE_OF[data.group] ?? 'hex'
      const material = glass(colour, data.type === 'user' ? 1 : 0)
      const mesh = new THREE.Mesh(data.type === 'user' ? shapes.orb : shapes[shape], material)
      // A company's facet edges draw as lines a little whiter than its glass.
      let outlineMaterial: THREE.LineBasicMaterial | null = null
      if (data.type === 'company') {
        outlineMaterial = own(new THREE.LineBasicMaterial({ color: colour.clone().lerp(new THREE.Color('#ffffff'), 0.35), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
        mesh.add(new THREE.LineSegments(outlines[shape], outlineMaterial))
      }
      root.add(mesh)
      return {
        data,
        radius: nodeRadius(data),
        colour,
        mesh,
        material,
        outlineMaterial,
        component: componentOf[i],
        local: local[i],
        neighbours: new Set<number>(),
        spin: new THREE.Vector3(random() * 6.28, random() * 6.28, (random() - 0.5) * 2),
        lit: 1,
        grow: 0,
        offset: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        world: new THREE.Vector3(),
        size: nodeRadius(data),
        panel: panelAt.get(data.label) ?? -1,
      }
    })
    for (const { a, b } of links) {
      nodes[a].neighbours.add(b)
      nodes[b].neighbours.add(a)
    }
    identity = nodes.findIndex((n) => n.data.label === IDENTITY)
    hub = nodes.findIndex((n) => n.data.label === 'Google')
    pluckAnchor = nodes.findIndex((n) => n.data.label === 'Goldman Sachs')
    edgeSet = ribbons(links.length, 0.013)
    links.forEach((link, k) => {
      edgeSet?.colorA.setXYZ(k, nodes[link.a].colour.r, nodes[link.a].colour.g, nodes[link.a].colour.b)
      edgeSet?.colorB.setXYZ(k, nodes[link.b].colour.r, nodes[link.b].colour.g, nodes[link.b].colour.b)
      edgeSet?.seed.setX(k, random())
    })
    edgeSet.mesh.renderOrder = -1
    root.add(edgeSet.mesh)
    for (const node of nodes) node.mesh.renderOrder = 1
    ctx.invalidate()
  }
  fetch(GRAPH_SRC)
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`${response.status}`))))
    .then((graph: NexusGraph) => { if (!disposed) build(graph) })
    .catch((error) => console.warn('[chapter] agoriai graph failed to load', error))

  // SwiftCedar's shells, outermost first, each a faceted ball with lit edges.
  const shellGeometry = own(flat(new THREE.IcosahedronGeometry(1, 1)))
  const shellEdges = own(new THREE.EdgesGeometry(shellGeometry, 5))
  const shells = SHELLS.map((radius, k) => {
    const material = glass(k === 0 ? '#7aa8ff' : k === 1 ? '#5f8fff' : '#4f7cff')
    const mesh = new THREE.Mesh(shellGeometry, material)
    const lineMaterial = own(new THREE.LineBasicMaterial({ color: '#9cc0ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    mesh.add(new THREE.LineSegments(shellEdges, lineMaterial))
    mesh.visible = false
    mesh.renderOrder = 2
    root.add(mesh)
    return { mesh, material, lineMaterial, radius, open: 0 }
  })
  let tier = 0

  // The messages pane: the real capture in a glass frame, the frosted shards over it, and the crack.
  const paneH = PANE_W / SCREEN_ASPECT
  const pane = new THREE.Group()
  root.add(pane)
  const frameGeometry = own(new RoundedBoxGeometry(PANE_W + 0.08, paneH + 0.08, 0.04, 2, 0.02))
  const paneFrameMaterial = glass('#1b2c5c')
  const paneFrame = new THREE.Mesh(frameGeometry, paneFrameMaterial)
  paneFrame.position.z = -0.03
  const screenGeometry = own(new THREE.PlaneGeometry(PANE_W, paneH))
  const paneScreenMaterial = own(new THREE.MeshBasicMaterial({ map: screens.messages.texture, transparent: true, toneMapped: false }))
  const paneScreen = new THREE.Mesh(screenGeometry, paneScreenMaterial)
  const shardUniforms = {
    uMap: { value: screens.messages.texture },
    uTime: { value: 0 },
    uPane: { value: new THREE.Vector2(PANE_W, paneH) },
    uOpacity: { value: 1 },
    uPointer: { value: new THREE.Vector2(0.5, 0.5) },
    uHover: { value: 0 },
    uKey: { value: keyDir },
  }
  const shardMaterial = own(new THREE.ShaderMaterial({ vertexShader: SHARD_VERTEX, fragmentShader: SHARD_FRAGMENT, uniforms: shardUniforms, transparent: true, premultipliedAlpha: true, depthWrite: false, side: THREE.DoubleSide }))
  const shardMesh = new THREE.Mesh(own(shardGeometry(PANE_W, paneH)), shardMaterial)
  shardMesh.position.z = 0.03
  shardMesh.frustumCulled = false
  const crackUniforms = { uCrack: { value: 0 }, uOrigin: { value: new THREE.Vector2(0.5, 0.5) }, uPane: { value: new THREE.Vector2(PANE_W, paneH) }, uOpacity: { value: 1 } }
  const crack = new THREE.Mesh(screenGeometry, own(new THREE.ShaderMaterial({ vertexShader: CRACK_VERTEX, fragmentShader: CRACK_FRAGMENT, uniforms: crackUniforms, ...ADDITIVE })))
  crack.position.z = 0.04
  paneFrame.renderOrder = 3
  paneScreen.renderOrder = 4
  shardMesh.renderOrder = 5
  crack.renderOrder = 6
  pane.add(paneFrame, paneScreen, shardMesh, crack)
  pane.visible = false
  /** The click's shatter, 0 whole to 1 broken, its goal, and the pointer's glint over the pane. */
  let shatter = 0
  let shatterGoal = 0
  let paneHover = 0

  // The stack: three plates, the screens on the client plate, the route ring, and the table slabs.
  const stack = new THREE.Group()
  root.add(stack)
  stack.visible = false
  const plateGeometry = own(new THREE.PlaneGeometry(PLATE.w, PLATE.d).rotateX(-Math.PI / 2))
  const plates = (['#6f9bff', '#4f7cff', '#3a66e8'] as const).map((colour, k) => {
    const uniforms = { uColor: { value: new THREE.Color(colour) }, uOpacity: { value: 0 }, uSize: { value: new THREE.Vector2(PLATE.w, PLATE.d) } }
    const mesh = new THREE.Mesh(plateGeometry, own(new THREE.ShaderMaterial({ vertexShader: PLATE_VERTEX, fragmentShader: PLATE_FRAGMENT, uniforms, ...ADDITIVE, side: THREE.DoubleSide })))
    mesh.position.y = [STACK.client, STACK.api, STACK.db][k]
    mesh.renderOrder = -2
    stack.add(mesh)
    return { mesh, uniforms }
  })
  const clientFrameGeometry = own(new RoundedBoxGeometry(CLIENT_W + 0.05, CLIENT_W / SCREEN_ASPECT + 0.05, 0.03, 2, 0.015))
  const clientScreenGeometry = own(new THREE.PlaneGeometry(CLIENT_W, CLIENT_W / SCREEN_ASPECT))
  const clients = CLIENT_SCREENS.map((key, k) => {
    const group = new THREE.Group()
    const frameMaterial = glass('#24396f')
    const frame = new THREE.Mesh(clientFrameGeometry, frameMaterial)
    frame.position.z = -0.02
    const material = own(new THREE.MeshBasicMaterial({ map: screens[key].texture, transparent: true, toneMapped: false }))
    const plane = new THREE.Mesh(clientScreenGeometry, material)
    plane.renderOrder = 3
    group.add(frame, plane)
    group.position.set((k - 1) * 0.84, STACK.client + 0.04 + CLIENT_W / SCREEN_ASPECT / 2, -0.15)
    stack.add(group)
    return { key, group, material, frameMaterial }
  })
  const routeCount = ROUTE_GROUPS.reduce((sum, n) => sum + n, 0)
  /** Each route's slot on the ring and its group. One slot stays empty after each group, so the groups read as arcs. */
  const routeSlot: number[] = []
  const routeGroup: number[] = []
  {
    let slot = 0
    ROUTE_GROUPS.forEach((size, group) => {
      for (let i = 0; i < size; i++) {
        routeSlot.push(slot++)
        routeGroup.push(group)
      }
      slot++
    })
  }
  const slotCount = routeCount + ROUTE_GROUPS.length
  const tileGeometry = own(new THREE.BoxGeometry(1, 1, 1))
  const tileMaterial = own(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, toneMapped: false, depthWrite: false }))
  const tiles = new THREE.InstancedMesh(tileGeometry, tileMaterial, routeCount)
  tiles.frustumCulled = false
  tiles.renderOrder = 2
  stack.add(tiles)
  const slabGeometry = own(new RoundedBoxGeometry(SLAB.w, SLAB.h, SLAB.d, 2, 0.02))
  const slabs = TABLES.map((name, k) => {
    let row = 0
    let first = 0
    while (k >= first + TABLE_ROWS[row]) first += TABLE_ROWS[row++]
    const material = glass('#4f7cff')
    const mesh = new THREE.Mesh(slabGeometry, material)
    mesh.position.set((k - first - (TABLE_ROWS[row] - 1) / 2) * SLAB.gap, STACK.db + SLAB.h / 2 + 0.01, (row - 1) * SLAB.row)
    mesh.renderOrder = 1
    stack.add(mesh)
    return { name, mesh, material, lit: 0, panel: panelAt.get(name) ?? -1, world: new THREE.Vector3() }
  })
  const slabOf = (name: Table) => slabs[TABLES.indexOf(name)]
  const beams = ribbons(1 + FAN, 0.012)
  beams.mesh.renderOrder = 7
  root.add(beams.mesh)
  for (let k = 0; k <= FAN; k++) {
    beams.colorA.setXYZ(k, 1.0, 0.55, 0.1)
    beams.colorB.setXYZ(k, 1.0, 0.55, 0.1)
  }
  const packetPositions = new THREE.BufferAttribute(new Float32Array((1 + FAN) * 3), 3)
  packetPositions.setUsage(THREE.DynamicDrawUsage)
  const packetLight = new THREE.BufferAttribute(new Float32Array(1 + FAN), 1)
  packetLight.setUsage(THREE.DynamicDrawUsage)
  const packetGeometry = own(new THREE.BufferGeometry())
  packetGeometry.setAttribute('position', packetPositions)
  packetGeometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(1 + FAN).fill(0.16), 1))
  packetGeometry.setAttribute('aLight', packetLight)
  const packetUniforms = { uScale: { value: 1 }, uColor: { value: new THREE.Color('#ffb347') } }
  const packets = new THREE.Points(packetGeometry, own(new THREE.ShaderMaterial({ vertexShader: PACKET_VERTEX, fragmentShader: PACKET_FRAGMENT, uniforms: packetUniforms, ...ADDITIVE })))
  packets.frustumCulled = false
  packets.renderOrder = 8
  root.add(packets)
  let request: RequestKey = 'posts'
  /** Clock seconds a clicked request started, or -1. A finished click holds its trip at 1 until the act is left. */
  let tripStart = -1
  let tripHeld = false
  let dial = -(routeSlot[REQUESTS.posts.route] / slotCount) * Math.PI * 2

  let narrow = ctx.narrow
  let clock = 0
  let selected = -1
  let pickable = false
  /** The last hovered node and the frame time it stays active until. */
  let held = -1
  let heldUntil = 0
  let paneLive = false
  let lastAspect = 1
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const scratch = new THREE.Vector3()
  const toward = new THREE.Vector3()
  const ballCentre = new THREE.Vector3()
  const turnBall = new THREE.Quaternion()
  const turnSplit = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const componentTurns = BALL.map(({ turn }) => new THREE.Quaternion().setFromEuler(new THREE.Euler(turn[0], turn[1], turn[2])))
  const drawing = new THREE.Vector2()
  const identityAt = new THREE.Vector3()
  const tileWorld = new THREE.Vector3()
  const screenFoot = new THREE.Vector3()
  const matrix = new THREE.Matrix4()
  const tileColour = new THREE.Color()
  const quaternion = new THREE.Quaternion()
  const UP = new THREE.Vector3(0, 1, 0)

  /** Points the camera straight down -z from `dist` so world (0, targetY) sits at `focusX` of the frame's width. */
  const aim = (dist: number, targetY: number, aspect: number, focusX: number) => {
    const visibleH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const offset = (0.5 - focusX) * visibleH * aspect
    camera.position.set(offset, targetY, dist)
    camera.lookAt(offset, targetY, 0)
  }

  /** The nearest node within reach of a pointer in NDC, by projected distance, or -1. A hidden node never picks. */
  const pickAt = (x: number, y: number, aspect: number) => {
    let best = -1
    let bestD = Infinity
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    nodes.forEach((node, i) => {
      if (!node.mesh.visible) return
      scratch.copy(node.world).project(camera)
      const d = Math.hypot((scratch.x - x) * aspect, scratch.y - y)
      const depth = camera.position.distanceTo(node.world)
      const reach = node.size / (depth * tanHalf) + 0.03
      if (d < reach && d < bestD) {
        best = i
        bestD = d
      }
    })
    return best
  }

  /** Advances the pluck by `dt` seconds in fixed PLUCK.step substeps. Returns true while any node still moves. */
  const stepPluck = (dt: number) => {
    let left = Math.min(dt, 0.05)
    while (left > 1e-6) {
      const h = Math.min(PLUCK.step, left)
      left -= h
      for (const node of nodes) {
        node.velocity.addScaledVector(node.offset, -PLUCK.home * h).multiplyScalar(1 - PLUCK.damp * h)
      }
      for (const { a, b, weight } of links) {
        toward.subVectors(nodes[b].offset, nodes[a].offset).multiplyScalar(PLUCK.link * weight * h)
        nodes[a].velocity.add(toward)
        nodes[b].velocity.sub(toward)
      }
      for (const node of nodes) node.offset.addScaledVector(node.velocity, h)
    }
    let peak = 0
    for (const node of nodes) peak = Math.max(peak, node.offset.length(), node.velocity.length())
    if (peak < PLUCK.rest) {
      for (const node of nodes) {
        node.offset.set(0, 0, 0)
        node.velocity.set(0, 0, 0)
      }
      return false
    }
    return true
  }
  let plucking = false

  // Panels, one per story label, reused every frame. A panel whose label is not shown sits one unit behind the
  // camera, so it projects to nothing. Chapter groups labels into rows by the height of every projected anchor, and
  // a hidden anchor between two shown labels would chain them into one row and push them apart sideways.
  const panels: ScenePanel[] = ctx.story.panels.map(() => ({ center: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), halfH: 0, corners: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], develop: 0, opacity: 0 }))
  const behind = new THREE.Vector3()
  const forward = new THREE.Vector3()
  /** Camera depth, world units, at which every shown panel's bound sits. */
  const LABEL_DEPTH = 4
  /**
   * Sets panel k as a label hung `drop` world units under `at`. Its bound is the one point on the camera's ray
   * through `at` at LABEL_DEPTH, so it projects where `at` does, and since every shown bound shares that depth no
   * panel counts as nearer than another and none hides another's label. A panel that is not developed parks behind
   * the camera.
   */
  const label = (k: number, at: THREE.Vector3, drop: number, develop: number, opacity: number) => {
    if (k < 0) return
    const panel = panels[k]
    const shown = develop >= 1 && opacity > 0
    panel.center.copy(shown ? at : behind)
    panel.up.copy(UP)
    panel.halfH = drop / 1.08
    toward.subVectors(panel.center, camera.position)
    const depth = toward.dot(forward)
    if (shown && depth > 1e-3) toward.multiplyScalar(LABEL_DEPTH / depth).add(camera.position)
    else toward.copy(panel.center)
    for (const corner of panel.corners) corner.copy(toward)
    panel.develop = shown ? develop : 0
    panel.opacity = shown ? opacity : 0
  }
  const anchors = new Map<string, THREE.Vector3 | null>()
  const anchorPoints = { orb: new THREE.Vector3(), glass: new THREE.Vector3(), hub: new THREE.Vector3(), pluck: new THREE.Vector3(), route: new THREE.Vector3() }
  const hit = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  const boundsPool = Array.from({ length: 96 }, () => new THREE.Vector3())
  const bounds: THREE.Vector3[] = []
  const bound = (x: number, y: number, z: number) => {
    if (bounds.length < boundsPool.length) bounds.push(boundsPool[bounds.length].set(x, y, z))
  }

  const update = (f: SceneFrame): SceneOutput => {
    const a = f.local('arrival')
    const id = f.local('identity')
    const nx = f.local('nexus')
    const st = f.local('stack')
    const c = f.local('close')
    clock = f.time
    lastAspect = f.aspect
    let busy = false
    const dt = f.dt
    const flare = 1 + 0.25 * f.push

    // Each phase is 0 before its act and complete after it, so they chain. The graph forms with the glyphs by 0.62
    // of the arrival, and the home page's preview holds its last frame from 0.65.
    const rise = smoother(ramp(a, 0, 0.62))
    const focusId = smoother(ramp(id, 0.02, 0.24)) * (1 - smoother(ramp(id, 0.84, 0.99)))
    const paneIn = smoother(ramp(id, 0.16, 0.4)) * (1 - smoother(ramp(id, 0.86, 0.98)))
    const split = smoother(ramp(nx, 0.04, 0.4))
    const dive = smoother(ramp(st, 0.02, 0.3))
    const stackIn = smoother(ramp(st, 0.04, 0.3)) * (1 - smoother(ramp(c, 0, 0.22)))
    const gather = smoother(ramp(c, 0.02, 0.5))
    const present = 1 - dive * (1 - gather)

    // The camera eases in as the graph forms, backs out for the split and further for the stack, and returns for the
    // close. Phones stand farther back and aim lower, so the scene keeps the top of the stage above the copy.
    let dist = lerp(narrow ? 11.4 : 6.9, narrow ? 10.2 : 6.2, rise)
    dist = lerp(dist, narrow ? 10.6 : 6.3, focusId)
    dist = lerp(dist, narrow ? 11.2 : 7.6, split)
    dist = lerp(dist, narrow ? 12.2 : 8.2, dive)
    dist = lerp(dist, narrow ? 10.2 : 6.2, gather)
    dist *= 1 - 0.05 * f.push
    let lift = narrow ? -1.3 : 0
    lift = lerp(lift, narrow ? -1.2 : 0, focusId)
    lift = lerp(lift, narrow ? -1.5 : 0, split)
    lift = lerp(lift, narrow ? -1.35 : 0.05, dive)
    lift = lerp(lift, narrow ? -1.3 : 0, gather)
    aim(dist, lift, f.aspect, narrow ? 0.5 : 0.655)
    camera.updateMatrixWorld()

    // The pointer and a drag turn the graph, and the scroll swings it into place as it forms and again as it gathers
    // at the close. The split turns each island about its own centre by 0.6 of the pointer's reach.
    const yaw = -f.interaction.tiltX * TILT.yaw + f.interaction.dragYaw
    const pitch = -f.interaction.tiltY * TILT.pitch
    turnBall.setFromEuler(euler.set(pitch + 0.25 * (1 - rise), yaw - 1.1 * (1 - rise) + 0.7 * smoother(ramp(c, 0.2, 1)), 0, 'YXZ'))
    turnSplit.setFromEuler(euler.set(pitch * 0.6, yaw * 0.6, 0, 'YXZ'))
    ballCentre.set(0, 0, 0)

    // The stack, posed first, since the nodes sink into its slabs.
    stack.visible = stackIn > 0.002
    stack.position.set(narrow ? 0 : 0.08, narrow ? 0.05 : 0.02, 0)
    stack.rotation.set(STACK.pitch + pitch * 0.4, yaw * 0.7 + 0.25 * (st - 0.5) * (1 - gather), 0, 'YXZ')
    stack.scale.setScalar((narrow ? 0.84 : 1) * (0.92 + 0.08 * stackIn))
    stack.updateMatrixWorld(true)
    for (const slab of slabs) slab.mesh.getWorldPosition(slab.world)

    // The node under the pointer, while the graph is whole and pickable. A hover outranks a clicked selection.
    pickable = nodes.length > 0 && focusId < 0.05 && dive < 0.05 + 0.9 * gather && (a > 0.45 || nx > 0) && (st === 0 || c > 0.5)
    const hovered = pickable && f.pointer.inside ? pickAt(f.pointer.x, f.pointer.y, f.aspect) : -1
    if (hovered >= 0) {
      held = hovered
      heldUntil = clock + HOVER_HOLD
    } else if (held >= 0 && clock >= heldUntil) held = -1
    if (held >= 0 && hovered < 0) busy = true
    const active = pickable ? (held >= 0 ? held : selected) : -1
    if (plucking) {
      plucking = stepPluck(dt)
      busy = busy || plucking
    }

    // Each node's position chains the act poses: the ball, the identity act, the split, the stack, and the close.
    const identityGrow = ORB_GROW * focusId
    if (identity >= 0) {
      if (narrow) identityAt.set(-0.52, 0.72, 0.3)
      else identityAt.set(-0.42, 0.7, 0.35)
    }
    nodes.forEach((node, i) => {
      // The ball starts 25% wider and closes as it forms.
      const p = node.world
      p.copy(node.local).applyQuaternion(componentTurns[node.component] ?? componentTurns[0])
      const at = BALL[node.component] ?? BALL[0]
      p.x += at.at[0]
      p.y += at.at[1]
      p.z += at.at[2]
      p.multiplyScalar(1.25 - 0.25 * rise).applyQuaternion(turnBall).add(ballCentre)
      // SwiftCedar comes forward, and the rest recede 2.8 units behind it as a dim field.
      if (focusId > 0) {
        if (i === identity) p.lerp(identityAt, focusId)
        else {
          scratch.copy(node.local).applyQuaternion(componentTurns[node.component] ?? componentTurns[0])
          scratch.x += at.at[0]
          scratch.y += at.at[1]
          scratch.multiplyScalar(narrow ? 0.62 : 0.8).applyQuaternion(turnBall)
          scratch.x += identityAt.x + 0.3
          scratch.y += identityAt.y + 0.08
          scratch.z += identityAt.z - 2.8
          p.lerp(scratch, focusId)
        }
      }
      // In the split each island moves to its own side.
      if (split > 0) {
        const side = (narrow ? SPLIT_NARROW : SPLIT_WIDE)[node.component] ?? [0, 0, 0]
        scratch.copy(node.local).applyQuaternion(componentTurns[node.component] ?? componentTurns[0]).multiplyScalar(narrow ? SPLIT_SCALE_NARROW : 1).applyQuaternion(turnSplit)
        scratch.x += side[0]
        scratch.y += side[1]
        scratch.z += side[2]
        p.lerp(scratch, split)
      }
      // In the stack, students sink into the users slab and companies into the companies slab.
      if (dive > 0) p.lerp(slabOf(node.data.type === 'user' ? 'users' : 'companies').world, dive)
      // The close rebuilds the ball from the slabs.
      if (gather > 0 && dive > 0) {
        scratch.copy(node.local).applyQuaternion(componentTurns[node.component] ?? componentTurns[0])
        scratch.x += at.at[0]
        scratch.y += at.at[1]
        scratch.z += at.at[2]
        scratch.applyQuaternion(turnBall)
        p.lerp(scratch, gather)
      }
      p.add(node.offset)

      const lit = active < 0 ? 1 : i === active || node.neighbours.has(active) ? 1 : 0.18
      const nextLit = ease(node.lit, lit, dt, LIT_EASE)
      const nextGrow = ease(node.grow, i === active ? 1 : 0, dt, HOVER_EASE)
      if (nextLit !== node.lit || nextGrow !== node.grow) busy = true
      node.lit = nextLit
      node.grow = nextGrow
      const isIdentity = i === identity
      const recede = isIdentity ? 1 + identityGrow : 1 - 0.3 * focusId
      node.size = node.radius * recede * (1 + 0.3 * node.grow) * lerp(1, 0.2, dive * (1 - gather)) * (narrow ? lerp(1, SPLIT_NODE_NARROW, split * (1 - gather)) : 1)
      node.mesh.position.copy(p)
      node.mesh.scale.setScalar(node.size)
      // Each solid turns with the scroll, so its facets catch the key as the reader moves.
      node.mesh.rotation.set(node.spin.x * 0.15 + f.progress * 2.2 * node.spin.z, node.spin.y + f.progress * 3.1, 0)
      const opacity = present * (isIdentity ? 1 : 1 - 0.4 * focusId)
      node.mesh.visible = opacity > 0.01
      node.material.uniforms.uOpacity.value = opacity
      node.material.uniforms.uLight.value = flare * node.lit * (isIdentity ? 1 : 1 - 0.72 * focusId)
      node.material.uniforms.uGlow.value = 0.25 * node.grow + (isIdentity ? 0.12 * focusId * tier : 0)
      if (node.outlineMaterial) node.outlineMaterial.opacity = 0.55 * opacity * node.lit
    })

    // Links light by weight as the app's opacity does (0.16 per weight, from 0.12 to 0.5). While a node is active
    // only its own links stay lit.
    if (edgeSet && present > 0.01) {
      links.forEach((link, k) => {
        const touches = active >= 0 && (link.a === active || link.b === active)
        const goal = active < 0 ? 1 : touches ? 1.7 : 0.12
        const next = ease(link.lit, goal, dt, LIT_EASE)
        if (next !== link.lit) busy = true
        link.lit = next
        const weightLight = Math.min(0.5, Math.max(0.12, link.weight * 0.16)) * 2
        const form = smoother(ramp(a, 0.15, 0.62))
        const light = weightLight * link.lit * form * present * (1 - 0.8 * focusId) * (1 - 0.6 * dive * (1 - gather))
        const pa = nodes[link.a].world
        const pb = nodes[link.b].world
        edgeSet?.start.setXYZ(k, pa.x, pa.y, pa.z)
        edgeSet?.end.setXYZ(k, pb.x, pb.y, pb.z)
        edgeSet?.light.setX(k, light)
      })
      edgeSet.commit()
      edgeSet.uniforms.uPhase.value = f.progress * 7
      edgeSet.uniforms.uPulse.value = 0.55 * present * (1 - focusId) * (active < 0 ? 1 : 0.4)
    }
    if (edgeSet) edgeSet.mesh.visible = present > 0.01

    // A level opens the shells above it outward, outermost first.
    const orb = identity >= 0 ? nodes[identity] : null
    shells.forEach((shell, k) => {
      const next = ease(shell.open, tier > k ? 1 : 0, dt, SHELL_EASE)
      if (next !== shell.open) busy = true
      shell.open = next
      const visible = focusId > 0.01 && !!orb && shell.open < 0.995
      shell.mesh.visible = visible
      if (!orb || !visible) return
      shell.mesh.position.copy(orb.world)
      shell.mesh.scale.setScalar(orb.size * shell.radius * (0.6 + 0.4 * focusId) * (1 + 0.9 * shell.open))
      shell.mesh.rotation.set(0.4 * k + id * 1.6 + pitch, 0.7 * k - id * 2.2 * (k % 2 ? -1 : 1) + yaw, 0)
      const fade = focusId * (1 - shell.open) ** 2
      shell.material.uniforms.uOpacity.value = fade * 0.75
      shell.material.uniforms.uLight.value = flare
      shell.lineMaterial.opacity = fade * 0.5
    })

    // The pane rises under the orb. A click breaks it, and without one the scroll breaks it from 0.74 of the act.
    pane.visible = paneIn > 0.002
    const shatterNext = shatter === shatterGoal ? shatter : Math.min(1, Math.max(0, shatter + Math.sign(shatterGoal - shatter) * (dt / SHATTER_S)))
    if (shatterNext !== shatter) busy = true
    shatter = shatterNext
    const broken = Math.max(shatter, ramp(id, 0.74, 0.88))
    if (narrow) pane.position.set(0, -0.3 - 0.5 * (1 - paneIn), 0)
    else pane.position.set(0.14, -0.6 - 0.55 * (1 - paneIn), 0)
    pane.rotation.set(pitch * 0.5 - 0.1 * (1 - paneIn), yaw * 0.5 - (narrow ? 0 : 0.1), 0)
    pane.scale.setScalar((narrow ? 0.8 : 1) * (0.9 + 0.1 * paneIn))
    paneScreenMaterial.opacity = paneIn
    paneScreenMaterial.color.setScalar(0.7 + 0.3 * broken)
    paneFrameMaterial.uniforms.uOpacity.value = paneIn * 0.8
    shardUniforms.uTime.value = broken * SHATTER.app
    shardUniforms.uOpacity.value = paneIn
    crackUniforms.uCrack.value = (broken * SHATTER.app) / SHATTER.crack
    crackUniforms.uOpacity.value = paneIn
    shardMesh.visible = broken < 0.999
    paneLive = paneIn > 0.6 && screens.messages.ready
    pane.updateMatrixWorld(true)
    let overPane = false
    if (paneLive && f.pointer.inside) {
      ndc.set(f.pointer.x, f.pointer.y)
      raycaster.setFromCamera(ndc, camera)
      const [over] = raycaster.intersectObject(paneScreen, false)
      if (over?.uv) {
        overPane = true
        shardUniforms.uPointer.value.copy(over.uv)
      }
    }
    const hover = ease(paneHover, overPane && broken < 0.05 ? 1 : 0, dt, HOVER_EASE)
    if (hover !== paneHover) busy = true
    paneHover = hover
    shardUniforms.uHover.value = paneHover

    // Plates and screens rise in, the ring's tiles light in route order, and the slabs wait for the trip.
    plates.forEach((plate, k) => { plate.uniforms.uOpacity.value = stackIn * smoother(ramp(st, 0.04 + 0.04 * k, 0.26 + 0.04 * k)) })
    const tripGoal = REQUESTS[request]
    const tripClick = tripStart >= 0 ? (clock - tripStart) / TRIP_S : -1
    if (tripClick >= 1) {
      tripStart = -1
      tripHeld = true
    } else if (tripClick >= 0) busy = true
    if (st <= 0 || st >= 1) tripHeld = false
    const trip = tripStart >= 0 ? clamp01(tripClick) : tripHeld ? 1 : ramp(st, 0.32, 0.64)
    const dialGoal = -(routeSlot[tripGoal.route] / slotCount) * Math.PI * 2
    const dialNext = ease(dial, dialGoal, dt, DIAL_EASE)
    if (dialNext !== dial) busy = true
    dial = dialNext
    const tileOn = trip > 0.02 ? 1 : 0
    // The stack's buffers upload only while it shows.
    for (let r = 0; r < (stack.visible ? routeCount : 0); r++) {
      const angle = (routeSlot[r] / slotCount) * Math.PI * 2 + dial
      const shown = smoother(ramp(st, 0.1 + r * 0.004, 0.22 + r * 0.004))
      const mine = r === tripGoal.route
      const height = mine ? 0.035 + 0.05 * tileOn : 0.035
      quaternion.setFromAxisAngle(UP, angle)
      matrix.compose(scratch.set(Math.sin(angle) * RING_R, STACK.api + height / 2, Math.cos(angle) * RING_R), quaternion, toward.set(0.085 * shown, height * shown + 1e-4, 0.06 * shown))
      tiles.setMatrixAt(r, matrix)
      if (mine && tileOn) tileColour.setRGB(1.0, 0.55, 0.12)
      else tileColour.setRGB(0.18, 0.36, 1.0).multiplyScalar(0.5 + 0.14 * (routeGroup[r] % 3))
      tiles.setColorAt(r, tileColour)
    }
    if (stack.visible) {
      tiles.instanceMatrix.needsUpdate = true
      if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true
    }
    tileMaterial.opacity = stackIn
    const screenRise = smoother(ramp(st, 0.12, 0.32))
    clients.forEach((client, k) => {
      const sending = client.key === tripGoal.screen
      const arrive = sending ? ramp(trip, 0.93, 1) * (1 - ramp(trip, 1, 1)) : 0
      client.group.position.y = STACK.client + 0.04 + CLIENT_W / SCREEN_ASPECT / 2 - 0.3 * (1 - screenRise)
      client.group.rotation.set(-STACK.pitch, (k - 1) * -0.18, 0)
      client.group.visible = stackIn > 0.002 && screens[client.key].ready
      client.material.opacity = stackIn * screenRise
      client.material.color.setScalar(sending ? 1 + 0.25 * arrive : 0.62)
      client.frameMaterial.uniforms.uOpacity.value = stackIn * screenRise * 0.8
      client.frameMaterial.uniforms.uGlow.value = sending && trip > 0 ? 0.6 * stackIn : 0
      client.frameMaterial.uniforms.uColor.value.set(sending && trip > 0 ? '#f5a524' : '#24396f')
    })
    // The slabs light as the request's packets reach them and stay lit while the trip rests.
    const reach = smoother(ramp(trip, 0.4, 0.48))
    slabs.forEach((slab) => {
      const goal = tripGoal.tables.includes(slab.name) ? reach : 0
      slab.lit = goal
      // The users and companies slabs flare as the graph lands in them.
      const sinkGlow = (slab.name === 'users' || slab.name === 'companies' ? smoother(ramp(st, 0.22, 0.3)) * (1 - smoother(ramp(st, 0.3, 0.4))) : 0)
      slab.material.uniforms.uColor.value.setRGB(lerp(0.078, 1.0, slab.lit), lerp(0.2, 0.42, slab.lit), lerp(1.0, 0.03, slab.lit))
      slab.material.uniforms.uGlow.value = 0.5 * slab.lit + 0.6 * sinkGlow
      slab.material.uniforms.uOpacity.value = stackIn * smoother(ramp(st, 0.06, 0.26))
      slab.material.uniforms.uLight.value = flare
    })

    // The trip: down from the screen's foot to the route's tile, out to each table, back, and up.
    const tileAngle = (routeSlot[tripGoal.route] / slotCount) * Math.PI * 2 + dial
    tileWorld.set(Math.sin(tileAngle) * RING_R, STACK.api + 0.06, Math.cos(tileAngle) * RING_R)
    stack.localToWorld(tileWorld)
    const sender = clients[CLIENT_SCREENS.indexOf(tripGoal.screen)]
    screenFoot.set(0, -CLIENT_W / SCREEN_ASPECT / 2, 0.02)
    sender.group.localToWorld(screenFoot)
    const down = ramp(trip, 0, 0.22)
    const out = ramp(trip, 0.24, 0.44)
    const back = ramp(trip, 0.54, 0.74)
    const up = ramp(trip, 0.76, 0.96)
    const travelling = stackIn > 0.5 && trip > 0 && trip < 1
    const packetAt = (k: number, from: THREE.Vector3, to: THREE.Vector3, t: number, light: number) => {
      scratch.lerpVectors(from, to, smoother(t))
      packetPositions.setXYZ(k, scratch.x, scratch.y, scratch.z)
      packetLight.setX(k, light)
    }
    if (up > 0) packetAt(0, tileWorld, screenFoot, up, travelling && up < 1 ? 1 : 0)
    else packetAt(0, screenFoot, tileWorld, down, travelling && down > 0 && down < 1 ? 1 : 0)
    beams.start.setXYZ(0, screenFoot.x, screenFoot.y, screenFoot.z)
    beams.end.setXYZ(0, tileWorld.x, tileWorld.y, tileWorld.z)
    const trace = stackIn * (trip > 0 ? 0.35 : 0)
    beams.light.setX(0, trace + 1.2 * Math.sin(Math.PI * down) + 1.2 * Math.sin(Math.PI * up))
    for (let k = 0; k < FAN; k++) {
      const name = tripGoal.tables[k]
      const slab = name ? slabOf(name) : null
      if (!slab) {
        packetLight.setX(1 + k, 0)
        beams.light.setX(1 + k, 0)
        beams.start.setXYZ(1 + k, tileWorld.x, tileWorld.y, tileWorld.z)
        beams.end.setXYZ(1 + k, tileWorld.x, tileWorld.y, tileWorld.z)
        continue
      }
      if (back > 0) packetAt(1 + k, slab.world, tileWorld, back, travelling && back < 1 ? 1 : 0)
      else packetAt(1 + k, tileWorld, slab.world, out, travelling && out > 0 && out < 1 ? 1 : 0)
      beams.start.setXYZ(1 + k, tileWorld.x, tileWorld.y, tileWorld.z)
      beams.end.setXYZ(1 + k, slab.world.x, slab.world.y + SLAB.h, slab.world.z)
      beams.light.setX(1 + k, (trip > 0.24 ? trace : 0) + 1.1 * Math.sin(Math.PI * out) + 1.1 * Math.sin(Math.PI * back))
    }
    beams.mesh.visible = stackIn > 0.01
    packets.visible = travelling
    if (beams.mesh.visible) beams.commit()
    if (packets.visible) {
      packetPositions.needsUpdate = true
      packetLight.needsUpdate = true
    }
    ctx.renderer.getDrawingBufferSize(drawing)
    packetUniforms.uScale.value = drawing.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))

    scene.updateMatrixWorld()

    // A label names the active node alone, as the app's tooltip names the hovered node. Its neighbours light up
    // without labels, since five labels at once covered the graph they name.
    camera.getWorldDirection(forward)
    behind.copy(camera.position).sub(forward)
    for (let k = 0; k < panels.length; k++) label(k, behind, 0, 0, 0)
    nodes.forEach((node, i) => {
      const named = active >= 0 && i === active && node.lit > 0.98
      label(node.panel, node.world, node.size * 1.25 + 0.03, named ? 1 : 0, node.mesh.visible ? 1 : 0)
    })
    // The islands are named under their lowest node once the split rests and no node is active. Phones set the
    // islands side by side, too close for two wide labels, and their copy names both.
    components.slice(0, ISLANDS.length).forEach((members, k) => {
      let lowest = -1
      for (const g of members) if (lowest < 0 || nodes[g].world.y - nodes[g].size < nodes[lowest].world.y - nodes[lowest].size) lowest = g
      if (lowest < 0) return
      let x = 0
      for (const g of members) x += nodes[g].world.x / members.length
      scratch.set(x, nodes[lowest].world.y - nodes[lowest].size, nodes[lowest].world.z)
      label(panelAt.get(ISLANDS[k]) ?? -1, scratch, 0.12, !narrow && split > 0.98 && dive < 0.01 && active < 0 ? 1 : 0, split > 0.5 && dive < 0.5 ? 1 : 0)
    })
    // SwiftCedar's fields, in a column right of the orb. A field shows once the shell over it has opened.
    if (orb) {
      FIELDS.forEach((text, k) => {
        const open = k === 0 ? 1 : shells[k - 1].open
        const reachOut = orb.size * SHELLS[0] + 0.62
        scratch.set(orb.world.x + reachOut, orb.world.y + 0.27 - k * 0.19, orb.world.z)
        label(panelAt.get(text) ?? -1, scratch, 0, focusId > 0.98 && open > 0.9 ? 1 : 0, focusId > 0.5 ? 1 : 0)
      })
    }
    // The layers are named at each plate's front left, and a lit table under its slab.
    LAYERS.forEach((text, k) => {
      scratch.set(-PLATE.w / 2 + 0.42, [STACK.client, STACK.api, STACK.db][k], PLATE.d / 2)
      stack.localToWorld(scratch)
      label(panelAt.get(text) ?? -1, scratch, 0.03, stackIn > 0.98 ? 1 : 0, stackIn > 0.5 ? 1 : 0)
    })
    // Phones set the slab rows closer than a label's height, so their labels would share one row and overlap. The
    // lit slabs carry the trip there.
    slabs.forEach((slab) => {
      scratch.set(0, -SLAB.h / 2, SLAB.d / 2)
      slab.mesh.localToWorld(scratch)
      label(slab.panel, scratch, 0.02, !narrow && stackIn > 0.98 && slab.lit > 0.98 ? 1 : 0, stackIn > 0.5 ? 1 : 0)
    })

    // Anchors for the callouts.
    anchors.clear()
    if (orb && focusId > 0.5) {
      anchorPoints.orb.copy(orb.world)
      anchorPoints.orb.x -= orb.size * SHELLS[2] * 0.8
      anchors.set('orb', anchorPoints.orb)
    } else anchors.set('orb', null)
    if (paneLive && broken < 0.5) {
      anchorPoints.glass.set(-PANE_W * 0.3, -paneH * 0.1, 0.03)
      pane.localToWorld(anchorPoints.glass)
      anchors.set('glass', anchorPoints.glass)
    } else anchors.set('glass', null)
    const graphShown = split > 0.9 && dive < 0.05
    anchors.set('hub', graphShown && hub >= 0 ? anchorPoints.hub.copy(nodes[hub].world) : null)
    anchors.set('pluck', graphShown && pluckAnchor >= 0 ? anchorPoints.pluck.copy(nodes[pluckAnchor].world) : null)
    anchors.set('route', stackIn > 0.9 ? anchorPoints.route.copy(tileWorld) : null)

    // Bounds span what the scene shows, for the phone layout's copy floor.
    bounds.length = 0
    for (const node of nodes) if (node.mesh.visible) bound(node.world.x, node.world.y - node.size * (active >= 0 ? 2.6 : 1.2), node.world.z)
    if (orb && focusId > 0.01) {
      const outer = orb.size * SHELLS[0] * 0.6
      bound(orb.world.x, orb.world.y + outer, orb.world.z)
      bound(orb.world.x, orb.world.y - outer, orb.world.z)
    }
    if (pane.visible) {
      for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        scratch.set((x * PANE_W) / 2, (y * paneH) / 2, 0)
        pane.localToWorld(scratch)
        bound(scratch.x, scratch.y, scratch.z)
      }
    }
    if (stack.visible) {
      for (const y of [STACK.client + CLIENT_W / SCREEN_ASPECT + 0.05, STACK.db - 0.05]) {
        for (const z of [-PLATE.d / 2, PLATE.d / 2]) {
          scratch.set(0, y, z)
          stack.localToWorld(scratch)
          bound(scratch.x, scratch.y - (y < 0 ? 0.12 : 0), scratch.z)
        }
      }
    }

    const radius = BALL_R * (1.25 - 0.25 * rise)
    hit[0].set(ballCentre.x - radius, ballCentre.y - radius, ballCentre.z)
    hit[1].set(ballCentre.x + radius, ballCentre.y - radius, ballCentre.z)
    hit[2].set(ballCentre.x + radius, ballCentre.y + radius, ballCentre.z)
    hit[3].set(ballCentre.x - radius, ballCentre.y + radius, ballCentre.z)

    const shown = (key: ScreenKey) => screens[key].ready
    const ready = nodes.length > 0 && (!pane.visible || shown('messages')) && (!stack.visible || CLIENT_SCREENS.every(shown))
    return {
      decode: f.base.decode,
      gather: f.base.gather,
      backdrop: f.base.backdrop,
      revealAt: ballCentre,
      anchors,
      hit,
      panels,
      bounds,
      bodyLight: flare,
      busy,
      ready,
    }
  }

  const press = (point: { x: number; y: number }) => {
    ndc.set(point.x, point.y)
    raycaster.setFromCamera(ndc, camera)
    if (paneLive) {
      const [hitPane] = raycaster.intersectObject(paneScreen, false)
      if (hitPane?.uv) {
        crackUniforms.uOrigin.value.copy(hitPane.uv)
        shatterGoal = shatterGoal > 0.5 ? 0 : 1
        return true
      }
    }
    if (pickable) {
      const i = pickAt(point.x, point.y, lastAspect)
      if (i >= 0) {
        selected = selected === i ? -1 : i
        // The pluck throws the node out from its island's middle and toward the reader.
        const node = nodes[i]
        const members = components[node.component] ?? []
        scratch.set(0, 0, 0)
        for (const g of members) scratch.addScaledVector(nodes[g].world, 1 / members.length)
        toward.subVectors(node.world, scratch).setZ(0)
        if (toward.lengthSq() < 1e-6) toward.set(0, 1, 0)
        toward.normalize().multiplyScalar(PLUCK.kick * 0.7)
        toward.z = PLUCK.kick * 0.6
        node.velocity.add(toward)
        plucking = true
        return true
      }
      selected = -1
    }
    return false
  }

  const command = (name: string, value: string) => {
    if (name === 'tier') {
      const k = TIERS.indexOf(value as (typeof TIERS)[number])
      if (k >= 0) tier = k
    } else if (name === 'request' && value in REQUESTS) {
      request = value as RequestKey
      tripStart = ctx.now()
      tripHeld = false
    }
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
      edgeSet?.geometry.dispose()
      edgeSet?.material.dispose()
      beams.geometry.dispose()
      beams.material.dispose()
      tiles.dispose()
      for (const item of disposables) item.dispose()
    },
  }
  return chapter
}

export default createScene
