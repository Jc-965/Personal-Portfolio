import assert from 'node:assert/strict'
import test from 'node:test'
import { actWindows } from '../../src/components/teardown/timeline.ts'
import { ACT_SCREEN, FOCAL, LAYER_Z, PHONE, anchorWorld, backdropAt, basis, coachWorld, planePoint, poseAt, projectPoint, projectRect, restPoints } from '../../src/components/teardown/rig.ts'
import { COACH_JOINTS, jointsAt } from '../../src/components/teardown/coach.ts'
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

test('the explode amount is zero outside acts 5 and 6 and rises through the first 40% of act 5', () => {
  for (const key of ['arrival', 'hand', 'day', 'quiet']) {
    assert.equal(at((w(key).start + w(key).end) / 2).explode, 0)
  }
  assert.equal(at(1).explode, 0)
  let last = -1
  for (let i = 0; i <= 32; i++) {
    const e = at(inAct('glass', 0.4 * (i / 32))).explode
    assert.ok(e >= last - 1e-12)
    last = e
  }
  const half = at(inAct('glass', 0.2)).explode
  assert.ok(half > 0.45 && half < 0.55, `the stack is half apart at 20% of the glass act: ${half}`)
  assert.equal(last, 1, 'the stack is fully apart by 40% of the glass act and holds')
  // The revealed stack, the code layer included, holds for the act's last 60%, about 2.6 viewport-heights.
  for (const local of [0.4, 0.65, 0.9]) {
    const pose = at(inAct('glass', local))
    assert.equal(pose.explode, 1, `explode at glass ${local}`)
    assert.equal(pose.code.opacity, 1, `code opacity at glass ${local}`)
  }
  assert.ok(at(inAct('proof', 0.5)).explode > 0.99, 'the stack stays apart while the proof readout types')
  assert.ok(at(inAct('proof', 0.8)).explode > 0.99, 'the stack stays apart while the typed readout rests')
})

test('the stack is fully closed from the start of the coach act through the close, with the glass back on the screen', () => {
  for (const narrow of [false, true]) {
    for (let i = 0; i <= 40; i++) {
      for (const [key, from] of [['coach', 0], ['close', 0]]) {
        const pose = at(inAct(key, from + (1 - from) * (i / 40)), narrow)
        assert.equal(pose.explode, 0, `explode at ${key} ${from + (1 - from) * (i / 40)}`)
        const glass = pose.phone.pos.map((v, k) => v + pose.phone.normal[k] * LAYER_Z.glass)
        pose.glass.center.forEach((v, k) => assert.ok(near(v, glass[k], 1e-9), `glass centre at ${key} ${i / 40}`))
      }
    }
  }
})

test('the skeleton draws only once every layer is home', () => {
  for (const narrow of [false, true]) {
    for (let i = 0; i <= 400; i++) {
      const pose = at(i / 400, narrow)
      if (pose.explode > 0.01) assert.equal(pose.coach.amount, 0, `skeleton at ${i / 400} with explode ${pose.explode}`)
    }
  }
  assert.ok(at(inAct('coach', 0.12)).coach.amount < 1e-12)
  assert.ok(at(inAct('coach', 0.285)).coach.amount > 0.4 && at(inAct('coach', 0.285)).coach.amount < 0.6, 'the figure is half drawn at 0.285')
  assert.equal(at(inAct('coach', 0.45)).coach.amount, 1)
  // The figure is gone a tenth into the close, before the evening room has swapped in under it.
  assert.ok(at(inAct('close', 0.05)).coach.amount > 0, 'the figure fades over the close act\'s first tenth')
  assert.equal(at(inAct('close', 0.1)).coach.amount, 0)
})

