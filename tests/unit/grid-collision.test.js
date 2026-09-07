import { Buffer } from 'node:buffer'
import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
const compiled = await build({ entryPoints: ['src/components/TheGrid/navigation/collision.ts'], bundle: true, write: false, format: 'esm', platform: 'node' })
const { moveCapsule, isCapsuleFree } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const world = { bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, colliders: [{ min: [2, 0, -5], max: [3, 8, 5] }], surfaces: [] }

test('capsule cannot tunnel through a wall, and slides along its face', () => {
  const hit = moveCapsule({ x: 0, y: 0, z: 0 }, 10, 0, world)
  assert.ok(hit.x < 1.7 && hit.x > 1.3)
  const slide = moveCapsule(hit, 2, 2, world)
  assert.ok(slide.x < 1.7)
  assert.ok(slide.z > 1.8)
  assert.ok(isCapsuleFree(slide, world.colliders))
})

test('stairs connect street to a platform and prevent an unsupported drop', () => {
  const stairs = { ...world, colliders: [], surfaces: [
    { minX: -2, maxX: 2, minZ: 0, maxZ: 14, y: 0, rise: 7, axis: 'z' },
    { minX: -2, maxX: 2, minZ: 14, maxZ: 18, y: 7 },
  ] }
  let walker = { x: 0, y: 0, z: 0 }
  for (let i = 0; i < 160; i++) walker = moveCapsule(walker, 0, 0.1, stairs)
  assert.ok(Math.abs(walker.y - 7) < 0.01)
  const edge = moveCapsule(walker, 6, 0, stairs)
  assert.ok(edge.x <= 2)
  assert.equal(edge.y, 7)
  for (let i = 0; i < 160; i++) walker = moveCapsule(walker, 0, -0.1, stairs)
  assert.ok(walker.y < 0.1)
})

test('door clearance honors capsule radius and overhead structure height', () => {
  const door = [{ min: [-4, 0, -0.2], max: [-0.7, 6, 0.2] }, { min: [0.7, 0, -0.2], max: [4, 6, 0.2] }, { min: [-4, 3, -0.2], max: [4, 6, 0.2] }]
  assert.ok(isCapsuleFree({ x: 0, y: 0, z: 0 }, door))
  assert.ok(!isCapsuleFree({ x: 0.5, y: 0, z: 0 }, door))
  const through = moveCapsule({ x: 0, y: 0, z: 2 }, 0, -4, { ...world, colliders: door })
  assert.ok(through.z < -1.8)
})

test('bounds and invalid movement cannot create a fall or non-finite pose', () => {
  const pose = moveCapsule({ x: 19, y: 0, z: 0 }, 8, 0, world)
  assert.ok(pose.x <= 19.66)
  assert.deepEqual(moveCapsule(pose, NaN, Infinity, world), pose)
})
