/**
 * The contract between the generic chapter engine (Chapter, ChapterCanvas) and one project's chapter: its story
 * (acts, copy, rooms, theme) and its scene module (a three.js scene and its pose for any scroll progress). The
 * engine owns scroll, the views, the renderer, the room composite, and the copy. A scene owns its centrepiece.
 */
import type * as THREE from 'three'
import type { Interaction } from '../teardown/rig'

export interface ChapterCallout {
  text: string
  /** Key of a point the scene returns in SceneOutput.anchors, where the callout's leader lands. */
  anchor: string
}

export interface ChapterAct {
  key: string
  /** Viewport-heights of pinned travel. */
  span: number
  /** Index into the story's backdrops, or null to hold the previous room as an outline field. */
  backdrop: number | null
  /** A small caps line above the act's lines. */
  eyebrow?: string
  /** The first act's first line is the chapter's title, and its second the lede. */
  lines: string[]
  /** Terminal-style lines that type in through the act. */
  readout?: string[]
  /** Bracket buttons in the act's copy that send `command` with `value` to the scene. The first is the default. */
  choices?: { label: string; command: string; value: string }[]
  callouts: ChapterCallout[]
}

export interface ChapterTheme {
  /** A Google Fonts stylesheet URL, loaded when the chapter nears. */
  fontsHref: string
  /** CSS custom properties set on the chapter: --ch-title, --ch-body, --ch-label fonts and --ch-ink, --ch-accent, --ch-panel, --ch-hairline. */
  vars: Record<string, string>
  /** Linear RGB of the glyph decode and the room's edge floor. */
  tint: readonly [number, number, number]
  /** Per-channel grade on the room's ink. */
  grade: readonly [number, number, number]
}

export interface ChapterBackdrop {
  src: string
  /** Point of the photograph to keep in frame, x from the left and y from the top, 0 to 1. */
  focus: readonly [number, number]
  /** Lightness range of the photograph that maps to the glyph ramp. */
  levels: readonly [number, number]
  mirror?: boolean
}

export interface ChapterStory {
  id: string
  name: string
  /** The kind of thing it is, for the document title: "ParkiWell teardown", "Tarocchi reading". */
  titleNoun: string
  /**
   * The first act is the arrival. Its centrepiece forms by EDGE_HOLD (0.65, timeline.ts), where its copy starts to
   * ride out and the home page's preview ends, as in ParkiWell's chapter.
   */
  acts: ChapterAct[]
  /** Per act, the local at which its finished state rests, for the wheel detents. */
  restLocal: number[]
  backdrops: ChapterBackdrop[]
  /** Labels the scene's panels carry, in panel order. */
  panels: string[]
  tags: string[]
  links: { label: string; href: string }[]
  credit?: string
  /** A still of the centrepiece for the reduced motion layout and the WebGL fallback. */
  poster: { src: string; alt: string }
  theme: ChapterTheme
  scene: () => Promise<{ default: SceneFactory }>
}

/** One frame's input to a scene. Lengths and positions are world units unless noted. */
export interface SceneFrame {
  /** Glided chapter progress, 0 to 1 over the whole journey. */
  progress: number
  /** Local progress, 0 to 1, of the act with this key. */
  local(key: string): number
  interaction: Interaction
  /** Pointer in normalised device coordinates over the stage, and whether a fine pointer is over it. */
  pointer: { x: number; y: number; inside: boolean }
  /** The launch bump, 0 to 1. */
  push: number
  aspect: number
  narrow: boolean
  /** Seconds since the scene started, and since the last frame. */
  time: number
  dt: number
  /**
   * The engine's default glyph phases and room for this progress: the centrepiece forms over the arrival up to
   * arrivalHold and dissolves late in the last act, and the rooms follow the acts' backdrops. A scene returns
   * these unless its centrepiece needs its own timing.
   */
  base: { decode: number; gather: number; backdrop: SceneOutput['backdrop'] }
}

/** A labelled panel as the overlay sees it, in world space. */
export interface ScenePanel {
  center: THREE.Vector3
  /** Unit vector along the panel's up edge and its half height, for the label hung under it. */
  up: THREE.Vector3
  halfH: number
  /** The panel's corners, for its projected bounds. */
  corners: THREE.Vector3[]
  develop: number
  opacity: number
}

export interface SceneOutput {
  /** The product layer's glyph decode and gather, 0 to 1, as in the ParkiWell composite. */
  decode: number
  gather: number
  backdrop: { a: number; b: number; mix: number; gain: number; glyphOnly: number; reveal: number }
  /** World point the room prints out of and dissolves into. */
  revealAt: THREE.Vector3
  /** World points for callout leaders, by anchor key. */
  anchors: Map<string, THREE.Vector3 | null>
  /** World corners of the clickable centrepiece in the preview, or null. */
  hit: THREE.Vector3[] | null
  panels: ScenePanel[]
  /** World points spanning what the scene shows, for the phone layout's copy floor under the lowest of them. */
  bounds: THREE.Vector3[]
  /** Scale on the scene's lit body, 1 normally. */
  bodyLight: number
  /** True while motion the pointer or a click started is still settling, so the loop keeps drawing. */
  busy: boolean
  /** True once the textures the current pose shows are uploaded. */
  ready: boolean
}

export interface SceneContext {
  renderer: THREE.WebGLRenderer
  environment: THREE.Texture
  narrow: boolean
  anisotropy: number
  /** Loads an sRGB mipmapped texture through the chapter's upload queue. Urgent ones upload first. */
  load(src: string, options?: { urgent?: boolean; pixelated?: boolean }): LoadedTexture
  /** Asks for another frame, for a scene whose state changed outside update (a click). */
  invalidate(): void
  /**
   * Seconds on SceneFrame.time's clock at this moment. A press or a command between frames stamps its start with it,
   * since the last frame's time can be any length of idle ago.
   */
  now(): number
  story: ChapterStory
}

export interface LoadedTexture {
  texture: THREE.Texture
  ready: boolean
  width: number
  height: number
}

export interface ChapterScene {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  update(frame: SceneFrame): SceneOutput
  /** A press on the stage at a pointer in normalised device coordinates. Returns true if the scene took it. */
  press?(ndc: { x: number; y: number }): boolean
  /** A choice from the act's copy (ChapterAct.choices). */
  command?(name: string, value: string): void
  setNarrow?(narrow: boolean): void
  dispose(): void
}

export type SceneFactory = (ctx: SceneContext) => ChapterScene
