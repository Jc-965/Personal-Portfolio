/**
 * Pure choreography for the teardown chapter. Maps chapter progress and the
 * visitor's drag and tilt to every transform the renderer and the DOM
 * callouts use. The renderer and the callouts read the same constants and
 * pose, so the GPU scene and the projected callouts always agree.
 *
 * Motion is continuous and every act rests on its finished state. An act's
 * incoming transition ramps across its first half (RAMP_END) and its reveal
 * is complete by about 65% of the act (REVEAL_END). The glass act's stack is
 * apart by 40% (EXPLODE_END), so it holds while its callouts read, and the
 * day act's row lands at 76%, since its four cards each take a spotlight in
 * turn (CARD_END). After that only
 * the drifts, the station step, and the surge move the pose until the next
 * act's transition takes over at the boundary. Nothing reads the clock: one
 * progress always yields one pose, which the glide in glide.ts relies on.
 *
 * World units: the phone is 1.51 tall. The camera never rotates: it looks
 * along +z from `camera.pos`, and `camera.shift` moves the principal point so
 * the object can sit off centre without oblique perspective. Phone-local +z
 * is the back of the phone, so the screen faces -normal, toward the camera.
 */
import type { ActKey, Anchor, ScreenKey } from '../../content/teardown/types.ts'
import { actAt, dwell, localOf, ramp, type ActWindow } from './timeline.ts'

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
/**
 * Glyph scatter radius before the arrival gather and after the close scatter,
 * in cells. At 70 cells (about 315 CSS px on a wide screen) the plume stays
 * around the phone and clear of the copy rail's chips at the close.
 */
export const SCATTER_CELLS = 70
/** Largest drag yaw, radians (about 40 degrees). */
export const MAX_DRAG = 0.7
/**
 * Weights of the screen normal and the phone's right vector along which the
 * exploded layers fan out. On wide screens each layer steps sideways by more
 * than half its projected width, so no layer hides behind the one in front.
 */
export const EXPLODE_DIRECTION = { normal: 0.6, right: 0.8 } as const
/**
 * Screen the main plane shows in each act. The hand act shows the symptom
 * form, which its accessibility callouts describe, and the day and quiet acts
 * keep it, since the first day card is Home and the phone must not show the
 * card it deals or fold the row into a matching screen. Home swaps in over the
 * glass act's first SWAP_SPAN, while the phone is still edge-on. The proof act
 * hides its screen from half the act and, once the hidden screen has dipped to
 * glyphs, gives it the coach capture, so the phone boots into Motion coach as
 * the stack closes and the coach act opens on it without a second dip. The
 * close act shows the routine summary that follows a coach session. The DOM
 * stage and the
 * reduced-motion layout read this table too, except that their day and quiet
 * acts, which have no cards, show the first card's screen (Teardown.tsx). The
 * canvas waits for every screen the story lists before it switches to GL, so
 * each listed screen must appear here or among the day cards.
 */
export const ACT_SCREEN: Record<ActKey, ScreenKey> = { arrival: 'welcome', hand: 'log', day: 'log', quiet: 'log', glass: 'home', proof: 'home', coach: 'coach', close: 'results' }
/**
 * Fraction of an act over which a screen swap re-encodes the main plane, and
 * the develop the dip reaches at its midpoint, where the texture changes. The
 * dip is 0 at the act boundary, so the develop stays continuous into the act.
 * The screen shader resolves cells in a scan, each over a quarter of the
 * develop, so at a floor of 0.2 the first cells are already 90% sharp and the
 * top left corner cuts hard between captures. At 0.05 no cell is more than
 * about 10% resolved when the texture changes.
 */
const SWAP_SPAN = 0.12
const SWAP_FLOOR = 0.05

/**
 * Fraction of an act over which its incoming transition (the phone's turn,
 * its station, and the dolly) ramps. The act holds the finished pose from
 * here on, so the visitor rests on it before the next act's transition starts
 * at the boundary.
 */
const RAMP_END = 0.5
/**
 * Fraction of an act by which its reveal (the product's formation, the day
 * row, the exploded stack) is complete. Later than RAMP_END, so the camera
 * has framed the act before the reveal finishes.
 */
const REVEAL_END = 0.65
/**
 * Glass act local by which the exploded stack is fully apart, about 1.7
 * viewport-heights into the act's 4.3. The revealed stack then holds for the
 * remaining 2.6 while its callouts read. Teardown.tsx draws a glass leader
 * only as explode passes 0.5 to 0.8, so no leader lands on layers that are
 * still stacked together.
 */
const EXPLODE_END = 0.4
/**
 * Chapter-long drifts, world units and radians. The phone sinks from +travelY
 * to -travelY over the chapter, and three sines of unrelated frequency keep
 * the yaw, the phone, and the camera moving through every held pose. Each
 * cycles value is the count of full waves over the chapter.
 */
