import assert from 'node:assert/strict'
import test from 'node:test'
import { actWindows } from '../../src/components/teardown/timeline.ts'
import { ACT_SCREEN, FOCAL, LAYER_Z, PHONE, anchorWorld, backdropAt, basis, planePoint, poseAt, projectPoint, roomDrift } from '../../src/components/teardown/rig.ts'
import { PARKIWELL } from '../../src/content/teardown/parkiwell.ts'

const windows = actWindows(PARKIWELL.acts)
const backdrops = PARKIWELL.acts.map((a) => a.backdrop)
const still = { dragYaw: 0, tiltX: 0, tiltY: 0 }
const at = (progress, narrow = false, aspect = narrow ? 0.46 : 1.6) => poseAt({ progress, windows, backdrops, narrow, aspect, interaction: still, poseFrames: PARKIWELL.pose.frames })
const w = (key) => windows.find((x) => x.key === key)
/** Chapter progress at `local` within an act. */
const inAct = (key, local) => w(key).start + (w(key).end - w(key).start) * local
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps
const length = (v) => Math.hypot(v[0], v[1], v[2])
/** Projected corners of a rectangle given as [center, right, up, halfW, halfH]. */
const corners = (pose, aspect, [c, r, u, hw, hh]) =>
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => projectPoint(pose, c.map((v, k) => v + r[k] * a * hw + u[k] * b * hh), aspect))
const xSpan = (pose, aspect, rect) => {
  const xs = corners(pose, aspect, rect).map((p) => p.x)
  return [Math.min(...xs), Math.max(...xs)]
}
const planeRect = (p) => [p.center, p.right, p.up, p.halfW, p.halfH]
const chassisRect = (pose) => [pose.phone.pos, pose.phone.right, pose.phone.up, PHONE.hx, PHONE.hy]
const glassRect = (pose) => [pose.glass.center, pose.phone.right, pose.phone.up, PHONE.sx, PHONE.sy]

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