test('each act reaches its station by half the act and holds it, with only the hold turn moving', () => {
  // The turn and the dolly end at RAMP_END, so between 0.5 and 0.99 of an act the camera's distance is unchanged
  // and the phone's normal moves only by the act's hold turn, at most 0.12 radians. The arrival turns with the
  // product's formation (0.65), the day row completes at 0.76, and proof's camera follows the code layer, so
  // those sample later or compare the normal alone.
  for (const [key, from] of [['arrival', 0.65], ['hand', 0.5], ['day', 0.76], ['quiet', 0.65], ['glass', 0.65], ['proof', 0.5], ['coach', 0.5], ['close', 0.5]]) {
    const a = at(inAct(key, from))
    const b = at(inAct(key, 0.99))
    const turn = Math.hypot(...a.phone.normal.map((v, k) => v - b.phone.normal[k]))
    assert.ok(turn < 0.11, `${key} keeps turning after ${from}: ${turn}`)
    if (key !== 'proof') assert.ok(Math.abs(a.camera.pos[2] - b.camera.pos[2]) < 1e-9, `${key} keeps dollying after ${from}`)
  }
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
  assert.ok(near(quietLate.gain, 0.3, 1e-6))
  assert.equal(quietLate.glyphOnly, 1)
  assert.equal(quietLate.a, PARKIWELL.acts.find((a) => a.key === 'day').backdrop)
  const quietMid = backdropAt(windows, backdrops, inAct('quiet', 0.25))
  assert.ok(quietMid.gain > 0.3 && quietMid.gain < 0.9, 'the room dims across the quiet act instead of at its start')
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

test('each room change takes about 0.6 viewport-heights, so every act holds its whole room', () => {
  // A change eases over 0.0328 of chapter progress from the start of its act, or 70% of a shorter act. With the
  // spans in parkiwell.ts it ends at 0.147 of the day act (card 0's hold starts at 0.144), 0.22 of the close, 0.474
  // of the hand and coach acts, and 0.44 of the quiet act.
  for (const [key, done] of [['hand', 0.475], ['day', 0.147], ['quiet', 0.445], ['coach', 0.475], ['close', 0.221]]) {
    const span = w(key).end - w(key).start
    assert.ok(near(Math.min(0.7, 0.0328 / span), done, 0.01), `${key} swap ends at ${0.0328 / span}`)
    const mid = backdropAt(windows, backdrops, inAct(key, done / 2))
    const whole = backdropAt(windows, backdrops, inAct(key, done))
    const late = backdropAt(windows, backdrops, inAct(key, 0.99))
    if (key === 'quiet') {
      assert.ok(mid.glyphOnly > 0 && mid.glyphOnly < 1, `quiet is still dimming at ${done / 2}`)
      assert.equal(whole.glyphOnly, 1, 'the quiet act holds the dimmed field once the change ends')
      assert.ok(near(whole.gain, late.gain, 1e-9))
      continue
    }
    assert.ok(mid.mix > 0 && mid.mix < 1, `${key} is still changing rooms at ${done / 2}: ${mid.mix}`)
    for (const state of [whole, late]) {
      assert.equal(state.mix, 1, `${key} shows its whole room from ${done}`)
      assert.equal(state.glyphOnly, 0)
      assert.ok(near(state.gain, 0.9, 1e-9))
    }
  }
})

test('a room act after a dark act dissolves from the held room back to full brightness', () => {
  const held = PARKIWELL.acts.find((a) => a.key === 'day').backdrop
  const coach = PARKIWELL.acts.find((a) => a.key === 'coach').backdrop
  const start = backdropAt(windows, backdrops, w('coach').start + 1e-6)
  assert.equal(start.a, held)
  assert.equal(start.b, coach)
  assert.ok(start.mix < 0.05 && start.glyphOnly > 0.95 && start.gain < 0.31)
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

test('the room prints in from the page over the first 63% of the arrival and dissolves back into it with the close scatter', () => {
  // The stage pins and unpins with no room drawn, so the page background runs through it at both edges. The print
  // ends just after the product has formed (decode reaches 1 at 0.62 of the arrival act). Both edges are fractions
  // of their acts, so a span change cannot move them off the product's phases.
  assert.equal(at(0).backdrop.reveal, 0)
  assert.equal(at(1).backdrop.reveal, 0)
  assert.ok(near(at(inAct('arrival', 0.315)).backdrop.reveal, 0.5, 1e-6), `reveal at the print's midpoint: ${at(inAct('arrival', 0.315)).backdrop.reveal}`)
  assert.ok(near(at(inAct('arrival', 0.63)).backdrop.reveal, 1, 1e-6), `reveal at the end of the print: ${at(inAct('arrival', 0.63)).backdrop.reveal}`)
  assert.equal(at(inAct('arrival', 0.62)).decode, 1)
  assert.ok(at(inAct('arrival', 0.6)).backdrop.reveal > 0.99, 'the room has printed by the time the product is solid')
  // The evening room is whole from 0.22 of the close, and the close holds it with the posed phone (from 0.5) and
  // the settled copy (from 0.4) until 0.66.
  for (const local of [0.23, 0.5, 0.66]) {
    const room = at(inAct('close', local)).backdrop
    assert.equal(room.b, 3, `the evening room is in slot b at close ${local}`)
    assert.equal(room.mix, 1, `the evening room is whole at close ${local}`)
  }
  assert.ok(near(at(inAct('close', 0.66)).backdrop.reveal, 1, 1e-6), `reveal at the start of the dissolve: ${at(inAct('close', 0.66)).backdrop.reveal}`)
  assert.ok(near(at(inAct('close', 0.805)).backdrop.reveal, 0.5, 1e-6), `reveal at the dissolve's midpoint: ${at(inAct('close', 0.805)).backdrop.reveal}`)
  assert.equal(at(inAct('close', 0.95)).backdrop.reveal, 0)
  // The dissolve ends with the phone's scatter, so no room outlives the product, and the room's gain stays the
  // act's own, so the print and the dissolve are the chapter's only edge fades.
  assert.equal(at(inAct('close', 0.95)).gather, 0)
  assert.ok(near(at(0).backdrop.gain, 0.9, 1e-6), `gain at the pin: ${at(0).backdrop.gain}`)
})

test('rooms carry no pan, so the backdrop pose is only which rooms show and how they blend', () => {
  for (let i = 0; i <= 100; i++) {
    const keys = Object.keys(at(i / 100).backdrop).sort()
    assert.deepEqual(keys, ['a', 'b', 'gain', 'glyphOnly', 'mix', 'reveal'])
  }
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

test('in a hold the phone only turns, one way and within its hold turn, and the camera never moves', () => {
  // Oscillating, unprompted motion made visitors motion sick, so once an act's transition has finished the phone
  // may only turn, monotonically and by no more than the act's hold turn (0.12 radians at most), as the visitor
  // scrolls. Its position and the camera stay fixed. The windows start after each act's last ramp ends.
  const holds = { arrival: [0.7, 0.99], hand: [0.55, 0.99], day: [0.2, 0.99], glass: [0.55, 0.99], proof: [0.55, 0.79], coach: [0.55, 0.99], close: [0.75, 0.99] }
  const yawOf = (pose) => Math.atan2(pose.phone.normal[0], pose.phone.normal[2])
  for (const narrow of [false, true]) {
    for (const [key, [from, to]] of Object.entries(holds)) {
      const where = `${key} (${narrow ? 'narrow' : 'wide'})`
      const samples = Array.from({ length: 12 }, (_, k) => at(inAct(key, from + ((to - from) * k) / 11), narrow))
      for (const pose of samples) {
        for (let i = 0; i < 3; i++) {
          assert.ok(near(samples[0].phone.pos[i], pose.phone.pos[i], 1e-9), `${where} phone.pos[${i}] moves while holding`)
          assert.ok(near(samples[0].camera.pos[i], pose.camera.pos[i], 1e-9), `${where} camera moves while holding`)
        }
      }
      const yaws = samples.map(yawOf)
      const steps = yaws.slice(1).map((y, k) => y - yaws[k])
      assert.ok(steps.every((d) => d >= -1e-9) || steps.every((d) => d <= 1e-9), `${where} turns back and forth while holding`)
      assert.ok(Math.abs(yaws.at(-1) - yaws[0]) <= 0.121, `${where} turns more than its hold turn: ${yaws.at(-1) - yaws[0]}`)
    }
  }
})

test('the pointer turns the phone toward it but never moves the camera or changes the room', () => {
  const local = inAct('hand', 0.8)
  const rest = poseAt({ progress: local, windows, backdrops, narrow: false, aspect: 1.6, interaction: still, poseFrames: PARKIWELL.pose.frames })
  const leaning = poseAt({ progress: local, windows, backdrops, narrow: false, aspect: 1.6, interaction: { dragYaw: 0, tiltX: 1, tiltY: -1 }, poseFrames: PARKIWELL.pose.frames })
  const turn = Math.acos(Math.min(1, rest.phone.normal.reduce((sum, v, i) => sum + v * leaning.phone.normal[i], 0)))
  assert.ok(turn > 0.28 && turn < 0.4, `the phone turns about 20 degrees toward the stage's corner: ${turn} rad`)
  // The screen faces the pointer: with the pointer at the right and up, the screen side (-normal) turns right and up.
  assert.ok(-leaning.phone.normal[0] > -rest.phone.normal[0] && -leaning.phone.normal[1] > -rest.phone.normal[1], 'the screen turns toward the pointer')
  for (let i = 0; i < 3; i++) assert.ok(near(rest.camera.pos[i], leaning.camera.pos[i], 1e-12), 'the camera ignores the pointer')
  // The composite shifts the room a little against the pointer for depth, but which rooms show and how they blend never depends on it.
  assert.deepEqual(rest.backdrop, leaning.backdrop, 'the room choice ignores the pointer')
})

test('the phone keeps one height through the chapter', () => {
  assert.equal(at(0).phone.pos[1], 0)
  assert.equal(at(1).phone.pos[1], 0)
})

test('the product forms from glyphs in act 1 and dissolves back before the end of act 8', () => {
  assert.equal(at(0).decode, 0)
  assert.equal(at(1).decode, 0)
  assert.ok(at((w('hand').start + w('hand').end) / 2).decode > 0.99)
  assert.ok(at(inAct('arrival', 0.36)).decode > 0.3 && at(inAct('arrival', 0.36)).decode < 0.7, 'the arrival decode runs across the first 62% of the act')
  assert.equal(at(inAct('arrival', 0.62)).decode, 1, 'the product is formed by 62% of the arrival and holds')
  assert.ok(at(inAct('close', 0.5)).decode > 0.99, 'the close holds the real render through its first half')
  assert.equal(at(inAct('close', 0.69)).decode, 1, 'the reassembled phone rests until 0.69 of the close')
  // The dissolve ends at 0.91 and the scatter at 0.95 of the close, so both complete while the stage is still pinned.
  assert.equal(at(inAct('close', 0.91)).decode, 0, 'the dissolve completes while the stage is still pinned')
  // The gather reverses behind the dissolve, so the characters drift apart instead of holding a phone-shaped block.
  assert.equal(at(0).gather, 0)
  assert.equal(at(inAct('close', 0.72)).gather, 1)
  assert.ok(at(inAct('close', 0.83)).gather > 0 && at(inAct('close', 0.83)).gather < 1, 'the scatter runs behind the dissolve')
  assert.equal(at(inAct('close', 0.95)).gather, 0)
  // Both phases ease on the quintic, so they leave and reach their ends at rest.
  const ease = (local) => at(inAct('arrival', local)).decode
  assert.ok(ease(0.12) < 0.01 && ease(0.6) > 0.99, 'the arrival decode starts and lands slowly')
  assert.equal(at(1).gather, 0)
})

test('the coach act opens on a whole, unghosted phone that already shows Motion coach', () => {
  // The stack closes, the glass seats on the screen, and the proof dimming and the code layer fade over the last
  // 20% of the proof act, after the readout has rested from about 0.49. The coach copy is opaque from 0.085, so
  // the phone must be whole from the act's first frame. The proof act has already booted the screen into the
  // coach capture, so the coach act never dips, and the figure starts at 0.12.
  for (const narrow of [false, true]) {
    const resting = at(inAct('proof', 0.78), narrow)
    assert.ok(resting.explode > 0.99, `explode while the readout rests: ${resting.explode}`)
    const open = at(inAct('coach', 0), narrow)
    assert.equal(open.explode, 0, 'the stack is closed at the start of the coach act')
    assert.equal(open.code.opacity, 0)
    assert.equal(open.screen.opacity, 1)
    const glass = open.phone.pos.map((v, k) => v + open.phone.normal[k] * LAYER_Z.glass)
    open.glass.center.forEach((v, k) => assert.ok(near(v, glass[k], 1e-9), 'the glass is on the screen'))
  }
  for (const local of [0, 0.03, 0.06, 0.12]) {
    const screen = at(inAct('coach', local)).screen
    assert.equal(screen.texture, 'coach', `screen at coach ${local}`)
    assert.ok(screen.develop > 0.999, `develop at coach ${local}: ${screen.develop}`)
  }
  assert.ok(at(inAct('coach', 0.12)).coach.amount < 1e-12, 'the figure has not started to draw at 0.12')
  assert.ok(at(inAct('coach', 0.2)).coach.amount > 0, 'the figure is drawing by 0.2')
})

test('proof hides the screen and the glass in front of the code layer, and relights them only after the code is gone', () => {
  // The composite blends in linear light, so even 5% of the Home capture prints legibly over the code, and the
  // fanned sheet's rim outlines a rectangle clipped by the frame. Only the code layer and the chassis stay, from
  // 0.1 of the act to the stack's close at 0.8.
  for (const local of [0.1, 0.2, 0.3, 0.5, 0.6, 0.8]) {
    const pose = at(inAct('proof', local))
    assert.equal(pose.screen.opacity, 0, `screen opacity at proof ${local}`)
    assert.equal(pose.glass.light, 0, `glass light at proof ${local}`)
    assert.equal(pose.code.opacity, 1, `code opacity at proof ${local}`)
  }
  // As the stack closes the code fades out first, and the screen and the glass return only once it is gone, so no
  // frame prints a capture through the code.
  for (let i = 0; i <= 40; i++) {
    const pose = at(inAct('proof', 0.8 + 0.2 * (i / 40)))
    assert.ok(pose.code.opacity === 0 || pose.screen.opacity === 0, `code ${pose.code.opacity} and screen ${pose.screen.opacity} at proof ${0.8 + 0.2 * (i / 40)}`)
  }
  // While hidden, the screen dips to glyphs (0.5 to 0.6) and takes the coach capture at the dip's bottom. It returns
  // opaque as glyphs by 0.9, never translucent over a resolved capture, and resolves by 0.95 while the glass is
  // still seating, so the closed phone shows the sharp capture for the act's last twentieth.
  assert.equal(at(inAct('proof', 0.55)).screen.texture, 'home')
  for (const local of [0.6, 0.7, 0.88, 0.9]) {
    const screen = at(inAct('proof', local)).screen
    assert.equal(screen.texture, 'coach', `screen at proof ${local}`)
    assert.ok(screen.develop < 0.051, `develop at proof ${local}: ${screen.develop}`)
  }
  for (let i = 0; i <= 20; i++) {
    const local = 0.88 + 0.12 * (i / 20)
    const { screen } = at(inAct('proof', local))
    if (screen.opacity > 0 && screen.opacity < 1) assert.ok(screen.develop < 0.051, `a translucent screen (${screen.opacity}) shows a resolved capture at proof ${local}`)
  }
  assert.equal(at(inAct('proof', 0.9)).screen.opacity, 1)
  const booting = at(inAct('proof', 0.925))
  assert.ok(booting.screen.develop > 0.1 && booting.screen.develop < 0.9, `the screen resolves while the stack seats: ${booting.screen.develop}`)
  assert.ok(booting.explode > 0, 'the glass is still seating while the screen resolves')
  for (const local of [0.95, 0.97, 1]) assert.ok(at(inAct('proof', local)).screen.develop > 0.999, `the screen is sharp at proof ${local}`)
})

test('each narrow deck card is whole in frame through the middle of its window and never with two neighbours', () => {
  // A card is centred from 0.3 to 0.7 of its window. Windows open 0.22 apart and last 0.3 of the act. At z -0.6
  // and 0.15 below the phone's line a held card spans about 59% to 70% of a 390 by 844 frame's height as the day
  // camera pushes in, and its top stays at least 3% below the frame's, clear of the menu pill.
  const aspect = 390 / 844
  for (let i = 0; i < 4; i++) {
    const s = 0.04 + i * 0.22
    for (const wnd of [0.3, 0.5, 0.7]) {
      const pose = at(inAct('day', s + wnd * 0.3), true, aspect)
      const card = pose.cards[i]
      assert.ok(card.opacity > 0.999, `card ${i} is opaque at ${wnd} of its window: ${card.opacity}`)
      for (const p of corners(pose, aspect, planeRect(card))) {
        assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, `card ${i} corner at ${wnd} of its window: ${p.x} ${p.y}`)
      }
      const rect = projectRect(pose, card, aspect)
      assert.ok(rect.top >= 0.03, `card ${i} top at ${wnd} of its window: ${rect.top}`)
      const height = rect.bottom - rect.top
      assert.ok(height > 0.57 && height < 0.72, `card ${i} spans ${height} of the frame height at ${wnd} of its window`)
    }
    // A card fades only over the first and last 12% of its window, while it is still at the frame's edge.
    for (const wnd of [0.12, 0.2, 0.8, 0.88]) {
      const card = at(inAct('day', s + wnd * 0.3), true, aspect).cards[i]
      assert.ok(card.opacity > 0.999, `card ${i} is opaque at ${wnd} of its window: ${card.opacity}`)
    }
    for (const wnd of [0.05, 0.95]) {
      const pose = at(inAct('day', s + wnd * 0.3), true, aspect)
      const card = pose.cards[i]
      assert.ok(card.opacity > 0 && card.opacity < 0.9, `card ${i} is translucent at ${wnd} of its window: ${card.opacity}`)
      const [left, right] = xSpan(pose, aspect, planeRect(card))
      assert.ok(left < 0 || right > 1, `card ${i} fades at ${wnd} of its window while whole in frame: ${left} to ${right}`)
    }
  }
  for (let k = 0; k <= 400; k++) {
    const pose = at(inAct('day', k / 400), true, aspect)
    const shown = pose.cards.filter((card) => card.opacity > 0)
    assert.ok(shown.length <= 2, `${shown.length} deck cards shown at day ${k / 400}`)
    // Two cards on screen at once never overlap, so neither is drawn through the other.
    if (shown.length === 2) {
      const [a, b] = shown.map((card) => xSpan(pose, aspect, planeRect(card)))
      assert.ok(a[1] < b[0] || b[1] < a[0], `deck cards overlap at day ${k / 400}: ${a} and ${b}`)
    }
    // A card is opaque wherever it crosses the phone, so the two screens never print through each other.
    const phone = xSpan(pose, aspect, chassisRect(pose))
    for (const card of pose.cards) {
      if (card.opacity <= 0 || card.opacity >= 0.98) continue
      const span = xSpan(pose, aspect, planeRect(card))
      assert.ok(span[1] < phone[0] || span[0] > phone[1], `a translucent deck card (${card.opacity}) crosses the phone at day ${k / 400}`)
    }
  }
  // The receded phone behind the deck is a dark body from card 0's hold until the last card, Community, leaves the
  // centre at 0.91, so the gap between two moving cards never shows its form. No card follows Community, so the
  // phone lights as it leaves and the deck ends on a lit phone.
  for (let k = 0; k <= 100; k++) {
    const local = 0.13 + 0.78 * (k / 100)
    assert.equal(at(inAct('day', local), true, aspect).screen.opacity, 0, `the phone's screen behind the deck at day ${local}`)
  }
  assert.ok(at(inAct('day', 1), true, aspect).screen.opacity > 0.99, 'the phone is lit as the last card leaves')
  assert.ok(at(inAct('quiet', 0.95), true, aspect).screen.opacity > 0.99, 'the phone stays lit through the quiet act')
})

test('the narrow hand phone keeps its top bezel clear of the frame\'s top edge', () => {
  // At 390 by 844 a hand distance of 2.15 left the bezel within about 5 px of the edge.
  const height = 844, aspect = 390 / height
  for (const local of [0.5, 0.7, 0.9, 1]) {
    const pose = at(inAct('hand', local), true, aspect)
    const top = projectRect(pose, { center: pose.phone.pos, right: pose.phone.right, up: pose.phone.up, halfW: PHONE.hx, halfH: PHONE.hy }, aspect).top * height
    assert.ok(top >= 20, `the hand phone's top at ${local} is ${top} px from the frame's top`)
  }
})

test('the narrow coach figure keeps its wrists clear of the receded phone and inside the frame', () => {
  // At 390 by 844 the arms reach level at the top of the raise, where the near wrist sat inside the phone's top
  // right corner and the far one off the frame. Each wrist must stay 12 CSS px outside the phone's projected rect
  // and the far wrist's 4 px ring inside the frame's right edge from 0.45, where the figure is fully drawn.
  const width = 390, height = 844, aspect = width / height
  const wrists = [COACH_JOINTS.indexOf(15), COACH_JOINTS.indexOf(16)]
  for (let k = 0; k <= 80; k++) {
    const local = 0.45 + 0.55 * (k / 80)
    const pose = at(inAct('coach', local), true, aspect)
    const phone = projectRect(pose, { center: pose.phone.pos, right: pose.phone.right, up: pose.phone.up, halfW: PHONE.hx, halfH: PHONE.hy }, aspect)
    const box = { left: phone.left * width, right: phone.right * width, top: phone.top * height, bottom: phone.bottom * height }
    const joints = coachWorld(pose, jointsAt(PARKIWELL.pose, pose.coach.frame))
    for (const j of wrists) {
      const p = projectPoint(pose, joints[j], aspect)
      const x = p.x * width, y = p.y * height
      const gap = Math.hypot(Math.max(box.left - x, 0, x - box.right), Math.max(box.top - y, 0, y - box.bottom))
      assert.ok(gap >= 12, `wrist ${j} is ${gap} px from the phone at coach ${local}`)
      assert.ok(x <= width - 4, `wrist ${j} at x ${x} at coach ${local}`)
    }
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

/** Chapter progress at `wnd` of wide day card `i`'s window: the window opens at 0.06 + 0.14 i and lasts 0.28 of the act. */
const inCard = (i, wnd) => inAct('day', 0.06 + i * 0.14 + wnd * 0.28)

test('wide day cards peel off the front of the screen and land at 0.95 scale by 76% of the act', () => {
  const start = at(inCard(0, -1e-6))
  const card = start.cards[0]
  assert.equal(card.opacity, 0)
  assert.ok(near(length(card.right), 1, 1e-9) && near(length(card.up), 1, 1e-9), 'a card still on the screen has the screen\'s scale')
  // At its start the card sits 0.02 in front of the screen along the screen normal.
  const front = start.screen.center.map((v, i) => v - start.phone.normal[i] * 0.02)
  card.center.forEach((v, i) => assert.ok(near(v, front[i], 1e-6)))
  start.cards.slice(1).forEach((later) => assert.equal(later.opacity, 0))

  const mid = at(inCard(0, 0.15))
  assert.ok(mid.cards[0].opacity > 0.5 && mid.cards[0].develop > 0 && mid.cards[0].develop < 1, 'a card develops while it travels to the spotlight')

  // The last card lands at 0.76 of the act and the row then holds to the end.
  for (const local of [0.76, 0.88, 1]) {
    at(inAct('day', local)).cards.forEach((c, k) => {
      assert.ok(near(length(c.right), 0.95, 1e-6) && near(length(c.up), 0.95, 1e-6), `card ${k} scale at ${local}`)
      assert.equal(c.develop, 1)
      assert.equal(c.opacity, 1)
      assert.equal(c.halfW, PHONE.sx)
    })
  }
  const late = at(inAct('day', 0.7)).cards[3]
  assert.ok(length(late.right) > 0.955 && late.opacity > 0.99 && late.develop === 1, 'the last card is developed but still settling into its slot at 70% of the act')
  // Card k's window opens at local 0.06 + 0.14 k, so just before that it is still hidden while card k - 1 is fully
  // shown and in its spotlight.
  for (let k = 1; k < 4; k++) {
    const before = at(inCard(k, -0.01 / 0.28))
    assert.equal(before.cards[k].opacity, 0, `card ${k} waits its turn`)
    assert.ok(before.cards[k - 1].opacity > 0.99, `card ${k - 1} is fully shown before card ${k} starts`)
  }
})

test('each wide day card holds in the spotlight at full scale, developed, facing the camera, at one place and size', () => {
  for (const aspect of [0.75, 1.33, 1.6, 2.0]) {
    for (let i = 0; i < 4; i++) {
      for (const wnd of [0.3, 0.45, 0.6]) {
        const pose = at(inCard(i, wnd), false, aspect)
        const card = pose.cards[i]
        assert.equal(card.develop, 1, `card ${i} develop at ${wnd} of its window`)
        assert.equal(card.opacity, 1, `card ${i} opacity at ${wnd} of its window`)
        assert.ok(near(length(card.right), 1, 1e-9) && near(length(card.up), 1, 1e-9), `card ${i} scale at ${wnd}: ${length(card.right)}`)
        assert.ok(near(card.right[0], 1, 1e-9) && near(card.up[1], 1, 1e-9), `card ${i} faces the camera at ${wnd}`)
        // The spotlight is fixed to the camera, so the held card keeps its place and its size while the day dolly
        // pushes in: centred at 0.72 of the width and 0.66 of the height tall, against about 0.42 to 0.51 for a
        // settled card at 1.33 and 1.6.
        const centre = projectPoint(pose, card.center, aspect)
        assert.ok(near(centre.x, 0.72, 1e-6), `${aspect} card ${i} centre x at ${wnd}: ${centre.x}`)
        const ys = corners(pose, aspect, planeRect(card)).map((p) => p.y)
        assert.ok(near(Math.max(...ys) - Math.min(...ys), 0.66, 1e-6), `${aspect} card ${i} height at ${wnd}: ${Math.max(...ys) - Math.min(...ys)}`)
        for (const p of corners(pose, aspect, planeRect(card))) {
          assert.ok(p.x >= 0.02 && p.x <= 0.98 && p.y >= 0.02 && p.y <= 0.98, `${aspect} card ${i} corner at ${wnd}: ${p.x} ${p.y}`)
        }
        // The label hangs 1.08 half-heights below the centre and must stay inside the frame.
        const label = projectPoint(pose, [card.center[0], card.center[1] - card.halfH * 1.08, card.center[2]], aspect)
        assert.ok(label.y < 0.97, `${aspect} card ${i} label at ${wnd}: ${label.y}`)
        // Earlier cards are still settling, behind the spotlight, and keep moving through the hold.
        if (i > 0 && wnd === 0.3) {
          const prev = pose.cards[i - 1]
          assert.ok(prev.center[2] > card.center[2] + 0.1, `card ${i - 1} is behind card ${i}'s spotlight: ${prev.center[2]} against ${card.center[2]}`)
          const later = at(inCard(i, 0.6), false, aspect).cards[i - 1]
          assert.ok(Math.hypot(...prev.center.map((v, k) => v - later.center[k])) > 0.01, `card ${i - 1} keeps sliding during card ${i}'s hold`)
        }
      }
    }
  }
})

test('the phone is at its day station, facing the camera, before card 0 reaches the spotlight', () => {
  // The phone's move, its turn, and the dolly out all end as card 0's hold starts, so through the hold the phone
  // turns only with the yaw drift (0.05 radians) and the camera moves only with the slow push-in, under 1%.
  for (const aspect of [0.75, 1.33, 1.6, 2.0]) {
    const end = at(inAct('day', 0.99), false, aspect)
    const held = [0.3, 0.45, 0.6].map((wnd) => at(inCard(0, wnd), false, aspect))
    for (const pose of held) {
      assert.ok(near(pose.phone.pos[0], end.phone.pos[0], 1e-9), `${aspect}: phone x ${pose.phone.pos[0]} against its station ${end.phone.pos[0]}`)
      const turn = Math.hypot(...pose.phone.normal.map((v, k) => v - held[0].phone.normal[k]))
      assert.ok(turn < 0.05, `${aspect}: the phone turns by ${turn} during card 0's hold`)
      const push = Math.abs(pose.camera.pos[2] / held[0].camera.pos[2] - 1)
      assert.ok(push < 0.01, `${aspect}: the camera moves by ${push} of its distance during card 0's hold`)
    }
    assert.ok(Math.abs(held[0].phone.normal[0]) < 0.06, `${aspect}: the phone faces the camera at card 0's hold, normal x ${held[0].phone.normal[0]}`)
  }
})

test('each narrow deck card holds at the centre, developed and opaque, for the middle 40% of its window', () => {
  for (let i = 0; i < 4; i++) {
    const s = 0.04 + i * 0.22
    for (const wnd of [0.3, 0.5, 0.7]) {
      const card = at(inAct('day', s + wnd * 0.3), true).cards[i]
      assert.ok(near(card.center[0], 0, 1e-9), `card ${i} x at ${wnd}: ${card.center[0]}`)
      assert.equal(card.develop, 1)
      assert.equal(card.opacity, 1)
    }
    assert.ok(at(inAct('day', s + 0.2 * 0.3), true).cards[i].center[0] > 0.05, 'the card is still arriving from the right at 0.2')
    assert.ok(at(inAct('day', s + 0.8 * 0.3), true).cards[i].center[0] < -0.05, 'the card is leaving to the left at 0.8')
  }
})

test('in the quiet act the cards fold into the phone one at a time from the nearest, and never re-encode', () => {
  // Card i slides toward the phone over 0.3 of the act from 0.1 i, so Home leads and Community lands at 0.6. It is
  // opaque until 0.45 of its own fold and gone by 0.8, before it reaches the phone.
  for (let i = 0; i < 4; i++) {
    let lastGap = Infinity
    for (let k = 0; k <= 12; k++) {
      const pose = at(inAct('quiet', 0.6 * (k / 12)))
      assert.equal(pose.cards[i].develop, 1, `card ${i} develop held at quiet ${0.6 * (k / 12)}`)
      const gap = Math.abs(pose.cards[i].center[0] - pose.phone.pos[0])
      assert.ok(gap <= lastGap + 1e-9, `card ${i} only ever closes on the phone across the frame`)
      lastGap = gap
    }
    const fold = (f) => at(inAct('quiet', 0.1 * i + 0.3 * f))
    if (i > 0) assert.equal(fold(0).cards[i].opacity, 1, `card ${i} waits in its slot while card ${i - 1} folds`)
    assert.equal(fold(0.4).cards[i].opacity, 1, `card ${i} is opaque at 0.4 of its fold`)
    const mid = fold(0.6).cards[i].opacity
    assert.ok(mid > 0.3 && mid < 0.7, `card ${i} is fading at 0.6 of its fold: ${mid}`)
    const gone = fold(0.75)
    assert.equal(gone.cards[i].opacity, 0, `card ${i} is gone at 0.75 of its fold`)
    assert.ok(Math.abs(gone.cards[i].center[0] - gone.phone.pos[0]) > 0.05, `card ${i} is gone before it reaches the phone`)
  }
  assert.equal(at(inAct('glass', 0.5)).cards[1].opacity, 0)
})

test('a folding card never lies translucent in front of the phone or another card and never cuts through the phone', () => {
  // The phone slides right through the row's left slots while it turns edge-on, its right half swinging back. Each
  // card is sampled on a 9 by 9 grid, and wherever the ray to a sample meets the phone's face or another card the
  // nearer surface must be opaque or nearly gone, and a card over the phone must be wholly in front of it or wholly
  // behind it. All four cards sliding home at once at half opacity crossed one another and the phone as
  // translucent sheets.
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  const dotv = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const crossv = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  /** Camera depth at which the ray through world point p meets a plane inside its rect, or null. */
  const meet = (pose, plane, p) => {
    const c = pose.camera.pos
    const dir = sub(p, c)
    const n = crossv(plane.right, plane.up)
    const denom = dotv(dir, n)
    if (Math.abs(denom) < 1e-9) return null
    const t = dotv(sub(plane.center, c), n) / denom
    const hit = dir.map((v, k) => c[k] + v * t)
    const d = sub(hit, plane.center)
    const s2 = dotv(plane.right, plane.right)
    if (Math.abs(dotv(d, plane.right) / s2) > plane.halfW || Math.abs(dotv(d, plane.up) / s2) > plane.halfH) return null
    return dotv(sub(hit, c), pose.camera.forward)
  }
  for (const aspect of [0.75, 1.33, 1.6, 2.0, 2.4]) {
    for (let k = 0; k <= 140; k++) {
      const local = 0.7 * (k / 140)
      const pose = at(inAct('quiet', local), false, aspect)
      const phone = { center: pose.screen.center, right: pose.phone.right, up: pose.phone.up, halfW: PHONE.hx, halfH: PHONE.hy, opacity: 1 }
      pose.cards.forEach((card, i) => {
        if (card.opacity < 0.03) return
        let front = 0, behind = 0
        for (let a = -1; a <= 1; a += 0.25) {
          for (let b = -1; b <= 1; b += 0.25) {
            const p = planePoint(card, a, b)
            const depth = dotv(sub(p, pose.camera.pos), pose.camera.forward)
            for (const [name, other] of [...pose.cards.map((c, j) => [`card ${j}`, c]), ['the phone', phone]]) {
              if (other === card || other.opacity < 0.03) continue
              const otherDepth = meet(pose, other, p)
              if (otherDepth === null) continue
              const near = depth < otherDepth ? card : other
              assert.ok(near.opacity >= 0.97 || near.opacity < 0.05, `${aspect} quiet ${local}: card ${i} and ${name} overlap with the nearer at ${near.opacity}`)
              if (other === phone && depth < otherDepth) front++
              else if (other === phone) behind++
            }
          }
        }
        assert.ok(!(front && behind), `${aspect} quiet ${local}: card ${i} cuts through the phone`)
      })
    }
  }
})

test('the main screen shows each act\'s screen and re-encodes briefly at every swap', () => {
  const keys = new Set(PARKIWELL.screens.map((s) => s.key))
  for (const [key, screen] of Object.entries(ACT_SCREEN)) {
    assert.ok(keys.has(screen), `${key} names a screen the story has`)
    assert.equal(at(inAct(key, 0.5)).screen.texture, screen)
  }
  assert.equal(at(inAct('hand', 0.5)).screen.texture, 'log')
  assert.equal(at(inAct('day', 0.5)).screen.texture, 'log', 'the day phone never shows Home beside the Home card')
  assert.equal(at(inAct('quiet', 0.05)).screen.texture, 'log', 'the row folds into a phone that shows a different screen')
  assert.equal(at(inAct('coach', 0.5)).screen.texture, 'coach')
  assert.equal(at(inAct('close', 0.5)).screen.texture, 'results')
  // A swap dips the develop to 0.05 of its level at 6% of the act and restores it by 12%. The texture changes at
  // the dip's bottom, where the shader's scan has resolved no cell past about 10%, so the screen it leaves and the
  // one it reveals are both drawn as glyphs at that instant. The glass act enters at the quiet act's dimmed develop
  // of about two thirds, which it restores over its first 60%.
  for (const [key, from] of [['hand', 'welcome'], ['glass', 'log'], ['close', 'coach']]) {
    const level = key === 'glass' ? 0.6 : 0.99
    assert.ok(at(inAct(key, 0)).screen.develop > level, `${key} enters at its develop`)
    assert.equal(at(inAct(key, 0.03)).screen.texture, from, `${key} keeps the previous screen into the dip`)
    const before = at(inAct(key, 0.0595)).screen
    const after = at(inAct(key, 0.0605)).screen
    assert.equal(before.texture, from)
    assert.equal(after.texture, ACT_SCREEN[key])
    for (const develop of [before.develop, after.develop]) assert.ok(develop > 0.02 && develop < 0.06, `${key} swaps at the dip's bottom: ${develop}`)
    assert.ok(at(inAct(key, 0.12)).screen.develop > level, `${key} restores the develop by 12%`)
  }
  // Acts that keep the screen the act before ended on never dip. The coach act enters on the coach capture, which
  // the proof act's hidden screen has booted into.
  for (const key of ['day', 'quiet', 'proof', 'coach']) assert.ok(at(inAct(key, 0.06)).screen.develop > 0.6, `${key} holds its screen`)
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
  // left out.
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

test('rest points mark each finished state in order: every act, and each day card before the finished row', () => {
  for (const narrow of [false, true]) {
    const points = restPoints(windows, narrow)
    assert.equal(points.length, windows.length + 4)
    for (let i = 1; i < points.length; i++) assert.ok(points[i] > points[i - 1], `rest ${i} is out of order (${narrow ? 'narrow' : 'wide'})`)
    assert.ok(points[0] > 0 && points.at(-1) < 1)
    const day = w('day')
    assert.equal(points.filter((p) => p >= day.start && p < day.end).length, 5, 'four card holds and the finished row')
    // Each rest sits where its act has finished its transition: the pose there matches the pose a little later.
    for (const p of points) {
      const a = at(p, narrow)
      const b = at(Math.min(p + 0.002, 1), narrow)
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(a.camera.pos[i] - b.camera.pos[i]) < 0.01, `the camera is mid-move at rest ${p}`)
    }
  }
})

test('the launch push moves the camera closer and lifts the light, and push 0 changes nothing', () => {
  const base = { progress: inAct('arrival', 0.65), windows, backdrops, narrow: false, aspect: 1.6, interaction: still, poseFrames: PARKIWELL.pose.frames }
  const rest = poseAt(base)
  assert.deepEqual(poseAt({ ...base, push: 0 }), rest)
  const pushed = poseAt({ ...base, push: 1 })
  const gap = (pose) => Math.hypot(...pose.camera.pos.map((c, i) => c - pose.phone.pos[i]))
  assert.ok(Math.abs(gap(pushed) / gap(rest) - 0.95) < 0.01, `camera gap ratio ${gap(pushed) / gap(rest)}`)
  assert.ok(near(pushed.bodyLight / rest.bodyLight, 1.25, 1e-9))
})
