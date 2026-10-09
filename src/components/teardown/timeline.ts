/** Pure scroll timeline for a teardown chapter: act windows, progress within them, and the copy's ride through an act. */
import type { ActKey } from '../../content/teardown/types.ts'

export interface ActWindow {
  key: ActKey
  /** Chapter progress where the act begins, 0 to 1. */
  start: number
  end: number
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
/**
 * Share of `dwell`'s motion moved from the middle to the ends. Below 1 keeps
 * dwell monotonic. At 0.75 the copy keeps drifting through the middle of its
 * act at 25% of the mean rate, so an act rests on its copy without reading
 * as a parked screen.
 */
const LINGER = 0.75
/** Vertical travel of the copy block, in stage heights, from local 0 to local 1. */
const RIDE = 0.9
/**
 * |y| at which the copy starts to fade, and |y| at which it is gone. The
 * phone layout in Teardown.tsx reads the first value and scales its ride so a
 * block's top meets the product floor there, so the clip and the fade start
 * together.
 */
export const RIDE_FADE: readonly [number, number] = [0.32, 0.45]

export function totalSpan(acts: readonly { span: number }[]): number {
  return acts.reduce((sum, act) => sum + act.span, 0)
}

/** Contiguous windows over chapter progress, sized by each act's span. The last window ends at exactly 1. */
export function actWindows(acts: readonly { key: ActKey; span: number }[]): ActWindow[] {
  const total = totalSpan(acts)
  let at = 0
  return acts.map((act, i) => {
    const start = at / total
    at += act.span
    return { key: act.key, start, end: i === acts.length - 1 ? 1 : at / total }
  })
}

/** The act containing `progress`. A boundary belongs to the act that starts there, and progress 1 to the last act. */
export function actAt(windows: readonly ActWindow[], progress: number): { index: number; key: ActKey; local: number } {
  const p = clamp01(progress)
  let index = windows.findIndex((w) => p < w.end)
  if (index < 0) index = windows.length - 1
  const w = windows[index]
  return { index, key: w.key, local: clamp01((p - w.start) / Math.max(1e-9, w.end - w.start)) }
}

/** Progress within one act: 0 before it, 1 after it. Chained effects rely on that monotonic shape. */
export function localOf(windows: readonly ActWindow[], key: ActKey, progress: number): number {
  const w = windows.find((entry) => entry.key === key)
  if (!w) return 0
  return clamp01((progress - w.start) / Math.max(1e-9, w.end - w.start))
}

/** Smoothstep of `t` across [a, b], clamped to 0 to 1. */
export function ramp(t: number, a: number, b: number): number {
  const x = clamp01((t - a) / Math.max(1e-9, b - a))
  return x * x * (3 - 2 * x)
}

/**
 * Progress eased to linger: 0 to 1 over 0 to 1, moving fastest at the ends and
 * at 1 - LINGER of the mean rate through the middle. Monotonic, with dwell(0.5)
 * exactly 0.5, so motion built on it is at its midpoint halfway through.
 */
export function dwell(t: number): number {
  const x = clamp01(t)
  return x + (LINGER * Math.sin(2 * Math.PI * x)) / (2 * Math.PI)
}

/**
 * The copy block's ride across its act. `y` is its vertical offset as a
 * fraction of the stage height: +0.45 at local 0 (below centre), 0 at 0.5,
 * -0.45 at 1, slower through the middle 60% of the act and faster at the ends.
 * `opacity` is 1 while |y| <= 0.32, which holds from about 0.085 to 0.915 of
 * the act, and 0 once |y| reaches 0.45.
 */
export function copyRide(local: number): { y: number; opacity: number } {
  const y = RIDE / 2 - RIDE * dwell(local)
  return { y, opacity: 1 - ramp(Math.abs(y), RIDE_FADE[0], RIDE_FADE[1]) }
}

/**
 * Share of the arrival over which its copy holds the centre. The arrival copy is in place when the chapter pins
 * and rides out over the act's last 60%.
 */
const EDGE_HOLD = 0.4
/**
 * Share of the close act over which its copy rides in to the centre, where it then holds to the unpin. At 0.4 the
 * copy has settled before the phone reaches its close pose (0.5) and rests with it and the evening room until
 * the room starts to dissolve at 0.74 (ROOM_REVEAL in rig.ts).
 */
const CLOSE_SETTLE = 0.4

/**
 * The copy ride of act `index` at chapter `progress`. Teardown.tsx moves the copy with it and the composite's
 * copy shade follows the same block, so both must read it from here. Two acts' copy is never visible at once,
 * since each act's copy is transparent at every boundary it shares with another act.
 */
export function actCopyRide(windows: readonly ActWindow[], index: number, progress: number): { y: number; opacity: number } {
  const local = localOf(windows, windows[index].key, progress)
  if (index === 0) return copyRide(0.5 + 0.5 * clamp01((local - EDGE_HOLD) / (1 - EDGE_HOLD)))
  if (index === windows.length - 1) return copyRide(0.5 * clamp01(local / CLOSE_SETTLE))
  return copyRide(local)
}
