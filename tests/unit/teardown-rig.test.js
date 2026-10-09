import assert from 'node:assert/strict'
import test from 'node:test'
import { actWindows } from '../../src/components/teardown/timeline.ts'
import { FOCAL, LAYER_Z, PHONE, anchorWorld, backdropAt, basis, poseAt, projectPoint } from '../../src/components/teardown/rig.ts'
import { PARKIWELL } from '../../src/content/teardown/parkiwell.ts'

const windows = actWindows(PARKIWELL.acts)
const backdrops = PARKIWELL.acts.map((a) => a.backdrop)
const still = { dragYaw: 0, tiltX: 0, tiltY: 0 }
const at = (progress, narrow = false, aspect = narrow ? 0.46 : 1.6) => poseAt({ progress, windows, backdrops, narrow, aspect, interaction: still, poseFrames: PARKIWELL.pose.frames })
const w = (key) => windows.find((x) => x.key === key)
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps
/** Projected corners of a rectangle given as [center, right, up, halfW, halfH]. */
const corners = (pose, aspect, [c, r, u, hw, hh]) =>
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => projectPoint(pose, c.map((v, k) => v + r[k] * a * hw + u[k] * b * hh), aspect))
const xSpan = (pose, aspect, rect) => {
  const xs = corners(pose, aspect, rect).map((p) => p.x)
  return [Math.min(...xs), Math.max(...xs)]
}
const planeRect = (p) => [p.center, p.right, p.up, p.halfW, p.halfH]
const chassisRect = (pose) => [pose.phone.pos, pose.phone.right, pose.phone.up, PHONE.hx, PHONE.hy]

test('basis is orthonormal for any yaw and pitch', () => {
  for (const [yaw, pitch] of [[0, 0], [0.7, -0.3], [-1.4, 0.9]]) {
    const { right, up, normal } = basis(yaw, pitch)
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    assert.ok(near(dot(right, right), 1) && near(dot(up, up), 1) && near(dot(normal, normal), 1))
    assert.ok(near(dot(right, up), 0) && near(dot(up, normal), 0) && near(dot(right, normal), 0))
  }
})

test('the phone is assembled at the start and the end of the chapter', () => {
  for (const progress of [0, 1]) {
    for (const narrow of [false, true]) {
      const pose = at(progress, narrow)
      assert.equal(pose.explode, 0)
      const expected = pose.phone.pos.map((v, i) => v + pose.phone.normal[i] * LAYER_Z.screen)
      pose.screen.center.forEach((v, i) => assert.ok(near(v, expected[i], 1e-6)))
    }
  }
})

test('the explode amount is zero outside acts 5 to 7 and rises through the first half of act 5', () => {
  for (const key of ['arrival', 'hand', 'day', 'quiet']) {
    assert.equal(at((w(key).start + w(key).end) / 2).explode, 0)
  }
  assert.equal(at(1).explode, 0)
  let last = -1
  const g = w('glass')
  for (let i = 0; i <= 20; i++) {
    const e = at(g.start + (g.end - g.start) * 0.5 * (i / 20)).explode
    assert.ok(e >= last - 1e-12)
    last = e
  }
  assert.ok(last > 0.95)
})

test('card develop and opacity values stay within 0 to 1', () => {
  for (let i = 0; i <= 200; i++) {
    for (const narrow of [false, true]) {
      const pose = at(i / 200, narrow)
      for (const card of pose.cards) {
        assert.ok(card.develop >= 0 && card.develop <= 1)
        assert.ok(card.opacity >= 0 && card.opacity <= 1)
      }
      assert.ok(pose.screen.develop >= 0 && pose.screen.develop <= 1)
    }
  }
})