test('the explode amount is zero outside acts 5 to 7 and rises through the first 80% of act 5', () => {
  for (const key of ['arrival', 'hand', 'day', 'quiet']) {
    assert.equal(at((w(key).start + w(key).end) / 2).explode, 0)
  }
  assert.equal(at(1).explode, 0)
  let last = -1
  for (let i = 0; i <= 32; i++) {
    const e = at(inAct('glass', 0.8 * (i / 32))).explode
    assert.ok(e >= last - 1e-12)
    last = e
  }
  assert.ok(at(inAct('glass', 0.5)).explode > 0.5)
  assert.ok(last > 0.95)
  assert.ok(at(inAct('proof', 0.5)).explode > 0.99, 'the stack stays apart through the proof act')
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

test('planePoint scales with the basis and anchorWorld reads screen anchors through it', () => {
  const pose = at(inAct('hand', 0.5))
  const corner = planePoint(pose.screen, 1, -1)
  const expected = pose.screen.center.map((v, i) => v + pose.screen.right[i] * pose.screen.halfW - pose.screen.up[i] * pose.screen.halfH)
  corner.forEach((v, i) => assert.ok(near(v, expected[i])))
  const anchor = anchorWorld(pose, { plane: 'screen', u: -0.6, v: 0.64 })
  planePoint(pose.screen, -0.6, 0.64).forEach((v, i) => assert.ok(near(v, anchor[i])))
})

test('backdrops crossfade between room acts and hold the last room as a dim field in acts without one', () => {
  const quietLate = backdropAt(windows, backdrops, w('quiet').end - 1e-6)
  assert.ok(near(quietLate.gain, 0.45, 1e-6))
  assert.equal(quietLate.glyphOnly, 1)
  assert.equal(quietLate.a, PARKIWELL.acts.find((a) => a.key === 'day').backdrop)
  const quietMid = backdropAt(windows, backdrops, (w('quiet').start + w('quiet').end) / 2)
  assert.ok(quietMid.gain > 0.45 && quietMid.gain < 0.9, 'the room dims across the quiet act instead of at its start')
  assert.ok(quietMid.glyphOnly > 0 && quietMid.glyphOnly < 1, 'the photograph under the glyphs fades across the quiet act')
  const handStart = backdropAt(windows, backdrops, w('hand').start + 1e-6)
  assert.equal(handStart.a, 0)
  assert.equal(handStart.b, 1)
  assert.ok(handStart.mix < 0.05)
  const handLate = backdropAt(windows, backdrops, w('hand').end - 1e-6)
  assert.equal(handLate.mix, 1)
  assert.ok(near(handLate.gain, 0.9, 1e-6))
  assert.equal(handLate.glyphOnly, 0, 'a room act shows the photograph under its glyphs')
})

test('a room act after a dark act dissolves from the held room back to full brightness', () => {
  const held = PARKIWELL.acts.find((a) => a.key === 'day').backdrop
  const coach = PARKIWELL.acts.find((a) => a.key === 'coach').backdrop
  const start = backdropAt(windows, backdrops, w('coach').start + 1e-6)
  assert.equal(start.a, held)
  assert.equal(start.b, coach)
  assert.ok(start.mix < 0.05 && start.glyphOnly > 0.95 && start.gain < 0.46)
  const late = backdropAt(windows, backdrops, w('coach').end - 1e-6)
  assert.equal(late.mix, 1)
  assert.equal(late.glyphOnly, 0)
  assert.ok(near(late.gain, 0.9, 1e-6))
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

test('the room prints in from the page over the first 8.5% of the chapter and dissolves back into it with the close scatter', () => {
  // The stage pins and unpins with no room drawn, so the page background runs through it at both edges.
  assert.equal(at(0).backdrop.reveal, 0)
  assert.equal(at(1).backdrop.reveal, 0)
  assert.ok(near(at(0.0425).backdrop.reveal, 0.5, 1e-6), `reveal at the print's midpoint: ${at(0.0425).backdrop.reveal}`)
  assert.ok(near(at(0.085).backdrop.reveal, 1, 1e-6), `reveal at the end of the print: ${at(0.085).backdrop.reveal}`)
  assert.ok(near(at(0.93).backdrop.reveal, 1, 1e-6), `reveal at the start of the dissolve: ${at(0.93).backdrop.reveal}`)
  assert.ok(near(at(0.961).backdrop.reveal, 0.5, 1e-6), `reveal at the dissolve's midpoint: ${at(0.961).backdrop.reveal}`)
  assert.equal(at(0.992).backdrop.reveal, 0)
  // The dissolve ends with the phone's scatter, so no room outlives the product, and the room's gain stays the
  // act's own, so the print and the dissolve are the chapter's only edge fades.
  assert.equal(at(0.992).gather, 0)
  assert.ok(near(at(0).backdrop.gain, 0.9, 1e-6), `gain at the pin: ${at(0).backdrop.gain}`)
})

test('each room pans over its own time on screen, at a bounded rate, and the pose carries both slots', () => {
  // The morning room (0) opens the chapter and is held through proof, so its pan caps at 0.4 of progress and rests.
  assert.equal(roomDrift(windows, backdrops, 0, 0), 0)
  assert.ok(near(roomDrift(windows, backdrops, 0, 0.2), 0.5, 1e-9))
  assert.equal(roomDrift(windows, backdrops, 0, 0.5), 1)
  // The hands room (1) shows in the hand act and dissolves out in the day act, 0.267 of progress, so it pans over
  // that span and is done by the end of the day act.
  const hand = w('hand')
  assert.equal(roomDrift(windows, backdrops, 1, hand.start - 1e-6), 0)
  assert.ok(roomDrift(windows, backdrops, 1, hand.end) > 0.3)
  assert.equal(roomDrift(windows, backdrops, 1, w('day').end), 1)
  // The evening room (3) is on screen for only the close act, under the 0.25 floor, so it pans part way.
  const evening = roomDrift(windows, backdrops, 3, 1)
  assert.ok(evening > 0.3 && evening < 0.4, `evening drift at the end: ${evening}`)
  assert.equal(roomDrift(windows, backdrops, 9, 0.5), 0, 'a room no act uses never pans')
  // Each slot carries its own room's drift, and both are continuous across every act boundary.
  for (const win of windows.slice(1)) {
    const before = at(win.start - 1e-6).backdrop
    const after = at(win.start + 1e-6).backdrop
    for (const [room, drift] of [[before.a, before.driftA], [before.b, before.driftB]]) {
      const now = after.a === room ? after.driftA : after.b === room ? after.driftB : null
      if (now !== null) assert.ok(Math.abs(drift - now) < 1e-3, `room ${room} drift jumps entering ${win.key}`)
    }
  }
  for (let i = 0; i <= 100; i++) {
    const { driftA, driftB } = at(i / 100).backdrop
    assert.ok(driftA >= 0 && driftA <= 1 && driftB >= 0 && driftB <= 1, `drifts at ${i / 100}: ${driftA} ${driftB}`)
  }
  // At the end the close act is still dissolving from the chair room (slot a) into the evening room (slot b).
  const end = at(1).backdrop
  assert.equal(end.b, 3)
  assert.ok(near(end.driftB, evening, 1e-9))
})

test('the pose is continuous across every act boundary', () => {
  for (const narrow of [false, true]) {
    for (const win of windows.slice(1)) {
      const before = at(win.start - 1e-6, narrow)
      const after = at(win.start + 1e-6, narrow)
      const close = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-3, `${what} jumps entering ${win.key} (${narrow ? 'narrow' : 'wide'}): ${a} to ${b}`)
      for (let i = 0; i < 3; i++) {
        close(before.phone.pos[i], after.phone.pos[i], `phone.pos[${i}]`)
        close(before.phone.normal[i], after.phone.normal[i], `phone.normal[${i}]`)
        close(before.camera.pos[i], after.camera.pos[i], `camera.pos[${i}]`)
        close(before.screen.center[i], after.screen.center[i], `screen.center[${i}]`)
        before.cards.forEach((card, k) => close(card.center[i], after.cards[k].center[i], `card ${k} center[${i}]`))
      }
      close(before.camera.shift[0], after.camera.shift[0], 'shift x')
      close(before.explode, after.explode, 'explode')
      close(before.screen.develop, after.screen.develop, 'screen develop')
      close(before.decode, after.decode, 'decode')
    }
  }
})

test('the drifts keep the phone and the camera moving late in an act', () => {
  // Every ramp eases to a stop at the end of its act, so without the drifts and the station step the last few
  // percent of the glass act would be nearly still.
  const a = at(inAct('glass', 0.96))
  const b = at(inAct('glass', 0.99))
  assert.ok(Math.abs(a.phone.normal[0] - b.phone.normal[0]) > 1e-4, 'yaw drifts')
  assert.ok(Math.abs(a.phone.pos[1] - b.phone.pos[1]) > 1e-4, 'the phone drifts vertically')
  assert.ok(Math.abs(a.camera.pos[1] - b.camera.pos[1]) > 1e-5, 'the camera drifts vertically')
  // The sink runs the whole chapter and the station steps lift the phone back by most of it, so the phone ends
  // between 0.08 and 0.2 lower than it starts, against the 0.6 the sink alone would drop it.
  const drop = at(0).phone.pos[1] - at(1).phone.pos[1]
  assert.ok(drop > 0.08 && drop < 0.2, `net drop over the chapter: ${drop}`)
})

test('the product forms from glyphs in act 1 and dissolves back before the end of act 8', () => {
  assert.equal(at(0).decode, 0)
  assert.equal(at(1).decode, 0)
  assert.ok(at((w('hand').start + w('hand').end) / 2).decode > 0.99)
  assert.ok(at(inAct('arrival', 0.5)).decode > 0.3 && at(inAct('arrival', 0.5)).decode < 0.7, 'the arrival decode runs across the act')
  assert.ok(at(inAct('close', 0.5)).decode > 0.99, 'the close holds the real render through its first half')
  // The dissolve ends at 0.82 and the scatter at 0.9 of the close, so both complete while the stage is still pinned.
  assert.equal(at(inAct('close', 0.82)).decode, 0, 'the dissolve completes while the stage is still pinned')
  // The gather reverses behind the dissolve, so the characters drift apart instead of holding a phone-shaped block.
  assert.equal(at(0).gather, 0)
  assert.equal(at(inAct('close', 0.62)).gather, 1)
  assert.ok(at(inAct('close', 0.75)).gather > 0 && at(inAct('close', 0.75)).gather < 1, 'the scatter runs behind the dissolve')
  assert.equal(at(inAct('close', 0.9)).gather, 0)
  assert.equal(at(1).gather, 0)
})

test('the coach screen is solid and unghosted before the figure starts to draw', () => {
  // The coach screen swaps in by 0.12 of the act and the figure draws from 0.25. The proof dimming and the code
  // layer are gone by 0.3 and the stack is nearly closed, so the screen is not seen through the code or the chassis.
  const swapped = at(inAct('coach', 0.12))
  assert.ok(swapped.screen.opacity > 0.5, `screen opacity at the end of the swap: ${swapped.screen.opacity}`)
  const drawing = at(inAct('coach', 0.25))
  assert.ok(drawing.screen.opacity > 0.9 && drawing.code.opacity < 0.1, `screen ${drawing.screen.opacity} and code ${drawing.code.opacity} opacity as the figure starts`)
  const settled = at(inAct('coach', 0.3))
  assert.equal(settled.screen.opacity, 1)
  assert.equal(settled.code.opacity, 0)
  assert.ok(settled.explode < 0.25, `explode at 0.3 of the coach act: ${settled.explode}`)
  assert.ok(at(inAct('coach', 0.4)).explode < 0.081, 'the stack is closed by 0.4 of the coach act')
  assert.ok(at(inAct('coach', 0.25)).coach.amount < 1e-9, 'the figure has not started to draw at 0.25')
})

test('each narrow deck card is whole in frame through the middle of its window and never with two neighbours', () => {
  // The day camera shows 0.54 to 0.65 world units of half-width at a card's depth, so a card of half-width 0.335
  // is whole in frame while |x| is under about 0.21, which the 0.85 reach holds from 0.3 to 0.72 of the card's
  // window. The fades span the same 0.3 at each end, so a card is opaque only while it is whole.
  const aspect = 0.46
  for (let i = 0; i < 4; i++) {
    const s = 0.04 + i * 0.2
    for (const wnd of [0.3, 0.5, 0.7]) {
      const pose = at(inAct('day', s + wnd * 0.36), true, aspect)
      const card = pose.cards[i]
      assert.ok(card.opacity > 0.999, `card ${i} is opaque at ${wnd} of its window: ${card.opacity}`)
      for (const p of corners(pose, aspect, planeRect(card))) {
        assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, `card ${i} corner at ${wnd} of its window: ${p.x} ${p.y}`)
      }
    }
    // A card enters and leaves through its fades, so a clipped card is translucent.
    for (const wnd of [0.1, 0.2, 0.8, 0.9]) {
      const card = at(inAct('day', s + wnd * 0.36), true, aspect).cards[i]
      assert.ok(card.opacity > 0 && card.opacity < 0.9, `card ${i} is translucent at ${wnd} of its window: ${card.opacity}`)
    }
  }
  for (let k = 0; k <= 100; k++) {
    const shown = at(inAct('day', k / 100), true, aspect).cards.filter((card) => card.opacity > 0).length
    assert.ok(shown <= 2, `${shown} deck cards shown at day ${k / 100}`)
  }
})

test('exploded layers fan out sideways so they do not stack in projection', () => {
  const pose = at(inAct('glass', 0.6))
  const a = projectPoint(pose, pose.glass.center, 1.6)
  const b = projectPoint(pose, pose.screen.center, 1.6)
  assert.ok(Math.abs(a.x - b.x) > 0.04, `glass and screen centres ${a.x} ${b.x}`)
  // On wide screens each layer steps sideways by more than the screen's projected half-width.
  const half = Math.abs(projectPoint(pose, planePoint(pose.screen, 1, 0), 1.6).x - b.x)
  const xs = [pose.glass.center, pose.screen.center, pose.code.center, pose.phone.pos].map((p) => projectPoint(pose, p, 1.6).x)
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i - 1] - xs[i] > half, `step ${i}: ${xs[i - 1] - xs[i]} against half-width ${half}`)
})

