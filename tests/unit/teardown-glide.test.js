import assert from 'node:assert/strict'
import test from 'node:test'
import { GLIDE_TIME, glideStep } from '../../src/components/teardown/glide.ts'

test('the glide time constant is about a third of a second', () => {
  assert.equal(GLIDE_TIME, 0.32)
})

test('glide approaches the target without overshoot', () => {
  let s = { value: 0, velocity: 0 }
  let max = 0
  for (let i = 0; i < 300; i++) {
    s = glideStep(s, 1, 1 / 60)
    max = Math.max(max, s.value)
  }
  assert.ok(max <= 1 + 1e-9)
  assert.ok(Math.abs(s.value - 1) < 1e-3)
})

test('glide covers about 0.6 of a step in one time constant', () => {
  let s = { value: 0, velocity: 0 }
  const steps = Math.round(GLIDE_TIME * 240)
  for (let i = 0; i < steps; i++) s = glideStep(s, 1, 1 / 240)
  // Critically damped from rest: 1 - (1 + 2) * e^-2 = 0.594 after one time constant.
  assert.ok(s.value > 0.45 && s.value < 0.75, `value after one time constant: ${s.value}`)
})

test('glide is stable for a long frame', () => {
  const s = glideStep({ value: 0, velocity: 0 }, 1, 0.5)
  assert.ok(Number.isFinite(s.value) && s.value <= 1 + 1e-9)
})