test('projectPoint matches a hand-computed pinhole projection with lens shift', () => {
  const pose = at(0)
  const c = pose.camera
  const point = [0.3, -0.2, c.pos[2] + 2]
  const got = projectPoint(pose, point, 1.6)
  const uvX = (FOCAL * (0.3 - c.pos[0])) / 2 + c.shift[0]
  const uvY = (FOCAL * (-0.2 - c.pos[1])) / 2 + c.shift[1]
  assert.ok(near(got.x, (uvX / 1.6 + 1) / 2))
  assert.ok(near(got.y, (1 - uvY) / 2))
  assert.equal(projectPoint(pose, [0, 0, c.pos[2] - 1], 1.6), null)
})

test('a screen anchor at the plane centre projects inside the viewport during the hand act', () => {
  const pose = at((w('hand').start + w('hand').end) / 2)
  const p = projectPoint(pose, anchorWorld(pose, { plane: 'screen', u: 0, v: 0 }), 1.6)
  assert.ok(p.x > 0.3 && p.x < 0.95 && p.y > 0.1 && p.y < 0.9)
})

test('backdrops crossfade between photo acts and hold the last room as glyphs in acts without one', () => {
  const quietMid = (w('quiet').start + w('quiet').end) / 2
  const quiet = backdropAt(windows, backdrops, quietMid)
  assert.ok(quiet.gain <= 0.21)
  assert.equal(quiet.glyphOnly, 1)
  assert.equal(quiet.a, PARKIWELL.acts.find((a) => a.key === 'day').backdrop)
  const handStart = backdropAt(windows, backdrops, w('hand').start + 1e-6)
  assert.equal(handStart.a, 0)
  assert.equal(handStart.b, 1)
  assert.ok(handStart.mix < 0.05)
  const handLate = backdropAt(windows, backdrops, w('hand').end - 1e-6)
  assert.equal(handLate.mix, 1)
  assert.ok(handLate.gain > 0.6)
})

test('a photo act after a glyph-only act dissolves from the held room back to a photo', () => {
  const held = PARKIWELL.acts.find((a) => a.key === 'day').backdrop
  const coach = PARKIWELL.acts.find((a) => a.key === 'coach').backdrop
  const start = backdropAt(windows, backdrops, w('coach').start + 1e-6)
  assert.equal(start.a, held)
  assert.equal(start.b, coach)
  assert.ok(start.mix < 0.05 && start.glyphOnly > 0.95 && start.gain < 0.21)
  const late = backdropAt(windows, backdrops, w('coach').end - 1e-6)
  assert.equal(late.mix, 1)
  assert.equal(late.glyphOnly, 0)
  assert.ok(late.gain > 0.6)
})

test('backdrop state is continuous across every act boundary', () => {
  const weights = (s) => {
    const out = new Map()
    out.set(s.a, (out.get(s.a) ?? 0) + 1 - s.mix)
    out.set(s.b, (out.get(s.b) ?? 0) + s.mix)
    return out
  }
  for (const win of windows.slice(1)) {
    const before = backdropAt(windows, backdrops, win.start - 1e-7)
    const after = backdropAt(windows, backdrops, win.start + 1e-7)
    assert.ok(Math.abs(before.gain - after.gain) < 1e-3, `gain jumps entering ${win.key}`)
    assert.ok(Math.abs(before.glyphOnly - after.glyphOnly) < 1e-3, `glyphOnly jumps entering ${win.key}`)
    const wb = weights(before), wa = weights(after)
    for (const key of new Set([...wb.keys(), ...wa.keys()])) {
      assert.ok(Math.abs((wb.get(key) ?? 0) - (wa.get(key) ?? 0)) < 1e-3, `room ${key} jumps entering ${win.key}`)
    }
  }
})

test('the product forms from glyphs in act 1 and dissolves back at the end of act 8', () => {
  assert.equal(at(0).decode, 0)
  assert.equal(at(1).decode, 0)
  assert.ok(at((w('hand').start + w('hand').end) / 2).decode > 0.99)
})

