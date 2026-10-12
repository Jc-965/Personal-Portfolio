/**
 * How a pinned chapter stage meets what is above and below it. Where a stage meets the page, its black base fades
 * in as the stage rises into place and out as it leaves, over an edge that widens the farther the stage is from its
 * pin, and its room starts printing before the pin, so the page's grid and graph give way to the room instead of to
 * a black slab. Where a stage meets another chapter, its base stays opaque to a hard edge, since the neighbour's
 * base covers the other side and no page shows between them. TeardownCanvas and ChapterCanvas both read this.
 */
import { EDGE_HOLD, ramp } from './timeline.ts'

/** Fraction of the stage height over which the room fades at the top and bottom, and the base at a pinned page edge. */
export const SEAM = 0.1
/** Fraction of the stage height the base fades over at a page edge one full stage height from its pin. */
const OPEN_FADE = 0.6
/** Share of the room an entering stage has printed by its pin. The arrival's own reveal completes it. */
const ENTRY_REVEAL = 0.85

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smoother = (t: number) => {
  const x = clamp01(t)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

export interface StageEdges {
  /** The base's fade at the stage's top and bottom, as fractions of the stage height. */
  top: number
  bottom: number
  /** The base's opacity, 0 to 1. */
  base: number
  /** 0 with the stage a full stage height below its pin, 1 from the pin on. */
  approach: number
}

/**
 * The stage's top edge in viewport px for a track whose top is at `trackTop` page px, `trackHeight` tall, with the
 * page scrolled to `scrollY`. Positive while the stage rises into place, 0 while it is pinned, and negative once it
 * scrolls out at the track's end.
 */
export function stageTopAt(scrollY: number, trackTop: number, trackHeight: number, stageHeight: number): number {
  if (scrollY < trackTop) return trackTop - scrollY
  const unpin = trackTop + trackHeight - stageHeight
  return scrollY > unpin ? unpin - scrollY : 0
}

/** The base's edges and opacity for a stage whose top is `stageTop` viewport px, and whether each edge meets a chapter. */
export function stageEdges(stageTop: number, stageHeight: number, joinTop: boolean, joinBottom: boolean): StageEdges {
  const h = Math.max(1, stageHeight)
  const approach = clamp01(1 - Math.max(0, stageTop) / h)
  const rise = smoother(approach)
  const fall = smoother(Math.max(0, -stageTop) / h)
  return {
    top: joinTop ? 0 : SEAM + (OPEN_FADE - SEAM) * (1 - rise),
    bottom: joinBottom ? 0 : SEAM + (OPEN_FADE - SEAM) * fall,
    base: (joinTop ? 1 : rise) * (joinBottom ? 1 : 1 - fall),
    approach,
  }
}

/**
 * The room's print-in while the stage approaches, up to ENTRY_REVEAL at the pin. It hands over to the arrival's own
 * reveal by EDGE_HOLD of the arrival act (`arrivalLocal`), which has reached the same share by then, so the room
 * never prints back out. Composite with max().
 */
export function entryReveal(approach: number, arrivalLocal: number): number {
  return ENTRY_REVEAL * smoother(approach) * (1 - smoother(ramp(arrivalLocal, EDGE_HOLD * 0.5, EDGE_HOLD)))
}

/** Whether `el` is a chapter whose stage is laid out, so a stage touching it needs no fade on that side. */
export function isChapter(el: Element | null): boolean {
  return !!el && el.classList.contains('teardown') && !el.classList.contains('teardown--static') && (el as HTMLElement).offsetHeight > 0
}
