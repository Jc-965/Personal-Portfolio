/** Skeleton for the coach act: which MediaPipe joints the story keeps, how they connect, and frame interpolation. */
import type { Pose2D } from '../../content/teardown/types.ts'

/** MediaPipe pose indices kept in the story's pose data, in storage order. */
export const COACH_JOINTS: readonly number[] = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32]

/** The app's demonstration skeleton (ParkiWell lib/motion_coach/motion_demonstration_view.dart), in MediaPipe indices. */
const MEDIAPIPE_BONES: readonly [number, number][] = [
  [11, 12], [23, 24], [11, 23], [12, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 31], [28, 32],
]

/** Bones as index pairs into COACH_JOINTS. */
export const COACH_BONES: readonly [number, number][] = MEDIAPIPE_BONES.map(([a, b]) => [COACH_JOINTS.indexOf(a), COACH_JOINTS.indexOf(b)])

/** Joint positions at a fractional frame. Frames wrap, so the loop plays continuously in both directions. */
export function jointsAt(pose: Pose2D, frame: number): [number, number][] {
  const n = pose.frames
  const f = ((frame % n) + n) % n
  const i0 = Math.floor(f)
  const i1 = (i0 + 1) % n
  const t = f - i0
  const out: [number, number][] = []
  for (let j = 0; j < pose.joints; j++) {
    const a = (i0 * pose.joints + j) * 2
    const b = (i1 * pose.joints + j) * 2
    out.push([
      pose.points[a] + (pose.points[b] - pose.points[a]) * t,
      pose.points[a + 1] + (pose.points[b + 1] - pose.points[a + 1]) * t,
    ])
  }
  return out
}
