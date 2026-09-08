import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DITHER_BAND, MAX_WOUNDS, WOUND_LIFE, WOUND_RADIUS,
  addWound, cellResolve, coverTransform, packWounds, readoutAt, woundStrength,
} from '../../src/components/decoded/decodeMath.ts'

test('a cell resolves once progress passes its roll, softly across the band', () => {
  assert.equal(cellResolve(0.5, 0.5 + DITHER_BAND), 1)
  assert.equal(cellResolve(0.5, 0.5 - DITHER_BAND), 0)
  assert.ok(Math.abs(cellResolve(0.5, 0.5) - 0.5) < 1e-9)
})

test('a wound is strongest when made and relaxes within its life', () => {
  const wound = { x: 0, y: 0, at: 10 }
  assert.equal(woundStrength(wound, 10), 1)
  assert.ok(woundStrength(wound, 10 + WOUND_LIFE) < 0.06)
  assert.equal(woundStrength(wound, 9), 0)
})

test('wounds are capped and packed newest first with the dead ones dropped', () => {
  const wounds = []
  for (let i = 0; i < MAX_WOUNDS + 5; i++) addWound(wounds, i, i, i)
  assert.equal(wounds.length, MAX_WOUNDS)
  const out = packWounds(wounds, MAX_WOUNDS + 4, new Float32Array(MAX_WOUNDS * 4), 2)
  assert.equal(out[0], (MAX_WOUNDS + 4) * 2, 'newest first, scaled')
  assert.equal(out[2], WOUND_RADIUS * 2)
  assert.equal(out[3], 1)
  assert.ok(wounds.length < MAX_WOUNDS, 'relaxed wounds were dropped')
})

test('coverTransform crops like object-fit cover', () => {
  const wide = coverTransform(200, 100, 100, 100)
  assert.deepEqual(wide.scale, [1, 0.5])
  assert.deepEqual(wide.offset, [0, 0.25])
  const tall = coverTransform(100, 200, 100, 100)
  assert.deepEqual(tall.scale, [0.5, 1])
  assert.deepEqual(tall.offset, [0.25, 0])
})

test('readoutAt counts numbers and types words', () => {
  assert.equal(readoutAt('<25 MS', 0), '<0 MS')
  assert.equal(readoutAt('<25 MS', 0.5), '<13 MS')
  assert.equal(readoutAt('<25 MS', 1), '<25 MS')
  assert.equal(readoutAt('1M WRITES', 1), '1M WRITES')
  assert.equal(readoutAt('4-TIER', 0.5), '2-TIER')
  assert.equal(readoutAt('ZERO', 0.5), 'ZE')
  assert.equal(readoutAt('ZERO', 1), 'ZERO')
})
