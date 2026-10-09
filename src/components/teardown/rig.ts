/**
 * Pure choreography for the teardown chapter. Maps chapter progress and the
 * visitor's drag and tilt to every transform the renderer and the DOM
 * callouts use. The renderer and the callouts read the same constants and
 * pose, so the GPU scene and the projected callouts always agree.
 *
 * World units: the phone is 1.51 tall. The camera never rotates: it looks
 * along +z from `camera.pos`, and `camera.shift` moves the principal point so
 * the object can sit off centre without oblique perspective. Phone-local +z
 * is the back of the phone, so the screen faces -normal, toward the camera.
 */
import type { ActKey, Anchor, ScreenKey } from '../../content/teardown/types.ts'
import { actAt, localOf, ramp, type ActWindow } from './timeline.ts'

export type Vec3 = [number, number, number]

/** Body and screen half-extents. sx / sy matches the 1320x2868 captures. */
export const PHONE = { hx: 0.36, hy: 0.755, hz: 0.045, radius: 0.11, sx: 0.335, sy: 0.728, sRadius: 0.095 } as const
/** Lens focal length in the hero's convention: ray = (uv.x, uv.y, FOCAL), uv.y in -1 to 1. */
export const FOCAL = 1.65
/** Distance encoded by the scene pass depth attachment. Anything farther reads as a miss. */
export const FAR = 24
/** Assembled layer depths along phone-local z. More negative is nearer the viewer. */
export const LAYER_Z = { glass: -0.05, screen: -0.038, code: -0.012 } as const
/** Code layer half-extents, inset from the screen. */
export const CODE = { hx: 0.31, hy: 0.68, radius: 0.04 } as const
/** Glyph scatter radius before the arrival gather, in cells. */
export const SCATTER_CELLS = 42
/** Largest drag yaw, radians (about 40 degrees). */
export const MAX_DRAG = 0.7
/**
 * Weights of the screen normal and the phone's right vector along which the
 * exploded layers fan out. On wide screens each layer steps sideways by more
 * than half its projected width, so no layer hides behind the one in front.
 */
export const EXPLODE_DIRECTION = { normal: 0.6, right: 0.8 } as const

export interface Interaction {
  /** Radians added to the phone's yaw by a drag. */
  dragYaw: number
  /** Pointer position over the stage, -1 to 1 on each axis, eased. */
  tiltX: number
  tiltY: number
}

export interface PlanePose {
  center: Vec3
  right: Vec3
  up: Vec3
  halfW: number
  halfH: number
  radius: number
  /** 0 draws the plane as glyphs from its texture, 1 draws the texture sharp. */
  develop: number
  opacity: number
  texture: ScreenKey | 'code'
}

export interface Pose {
  camera: { pos: Vec3; right: Vec3; up: Vec3; forward: Vec3; focal: number; shift: [number, number] }
  phone: { pos: Vec3; right: Vec3; up: Vec3; normal: Vec3 }
  /** 0 assembled, 1 fully apart. */
  explode: number
  /** 0 scattered glyphs, 1 assembled glyphs. */
  gather: number
  /** 0 draws the product as glyphs, 1 as the real render. */
  decode: number
  /** Chassis interior brightness, 0 to 1. */
  internals: number
  glass: { center: Vec3; light: number; sweep: number; band: number }
  screen: PlanePose
  code: PlanePose
  cards: PlanePose[]
  /** `glyphOnly` is 0 for the photo with its glyph layer and 1 for the glyph layer alone. */
  backdrop: { a: number; b: number; mix: number; gain: number; glyphOnly: number; drift: number }
  coach: { amount: number; frame: number; pos: Vec3; scale: number }
}

export interface RigInput {
  progress: number
  windows: readonly ActWindow[]
  /** Backdrop index per act, in act order. Null holds the previous room as a dim glyph-only field. */
  backdrops: readonly (number | null)[]
  narrow: boolean
  /** Canvas width over height. */
  aspect: number
  interaction: Interaction
  poseFrames: number
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const BACKDROP_GAIN = 0.62
/** Gain of the room an act without its own room holds as glyphs. */
const HELD_GAIN = 0.2

/** Orthonormal basis of a body turned by yaw about world y, then by pitch about its own x. Positive pitch leans the top away. */
export function basis(yaw: number, pitch: number): { right: Vec3; up: Vec3; normal: Vec3 } {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch)
  return { right: [cy, 0, -sy], up: [sy * sp, cp, cy * sp], normal: [sy * cp, -sp, cy * cp] }
}

