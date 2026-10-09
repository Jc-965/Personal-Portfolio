import assert from 'node:assert/strict'
import test from 'node:test'
import { actWindows, actAt, copyRide, dwell, localOf, ramp, totalSpan } from '../../src/components/teardown/timeline.ts'

const ACTS = [
  { key: 'arrival', span: 1 }, { key: 'hand', span: 0.9 }, { key: 'day', span: 1.4 }, { key: 'quiet', span: 0.4 },
  { key: 'glass', span: 2.2 }, { key: 'proof', span: 0.9 }, { key: 'coach', span: 0.8 }, { key: 'close', span: 0.8 },
]
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps

test('act windows are contiguous, ordered, and cover 0 to 1', () => {
  const windows = actWindows(ACTS)
  assert.equal(windows.length, 8)
  assert.equal(windows[0].start, 0)
  assert.equal(windows.at(-1).end, 1)
  for (let i = 1; i < windows.length; i++) assert.ok(Math.abs(windows[i].start - windows[i - 1].end) < 1e-12)
  assert.ok(Math.abs(totalSpan(ACTS) - 8.4) < 1e-9)
})

test('the peak act has the largest window by a visible margin', () => {
  const windows = actWindows(ACTS)
  const widths = windows.map((w) => w.end - w.start)
  const glass = widths[4]
  const others = widths.filter((_, i) => i !== 4)
  assert.ok(others.every((w) => glass > w * 1.4))
})

test('actAt maps boundaries to the act that starts there and progress 1 to the last act', () => {
  const windows = actWindows(ACTS)
  assert.deepEqual(actAt(windows, 0), { index: 0, key: 'arrival', local: 0 })
  assert.equal(actAt(windows, windows[2].start).key, 'day')
  assert.equal(actAt(windows, windows[2].start).local, 0)
  const last = actAt(windows, 1)
  assert.equal(last.key, 'close')
  assert.equal(last.local, 1)
  assert.equal(actAt(windows, -3).key, 'arrival')
  assert.equal(actAt(windows, 7).key, 'close')
})

test('localOf clamps to 0 before an act and 1 after it', () => {
  const windows = actWindows(ACTS)
  assert.equal(localOf(windows, 'glass', 0), 0)
  assert.equal(localOf(windows, 'glass', 1), 1)
  const mid = (windows[4].start + windows[4].end) / 2
  assert.ok(Math.abs(localOf(windows, 'glass', mid) - 0.5) < 1e-9)
})

test('ramp is a clamped smoothstep', () => {
  assert.equal(ramp(0, 0.2, 0.6), 0)
  assert.equal(ramp(1, 0.2, 0.6), 1)
  assert.ok(Math.abs(ramp(0.4, 0.2, 0.6) - 0.5) < 1e-12)
})

test('dwell is monotonic from 0 to 1, passes through the middle, and lingers there', () => {
  assert.equal(dwell(0), 0)
  assert.ok(near(dwell(0.5), 0.5))
  assert.ok(near(dwell(1), 1))
  assert.equal(dwell(-1), 0)
  assert.ok(near(dwell(2), 1))
  let last = 0
  for (let i = 1; i <= 100; i++) {
    const v = dwell(i / 100)
    assert.ok(v > last, `dwell rises at ${i / 100}`)
    last = v
  }
  // The middle 60% of the input covers well under 60% of the output, and the outer 40% covers the rest.
  const middle = dwell(0.8) - dwell(0.2)
  assert.ok(middle > 0.25 && middle < 0.45, `middle share ${middle}`)
})

test('copyRide carries the copy from below centre to above it, readable through the middle', () => {
  assert.ok(near(copyRide(0).y, 0.45))
  assert.ok(near(copyRide(0.5).y, 0))
  assert.ok(near(copyRide(1).y, -0.45))
  assert.equal(copyRide(0).opacity, 0)
  assert.equal(copyRide(1).opacity, 0)
  assert.equal(copyRide(0.5).opacity, 1)
  let lastY = Infinity
  for (let i = 0; i <= 50; i++) {
    const { y, opacity } = copyRide(i / 50)
    assert.ok(y < lastY, `y falls at ${i / 50}`)
    lastY = y
    assert.ok(opacity >= 0 && opacity <= 1)
    if (Math.abs(y) <= 0.28) assert.equal(opacity, 1, `fully shown at ${i / 50} where y is ${y}`)
    if (Math.abs(y) >= 0.45 - 1e-9) assert.equal(opacity, 0, `gone at ${i / 50} where y is ${y}`)
  }
  // Slow through the middle: the copy stays within reading range for most of the act.
  assert.equal(copyRide(0.15).opacity, 1)
  assert.equal(copyRide(0.85).opacity, 1)
})