const DRIFT = { travelY: 0.4, yaw: 0.05, yawCycles: 2.3, phoneY: 0.025, phoneCycles: 3.1, cameraY: 0.02, cameraCycles: 1.7 } as const
/**
 * The phone's station step per act, world units. Each act lifts the phone by
 * one step on the copy's dwell curve, so the phone glides to its next station
 * while the copy rides out, and the eight steps are centred on zero over the
 * chapter. With DRIFT.travelY the net drop over the chapter is
 * 2 * travelY - 8 * STATION_STEP, which must stay between 0.08 and 0.2.
 */
const STATION_STEP = 0.08
/**
 * How far a full surge (the scroll's eased speed at its soft limit) moves
 * the product: the top of the phone tips away by `pitch` radians, the phone
 * sinks by `y` world units, and the camera backs off by `dist`. The surge is
 * 0 at rest, so none of it survives once the scroll settles.
 */
const SURGE = { pitch: 0.06, y: 0.05, dist: 0.1 } as const
const TAU = 2 * Math.PI

/**
 * The wide day act's row: the phone, then the four cards at `scale`, with
 * `gap` between neighbours. The outer cards turn in by `arcYaw` radians per
 * step from the middle and stand `arcZ` farther back per step, which is the
 * slight arc. The row sits `centre` right of x = 0, which balances the nearer
 * phone against the foreshortened far cards so the projected margins match.
 * Offsets are world units before `reach`.
 */
const DAY_ROW = (() => {
  const scale = 0.95
  const gap = 0.16
  const centre = 0.05
  const cardHalf = PHONE.sx * scale
  const pitch = 2 * cardHalf + gap
  const half = (2 * PHONE.hx + gap + 4 * 2 * cardHalf + 3 * gap) / 2
  const phoneX = centre - half + PHONE.hx
  const cardX = phoneX + PHONE.hx + gap + cardHalf
  return { scale, pitch, half, phoneX, cardX, arcYaw: 0.12, arcZ: 0.05, lead: 0.02 } as const
})()
/**
 * Half-width the day camera keeps visible at the phone's depth, world units.
 * It is the row's half-width over 0.84, so the row keeps an 8% margin each
 * side at the aspect where the distance floor stops holding, and about 5%
 * once the camera has pushed in to DAY_PUSH of that distance.
 */
const DAY_VIEW = DAY_ROW.half / 0.84
/** The day camera's distance once the row is complete, as a fraction of the distance that frames DAY_VIEW. */
const DAY_PUSH = 0.93
/**
 * Card i of the wide day act has its moment over a window of CARD_WINDOW of
 * the act that opens at CARD_START + i * CARD_STEP. Within the window the
 * card peels off the phone to the spotlight by SPOT.in, holds there until
 * SPOT.out, and settles into its row slot by 1. The windows overlap by half,
 * so card i + 1 peels off the phone while card i is still held and reaches
 * the spotlight after card i has left it. The last card lands at CARD_END,
 * 0.76 of the act, and the finished row then rests for the act's last 0.24,
 * about 1.0 viewport-heights of the day act's 4.2. A hold lasts 0.3 of a
 * window, about 0.35 viewport-heights.
 */
const CARD_START = 0.06
const CARD_STEP = 0.14
const CARD_WINDOW = 0.28
const CARD_END = CARD_START + 3 * CARD_STEP + CARD_WINDOW
/**
 * The spotlight: a held card faces the camera at full scale with its centre at
 * `x` of the frame width and its height spanning `height` of the frame's, at
 * every aspect. It is fixed to the camera, so neither the day dolly nor the
 * lens shift moves or resizes a held card. At x 0.72 a held card covers card
 * 2's slot and the empty right end of the row, and from an aspect of 1.33 up
 * it clears the label of card 1 in its slot, which labels.ts would otherwise
 * hide. `in` and `out` are the fractions of a card's window at which it
 * reaches and leaves the spotlight.
 */
const SPOT = { x: 0.72, height: 0.66, in: 0.3, out: 0.6 } as const
/** Camera depth of a held card, world units: the depth at which the screen's full height spans SPOT.height of the frame. */
const SPOT_DEPTH = (FOCAL * PHONE.sy) / SPOT.height
/**
 * Day act local by which the phone has reached its station facing the camera
 * and the camera has dollied out. It is the moment card 0 reaches the
 * spotlight, so through every hold the phone moves only with the drifts and
 * the camera only with the slow push-in to DAY_PUSH, which runs to CARD_END.
 */
const DAY_FORM = CARD_START + SPOT.in * CARD_WINDOW
/**
 * The narrow deck. Card i's window opens at DECK.start + i * DECK.step of the
 * day act and lasts DECK.window. Within it the card is centred from hold[0]
 * and starts to leave at hold[1], so it rests at the centre for 40% of its
 * window (about 0.5 viewport-heights), fully developed. It fades only over the
 * first and last `fade` of its window, while it is still clear of the receded
 * phone at the frame's edge, so it is opaque wherever it crosses the phone and
 * two screens never print through each other. The step is past 0.7 of the
 * window, so when the incoming card is halfway in (x 0.5) the outgoing one is
 * past x -0.49, and the two never overlap. `z` is the cards' depth, nearer the
 * camera than the receded phone, and `drop` lowers them below the phone's
 * line. At z -0.6 a held card spans about 59% to 70% of the frame height on a
 * 390 by 844 phone as the day camera pushes in, and the drop keeps its top
 * edge at least 3% of the height below the frame's, clear of the menu pill.
 */
