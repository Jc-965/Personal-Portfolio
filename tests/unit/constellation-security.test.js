import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { URL } from 'node:url'
import { calculateMegaStarsFromBatch } from '../../api/_constellationMerge.js'
import { hashSessionSecret, isValidSessionSecret, ownsStar } from '../../api/_starIdentity.js'
import { isSameOriginRequest, checkRateLimit } from '../../api/_security.js'
import { isAllowedStarMessage, readJson } from '../../api/_starModeration.js'

test('star ownership requires a hash and rejects world-readable legacy ids', () => {
  const secret = 'browser-session-secret'
  const sessionHash = hashSessionSecret(secret)

  assert.equal(ownsStar({ sessionHash }, secret), true)
  assert.equal(ownsStar({ sessionHash }, 'different-session'), false)
  assert.equal(ownsStar({ sessionId: secret }, secret), false)
  assert.equal(isValidSessionSecret('x'.repeat(37)), false)
})

test('constellation compaction preserves the represented star count', () => {
  const stars = Array.from({ length: 20 }, (_, index) => ({
    x: index < 10 ? 0.1 : 0.8,
    y: index < 10 ? 0.1 : 0.8,
    color: index < 10 ? '#00ffff' : '#ff00ff',
    message: '',
  }))
  const compacted = calculateMegaStarsFromBatch(stars, 1234)

  assert.equal(compacted.length, 2)
  assert.equal(compacted.reduce((sum, star) => sum + star.mergedCount, 0), stars.length)
  assert.ok(compacted.every((star) => star.timestamp === 1234 && star.isMega))
})

test('message moderation catches separator-based evasion and payload limits', async () => {
  assert.equal(isAllowedStarMessage('hello from Pittsburgh'), true)
  assert.equal(isAllowedStarMessage('f.u.c.k'), false)

  await assert.rejects(
    readJson({ body: JSON.stringify({ message: 'x'.repeat(5000) }) }),
    (error) => error.statusCode === 413,
  )
})

test('same-origin and per-key rate guards reject hostile or excess requests', () => {
  assert.equal(isSameOriginRequest({ headers: { origin: 'https://www.jc-965.com', host: 'www.jc-965.com' } }), true)
  assert.equal(isSameOriginRequest({ headers: { origin: 'https://attacker.example', host: 'www.jc-965.com' } }), false)

  const key = `test-${Date.now()}-${Math.random()}`
  assert.equal(checkRateLimit(key, { limit: 1, windowMs: 1000 }).allowed, true)
  assert.equal(checkRateLimit(key, { limit: 1, windowMs: 1000 }).allowed, false)
})

test('Firebase rules expose reads but reserve every write for server credentials', async () => {
  const rules = JSON.parse(await readFile(new URL('../../database.rules.json', import.meta.url), 'utf8')).rules
  assert.equal(rules.stars['.read'], true)
  assert.equal(rules.stars['.write'], false)
  assert.equal(rules.metadata['.read'], true)
  assert.equal(rules.metadata['.write'], false)
  assert.equal(rules['.write'], false)
})