function plane(center: Vec3, right: Vec3, up: Vec3, halfW: number, halfH: number, radius: number, develop: number, opacity: number, texture: PlanePose['texture']): PlanePose {
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
  return { center, right, up, halfW, halfH, radius, develop: clamp01(develop), opacity: clamp01(opacity), texture }
}

/**
 * Backdrop pair, dissolve, gain, and glyph-only amount for a progress. An act
 * without a room holds the nearest earlier room as a dim glyph-only field. Every
 * change eases over the first 35% of the act that starts it, so each room's
 * weight, the gain, and the glyph-only amount are continuous across act
 * boundaries. The indices a and b can swap at a boundary, with mix
 * compensating, so callers must not interpolate a or b directly. Index -1 means
 * no room, which happens only before the first act that has one.
 */
export function backdropAt(windows: readonly ActWindow[], backdrops: readonly (number | null)[], progress: number): { a: number; b: number; mix: number; gain: number; glyphOnly: number } {
  const { index, local } = actAt(windows, progress)
  const cur = backdrops[index] ?? null
  const prev = index > 0 ? backdrops[index - 1] ?? null : cur
  let held: number | null = null
  for (let i = index - 1; i >= 0 && held === null; i--) held = backdrops[i] ?? null
  const s = ramp(local, 0, 0.35)
  if (cur !== null && prev !== null) return { a: prev, b: cur, mix: prev === cur ? 1 : s, gain: BACKDROP_GAIN, glyphOnly: 0 }
  if (cur !== null && held !== null) return { a: held, b: cur, mix: held === cur ? 1 : s, gain: lerp(HELD_GAIN, BACKDROP_GAIN, s), glyphOnly: 1 - s }
  if (cur !== null) return { a: cur, b: cur, mix: 1, gain: BACKDROP_GAIN * s, glyphOnly: 0 }
  if (held === null) return { a: -1, b: -1, mix: 1, gain: 0, glyphOnly: 1 }
  if (prev !== null) return { a: held, b: held, mix: 1, gain: lerp(BACKDROP_GAIN, HELD_GAIN, s), glyphOnly: s }
  return { a: held, b: held, mix: 1, gain: HELD_GAIN, glyphOnly: 1 }
}

