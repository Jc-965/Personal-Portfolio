/**
 * Layout of the day act's card labels, in stage px. A label hangs centred
 * under its card, shows while the card is developed, opaque, and whole in
 * frame, which starts as the card reaches its hold, and hides while a nearer
 * card covers it, so a label never draws over a card in front of its own and
 * never names a card hidden behind another or leaving the frame. Pure, so the
 * label tests drive it with real poses.
 */
import { projectPoint, projectRect, type Pose } from './rig.ts'

/** One day card as the overlay sees it in a frame. Lengths are stage px. */
export interface CardShot {
  /** The label's anchor, under the card's centre. Null when behind the camera. */
  anchor: { x: number; y: number } | null
  /** Projected bounds. Null when a corner is behind the camera. */
  rect: { left: number; top: number; right: number; bottom: number } | null
  /** Camera depth of the card's centre, world units. */
  depth: number
  develop: number
  opacity: number
}

export interface LabelPlace {
  left: number
  top: number
  on: boolean
}

/**
 * A label shows once its card's develop reaches this. Wide cards and deck cards both reach 1 exactly as their hold
 * starts, where rounding leaves a sampled frame a hair short of 1, so the threshold sits just below it and the
 * label is on from the hold's first frame. At 0.98 a wide card's label showed while the card was up to 2.5% of its
 * window short of the spotlight and pushed the label of the card settling behind it off that card.
 */
export const LABEL_DEVELOP = 0.999
/** A label shows only while its card is at least this opaque, so a fading card takes its label with it. */
export const LABEL_OPACITY = 0.95
/**
 * CSS px every card label keeps from the stage edges, and the inset at which a card still counts as whole in
 * frame. A deck card stays opaque until it reaches the frame's edge, so its label leaves as the card comes within
 * this inset of the edge on its way out, and never pushes the next card's label off that card.
 */
const LABEL_EDGE = 12
/** CSS px two shown card labels keep between them. */
const LABEL_GAP = 8
/** A label's anchor sits this many of its card's unscaled half-heights below the card's centre. */
const LABEL_DROP = 1.08
/**
 * A card covers another card's label once it is at least COVER_OPACITY opaque
 * and COVER_DEPTH world units nearer the camera, and either its rect holds the
 * other card's centre or the label's box reaches more than LABEL_COVER_SLACK
 * inside its side edges. The centre test hides the label of a card hidden
 * behind it even where the label clears its bottom edge by a pixel, as card
 * 2's does under held card 3 at 1920 by 1080. The row's arc sets settled
 * neighbours 0.05 apart in depth, so a settled card never covers another's
 * label, and a held card is at least 0.2 nearer than the row at every aspect.
 */
const COVER_OPACITY = 0.5
const COVER_DEPTH = 0.1
/**
 * CSS px a label must reach past a nearer card's edge before that card covers it. At 1440 by 900 the Manage label
 * under its slot ends 1 to 3 px inside the held Recovery card's left edge, and a corner that small read as covered
 * and hid the label for Recovery's whole hold.
 */
const LABEL_COVER_SLACK = 8

const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value))

/** Each day card of `pose` in stage px, in story order. */
export function cardShots(pose: Pose, aspect: number, width: number, height: number): CardShot[] {
  return pose.cards.map((card) => {
    // Measured along the card's own up axis, so a card that tips or turns in flight keeps its label under it.
    const upLength = Math.hypot(card.up[0], card.up[1], card.up[2]) || 1
    const drop = (card.halfH * LABEL_DROP) / upLength
    const anchor = projectPoint(pose, [card.center[0] - card.up[0] * drop, card.center[1] - card.up[1] * drop, card.center[2] - card.up[2] * drop], aspect)
    const rect = projectRect(pose, card, aspect)
    return {
      anchor: anchor && { x: anchor.x * width, y: anchor.y * height },
      rect: rect && { left: rect.left * width, top: rect.top * height, right: rect.right * width, bottom: rect.bottom * height },
      depth: rect?.depth ?? Infinity,
      develop: card.develop,
      opacity: card.opacity,
    }
  })
}

/**
 * Places label k of `sizes` under card k of `cards`, inside the stage. Null for a label whose anchor is behind
 * the camera. Shown labels are then pushed apart in order of x, not card order, since a settling card can sit
 * right of the card held in front of it. The nearest card's label holds its place and the others make room on
 * either side, so a held card's label never shifts for a card settling behind it. Last, the row is kept off the
 * left edge and pushed back from the right edge. A hidden label keeps tracking its card while it fades out.
 */
export function layoutCardLabels(cards: readonly CardShot[], sizes: readonly { w: number; h: number }[], stage: { width: number; height: number }): (LabelPlace | null)[] {
  const places = sizes.map((size, k): LabelPlace | null => {
    const card = cards[k]
    const anchor = card?.anchor
    if (!anchor) return null
    const left = clamp(anchor.x - size.w / 2, LABEL_EDGE, stage.width - LABEL_EDGE - size.w)
    const top = clamp(anchor.y, LABEL_EDGE, stage.height - LABEL_EDGE - size.h)
    const rect = card.rect
    const inFrame = anchor.x >= 0 && anchor.x <= stage.width && anchor.y >= 0 && anchor.y <= stage.height
      && !!rect && rect.left >= LABEL_EDGE && rect.right <= stage.width - LABEL_EDGE && rect.top >= LABEL_EDGE && rect.bottom <= stage.height - LABEL_EDGE
    const covered = cards.some((other, j) => {
      const r = other.rect
      // A bound with no area (a generic chapter's point-sized panel) covers nothing.
      if (j === k || !r || r.right - r.left < 1 || r.bottom - r.top < 1 || other.opacity < COVER_OPACITY || other.depth >= card.depth - COVER_DEPTH) return false
      const behind = !!rect && (rect.left + rect.right) / 2 > r.left && (rect.left + rect.right) / 2 < r.right
        && (rect.top + rect.bottom) / 2 > r.top && (rect.top + rect.bottom) / 2 < r.bottom
      return behind || (left < r.right - LABEL_COVER_SLACK && left + size.w > r.left + LABEL_COVER_SLACK && top < r.bottom && top + size.h > r.top)
    })
    return { left, top, on: inFrame && card.develop >= LABEL_DEVELOP && card.opacity >= LABEL_OPACITY && !covered }
  })
  const row = places.flatMap((place, k) => (place?.on ? [{ place, w: sizes[k].w, depth: cards[k].depth }] : [])).sort((a, b) => a.place.left - b.place.left)
  const pin = row.reduce((nearest, item, i) => (item.depth < row[nearest].depth ? i : nearest), 0)
  for (let i = pin + 1; i < row.length; i++) row[i].place.left = Math.max(row[i].place.left, row[i - 1].place.left + row[i - 1].w + LABEL_GAP)
  for (let i = pin - 1; i >= 0; i--) row[i].place.left = Math.min(row[i].place.left, row[i + 1].place.left - row[i].w - LABEL_GAP)
  for (let i = 0; i < row.length; i++) row[i].place.left = Math.max(row[i].place.left, i === 0 ? LABEL_EDGE : row[i - 1].place.left + row[i - 1].w + LABEL_GAP)
  for (let i = row.length - 1; i >= 0; i--) {
    const limit = i === row.length - 1 ? stage.width - LABEL_EDGE - row[i].w : row[i + 1].place.left - row[i].w - LABEL_GAP
    row[i].place.left = Math.min(row[i].place.left, limit)
  }
  return places
}
