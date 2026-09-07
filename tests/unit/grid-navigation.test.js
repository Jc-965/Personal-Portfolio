import { Buffer } from 'node:buffer'
import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'

const compiled = await build({
  entryPoints: ['src/components/TheGrid/navigation/session.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  loader: { '.json': 'json' },
})
const navigation = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)

test('photo mode restores the mode and freezes shared world time', () => {
  const session = new navigation.GridSession(false)
  session.toggleTour()
  assert.equal(session.getSnapshot().mode, 'tour')
  session.togglePhoto()
  navigation.advanceWorldTime(1 / 60, true)
  assert.equal(session.getSnapshot().mode, 'photo')
  assert.equal(navigation.WORLD_TIME.delta, 0)
  assert.equal(navigation.WORLD_TIME.frozen, true)
  session.togglePhoto()
  assert.equal(session.getSnapshot().mode, 'tour')
})

test('landmark lookup reports a nearby interaction without selecting distant places', () => {
  assert.equal(navigation.nearestLandmark({ x: 9, y: 0, z: 31 }, 3)?.id, 'contact')
  assert.equal(navigation.nearestLandmark({ x: 140, y: 0, z: 40 }, 3), null)
})

test('reduced motion exposes every authored landmark through direct travel', () => {
  const session = new navigation.GridSession(true)
  for (const landmark of navigation.NAVIGATION_LANDMARKS) {
    session.travel(landmark.id)
    assert.equal(session.pendingTravel?.id, landmark.id)
  }
})