const DECK = { start: 0.04, step: 0.22, window: 0.3, hold: [0.3, 0.7], fade: 0.12, z: -0.6, drop: 0.15 } as const
/** Room gain in an act with a room, and the gain an act without one holds the previous room at. */
const BACKDROP_GAIN = 0.9
const HELD_GAIN = 0.3
/**
 * Chapter progress over which a room change eases in from the start of the
 * act that makes it, capped at 70% of that act. At 0.035, about 0.6
 * viewport-heights of 17.3, the swap ends at 0.144 of the day act (card 0's
 * hold), 0.30 of the close, 0.47 of the hand and coach acts, and 0.55 of the
 * quiet act, so each act holds its whole room for most of its span.
 */
const ROOM_SWAP = 0.035
/**
 * Act-local spans over which the room prints in from the page at the start
 * of the arrival and dissolves back into it in the close, so the stage pins
 * and unpins with nothing drawn but the copy. The composite prints and
 * dissolves the room cell by cell around the product, so both bracket the
 * product's own glyph phases: the phone forms from glyphs by 0.62 of the
 * arrival and the room has printed by 0.63. In the close the room holds with
 * the posed phone and the settled copy until 0.74, starts to dissolve just
 * before the phone does (0.78), and is gone at 0.93 with the phone's scatter,
 * which stops short of the unpin to cover the glide's lag (END_GLIDE_TIME in
 * TeardownCanvas.tsx). They are fractions of the acts, so a span change cannot
 * move them off the product's phases.
 */
const ROOM_REVEAL = { inEnd: 0.63, out: [0.74, 0.93] } as const
/**
 * Bounds, in chapter progress, on the span over which a room pans its full
 * distance. A room that is on screen for less than the minimum (about 4.3
 * viewport-heights) pans only part of the way, so a short act never races,
 * and a room held for longer than the maximum (about 6.9 viewport-heights)
 * finishes its pan and rests, since by then it is a dim field behind the
 * exploded stack.
 */
const ROOM_PAN_SPAN: [number, number] = [0.25, 0.4]

export interface Interaction {
  /** Radians added to the phone's yaw by a drag. */
  dragYaw: number
  /** Pointer position over the stage, -1 to 1 on each axis, eased. */
  tiltX: number
  tiltY: number
  /** The scroll's eased speed, -1 to 1, positive scrolling down. Absent or 0 at rest. */
  surge?: number
}

/**
 * A textured plane. `right` and `up` are orthogonal and share one length,
 * the plane's scale, so a world point on it is center + right * u * halfW +
 * up * v * halfH for u and v in -1 to 1. The product renderer builds the
 * mesh matrix from them directly, which is how the day cards draw smaller.
 */
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
  /**
   * `gain` is 1 at full room brightness. `glyphOnly` is 1 where the room is held as a glyph-only field, with the
   * photograph under the glyphs faded out. `reveal` is 0 while no room is drawn at the chapter's edges and 1 once
   * the room has printed in. `driftA` and `driftB` are each room's own pan progress from `roomDrift`.
   */
  backdrop: { a: number; b: number; mix: number; gain: number; glyphOnly: number; reveal: number; driftA: number; driftB: number }
  coach: { amount: number; frame: number; pos: Vec3; scale: number }
}

export interface RigInput {
  progress: number
  windows: readonly ActWindow[]
  /** Backdrop index per act, in act order. Null holds the previous room as a dim glyph field. */
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
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Orthonormal basis of a body turned by yaw about world y, then by pitch about its own x. Positive pitch leans the top away. */
export function basis(yaw: number, pitch: number): { right: Vec3; up: Vec3; normal: Vec3 } {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch)
  return { right: [cy, 0, -sy], up: [sy * sp, cp, cy * sp], normal: [sy * cp, -sp, cy * cp] }
}

function plane(center: Vec3, right: Vec3, up: Vec3, halfW: number, halfH: number, radius: number, develop: number, opacity: number, texture: PlanePose['texture']): PlanePose {
  return { center, right, up, halfW, halfH, radius, develop: clamp01(develop), opacity: clamp01(opacity), texture }
}

/** World point on a plane at (u, v), each -1 to 1 across the plane's extents. v below -1 is past the bottom edge. */
export function planePoint(plane: PlanePose, u: number, v: number): Vec3 {
  return add(plane.center, add(mul(plane.right, u * plane.halfW), mul(plane.up, v * plane.halfH)))
}

