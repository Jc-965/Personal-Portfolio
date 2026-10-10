import assert from 'node:assert/strict'
import test from 'node:test'
import { actWindows } from '../../src/components/teardown/timeline.ts'
import { anchorWorld, poseAt, projectPoint } from '../../src/components/teardown/rig.ts'
import { LANE, routeLeaders } from '../../src/components/teardown/leaders.ts'
import { PARKIWELL } from '../../src/content/teardown/parkiwell.ts'

const windows = actWindows(PARKIWELL.acts)
const backdrops = PARKIWELL.acts.map((a) => a.backdrop)
const still = { dragYaw: 0, tiltX: 0, tiltY: 0 }
const inAct = (key, local) => {
  const w = windows.find((x) => x.key === key)
  return w.start + (w.end - w.start) * local
}

/**
 * Callout boxes as teardown.css lays them out: mono text at `char` px per character plus the "// " prefix, wrapped
 * inside `max` px, with `pad` px of padding and border across and `line` px per line plus `pad` down, `gap` px
 * apart. Phones stack them bottom to top from `bottom`, wide stages top to bottom from `top`.
 */
function boxes(texts, { left, max, char, pad, line, gap, top, bottom }) {
  const sizes = texts.map((text) => {
    const ink = char * (text.length + 3)
    const lines = Math.ceil(ink / (max - pad))
    return { w: lines > 1 ? max : ink + pad, h: lines * line + pad }
  })
  const out = []
  if (bottom !== undefined) {
    let y = bottom
    sizes.forEach((s) => { out.push({ left, top: y - s.h, right: left + s.w, bottom: y }); y -= s.h + gap })
  } else {
    let y = top
    sizes.forEach((s) => { out.push({ left, top: y, right: left + s.w, bottom: y + s.h }); y += s.h + gap })
  }
  return out
}

const anchorsAt = (key, local, width, height, narrow) => {
  const aspect = width / height
  const pose = poseAt({ progress: inAct(key, local), windows, backdrops, narrow, aspect, interaction: still, poseFrames: PARKIWELL.pose.frames })
  return PARKIWELL.acts.find((a) => a.key === key).callouts.map((c) => {
    const p = projectPoint(pose, anchorWorld(pose, c.anchor), aspect)
    return { x: p.x * width, y: p.y * height }
  })
}

const orient = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
const crosses = ([a, b], [c, d]) => orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0
const segments = (route) => route.slice(1).map((p, k) => [route[k], p])
const inside = (box, p) => p.x > box.left && p.x < box.right && p.y > box.top && p.y < box.bottom
/** A segment enters a box if any of a few points along it lies strictly inside. Routes are axis-aligned or long diagonals, so 32 samples are dense enough. */
const enters = ([a, b], box) => Array.from({ length: 33 }, (_, k) => ({ x: a.x + ((b.x - a.x) * k) / 32, y: a.y + ((b.y - a.y) * k) / 32 })).some((p) => inside(box, p))

/** No two routes of an act cross, and no route runs through a callout box, its own included. */
function assertClean(routes, callouts, where) {
  routes.forEach((route, i) => {
    for (const seg of segments(route)) {
      callouts.forEach((box, k) => assert.ok(!enters(seg, box), `${where}: leader ${i} runs through callout ${k}`))
      routes.forEach((other, j) => {
        if (j <= i) return
        for (const seg2 of segments(other)) assert.ok(!crosses(seg, seg2), `${where}: leaders ${i} and ${j} cross`)
      })
    }
  })
}

test('phone leaders at 390 by 844 run up nested gutter lanes and never cross', () => {
  // The phone layout's callouts are .76rem mono (about 7.3 px a character) in panels of 10 px by 6 px padding and
  // a 1 px border, at most the 350 px the 20 px gutters leave, 6 px apart, and listed bottom to top from the
  // region's bottom, 34 px above the stage's. A ride lowers the stack by up to a few hundred px on the way in.
  const width = 390, height = 844
  const cases = [['hand', [0.2, 0.35, 0.5, 0.65, 0.8]], ['glass', [0.21, 0.3, 0.5, 0.7, 0.9]]]
  for (const [key, locals] of cases) {
    const texts = PARKIWELL.acts.find((a) => a.key === key).callouts.map((c) => c.text)
    for (const local of locals) {
      const anchors = anchorsAt(key, local, width, height, true)
      for (let k = 1; k < anchors.length; k++) assert.ok(anchors[k].y > anchors[k - 1].y, `${key} ${local}: anchor ${k} is not below anchor ${k - 1}`)
      for (const drop of [0, 80, 240]) {
        const callouts = boxes(texts, { left: 20, max: 350, char: 7.3, pad: 22, line: 17, gap: 6, bottom: height - 34 + drop })
        assert.ok(Math.min(...callouts.map((b) => b.top)) > Math.max(...anchors.map((a) => a.y)), `${key} ${local}: a callout reaches above an anchor`)
        const routes = routeLeaders(callouts, anchors, true)
        assertClean(routes, callouts, `390x844 ${key} ${local} drop ${drop}`)
        routes.forEach((route, i) => {
          // The lanes stay in the gutter, left of every callout and inside the frame, the top anchor's outermost.
          const lane = route[1].x
          assert.ok(lane >= 3 && lane <= 20 - LANE.inset, `${key} ${local}: lane ${i} at x ${lane}`)
          if (i > 0) assert.ok(lane > routes[i - 1][1].x, `${key} ${local}: lane ${i} is not inside lane ${i - 1}`)
          // Each leader turns right onto its anchor, so it never crosses the screen it names to reach it.
          assert.ok(route[3].x > lane, `${key} ${local}: leader ${i} reaches its anchor from the right`)
        })
      }
    }
  }
})

test('wide leaders at 1440 by 900 turn at one shared x and never cross while the copy rides', () => {
  // The wide callouts are .88rem mono (about 8.45 px a character) in panels of 14 px by 10 px padding and a 1 px
  // border, at most the 500 px rail, 12 px apart, top to bottom from the block's ridden top.
  const width = 1440, height = 900
  const cases = [['hand', [0.2, 0.5, 0.8]], ['glass', [0.21, 0.3, 0.5, 0.7, 0.9]]]
  for (const [key, locals] of cases) {
    const texts = PARKIWELL.acts.find((a) => a.key === key).callouts.map((c) => c.text)
    for (const local of locals) {
      const anchors = anchorsAt(key, local, width, height, false)
      for (const top of [250, 400, 550]) {
        const callouts = boxes(texts, { left: 86, max: 500, char: 8.45, pad: 30, line: 20.4, gap: 12, top })
        const routes = routeLeaders(callouts, anchors, false)
        assertClean(routes, callouts, `1440x900 ${key} ${local} top ${top}`)
        const turn = Math.max(...callouts.map((b) => b.right)) + 8
        routes.forEach((route) => assert.equal(route[1].x, turn))
      }
    }
  }
})

test('a hidden leader leaves the other phone lanes where they were', () => {
  const callouts = [0, 1, 2, 3].map((k) => ({ left: 20, top: 800 - 40 * k, right: 200, bottom: 830 - 40 * k }))
  const anchors = [0, 1, 2, 3].map((k) => ({ x: 100, y: 200 + 80 * k }))
  const all = routeLeaders(callouts, anchors, true)
  const some = routeLeaders(callouts.map((b, k) => (k === 1 ? null : b)), anchors, true)
  assert.equal(some[1], null)
  for (const k of [0, 2, 3]) assert.equal(some[k][1].x, all[k][1].x, `lane ${k} moved`)
})