export function poseAt(input: RigInput): Pose {
  const { progress: p, windows, narrow, aspect, interaction } = input
  const L = (key: ActKey) => localOf(windows, key, p)
  const arrival = L('arrival'), hand = L('hand'), day = L('day'), quiet = L('quiet')
  const glass = L('glass'), proof = L('proof'), coach = L('coach'), close = L('close')

  // Each act's term is 0 before the act and complete after it, so the sums chain.
  const dayOut = ramp(day, 0, 0.15) * (1 - ramp(quiet, 0, 0.7))
  const explode = ramp(glass, 0.05, 0.5) * (1 - 0.85 * ramp(coach, 0, 0.35)) * (1 - ramp(close, 0, 0.5))
  const spread = narrow ? 0.75 : 1

  let yaw = 0.55 - 0.7 * ramp(arrival, 0, 0.8)
  yaw -= 0.35 * ramp(hand, 0.1, 0.9)
  yaw += 0.5 * ramp(day, 0, 0.2)
  yaw -= 1.35 * ramp(quiet, 0, 0.9)
  yaw += (narrow ? 0.95 : 0.75) * ramp(glass, 0, 0.45)
  yaw += 0.15 * ramp(glass, 0.45, 1)
  yaw += 0.2 * ramp(proof, 0, 0.7)
  yaw += (narrow ? 0.05 : 0.25) * ramp(close, 0, 0.7)
  yaw += interaction.dragYaw + interaction.tiltX * 0.07

  let pitch = 0.95 - 0.95 * ramp(arrival, 0.05, 0.85)
  pitch += 0.22 * ramp(glass, 0, 0.45)
  pitch -= 0.22 * ramp(close, 0, 0.7)
  pitch += interaction.tiltY * 0.07

  const { right, up, normal } = basis(yaw, pitch)

  // The wide day camera keeps at least 2.05 world units of half-width visible at the phone's depth. Above an aspect
  // of about 1.57 the distance floor shows more, and `reach` scales the day act's x positions to match. The centres
  // of the phone and the cards then sit at the same fractions of the frame width, within 0.02, from an aspect of
  // 0.56 to 2.4.
  const dayDist = narrow ? 2.5 : Math.max(2.15, (2.05 * FOCAL) / aspect)
  const reach = (dayDist * aspect) / FOCAL / 2.05

  let phonePos: Vec3 = [0, 0, 0]
  if (narrow) {
    phonePos = add(phonePos, [0, 0, 1.4 * ramp(day, 0, 0.12) * (1 - ramp(quiet, 0, 0.7))])
    phonePos = add(phonePos, [0, 0, 1.2 * ramp(coach, 0, 0.3) * (1 - ramp(close, 0, 0.6))])
  } else {
    // The lifted screen is nearer the camera than the chassis, so it projects farther left. At 1.2 its left edge stays
    // at least 0.04 of the width inside the frame.
    phonePos = add(phonePos, [-1.2 * reach * dayOut, 0, 0])
    phonePos = add(phonePos, [-0.55 * ramp(coach, 0, 0.3) * (1 - ramp(close, 0, 0.6)), 0, 0])
  }

  // The day act's lift stays on the normal so the screen rises straight off the phone. Only the explode follows the fan.
  const lift = 0.35 * ramp(day, 0, 0.15) * (1 - ramp(quiet, 0, 0.6))
  const toward = add(mul(normal, -EXPLODE_DIRECTION.normal), mul(right, EXPLODE_DIRECTION.right))
  const fan = mul(toward, 1 / Math.hypot(toward[0], toward[1], toward[2]))
  const layer = (z: number, lifted: number, apart: number): Vec3 => add(add(phonePos, mul(normal, z - lifted)), mul(fan, apart))
  const screenCenter = layer(LAYER_Z.screen, lift, 0.62 * explode * spread)
  const codeCenter = layer(LAYER_Z.code, 0, 0.3 * explode * spread)
  const glassCenter = layer(LAYER_Z.glass, 0, 0.95 * explode * spread)

  // The main screen re-encodes to glyphs while it swaps from welcome to home, and goes dark-glyph for the quiet act.
  const dip = ramp(day, 0, 0.06) * (1 - ramp(day, 0.1, 0.2))
  const quietDim = ramp(quiet, 0.2, 0.9) * (1 - ramp(glass, 0.1, 0.4))
  const screenDevelop = ramp(arrival, 0.45, 0.9) * (1 - dip) * (1 - quietDim)
  const proofDim = ramp(proof, 0, 0.4) * (1 - ramp(coach, 0, 0.3))
  const screen = plane(screenCenter, right, up, PHONE.sx, PHONE.sy, PHONE.sRadius, screenDevelop, ramp(arrival, 0.25, 0.6) * (1 - 0.65 * proofDim), day >= 0.08 ? 'home' : 'welcome')
  const code = plane(codeCenter, right, up, CODE.hx, CODE.hy, CODE.radius, 1, ramp(glass, 0.15, 0.5) * (1 - ramp(coach, 0, 0.35)), 'code')

  const cardKeys: ScreenKey[] = ['home', 'manage', 'recovery', 'community']
  const cards = cardKeys.map((key, i) => {
    if (narrow) {
      const s = 0.1 + i * 0.22
      const wnd = Math.min(1, Math.max(0, (day - s) / 0.26))
      const x = wnd < 0.4 ? lerp(1.6, 0, ramp(wnd, 0, 0.4)) : lerp(0, -1.6, ramp(wnd, 0.6, 1))
      const develop = ramp(wnd, 0.25, 0.42) * (1 - ramp(wnd, 0.62, 0.8))
      const opacity = ramp(wnd, 0, 0.1) * (1 - ramp(wnd, 0.9, 1)) * (1 - ramp(quiet, 0, 0.2))
      return plane([x, 0, -0.3], [1, 0, 0], [0, 1, 0], PHONE.sx, PHONE.sy, PHONE.sRadius, develop, opacity, key)
    }
    const s = 0.12 + i * 0.17
    const out = ramp(day, s, s + 0.28) * (1 - ramp(quiet, 0, 0.6))
    const slot: Vec3 = [(-0.46 + i * 0.73) * reach, 0, 0.1 * Math.abs(i - 1.5)]
    const b = basis(-0.12 * (i - 1.5), 0)
    const develop = ramp(day, s + 0.18, s + 0.32) * (1 - ramp(quiet, 0, 0.6))
    const opacity = ramp(day, s, s + 0.06) * (1 - ramp(quiet, 0.45, 0.65))
    return plane(lerp3(screenCenter, slot, out), b.right, b.up, PHONE.sx, PHONE.sy, PHONE.sRadius, develop, opacity, key)
  })

  let dist = narrow ? 2.6 : 2.05
  dist = lerp(dist, narrow ? 2.25 : 1.7, ramp(arrival, 0, 1))
  dist = lerp(dist, narrow ? 2.15 : 1.62, ramp(hand, 0, 0.8))
  dist = lerp(dist, dayDist, ramp(day, 0, 0.15))
  dist = lerp(dist, narrow ? 2.3 : 1.75, ramp(quiet, 0, 0.8))
  // At 2.25 the fanned stack crosses the right edge below an aspect of about 1.33, which includes tablets in portrait.
  // The wide glass distance grows as 3.1 / aspect below 1.38, which holds the glass's right edge under 0.99 of the width.
  dist = lerp(dist, narrow ? 2.9 : Math.max(2.25, 3.1 / aspect), ramp(glass, 0, 0.45))
  dist = lerp(dist, narrow ? 1.9 : 1.45, ramp(proof, 0, 0.6))
  dist = lerp(dist, narrow ? 2.6 : 2.2, ramp(coach, 0, 0.4))
  dist = lerp(dist, narrow ? 2.25 : 1.7, ramp(close, 0, 0.7))

  const proofFocus = ramp(proof, 0, 0.6) * (1 - ramp(coach, 0, 0.4))
  const target = lerp3([0, 0, 0], codeCenter, proofFocus)
  // The exploded stack fans toward the phone's right, so both shifts ease left during the glass act. Wide keeps
  // the stack near its callouts, and narrow centres the stack so every layer stays in frame.
  const stackOut = ramp(glass, 0, 0.45) * (1 - ramp(proof, 0, 0.6))
  const wideShift = (0.27 - 0.07 * stackOut) * aspect * (1 - dayOut)
  const shift: [number, number] = narrow ? [-0.22 * stackOut, 0.26] : [wideShift, 0]

  const bd = backdropAt(windows, input.backdrops, p)
  const coachAmount = ramp(coach, 0, 0.25) * (1 - ramp(close, 0, 0.3))
  const decode = ramp(arrival, 0.25, 0.8) * (1 - ramp(close, 0.6, 1))

  return {
    camera: { pos: [target[0], target[1], target[2] - dist], right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, 1], focal: FOCAL, shift },
    phone: { pos: phonePos, right, up, normal },
    explode,
    gather: ramp(arrival, 0, 0.6),
    decode,
    internals: explode,
    glass: { center: glassCenter, light: (0.35 + 0.65 * explode) * (1 - 0.6 * proofDim) * ramp(arrival, 0.3, 0.6), sweep: lerp(-1.4, 1.4, ramp(glass, 0.1, 0.9)), band: explode },
    screen,
    code,
    cards,
    backdrop: { ...bd, gain: bd.gain * ramp(arrival, 0, 0.5), drift: p },
    coach: { amount: coachAmount, frame: coach * input.poseFrames, pos: narrow ? [0, -0.15, -0.2] : [0.75, -0.12, 0.1], scale: narrow ? 1.0 : 1.25 },
  }
}