/**
 * Backdrop pair, dissolve, gain, and glyph-only amount for a progress. An act
 * without a room holds the nearest earlier room at HELD_GAIN. Every change
 * eases over ROOM_SWAP of progress from the start of the act that makes it,
 * or 70% of an act shorter than that allows, so each room's weight and the
 * gain are continuous across act boundaries. The indices a and b can
 * swap at a boundary, with mix compensating, so callers must not interpolate
 * a or b directly. Index -1 means no room, which happens only before the
 * first act that has one.
 */
export function backdropAt(windows: readonly ActWindow[], backdrops: readonly (number | null)[], progress: number): { a: number; b: number; mix: number; gain: number; glyphOnly: number } {
  const { index, local } = actAt(windows, progress)
  const cur = backdrops[index] ?? null
  const prev = index > 0 ? backdrops[index - 1] ?? null : cur
  let held: number | null = null
  for (let i = index - 1; i >= 0 && held === null; i--) held = backdrops[i] ?? null
  const win = windows[index]
  const s = ramp(local, 0, Math.min(0.7, ROOM_SWAP / Math.max(1e-9, win.end - win.start)))
  if (cur !== null && prev !== null) return { a: prev, b: cur, mix: prev === cur ? 1 : s, gain: BACKDROP_GAIN, glyphOnly: 0 }
  if (cur !== null && held !== null) return { a: held, b: cur, mix: held === cur ? 1 : s, gain: lerp(HELD_GAIN, BACKDROP_GAIN, s), glyphOnly: 1 - s }
  if (cur !== null) return { a: cur, b: cur, mix: 1, gain: BACKDROP_GAIN * s, glyphOnly: 0 }
  if (held === null) return { a: -1, b: -1, mix: 1, gain: 0, glyphOnly: 1 }
  if (prev !== null) return { a: held, b: held, mix: 1, gain: lerp(BACKDROP_GAIN, HELD_GAIN, s), glyphOnly: s }
  return { a: held, b: held, mix: 1, gain: HELD_GAIN, glyphOnly: 1 }
}

/**
 * A room's pan progress at `progress`: 0 when the first act that shows it
 * begins and 1 once the room has been on screen for a span within
 * ROOM_PAN_SPAN. The room is on screen from that first act until the end of
 * the act after the last one that shows or holds it, which is when its
 * dissolve out completes. Linear in progress, so the pan rate is steady, and
 * a function of progress alone, so it is continuous whichever slot (a or b)
 * the room sits in. Rooms that never appear return 0.
 */
export function roomDrift(windows: readonly ActWindow[], backdrops: readonly (number | null)[], room: number, progress: number): number {
  let first = -1
  let last = -1
  let held: number | null = null
  backdrops.forEach((room0, i) => {
    held = room0 ?? held
    if (held !== room) return
    if (first < 0) first = i
    last = i
  })
  if (first < 0 || !windows[first]) return 0
  const start = windows[first].start
  const end = windows[Math.min(last + 1, windows.length - 1)].end
  const span = Math.min(ROOM_PAN_SPAN[1], Math.max(ROOM_PAN_SPAN[0], end - start))
  return clamp01((progress - start) / span)
}

