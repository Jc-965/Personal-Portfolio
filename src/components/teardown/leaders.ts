/**
 * Leader routes for one act's callouts, in stage CSS px, which Teardown.tsx draws as SVG paths from each callout
 * to its anchor.
 *
 * Wide stages keep the copy left of the product. Each leader leaves its callout on a horizontal stub to one shared
 * x, LEADER_GAP right of the act's widest callout, and runs straight to its anchor, so none runs behind another
 * callout. Callouts and anchors both run top to bottom in callout order, so no two runs cross.
 *
 * Phone stages stack the callouts under the product, so every anchor is above every callout, and two leaders that
 * run up one side of the stack cross unless one encloses the other. teardown.css therefore lists the anchored
 * callouts bottom to top while the leaders show. Each leader leaves its callout's left edge for its own lane in
 * the left gutter, runs up to its anchor's height, and turns right onto the anchor at the left edge of the part it
 * names, with the top anchor on the outermost lane. Lanes on the right would turn onto each anchor across the
 * screen it names, through the capture's own text.
 */

export interface Box { left: number; top: number; right: number; bottom: number }
export interface Point { x: number; y: number }

/** CSS px between a wide callout's right edge and its leader's start. */
export const LEADER_GAP = 8
/**
 * Phone lanes. The innermost lane is `inset` CSS px left of the callouts' left edge, clear of the + corner glyph
 * each panel draws 4 px outside its edge, and each lane outward is `step` px further left. At the 20 px phone
 * gutter four lanes run from x 14 to x 3.5. `gap` is the CSS px between a callout's left edge and its leader's
 * start.
 */
export const LANE = { inset: 6, step: 3.5, gap: 2 } as const

const middle = (box: Box) => (box.top + box.bottom) / 2

/**
 * Each callout's route as a polyline from its callout to its anchor, in callout order. An entry is null where its
 * callout or anchor is null, which hides that leader without moving the others: a phone lane belongs to its
 * callout's index, not to its place among the leaders shown.
 */
export function routeLeaders(callouts: readonly (Box | null)[], anchors: readonly (Point | null)[], narrow: boolean): (Point[] | null)[] {
  const shown = callouts.filter((box, i): box is Box => !!box && !!anchors[i])
  if (!shown.length) return callouts.map(() => null)
  if (!narrow) {
    const turn = Math.max(...shown.map((box) => box.right)) + LEADER_GAP
    return callouts.map((box, i) => {
      const anchor = anchors[i]
      return box && anchor ? [{ x: box.right + LEADER_GAP, y: middle(box) }, { x: turn, y: middle(box) }, anchor] : null
    })
  }
  const inner = Math.min(...shown.map((box) => box.left)) - LANE.inset
  return callouts.map((box, i) => {
    const anchor = anchors[i]
    if (!box || !anchor) return null
    const lane = inner - LANE.step * (callouts.length - 1 - i)
    return [{ x: box.left - LANE.gap, y: middle(box) }, { x: lane, y: middle(box) }, { x: lane, y: anchor.y }, anchor]
  })
}
