/**
 * Content contract for a teardown chapter: one product told in eight fixed
 * acts. The renderer, timeline, and rig read only this shape, so a second
 * project needs a new story object and no new code.
 */

export type ActKey = 'arrival' | 'hand' | 'day' | 'quiet' | 'glass' | 'proof' | 'coach' | 'close'

/** The teardown grammar fixes this order. Stories must list their acts in it. */
export const ACT_ORDER: readonly ActKey[] = ['arrival', 'hand', 'day', 'quiet', 'glass', 'proof', 'coach', 'close']

/** Surface a callout attaches to, addressed in that surface's half-extents, -1 to 1 on each axis. */
export type AnchorPlane = 'screen' | 'glass' | 'code' | 'chassis' | 'coach'

export interface Anchor {
  plane: AnchorPlane
  u: number
  v: number
}

export interface Callout {
  /** At most eight words. */
  text: string
  anchor: Anchor
}

export interface TeardownAct {
  key: ActKey
  /** Pinned scroll travel for this act, in viewport heights. */
  span: number
  /** Copy beside the object. In 'arrival' the first line is the chapter heading. */
  lines: string[]
  callouts: Callout[]
  /** Index into `TeardownStory.backdrops`, or null for a dark stage. */
  backdrop: number | null
}

export type ScreenKey = 'welcome' | 'home' | 'manage' | 'recovery' | 'community' | 'log' | 'coach' | 'results'

export interface TeardownScreen {
  key: ScreenKey
  src: string
  alt: string
  width: number
  height: number
}

export interface Pose2D {
  frames: number
  joints: number
  /** x then y for each joint of each frame, body centred, y up. */
  points: readonly number[]
}

export interface TeardownStory {
  id: string
  name: string
  acts: TeardownAct[]
  screens: TeardownScreen[]
  /** The 'day' act's cards in order. Each label has at most eight words. */
  cards: { screen: ScreenKey; label: string }[]
  /** Full-colour room photographs. `focus` is the subject's centre, x from the left and y from the top, 0 to 1. */
  backdrops: { src: string; focus: [number, number] }[]
  /** Source excerpt drawn on the code layer. */
  code: string
  codeSource: string
  pose: Pose2D
  tags: string[]
  links: { label: string; href: string }[]
}
