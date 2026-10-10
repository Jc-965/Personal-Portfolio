import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { ACT_ORDER } from '../../src/content/teardown/types.ts'
import { PARKIWELL } from '../../src/content/teardown/parkiwell.ts'
import { totalSpan } from '../../src/components/teardown/timeline.ts'

const words = (text) => text.trim().split(/\s+/).length
const allCopy = () => [
  ...PARKIWELL.acts.flatMap((act) => [...act.lines, ...act.callouts.map((c) => c.text)]),
  ...PARKIWELL.cards.map((c) => c.label),
  ...PARKIWELL.screens.map((s) => s.alt),
  ...PARKIWELL.tags,
  ...PARKIWELL.links.map((l) => l.label),
]

test('acts follow the teardown order and the peak has the largest span', () => {
  assert.deepEqual(PARKIWELL.acts.map((a) => a.key), ACT_ORDER)
  const glass = PARKIWELL.acts.find((a) => a.key === 'glass').span
  assert.ok(PARKIWELL.acts.every((a) => a.key === 'glass' || a.span < glass))
  // The pinned travel matches the --teardown-travel fallback in teardown.css, and the e2e geometry is sized to it.
  assert.ok(Math.abs(totalSpan(PARKIWELL.acts) - 17.6) < 1e-9, `pinned travel ${totalSpan(PARKIWELL.acts)}`)
  // The quiet act must outlast two wheel notches (about 0.67 viewport-heights under Lenis) to read as a pause.
  assert.ok(PARKIWELL.acts.find((a) => a.key === 'quiet').span >= 0.7)
})

test('labels have at most eight words', () => {
  for (const act of PARKIWELL.acts) for (const c of act.callouts) assert.ok(words(c.text) <= 8, c.text)
  for (const card of PARKIWELL.cards) assert.ok(words(card.label) <= 8, card.label)
})

test('callouts on one surface run top to bottom, so leader lines never cross', () => {
  for (const act of PARKIWELL.acts) {
    const byPlane = new Map()
    for (const c of act.callouts) {
      const last = byPlane.get(c.anchor.plane)
      if (last !== undefined) assert.ok(c.anchor.v < last, `${act.key}: ${c.text} is not below the callout above it`)
      byPlane.set(c.anchor.plane, c.anchor.v)
    }
  }
})

test('copy has no dashes used as punctuation and no unsupported claims', () => {
  for (const text of allCopy()) {
    assert.ok(!/[\u2013\u2014]/.test(text), `dash in: ${text}`)
    assert.ok(!/<\s*25\s*ms|camera-to-feedback|process kills|downloads|users|rating|stars/i.test(text), `unsupported claim in: ${text}`)
  }
})

test('copy never restates the welcome screen or mentions the research', () => {
  for (const text of allCopy()) {
    assert.ok(!/calmer way|SoftCom|research|paper|accuracy/i.test(text), `restated or research copy: ${text}`)
  }
})

test('every asset path exists under public/', () => {
  const paths = [...PARKIWELL.screens.map((s) => s.src), ...PARKIWELL.backdrops.map((b) => b.src)]
  for (const p of paths) assert.ok(fs.existsSync(path.join('public', p)), `missing ${p}`)
})

test('room focus points sit inside the photo', () => {
  for (const b of PARKIWELL.backdrops) {
    assert.equal(b.focus.length, 2)
    for (const v of b.focus) assert.ok(v >= 0 && v <= 1)
  }
})

test('cards and backdrops reference real entries', () => {
  const keys = new Set(PARKIWELL.screens.map((s) => s.key))
  assert.equal(keys.size, PARKIWELL.screens.length, 'screen keys are unique')
  for (const card of PARKIWELL.cards) assert.ok(keys.has(card.screen))
  for (const act of PARKIWELL.acts) if (act.backdrop !== null) assert.ok(act.backdrop >= 0 && act.backdrop < PARKIWELL.backdrops.length)
})
