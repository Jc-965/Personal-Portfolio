import assert from 'node:assert/strict'
import test from 'node:test'
import { applyLensShift, toThreeMatrix, toThreePosition, verticalFov } from '../../src/components/teardown/threeMap.ts'
import { FOCAL, basis, projectPoint } from '../../src/components/teardown/rig.ts'

const det3 = (m) => m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5])

test('rig bases map to proper rotations in three.js space', () => {
  for (const [yaw, pitch] of [[0, 0], [0.6, -0.2], [-1.3, 0.9]]) {
    const { right, up, normal } = basis(yaw, pitch)
    const m = toThreeMatrix([0.1, 0.2, 0.3], right, up, normal)
    assert.ok(Math.abs(det3(m) - 1) < 1e-9)
    assert.deepEqual([m[12], m[13], m[14]], [0.1, 0.2, -0.3])
  }
})

test('the phone screen faces a three.js camera that looks down -z', () => {
  const { right, up, normal } = basis(0, 0)
  const m = toThreeMatrix([0, 0, 0], right, up, normal)
  // Local +z (the screen side in three.js) must point toward +z, where the camera sits.
  assert.ok(m[10] > 0.99)
})

test('a three.js style projection with lens shift matches rig.projectPoint', () => {
  const aspect = 1.6
  const pose = { camera: { pos: [0.2, -0.1, -2.5], right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, 1], focal: FOCAL, shift: [0.4, 0.1] } }
  const world = [0.3, 0.25, 0.4]
  const expected = projectPoint(pose, world, aspect)
  const fov = verticalFov(FOCAL) * Math.PI / 180
  const f = 1 / Math.tan(fov / 2)
  const near = 0.01, far = 50
  const base = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, -(far + near) / (far - near), -1, 0, 0, -2 * far * near / (far - near), 0]
  const p = applyLensShift(base, pose.camera.shift, aspect)
  const t = toThreePosition(world), c = toThreePosition(pose.camera.pos)
  const v = [t[0] - c[0], t[1] - c[1], t[2] - c[2], 1]
  const clip = [0, 1, 2, 3].map((r) => p[r] * v[0] + p[4 + r] * v[1] + p[8 + r] * v[2] + p[12 + r] * v[3])
  const ndc = [clip[0] / clip[3], clip[1] / clip[3]]
  assert.ok(Math.abs((ndc[0] + 1) / 2 - expected.x) < 1e-9)
  assert.ok(Math.abs((1 - ndc[1]) / 2 - expected.y) < 1e-9)
})