test('every layer of the exploded stack stays inside the frame through act 5', () => {
  // Wide covers tablets in portrait (0.75) up to a 1440x900 desktop. Narrow is a phone in portrait.
  for (const [narrow, aspect] of [[false, 0.75], [false, 1.0], [false, 1.33], [false, 1.6], [true, 0.46]]) {
    for (let i = 1; i <= 9; i++) {
      const pose = at(inAct('glass', i / 10), narrow, aspect)
      const layers = { glass: glassRect(pose), screen: planeRect(pose.screen), code: planeRect(pose.code), chassis: chassisRect(pose) }
      for (const [name, rect] of Object.entries(layers)) {
        for (const p of corners(pose, aspect, rect)) {
          assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, `${narrow ? 'narrow' : 'wide'} ${aspect} ${name} corner at glass ${i / 10}: ${p.x} ${p.y}`)
        }
      }
    }
  }
})

test('the wide day act keeps the phone, its screen, and every shown card inside the frame', () => {
  // 1024x768, 1280x800, and 1440x900 are 1.33 and 1.6. The others cover tablets in portrait and ultra-wide.
  for (const aspect of [0.75, 1.0, 1.33, 1.6, 2.0]) {
    for (let i = 1; i <= 19; i++) {
      const pose = at(inAct('day', i / 20), false, aspect)
      const parts = { chassis: chassisRect(pose), screen: planeRect(pose.screen) }
      pose.cards.forEach((card, k) => { if (card.opacity > 0) parts[`card ${k}`] = planeRect(card) })
      for (const [name, rect] of Object.entries(parts)) {
        for (const p of corners(pose, aspect, rect)) {
          assert.ok(p.x >= 0.02 && p.x <= 0.98 && p.y >= 0.02 && p.y <= 0.98, `${aspect} ${name} corner at day ${i / 20}: ${p.x} ${p.y}`)
        }
      }
    }
  }
})

