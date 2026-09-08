import assert from 'node:assert/strict'
import test from 'node:test'
import { isHeroCovering, onHeroCover, setHeroCovering } from '../../src/components/hero/heroCover.ts'

test('the hero cover signal starts uncovered and notifies only on change', () => {
  assert.equal(isHeroCovering(), false)
  const seen = []
  const stop = onHeroCover((covering) => seen.push(covering))
  setHeroCovering(true)
  setHeroCovering(true)
  setHeroCovering(false)
  assert.deepEqual(seen, [true, false])
  assert.equal(isHeroCovering(), false)
  stop()
  setHeroCovering(true)
  assert.deepEqual(seen, [true, false], 'unsubscribed listeners stay quiet')
  assert.equal(isHeroCovering(), true)
  setHeroCovering(false)
})
