/** Pure scroll timeline for a teardown chapter: act windows and progress within them. */
import type { ActKey } from '../../content/teardown/types.ts'

export interface ActWindow {
  key: ActKey
  /** Chapter progress where the act begins, 0 to 1. */
  start: number
  end: number
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

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
