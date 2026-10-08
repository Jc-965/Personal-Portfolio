import assert from 'node:assert/strict'
import test from 'node:test'
import { actWindows } from '../../src/components/teardown/timeline.ts'
import { FOCAL, LAYER_Z, PHONE, anchorWorld, backdropAt, basis, poseAt, projectPoint } from '../../src/components/teardown/rig.ts'
import { PARKIWELL } from '../../src/content/teardown/parkiwell.ts'

const windows = actWindows(PARKIWELL.acts)
const backdrops = PARKIWELL.acts.map((a) => a.backdrop)
const still = { dragYaw: 0, tiltX: 0, tiltY: 0 }
const at = (progress, narrow = false) => poseAt({ progress, windows, backdrops, narrow, aspect: narrow ? 0.46 : 1.6, interaction: still, poseFrames: PARKIWELL.pose.frames })
const w = (key) => windows.find((x) => x.key === key)
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps

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

test('backdrops crossfade between acts and fade to dark for null acts', () => {
  const quietMid = (w('quiet').start + w('quiet').end) / 2
  assert.equal(backdropAt(windows, backdrops, quietMid).gain, 0)
  const handStart = backdropAt(windows, backdrops, w('hand').start + 1e-6)
  assert.equal(handStart.a, 0)
  assert.equal(handStart.b, 1)
  assert.ok(handStart.mix < 0.05)
  const handLate = backdropAt(windows, backdrops, w('hand').end - 1e-6)
  assert.equal(handLate.mix, 1)
  assert.ok(handLate.gain > 0.4)
})

test('the screen half-extents keep the 1320x2868 capture aspect', () => {
  assert.ok(Math.abs(PHONE.sx / PHONE.sy - 1320 / 2868) < 0.002)
})
