import assert from 'node:assert/strict'
import test from 'node:test'
import { COACH_JOINTS, COACH_BONES, jointsAt } from '../../src/components/teardown/coach.ts'
import { PARKIWELL_POSE } from '../../src/content/teardown/parkiwellPose.ts'

test('every bone joins two kept joints', () => {
  assert.equal(COACH_BONES.length, 14)
  for (const [a, b] of COACH_BONES) {
    assert.ok(a >= 0 && a < COACH_JOINTS.length)
    assert.ok(b >= 0 && b < COACH_JOINTS.length)
    assert.notEqual(a, b)
  }
})

test('the pose data matches the kept joints and has y up', () => {
  assert.equal(PARKIWELL_POSE.joints, COACH_JOINTS.length)
  assert.equal(PARKIWELL_POSE.points.length, PARKIWELL_POSE.frames * PARKIWELL_POSE.joints * 2)
  const first = jointsAt(PARKIWELL_POSE, 0)
  const nose = first[0]
  const leftAnkle = first[COACH_JOINTS.indexOf(27)]
  assert.ok(nose[1] > leftAnkle[1], 'the nose is above the ankle')
})

test('frames interpolate and wrap continuously at the loop seam', () => {
  const n = PARKIWELL_POSE.frames
  const a = jointsAt(PARKIWELL_POSE, 2)
  const b = jointsAt(PARKIWELL_POSE, 3)
  const mid = jointsAt(PARKIWELL_POSE, 2.5)
  for (let j = 0; j < a.length; j++) {
    assert.ok(Math.abs(mid[j][0] - (a[j][0] + b[j][0]) / 2) < 1e-9)
  }
  const beforeSeam = jointsAt(PARKIWELL_POSE, n - 0.001)
  const atSeam = jointsAt(PARKIWELL_POSE, n)
  for (let j = 0; j < atSeam.length; j++) {
    assert.ok(Math.abs(beforeSeam[j][0] - atSeam[j][0]) < 0.06)
    assert.ok(Math.abs(beforeSeam[j][1] - atSeam[j][1]) < 0.06)
  }
  assert.deepEqual(jointsAt(PARKIWELL_POSE, -1), jointsAt(PARKIWELL_POSE, n - 1))
})