/** Projects a world point to viewport fractions (x from the left, y from the top). Null when the point is behind the camera. */
export function projectPoint(pose: Pose, point: Vec3, aspect: number): { x: number; y: number; depth: number } | null {
  const c = pose.camera
  const d: Vec3 = [point[0] - c.pos[0], point[1] - c.pos[1], point[2] - c.pos[2]]
  const depth = dot(d, c.forward)
  if (depth < 0.05) return null
  const uvX = (c.focal * dot(d, c.right)) / depth + c.shift[0]
  const uvY = (c.focal * dot(d, c.up)) / depth + c.shift[1]
  return { x: (uvX / aspect + 1) / 2, y: (1 - uvY) / 2, depth }
}

/** World position of a callout anchor on its surface. */
export function anchorWorld(pose: Pose, anchor: Anchor): Vec3 {
  const { phone } = pose
  const on = (center: Vec3, r: Vec3, u: Vec3, halfW: number, halfH: number) => add(center, add(mul(r, anchor.u * halfW), mul(u, anchor.v * halfH)))
  switch (anchor.plane) {
    case 'screen': return on(pose.screen.center, pose.screen.right, pose.screen.up, pose.screen.halfW, pose.screen.halfH)
    case 'code': return on(pose.code.center, pose.code.right, pose.code.up, pose.code.halfW, pose.code.halfH)
    case 'glass': return on(pose.glass.center, phone.right, phone.up, PHONE.sx, PHONE.sy)
    case 'chassis': return on(phone.pos, phone.right, phone.up, PHONE.hx, PHONE.hy)
    case 'coach': return add(pose.coach.pos, [anchor.u * 0.5 * pose.coach.scale, anchor.v * 0.6 * pose.coach.scale, 0])
  }
}

/** World positions of skeleton joints given body-centred 2D joints with y up. */
export function coachWorld(pose: Pose, joints: readonly [number, number][]): Vec3[] {
  const { pos, scale } = pose.coach
  return joints.map(([x, y]) => [pos[0] + x * scale, pos[1] + y * scale, pos[2]])
}