export function poseAt(input: RigInput): Pose {
  const { progress: p, windows, narrow, aspect, interaction } = input
  const L = (key: ActKey) => localOf(windows, key, p)
  const arrival = L('arrival'), hand = L('hand'), day = L('day'), quiet = L('quiet')
  const glass = L('glass'), proof = L('proof'), coach = L('coach'), close = L('close')
  /** An act's transition: 0 at its start, 1 from `end` of the act on. */
  const rise = (local: number, end = RAMP_END) => ramp(local, 0, end)

  // Each act's term is 0 before the act and complete after it, so the sums chain. The phone reaches the day row's
  // station by DAY_FORM, as card 0 reaches the spotlight, and the quiet act folds the row away. The stack closes
  // and the glass seats on the screen over the last 20% of the proof act, after the readout has rested, so the
  // coach act opens on a whole phone. Its copy is fully opaque from 0.085 of the act, and no layer offset may
  // remain by then. The code layer fades out over the first 8% of that close (codeOut) and only then do the
  // screen and the glass light return (relit), so a screen and the code never print over each other. The screen
  // returns opaque, as glyphs on its dark base, and resolves into the coach capture while the stack seats (boot).
  const dayOut = rise(day, DAY_FORM) * (1 - rise(quiet, REVEAL_END))
  const seated = ramp(proof, 0.8, 1)
  const codeOut = ramp(proof, 0.8, 0.88)
  const relit = ramp(proof, 0.88, 0.9)
  const boot = ramp(proof, 0.9, 1)
  const explode = rise(glass, EXPLODE_END) * (1 - seated)
  const proofDim = rise(proof) * (1 - relit)
  const spread = narrow ? 0.75 : 1
  const surge = interaction.surge ?? 0

  // The arrival's turn runs with the product's formation (REVEAL_END). The day's turn runs with the phone's move
  // to its station and ends at DAY_FORM, so card 0 peels off a phone that is still turning and the phone faces
  // the camera from card 0's hold on.
  let yaw = 0.55 - 0.7 * rise(arrival, REVEAL_END)
  yaw -= 0.35 * rise(hand)
  yaw += 0.5 * rise(day, DAY_FORM)
  yaw -= 1.4 * rise(quiet, REVEAL_END)
  yaw += (narrow ? 1.1 : 0.9) * rise(glass)
  yaw += 0.4 * rise(proof)
  yaw += (narrow ? 0.05 : 0.1) * rise(coach)
  yaw += (narrow ? 0.05 : 0.2) * rise(close)
  yaw += DRIFT.yaw * Math.sin(p * TAU * DRIFT.yawCycles)
  yaw += interaction.dragYaw + interaction.tiltX * 0.07

  let pitch = 0.95 - 0.95 * rise(arrival, REVEAL_END)
  pitch -= 0.08 * rise(hand)
  pitch += 0.08 * rise(day, DAY_FORM)
  pitch += 0.22 * rise(glass)
  // The proof act turns the stack about 23 degrees and nods it most of the way back to upright as the camera
  // closes in, so the stack keeps moving while the readout types. At the glass pitch the near bottom edge
  // projects far larger than the far top edge, which puts the chassis low in the close-up frame.
  pitch -= 0.2 * rise(proof)
  pitch -= 0.1 * rise(close)
  pitch += interaction.tiltY * 0.07
  // Scrolling down tips the top of the phone away, as if the page's motion pushed it, and it eases back at rest.
  pitch += SURGE.pitch * surge

  const { right, up, normal } = basis(yaw, pitch)

  // The wide day camera keeps at least DAY_VIEW world units of half-width visible at the phone's depth. Above the
  // aspect where the distance floor shows more, `reach` scales the row's x positions to match, so the centres of
  // the phone and the cards sit at the same fractions of the frame width at every wide aspect.
  const dayDist = narrow ? 2.5 : Math.max(2.2, (DAY_VIEW * FOCAL) / aspect)
  const reach = (dayDist * aspect) / FOCAL / DAY_VIEW

  // The phone sinks through the chapter against the scroll and steps up one station per act on the copy's dwell
  // curve, with a wave on top. The station term is cumulative over the acts, so it is continuous at every
  // boundary. The row's y keeps the sink and the station and gives each card its own phase of the wave.
  const { index: actIndex, local: actLocal } = actAt(windows, p)
  // The surge sink is halved on phones, where the copy sits under the product at a fixed gap that the still pose sets.
  const sinkY = DRIFT.travelY * (1 - 2 * p) + STATION_STEP * (actIndex + dwell(actLocal) - windows.length / 2) - SURGE.y * surge * (narrow ? 0.5 : 1)
  const wave = (phase: number) => DRIFT.phoneY * Math.sin(p * TAU * DRIFT.phoneCycles + phase)
  let phonePos: Vec3 = [0, sinkY + wave(0), 0]
  if (narrow) {
    // The narrow day phone recedes behind the deck and returns through the quiet act.
    phonePos = add(phonePos, [0, 0, 1.4 * rise(day, 0.6) * (1 - rise(quiet, REVEAL_END))])
    // The coach phone recedes down and to the left, so the figure stands to its right clear of the screen.
    const aside = rise(coach) * (1 - rise(close))
    phonePos = add(phonePos, [-0.55 * aside, -0.1 * aside, 1.6 * aside])
  } else {
    phonePos = add(phonePos, [DAY_ROW.phoneX * reach * dayOut, 0, 0])
    phonePos = add(phonePos, [-0.55 * rise(coach) * (1 - rise(close)), 0, 0])
  }

  const toward = add(mul(normal, -EXPLODE_DIRECTION.normal), mul(right, EXPLODE_DIRECTION.right))
  const fan = mul(toward, 1 / Math.hypot(toward[0], toward[1], toward[2]))
  const layer = (z: number, apart: number): Vec3 => add(add(phonePos, mul(normal, z)), mul(fan, apart))
  const screenCenter = layer(LAYER_Z.screen, 0.62 * explode * spread)
  const codeCenter = layer(LAYER_Z.code, 0.3 * explode * spread)
  const glassCenter = layer(LAYER_Z.glass, 0.95 * explode * spread)

  // The quiet act takes the main screen's develop down to about two thirds, at full opacity, while the phone
  // turns to 80 degrees.
  const quietDim = rise(quiet, REVEAL_END) * (1 - ramp(glass, 0, 0.6))
  // An act whose screen differs from the one the act before ended on re-encodes the main plane over its first
  // SWAP_SPAN: the develop dips to SWAP_FLOOR at the midpoint and the texture swaps there, under the glyphs, so it
  // never pops. The proof act ends on the coach capture, so the coach act enters on its own screen and never dips.
  const actKey = windows[actIndex].key
  const prevKey = actIndex > 0 ? windows[actIndex - 1].key : actKey
  const entered = prevKey === 'proof' ? ACT_SCREEN.coach : ACT_SCREEN[prevKey]
  const swapping = ACT_SCREEN[actKey] !== entered
  const swapDip = swapping ? ramp(actLocal, 0, SWAP_SPAN / 2) * (1 - ramp(actLocal, SWAP_SPAN / 2, SWAP_SPAN)) : 0
  // The proof screen is hidden from 0.5 (proofDim). Its develop dips to SWAP_FLOOR from 0.5 to 0.6, where it takes
  // the coach capture, and it stays glyphs until it is opaque again at 0.9, then resolves as the stack seats.
  const bootsCoach = actKey === 'proof' && actLocal >= 0.6
  const screenKey = bootsCoach ? ACT_SCREEN.coach : swapping && actLocal < SWAP_SPAN / 2 ? entered : ACT_SCREEN[actKey]
  const proofBoot = 1 - (1 - SWAP_FLOOR) * ramp(proof, 0.5, 0.6) * (1 - boot)
  const screenDevelop = ramp(arrival, 0.3, REVEAL_END) * (1 - 0.35 * quietDim) * (1 - (1 - SWAP_FLOOR) * swapDip) * proofBoot
  // Proof hides the screen in front of the code layer, since the composite blends in linear light and even 5% of
  // the Home capture's white text prints legibly over the code. The narrow day phone's screen goes dark behind
  // the deck for the same reason: it fades out while card 0 crosses onto it and is gone by card 0's hold, so the
  // phone is a dark body wherever the gap between two moving cards shows it, and it lights up again as the phone
  // returns through the quiet act.
  const deckDark = narrow ? ramp(day, DECK.start, DECK.start + DECK.hold[0] * DECK.window) * (1 - rise(quiet, REVEAL_END)) : 0
  const screenOpacity = ramp(arrival, 0.15, 0.45) * (1 - proofDim) * (1 - deckDark)
  const screen = plane(screenCenter, right, up, PHONE.sx, PHONE.sy, PHONE.sRadius, screenDevelop, screenOpacity, screenKey)
  const code = plane(codeCenter, right, up, CODE.hx, CODE.hy, CODE.radius, 1, ramp(glass, 0.1, EXPLODE_END) * (1 - codeOut), 'code')

  // The dolly is a chain of wide lerps, each act's easing out of the one before, so the distance never steps. The
  // day act dollies out 5% past its distance while the phone moves to its station and pushes in to DAY_PUSH of it
  // while the cards have their moments, then holds with the finished row. The row keeps about a 6% margin each
  // side at 1.33 and 1.6.
  let dist = narrow ? 2.6 : 2.05
  dist = lerp(dist, narrow ? 2.25 : 1.82, rise(arrival, REVEAL_END))
  // At 2.3 the narrow hand phone's top bezel clears the frame's top edge.
  dist = lerp(dist, narrow ? 2.3 : 1.68, rise(hand))
  dist = lerp(dist, dayDist * 1.05, rise(day, DAY_FORM))
  dist = lerp(dist, dayDist * DAY_PUSH, ramp(day, DAY_FORM, CARD_END))
  // The quiet phone turns edge-on, which brings its near edge 0.35 closer than its centre, so it needs more room.
  dist = lerp(dist, narrow ? 2.3 : 1.85, rise(quiet, REVEAL_END))
  // At 2.25 the fanned stack crosses the right edge below an aspect of about 1.33, which includes tablets in portrait.
  // The wide glass distance grows as 3.1 / aspect below 1.38, which holds the glass's right edge under 0.99 of the width.
  dist = lerp(dist, narrow ? 3.0 : Math.max(2.25, 3.1 / aspect), rise(glass))
  // The wide proof distance grows as 2.1 / aspect below 1.35, which keeps the chassis right of the copy rail's
  // clearance at 0.44, and the floor of 1.55 puts the code layer at about 0.72 of the frame height from 1.35 up,
  // so its text is legible, while the nearer screen's corners stay inside the frame's top and bottom 2%. The
  // fanned glass crosses the right edge at this distance, dimmed. The narrow distance of 2.25 keeps the exploded
  // stack's top under the menu pill with the lens shift below.
  dist = lerp(dist, narrow ? 2.25 : Math.max(1.55, 2.1 / aspect), rise(proof))
  dist = lerp(dist, narrow ? 2.6 : 2.2, rise(coach))
  // The narrow close backs off to 2.45, which raises the phone's floor and lifts the link row clear of the bottom edge.
  dist = lerp(dist, narrow ? 2.45 : 1.7, rise(close))
  // The spotlight is placed against the camera at rest, so a held card backs off with the rest of the product.
  const restDist = dist
  // A moving scroll backs the camera off a little, so the product breathes with the wheel and settles closer.
  dist += SURGE.dist * Math.abs(surge)

  // The proof camera eases onto the code layer over the first half of the act and follows it through the chapter
  // sink and back into the phone as the stack closes over the act's last 20%, so the code stays framed while the
  // readout types and rests. A target that left out the sink would carry the stack 0.08 lower by the end of the
  // act, past the bottom edge.
  const proofFocus = rise(proof) * (1 - rise(coach))
  const target = lerp3([0, 0, 0], codeCenter, proofFocus)
  // The exploded stack fans toward the phone's right, so both shifts ease left during the glass act. Wide keeps
  // the stack near its callouts, then shifts right as proof focuses until the code layer's centre sits at 0.685
  // of the width, a little left of the middle of the space right of the copy rail, which keeps the fanned glass
  // inside the right edge. Narrow centres the stack so every layer stays in frame, and its vertical shift eases
  // down by 0.1 as proof focuses, so the stack settles lower and its glass top clears the menu pill.
  const stackOut = rise(glass) * (1 - rise(proof))
  const wideShift = (0.27 - 0.07 * stackOut + 0.10 * proofFocus) * aspect * (1 - dayOut)
  const shift: [number, number] = narrow ? [-0.22 * stackOut, 0.26 - 0.1 * proofFocus] : [wideShift, 0]
  const cameraY = target[1] + DRIFT.cameraY * Math.sin(p * TAU * DRIFT.cameraCycles)

  // The spotlight is SPOT_DEPTH in front of the camera at rest, at the world x that projects to SPOT.x of the frame
  // width through this frame's lens shift.
  const spotX = target[0] + ((aspect * (2 * SPOT.x - 1) - shift[0]) * SPOT_DEPTH) / FOCAL
  const spotZ = target[2] - restDist + SPOT_DEPTH

  const cardKeys: ScreenKey[] = ['home', 'manage', 'recovery', 'community']
  const cards = cardKeys.map((key, i) => {
    if (narrow) {
      // The deck: each card crosses the frame in front of the receded phone and holds at the centre through the
      // middle of its window. A card of half-width 0.335 is whole in frame while |x| is small, which holds from
      // hold[0] to hold[1] of the window: the card eases to the centre over the first 0.3, rests there until 0.7,
      // and eases off over the last 0.3. It develops as it arrives and is sharp from hold[0], and it fades only
      // at the frame's edge, so it covers the phone opaquely whenever the two overlap.
      const s = DECK.start + i * DECK.step
      const wnd = clamp01((day - s) / DECK.window)
      const across = 0.5 * ramp(wnd, 0, DECK.hold[0]) + 0.5 * ramp(wnd, DECK.hold[1], 1)
      const x = 0.85 - 1.7 * across
      const develop = ramp(wnd, 0.02, DECK.hold[0])
      const opacity = ramp(wnd, 0, DECK.fade) * (1 - ramp(wnd, 1 - DECK.fade, 1)) * (1 - rise(quiet, 0.5))
      return plane([x, sinkY + wave(0.7 * (i + 1)) - DECK.drop, DECK.z], [1, 0, 0], [0, 1, 0], PHONE.sx, PHONE.sy, PHONE.sRadius, develop, opacity, key)
    }
    // Each card peels off the front of the screen, matching the phone's turn and size there, and travels to the
    // spotlight, where it faces the camera at full scale, developed, with its label under it. It stays hidden
    // until its peel has lifted it about 10% of the way off the phone (0.06 of its window) and fades in by 0.2
    // while it develops, so its glyph phase never prints as a dotted rectangle on the phone's face and is never
    // an opaque glyph fill that reads as the screen tearing. After the hold it settles into its slot of the row
    // at DAY_ROW.scale. The quiet act folds the row: every card slides home over the first 60% of the act while
    // the phone returns to the centre, and fades from 10% to 50%, so it is gone before it reaches the screen,
    // with develop held so it never re-encodes.
    const s = CARD_START + i * CARD_STEP
    const wnd = clamp01((day - s) / CARD_WINDOW)
    const peel = ramp(wnd, 0, SPOT.in)
    const settle = ramp(wnd, SPOT.out, 1)
    const home = ramp(quiet, 0, 0.6)
    const step = i - 1.5
    const y = sinkY + wave(0.7 * (i + 1))
    const slot: Vec3 = [(DAY_ROW.cardX + i * DAY_ROW.pitch) * reach, y, DAY_ROW.arcZ * Math.abs(step)]
    const spot: Vec3 = [spotX, y, spotZ]
    const front = add(screenCenter, mul(normal, -DAY_ROW.lead))
    const cardYaw = lerp(lerp(lerp(yaw, 0, peel), -DAY_ROW.arcYaw * step, settle), yaw, home)
    const cardPitch = lerp(lerp(pitch, 0, peel), pitch, home)
    const b = basis(cardYaw, cardPitch)
    const scale = lerp(lerp(1, DAY_ROW.scale, settle), 1, home)
    const center = lerp3(lerp3(lerp3(front, spot, peel), slot, settle), front, home)
    const develop = ramp(wnd, 0, SPOT.in)
    const opacity = ramp(wnd, 0.06, 0.2) * (1 - ramp(quiet, 0.1, 0.5))
    return plane(center, mul(b.right, scale), mul(b.up, scale), PHONE.sx, PHONE.sy, PHONE.sRadius, develop, opacity, key)
  })

  const bd = backdropAt(windows, input.backdrops, p)
  // The coach figure draws from 0.15 of its act, on the whole phone the proof act closed, while the phone moves
  // aside, and is gone a quarter into the close, before the close copy is in place.
  const coachDraw = ramp(coach, 0.15, 0.6)
  const coachAmount = coachDraw * (1 - ramp(close, 0, 0.25))
  // The product forms by 0.62 of the arrival and holds. The reassembled phone then turns to its close pose by half
  // the close and rests there, with the copy settled from 0.4 (CLOSE_SETTLE in timeline.ts) and the evening room
  // whole from 0.3 (ROOM_SWAP) until 0.74 (ROOM_REVEAL), so the finished close holds for about 0.48
  // viewport-heights. The dissolve runs
  // from 0.78 to 0.9 of the act and the scatter ends at 0.93, about 0.14 viewport-heights before the stage
  // unpins, which covers the glide's lag behind a fast wheel (END_GLIDE_TIME in TeardownCanvas.tsx) so no loose
  // characters outlive the chapter. The gather reverses behind the dissolve so the characters drift apart instead
  // of holding a phone-shaped block.
  const decode = ramp(arrival, 0.1, 0.62) * (1 - ramp(close, 0.78, 0.9))
  const gather = ramp(arrival, 0, 0.5) * (1 - ramp(close, 0.82, 0.93))

  return {
    camera: { pos: [target[0], cameraY, target[2] - dist], right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, 1], focal: FOCAL, shift },
    phone: { pos: phonePos, right, up, normal },
    explode,
    gather,
    decode,
    internals: explode,
    // The glass light drives both the sheet's rim and its opacity in product.ts, so proof hides the fanned sheet,
    // whose rim otherwise outlines a clipped rectangle at the frame's top and right edges, and leaves the code layer
    // and the chassis in focus.
    glass: { center: glassCenter, light: (0.35 + 0.65 * explode) * (1 - proofDim) * ramp(arrival, 0.2, 0.45), sweep: lerp(-1.4, 1.4, ramp(glass, 0.05, 0.95)), band: explode },
    screen,
    code,
    cards,
    // The room prints in from the page over ROOM_REVEAL's opening span and dissolves back into it over its closing
    // span, so the stage pins and unpins with nothing drawn but the copy, and the chapter ends on the copy against
    // the page.
    backdrop: {
      ...bd,
      reveal: ramp(arrival, 0, ROOM_REVEAL.inEnd) * (1 - ramp(close, ROOM_REVEAL.out[0], ROOM_REVEAL.out[1])),
      driftA: roomDrift(windows, input.backdrops, bd.a, p),
      driftB: roomDrift(windows, input.backdrops, bd.b, p),
    },
    // The figure slides in from the right as it draws, starting 0.25 (wide) or 0.3 (narrow) right of its station
    // at 0.15 of the act and landing at 0.6, when it is fully drawn. The wide station at x 0.66 keeps the arms
    // clear of the receding phone. At 390 by 844 the narrow figure at scale 0.53 and x 0.3 keeps both wrists at
    // least 12 CSS px outside the receded phone and the far wrist's ring inside the frame's right edge when the
    // arms are level. At 0.7 the near wrist sat inside the phone's top right corner and the far one off the frame.
    coach: {
      amount: coachAmount,
      frame: coach * input.poseFrames,
      pos: [(narrow ? 0.3 : 0.66) + (narrow ? 0.3 : 0.25) * (1 - coachDraw), narrow ? -0.08 : -0.12, narrow ? -0.2 : 0.1],
      scale: narrow ? 0.53 : 0.85,
    },
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

/** A rectangle in world space: `center` plus `right` * u * halfW plus `up` * v * halfH for u and v in -1 to 1. */
export type WorldRect = Pick<PlanePose, 'center' | 'right' | 'up' | 'halfW' | 'halfH'>

/** Projected bounds of a rectangle as viewport fractions, with the camera depth of its centre. Null when any corner is behind the camera. */
export function projectRect(pose: Pose, rect: WorldRect, aspect: number): { left: number; top: number; right: number; bottom: number; depth: number } | null {
  const centre = projectPoint(pose, rect.center, aspect)
  if (!centre) return null
  const out = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity, depth: centre.depth }
  for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const at = projectPoint(pose, add(rect.center, add(mul(rect.right, u * rect.halfW), mul(rect.up, v * rect.halfH))), aspect)
    if (!at) return null
    out.left = Math.min(out.left, at.x)
    out.right = Math.max(out.right, at.x)
    out.top = Math.min(out.top, at.y)
    out.bottom = Math.max(out.bottom, at.y)
  }
  return out
}

/** World position of a callout anchor on its surface. */
export function anchorWorld(pose: Pose, anchor: Anchor): Vec3 {
  const { phone } = pose
  const on = (center: Vec3, r: Vec3, u: Vec3, halfW: number, halfH: number) => add(center, add(mul(r, anchor.u * halfW), mul(u, anchor.v * halfH)))
  switch (anchor.plane) {
    case 'screen': return planePoint(pose.screen, anchor.u, anchor.v)
    case 'code': return planePoint(pose.code, anchor.u, anchor.v)
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