test('the wide day row is the phone then the cards in order, centred, without overlaps', () => {
  for (const aspect of [0.75, 1.33, 1.6, 2.0]) {
    const pose = at(inAct('day', 0.99), false, aspect)
    const phone = Math.max(xSpan(pose, aspect, chassisRect(pose))[1], xSpan(pose, aspect, planeRect(pose.screen))[1])
    const cards = pose.cards.map((card) => xSpan(pose, aspect, planeRect(card)))
    assert.ok(cards[0][0] > phone, `${aspect}: card 0 starts at ${cards[0][0]}, phone ends at ${phone}`)
    for (let k = 1; k < cards.length; k++) assert.ok(cards[k][0] > cards[k - 1][1], `${aspect}: card ${k} starts at ${cards[k][0]}, card ${k - 1} ends at ${cards[k - 1][1]}`)
    const left = xSpan(pose, aspect, chassisRect(pose))[0]
    const right = 1 - cards[cards.length - 1][1]
    assert.ok(left > 0.03 && left < 0.14, `${aspect}: left margin ${left}`)
    assert.ok(right > 0.03 && right < 0.14, `${aspect}: right margin ${right}`)
    assert.ok(Math.abs(left - right) < 0.03, `${aspect}: margins ${left} and ${right} are not centred`)
  }
})

