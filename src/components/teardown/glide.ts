/**
 * Critically damped follow for rendered progress. The chapter draws this value
 * instead of raw scroll progress, so a jerky wheel or a fling still produces
 * gliding motion. It never overshoots, which keeps act boundaries monotonic.
 */
export interface Glide {
  value: number
  velocity: number
}

/** Seconds. Larger is slower and smoother. Lenis already smooths the scroll, so this stays short enough that rendered progress keeps up with the wheel. */
export const GLIDE_TIME = 0.32

/**
 * Advances the follow by `dt` seconds toward `target`. The decay factor is a
 * cubic approximation of the exponential that stays between 0 and 1 for any
 * dt, so a long frame cannot diverge.
 */
export function glideStep(state: Glide, target: number, dt: number, timeConstant = GLIDE_TIME): Glide {
  const omega = 2 / timeConstant
  const x = omega * dt
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = state.value - target
  const temp = (state.velocity + omega * change) * dt
  const velocity = (state.velocity - omega * temp) * decay
  const value = target + (change + temp) * decay
  // A step that would cross the target lands on it at rest. Both a long frame and a fast approach can otherwise carry it past.
  if ((target - state.value) * (target - value) < 0) return { value: target, velocity: 0 }
  return { value, velocity }
}
