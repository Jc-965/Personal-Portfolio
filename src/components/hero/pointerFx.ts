/**
 * Pure state for the pointer effects on the hero canvas. The pointer draws
 * the glyph field toward itself, so the edges of the text lean in as it
 * passes, and lifts the glyphs under it a step up the ramp. A press bumps the
 * glyphs around a click outward and lets them settle, the way the page's
 * background grid answers a click. Positions are CSS pixels with the origin
 * at the bottom left, the way the shader sees them.
 */

export interface PointerFx {
  /** Where the pointer is. */
  x: number
  y: number
  /** Where the pull is. It trails the pointer a little, so the field flows rather than snaps. */
  px: number
  py: number
  /** 0 when the pointer is away or coarse, eased toward 1 while it is over the page. */
  pull: number
  targetPull: number
  press: { x: number; y: number; startedAt: number } | null
}

/** Reach of the pull in CSS pixels. It peaks at about half this and fades past it. */
export const PULL_RADIUS = 120
/** How far the field moves toward the pointer at the peak, in CSS pixels. */
export const PULL_DEPTH = 12
/** Reach of a press the instant it lands, in CSS pixels. */
export const PRESS_RADIUS = 130
/** How far the cells nearest a press move at full strength, in CSS pixels. */
export const PRESS_PUSH = 16
/** Relax rate per second. Matches the grid's 0.95 per frame at 60 fps. */
export const PRESS_DECAY = 3.1

export function createPointerFx(): PointerFx {
  return { x: -1e4, y: -1e4, px: -1e4, py: -1e4, pull: 0, targetPull: 0, press: null }
}

/**
 * Eases the pull in or out and lets its centre catch up with the pointer.
 * `dt` is seconds since the last frame. While the pull is off, the centre
 * snaps, so it never flies in from wherever the pointer last left.
 */
export function easePull(fx: PointerFx, dt: number): void {
  const ease = 1 - Math.exp(-dt * 6)
  fx.pull += (fx.targetPull - fx.pull) * ease
  if (Math.abs(fx.pull - fx.targetPull) < 0.002) fx.pull = fx.targetPull
  const follow = fx.pull < 0.02 ? 1 : 1 - Math.exp(-dt * 14)
  fx.px += (fx.x - fx.px) * follow
  fx.py += (fx.y - fx.py) * follow
}

/**
 * The press at `now` (seconds): where it is, how far it reaches, and how hard
 * it pushes. It is strongest the instant it lands and relaxes from there, and
 * its reach shrinks with it, exactly like the grid's click.
 */
export function pressAt(fx: PointerFx, now: number): { x: number; y: number; radius: number; strength: number } {
  const none = { x: 0, y: 0, radius: 0, strength: 0 }
  if (!fx.press) return none
  const age = now - fx.press.startedAt
  if (age < 0) return none
  const strength = Math.exp(-age * PRESS_DECAY)
  if (strength < 0.01) return none
  return { x: fx.press.x, y: fx.press.y, radius: PRESS_RADIUS * strength, strength }
}
