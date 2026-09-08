import assert from 'node:assert/strict'
import test from 'node:test'
import { PRESS_RADIUS, createPointerFx, easePull, pressAt } from '../../src/components/hero/pointerFx.ts'

test('the pull eases toward its target and snaps when close', () => {
  const fx = createPointerFx()
  fx.targetPull = 1
  easePull(fx, 0.1)
  assert.ok(fx.pull > 0.4 && fx.pull < 0.5)
  for (let i = 0; i < 40; i++) easePull(fx, 0.1)
  assert.equal(fx.pull, 1)
})

test('the pull centre snaps to the pointer while off and trails it while on', () => {
  const fx = createPointerFx()
  fx.x = 300
  fx.y = 200
  easePull(fx, 0.016)
  assert.deepEqual([fx.px, fx.py], [300, 200], 'off: no fly-in from the last resting place')
  fx.pull = 1
  fx.targetPull = 1
  fx.x = 400
  easePull(fx, 0.016)
  assert.ok(fx.px > 300 && fx.px < 400, 'on: the centre is still catching up')
  for (let i = 0; i < 200; i++) easePull(fx, 0.016)
  assert.ok(Math.abs(fx.px - 400) < 0.01, 'and it gets there')
})

test('a press is strongest the instant it lands and relaxes from there', () => {
  const fx = createPointerFx()
  assert.equal(pressAt(fx, 5).strength, 0)
  fx.press = { x: 100, y: 200, startedAt: 10 }
  const start = pressAt(fx, 10)
  assert.equal(start.strength, 1)
  assert.equal(start.radius, PRESS_RADIUS)
  assert.deepEqual([start.x, start.y], [100, 200])
  const later = pressAt(fx, 10.3)
  assert.ok(later.strength > 0.3 && later.strength < 0.5)
  assert.ok(later.radius < PRESS_RADIUS)
  assert.equal(pressAt(fx, 9).strength, 0)
  assert.equal(pressAt(fx, 12).strength, 0)
})
