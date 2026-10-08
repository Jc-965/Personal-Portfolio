import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { ACT_ORDER } from '../../src/content/teardown/types.ts'
import { PARKIWELL } from '../../src/content/teardown/parkiwell.ts'

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
})

test('labels have at most eight words', () => {
  for (const act of PARKIWELL.acts) for (const c of act.callouts) assert.ok(words(c.text) <= 8, c.text)
  for (const card of PARKIWELL.cards) assert.ok(words(card.label) <= 8, card.label)
})

test('copy has no dashes used as punctuation and no unsupported claims', () => {
  for (const text of allCopy()) {
    assert.ok(!/[\u2013\u2014]/.test(text), `dash in: ${text}`)
    assert.ok(!/<\s*25\s*ms|camera-to-feedback|process kills|downloads|users|rating|stars/i.test(text), `unsupported claim in: ${text}`)
  }
})

test('every asset path exists under public/', () => {
  const paths = [...PARKIWELL.screens.map((s) => s.src), ...PARKIWELL.backdrops.map((b) => b.src)]
  for (const p of paths) assert.ok(fs.existsSync(path.join('public', p)), `missing ${p}`)
})

test('cards and backdrops reference real entries', () => {
  const keys = new Set(PARKIWELL.screens.map((s) => s.key))
  for (const card of PARKIWELL.cards) assert.ok(keys.has(card.screen))
  for (const act of PARKIWELL.acts) if (act.backdrop !== null) assert.ok(act.backdrop >= 0 && act.backdrop < PARKIWELL.backdrops.length)
})