test('exploded layers fan out sideways so they do not stack in projection', () => {
  const g = w('glass')
  const pose = at(g.start + (g.end - g.start) * 0.6)
  const a = projectPoint(pose, pose.glass.center, 1.6)
  const b = projectPoint(pose, pose.screen.center, 1.6)
  assert.ok(Math.abs(a.x - b.x) > 0.04, `glass and screen centres ${a.x} ${b.x}`)
  // On wide screens each layer steps sideways by more than the screen's projected half-width.
  const s = pose.screen
  const edge = s.center.map((v, i) => v + s.right[i] * s.halfW)
  const half = Math.abs(projectPoint(pose, edge, 1.6).x - b.x)
  const xs = [pose.glass.center, s.center, pose.code.center, pose.phone.pos].map((p) => projectPoint(pose, p, 1.6).x)
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i - 1] - xs[i] > half, `step ${i}: ${xs[i - 1] - xs[i]} against half-width ${half}`)
})

test('every layer of the exploded stack stays inside the frame through act 5', () => {
  const g = w('glass')
  // Wide covers tablets in portrait (0.75) up to a 1440x900 desktop. Narrow is a phone in portrait.
  for (const [narrow, aspect] of [[false, 0.75], [false, 1.0], [false, 1.33], [false, 1.6], [true, 0.46]]) {
    for (let i = 1; i <= 9; i++) {
      const pose = at(g.start + (g.end - g.start) * (i / 10), narrow, aspect)
      const layers = {
        glass: [pose.glass.center, pose.phone.right, pose.phone.up, PHONE.sx, PHONE.sy],
        screen: planeRect(pose.screen),
        code: planeRect(pose.code),
        chassis: chassisRect(pose),
      }
      for (const [name, rect] of Object.entries(layers)) {
        for (const p of corners(pose, aspect, rect)) {
          assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, `${narrow ? 'narrow' : 'wide'} ${aspect} ${name} corner at glass ${i / 10}: ${p.x} ${p.y}`)
        }
      }
    }
  }
})

test('the wide day act keeps the phone, its lifted screen, and every shown card inside the frame', () => {
  const d = w('day')
  for (const aspect of [0.75, 1.0, 1.33, 1.6, 2.0]) {
    for (let i = 1; i <= 19; i++) {
      const pose = at(d.start + (d.end - d.start) * (i / 20), false, aspect)
      const parts = { chassis: chassisRect(pose), screen: planeRect(pose.screen) }
      pose.cards.forEach((card, k) => { if (card.opacity > 0) parts[`card ${k}`] = planeRect(card) })
      for (const [name, rect] of Object.entries(parts)) {
        for (const p of corners(pose, aspect, rect)) {
          assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, `${aspect} ${name} corner at day ${i / 20}: ${p.x} ${p.y}`)
        }
      }
    }
  }
})

test('the wide day cards fan across the width in order without overlapping the phone or each other', () => {
  const d = w('day')
  for (const aspect of [0.75, 1.33, 1.6, 2.0]) {
    const pose = at(d.start + (d.end - d.start) * 0.95, false, aspect)
    const phone = Math.max(xSpan(pose, aspect, chassisRect(pose))[1], xSpan(pose, aspect, planeRect(pose.screen))[1])
    const cards = pose.cards.map((card) => xSpan(pose, aspect, planeRect(card)))
    assert.ok(cards[0][0] > phone, `${aspect}: card 0 starts at ${cards[0][0]}, phone ends at ${phone}`)
    for (let k = 1; k < cards.length; k++) assert.ok(cards[k][0] > cards[k - 1][1], `${aspect}: card ${k} starts at ${cards[k][0]}, card ${k - 1} ends at ${cards[k - 1][1]}`)
    assert.ok(cards[cards.length - 1][1] > 0.9, `${aspect}: last card ends at ${cards[cards.length - 1][1]}`)
  }
})

test('the screen half-extents keep the 1320x2868 capture aspect', () => {
  assert.ok(Math.abs(PHONE.sx / PHONE.sy - 1320 / 2868) < 0.002)
})