test('wide day cards peel off the front of the screen and land at 0.86 scale', () => {
  const start = at(inAct('day', 0.08))
  const card = start.cards[0]
  assert.equal(card.opacity, 0)
  assert.ok(near(length(card.right), 1, 1e-9) && near(length(card.up), 1, 1e-9), 'a card still on the screen has the screen\'s scale')
  // At its start the card sits 0.02 in front of the screen along the screen normal.
  const front = start.screen.center.map((v, i) => v - start.phone.normal[i] * 0.02)
  card.center.forEach((v, i) => assert.ok(near(v, front[i], 1e-6)))
  start.cards.slice(1).forEach((later) => assert.equal(later.opacity, 0))

  const mid = at(inAct('day', 0.29))
  assert.ok(mid.cards[0].opacity > 0.99 && mid.cards[0].develop > 0 && mid.cards[0].develop < 1, 'a card develops while it slides')

  // The last card lands exactly at the end of the act, so the fan is in motion for the whole act.
  const landed = at(inAct('day', 1))
  landed.cards.forEach((c, k) => {
    assert.ok(near(length(c.right), 0.86, 1e-6) && near(length(c.up), 0.86, 1e-6), `card ${k} scale`)
    assert.equal(c.develop, 1)
    assert.equal(c.opacity, 1)
    assert.equal(c.halfW, PHONE.sx)
  })
  const late = at(inAct('day', 0.9)).cards[3]
  assert.ok(length(late.right) > 0.865 && late.opacity > 0.99 && late.develop === 1, 'the last card is developed but still sliding to its slot at 90% of the act')
  // Card k starts at local 0.08 + 0.14 k, so just before that it is still hidden while card k - 1 is more than half
  // shown. The slides overlap, so card k - 1 is still fading in when card k starts.
  for (let k = 1; k < landed.cards.length; k++) {
    const before = at(inAct('day', 0.08 + k * 0.14 - 0.01))
    assert.equal(before.cards[k].opacity, 0, `card ${k} waits its turn`)
    assert.ok(before.cards[k - 1].opacity > 0.5, `card ${k - 1} is more than half shown before card ${k} starts`)
  }
})

