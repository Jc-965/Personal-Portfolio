import assert from 'node:assert/strict'
import test from 'node:test'
import { journeyAt, journeyPath } from '../../src/components/teardown/route.ts'

test('a chapter journey lives at its id', () => {
  assert.equal(journeyPath('parkiwell'), '/parkiwell')
  assert.equal(journeyAt('/parkiwell', ['parkiwell']), 'parkiwell')
  assert.equal(journeyAt('/parkiwell/', ['parkiwell']), 'parkiwell')
  assert.equal(journeyAt('/', ['parkiwell']), null)
  assert.equal(journeyAt('/projects/parkiwell/', ['parkiwell']), null)
})

test('every chapter has a journey page and App knows each one', async () => {
  const { JOURNEYS } = await import('../../src/components/teardown/route.ts')
  const { TEARDOWNS } = await import('../../src/content/teardown/index.ts')
  const { CHAPTERS } = await import('../../src/content/chapters/index.ts')
  assert.deepEqual([...JOURNEYS].sort(), [...Object.keys(TEARDOWNS), ...Object.keys(CHAPTERS)].sort())
})
