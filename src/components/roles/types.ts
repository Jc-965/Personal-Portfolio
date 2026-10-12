/**
 * The contract between the Journey section's engine (RolesSection, RolesStage) and one role: its story (copy, acts,
 * sky, poster) and its scene module (a floating-island diorama posed for a frame). The engine owns the rows, the
 * journey view, the renderer, the sky composite, and the copy. A scene owns its island.
 */
import type * as THREE from 'three'

export interface RoleCallout {
  text: string
  /** Key of a point the scene returns in IslandOutput.anchors, where the callout's leader lands. */
  anchor: string
}

export interface RoleAct {
  key: string
  /** Viewport-heights of pinned travel. */
  span: number
  /** A small caps line above the act's lines. */
  eyebrow?: string
  lines: string[]
  /** Terminal-style lines that type in through the act. */
  readout?: string[]
  /** Bracket buttons that send `command` with `value` to the scene. The first is the default. */
  choices?: { label: string; command: string; value: string }[]
  callouts: RoleCallout[]
}

export interface RoleStory {
  /** The portfolio.json experience id, also the journey path segment. */
  id: string
  /** The role's acts, at least the arrival and a close. The first act's first line is never shown. */
  acts: RoleAct[]
  /** Per act, the local at which its finished state rests, for the wheel detents. */
  restLocal: number[]
  /** The painted sky behind the island on the journey page, and its focus x, 0 to 1, kept in frame. */
  sky: { src: string; focusX: number }
  /** Labels the scene's panels carry, in panel order. */
  panels: string[]
  links: { label: string; href: string }[]
  credit?: string
  /** A still of the island for reduced motion and the WebGL fallback. */
  poster: { src: string; alt: string }
  scene: () => Promise<{ default: IslandFactory }>
}

/** The role's facts from portfolio.json, joined to its story for the rows and the journey copy. */
export interface RoleFacts {
  id: string
  company: string
  role: string
  track: string
  period: string
  location: string
  status?: string
  summary: string
  stack: string[]
  accent: string
}

export type IslandMode = 'home' | 'journey'

/** One frame's input to a scene. Lengths are world units unless noted. */
export interface IslandFrame {
  mode: IslandMode
  /** Local progress, 0 to 1, of the act with this key. 0 for every act in home mode. */
  local(key: string): number
  /** Pointer over the island's own rectangle in normalised device coordinates, and whether it is inside. */
  pointer: { x: number; y: number; inside: boolean }
  /** Eased pointer tilt, -1 to 1 on each axis, and radians of drag yaw. */
  tiltX: number
  tiltY: number
  dragYaw: number
  /** Eased 0 to 1 while the pointer is over the island on the home page. */
  hover: number
  /** The launch bump, 0 to 1, as the journey opens. */
  push: number
  /** Width over height of the rectangle the island draws into. */
  aspect: number
  narrow: boolean
  /** Seconds since the stage started, and since the last frame. */
  time: number
  dt: number
}

/** A labelled panel as the overlay sees it, in world space. */
export interface IslandPanel {
  center: THREE.Vector3
  up: THREE.Vector3
  halfH: number
  corners: THREE.Vector3[]
  develop: number
  opacity: number
}

export interface IslandOutput {
  /** World points for callout leaders, by anchor key. */
  anchors: Map<string, THREE.Vector3 | null>
  panels: IslandPanel[]
  /** World points spanning what the island shows, for the phone layout's copy floor under the lowest of them. */
  bounds: THREE.Vector3[]
  /** Screen height, 0 at the bottom to 1 at the top, of the tilt-shift's sharp band on the journey page. */
  focusY: number
  /** True while motion the pointer, a click, or a choice started is still settling, so the loop keeps drawing. */
  busy: boolean
  /** True once the textures and data the current pose shows are ready. */
  ready: boolean
}

export interface IslandContext {
  renderer: THREE.WebGLRenderer
  environment: THREE.Texture
  /** Loads an sRGB mipmapped texture through the stage's upload queue. */
  load(src: string): { texture: THREE.Texture; ready: boolean }
  /** Asks for another frame, for a scene whose state changed outside update. */
  invalidate(): void
  /** Seconds on IslandFrame.time's clock at this moment, for a press or a command between frames. */
  now(): number
  story: RoleStory
  facts: RoleFacts
}

export interface IslandScene {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  update(frame: IslandFrame): IslandOutput
  /** A press at a pointer in the island rectangle's normalised device coordinates. Returns true if it was taken. */
  press?(ndc: { x: number; y: number }): boolean
  command?(name: string, value: string): void
  dispose(): void
}

export type IslandFactory = (ctx: IslandContext) => IslandScene