test('in the quiet act the cards slide home, fade before they arrive, and never re-encode', () => {
  const slot = at(inAct('day', 0.99)).cards[1].center
  let lastGap = Infinity
  for (let i = 0; i <= 10; i++) {
    const pose = at(inAct('quiet', 0.7 * (i / 10)))
    const card = pose.cards[1]
    assert.equal(card.develop, 1, `develop held at quiet ${0.7 * (i / 10)}`)
    const gap = Math.hypot(...card.center.map((v, k) => v - pose.screen.center[k]))
    assert.ok(gap <= lastGap + 1e-9, 'the card only ever approaches the screen')
    lastGap = gap
  }
  // The cards fade over the first 30% of the act, so they are gone while still most of the way out to their slots.
  const faded = at(inAct('quiet', 0.3)).cards[1]
  assert.equal(faded.opacity, 0)
  assert.ok(at(inAct('quiet', 0.15)).cards[1].opacity < 0.6, 'the cards are half gone by the middle of the fade window')
  const slotGap = Math.hypot(...slot.map((v, k) => v - at(inAct('day', 0.99)).screen.center[k]))
  const fadedGap = Math.hypot(...faded.center.map((v, k) => v - at(inAct('quiet', 0.3)).screen.center[k]))
  assert.ok(fadedGap > 0.4 * slotGap, 'the card is gone before it is more than 60% of the way home')
  assert.equal(at(inAct('glass', 0.5)).cards[1].opacity, 0)
})

test('the main screen shows each act\'s screen and re-encodes briefly at every swap', () => {
  const keys = new Set(PARKIWELL.screens.map((s) => s.key))
  for (const [key, screen] of Object.entries(ACT_SCREEN)) {
    assert.ok(keys.has(screen), `${key} names a screen the story has`)
    assert.equal(at(inAct(key, 0.5)).screen.texture, screen)
  }
  assert.equal(at(inAct('hand', 0.5)).screen.texture, 'log')
  assert.equal(at(inAct('coach', 0.5)).screen.texture, 'coach')
  assert.equal(at(inAct('close', 0.5)).screen.texture, 'results')
  // A swap dips the develop to 0.05 at 6% of the act and restores it by 12%. The texture changes at the dip's
  // bottom, where the shader's scan has resolved no cell past about 10%, so the screen it leaves and the one it
  // reveals are both drawn as glyphs at that instant.
  for (const [key, from] of [['hand', 'welcome'], ['day', 'log'], ['coach', 'home'], ['close', 'coach']]) {
    assert.ok(at(inAct(key, 0)).screen.develop > 0.99, `${key} enters at full develop`)
    assert.equal(at(inAct(key, 0.03)).screen.texture, from, `${key} keeps the previous screen into the dip`)
    const before = at(inAct(key, 0.0595)).screen
    const after = at(inAct(key, 0.0605)).screen
    assert.equal(before.texture, from)
    assert.equal(after.texture, ACT_SCREEN[key])
    assert.ok(near(before.develop, 0.05, 0.01) && near(after.develop, 0.05, 0.01), `${key} swaps at the dip's bottom: ${before.develop} ${after.develop}`)
    assert.ok(at(inAct(key, 0.12)).screen.develop > 0.99, `${key} restores the develop by 12%`)
  }
  // Acts that keep the previous screen never dip.
  for (const key of ['quiet', 'glass', 'proof']) assert.ok(at(inAct(key, 0.06)).screen.develop > 0.6, `${key} holds its screen`)
})

