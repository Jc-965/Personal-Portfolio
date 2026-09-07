import assert from 'node:assert/strict'
import test from 'node:test'
import { gridFor, sceneProgress, arrivalProgress, glyphIndex, GLYPH_RAMP } from '../../src/components/hero/world.ts'

test('gridFor fits whole cells inside the viewport and centres the leftover', () => {
  const grid = gridFor(1440, 900, 7.2, 14)
  assert.equal(grid.cols, 200)
  assert.equal(grid.rows, 64)
  assert.ok(Math.abs(grid.offsetX - 0) < 1e-9)
  assert.ok(Math.abs(grid.offsetY - 2) < 1e-9)
})

test('gridFor never returns fewer than one cell', () => {
  const grid = gridFor(3, 2, 7.2, 14)
  assert.equal(grid.cols, 1)
  assert.equal(grid.rows, 1)
})

test('the gateway camera has a reversible normalized track and clamps at its ends', () => {
  assert.equal(sceneProgress(-100, 2400, 1000), 0)
  assert.equal(sceneProgress(700, 2400, 1000), 0.5)
  assert.equal(sceneProgress(1400, 2400, 1000), 1)
  assert.equal(sceneProgress(2800, 2400, 1000), 1)
  assert.equal(sceneProgress(350, 2400, 1000), 0.25)
})

test('the background handoff starts when Journey enters and ends when it reaches the top', () => {
  assert.equal(arrivalProgress(1300, 2400, 1000), 0)
  assert.equal(arrivalProgress(1400, 2400, 1000), 0)
  assert.equal(arrivalProgress(1900, 2400, 1000), 0.5)
  assert.equal(arrivalProgress(2400, 2400, 1000), 1)
  assert.equal(arrivalProgress(5000, 2400, 1000), 1)
})

test('zero scroll space cannot produce NaN or move the camera before the page is scrolled', () => {
  assert.equal(sceneProgress(0, 900, 900), 0)
  assert.equal(sceneProgress(100, 900, 900), 1)
  assert.equal(arrivalProgress(0, 0, 0), 0)
})

test('glyphIndex maps darkness to the empty glyph and full brightness to the last glyph', () => {
  const last = GLYPH_RAMP.length - 1
  assert.equal(glyphIndex(0), 0)
  assert.equal(glyphIndex(-1), 0)
  assert.equal(glyphIndex(1), last)
  assert.equal(glyphIndex(2), last)
  assert.ok(glyphIndex(0.5) > 0 && glyphIndex(0.5) < last)
})