test('every screen the story lists is drawn by an act or a day card', () => {
  // The canvas loads every listed screen and waits for all of them before it switches to GL, so a screen nothing
  // draws delays the chapter for a download the visitor never sees.
  const drawn = new Set([...Object.values(ACT_SCREEN), ...PARKIWELL.cards.map((c) => c.screen)])
  for (const screen of PARKIWELL.screens) assert.ok(drawn.has(screen.key), `${screen.key} is loaded but never drawn`)
})

test('the quiet act turns the phone edge-on and dips the screen develop to about two thirds at full opacity', () => {
  const pose = at(inAct('quiet', 0.95))
  assert.ok(near(pose.screen.develop, 0.65, 0.015), `develop ${pose.screen.develop}`)
  assert.equal(pose.screen.opacity, 1)
  // Edge-on: the screen normal is nearly perpendicular to the view axis.
  assert.ok(Math.abs(pose.phone.normal[2]) < 0.3, `normal z ${pose.phone.normal[2]}`)
  assert.ok(Math.abs(at(inAct('day', 0.99)).phone.normal[2]) > 0.9, 'the day phone faces the camera')
  assert.ok(at(inAct('glass', 0.95)).screen.develop > 0.99, 'the glass act restores the screen')
})

test('the proof act keeps the product right of 0.44 of the width on wide screens', () => {
  for (const aspect of [0.75, 1.0, 1.33, 1.6, 2.0]) {
    for (const local of [0.85, 1]) {
      const pose = at(inAct('proof', local), false, aspect)
      const parts = [chassisRect(pose), planeRect(pose.screen), planeRect(pose.code), glassRect(pose)]
      const left = Math.min(...parts.map((rect) => xSpan(pose, aspect, rect)[0]))
      assert.ok(left >= 0.44, `${aspect} at proof ${local}: product starts at ${left}`)
    }
  }
})

test('the proof close-up and the start of the coach act keep the chassis and the screen inside the frame', () => {
  // 1024x768, 1280x800, and 1440x900 are 1.33 and 1.6. The glass stays fanned past the right edge, dimmed, so it is
  // left out. The sink has carried the phone 0.08 below its start by the end of proof, and the camera must follow.
  for (const aspect of [0.75, 1.0, 1.33, 1.6, 2.0]) {
    for (const [key, local] of [['proof', 0.85], ['proof', 1], ['coach', 0.1], ['coach', 0.25]]) {
      const pose = at(inAct(key, local), false, aspect)
      for (const [name, rect] of [['chassis', chassisRect(pose)], ['screen', planeRect(pose.screen)]]) {
        for (const p of corners(pose, aspect, rect)) {
          assert.ok(p.x >= 0.02 && p.x <= 0.98 && p.y >= 0.02 && p.y <= 0.98, `${aspect} ${name} corner at ${key} ${local}: ${p.x} ${p.y}`)
        }
      }
    }
  }
})

test('the proof camera follows the code layer, which sits centred in the space right of the copy rail', () => {
  for (const aspect of [1.33, 1.6]) {
    for (const local of [0.85, 1]) {
      const pose = at(inAct('proof', local), false, aspect)
      const centre = projectPoint(pose, pose.code.center, aspect)
      assert.ok(Math.abs(centre.y - 0.5) < 0.03, `${aspect} at proof ${local}: code centre y ${centre.y}`)
      assert.ok(centre.x > 0.68 && centre.x < 0.74, `${aspect} at proof ${local}: code centre x ${centre.x}`)
    }
  }
})

test('the screen half-extents keep the 1320x2868 capture aspect', () => {
  assert.ok(Math.abs(PHONE.sx / PHONE.sy - 1320 / 2868) < 0.002)
})
