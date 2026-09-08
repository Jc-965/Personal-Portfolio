import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { acquireLink, createRendererLink, releaseLink } from '../../src/components/background/link.ts'

function fakeWorker() {
  const worker = { sent: [], terminated: false, onmessage: null, onerror: null }
  worker.postMessage = (message, transfer = []) => worker.sent.push({ message, transfer })
  worker.terminate = () => { worker.terminated = true }
  return worker
}

function fakeRendererModule() {
  const applied = []
  const renderer = { applied, disposed: false, dispose() { renderer.disposed = true } }
  const module = {
    created: [],
    createBackgroundRenderer(canvas, options) { module.created.push({ canvas, options }); return renderer },
    applyMessage(target, message) { target.applied.push(message) },
  }
  return { module, renderer }
}

const offscreen = { kind: 'offscreen' }
const canvas = () => ({ width: 300, height: 150, getContext: () => ({}), transferControlToOffscreen: () => offscreen })
const flush = () => delay(0)

test('the canvas is handed to the worker only after it reports ready, with earlier messages queued in order', () => {
  const worker = fakeWorker()
  const link = createRendererLink(canvas(), { reducedMotion: false, spawnWorker: () => worker, loadRenderer: () => Promise.reject(new Error('unused')) })
  assert.equal(link.worker, true)
  link.post({ type: 'resize', width: 10, height: 10, profile: {} })
  link.post({ type: 'covered', covered: true })
  assert.equal(worker.sent.length, 0, 'nothing crosses before the handshake')
  worker.onmessage({ data: { type: 'ready' } })
  assert.deepEqual(worker.sent.map((entry) => entry.message.type), ['init', 'resize', 'covered'])
  assert.equal(worker.sent[0].message.canvas, offscreen)
  assert.deepEqual(worker.sent[0].transfer, [offscreen])
  const bitmap = { kind: 'bitmap' }
  link.post({ type: 'noise', tile: bitmap, scale: 2 }, [bitmap])
  assert.deepEqual(worker.sent.at(-1).transfer, [bitmap])
  link.dispose()
  assert.equal(worker.terminated, true)
})

test('a worker that fails before ready is replaced by the inline renderer on the untouched canvas', async () => {
  const worker = fakeWorker()
  const { module, renderer } = fakeRendererModule()
  const target = canvas()
  const link = createRendererLink(target, { reducedMotion: false, spawnWorker: () => worker, loadRenderer: () => Promise.resolve(module) })
  link.post({ type: 'covered', covered: true })
  worker.onerror(new Error('boom'))
  assert.equal(worker.terminated, true)
  assert.equal(link.worker, false)
  await flush()
  assert.equal(module.created[0].canvas, target)
  assert.equal(module.created[0].options.reducedMotion, false)
  assert.deepEqual(renderer.applied, [{ type: 'covered', covered: true }])
  link.post({ type: 'scroll', progress: 0.2 })
  assert.equal(renderer.applied.length, 2)
  link.dispose()
  assert.equal(renderer.disposed, true)
})

test('a worker without frame scheduling says so and the link falls back the same way', async () => {
  const worker = fakeWorker()
  const { module } = fakeRendererModule()
  const link = createRendererLink(canvas(), { reducedMotion: false, spawnWorker: () => worker, loadRenderer: () => Promise.resolve(module) })
  worker.onmessage({ data: { type: 'unsupported' } })
  await flush()
  assert.equal(link.worker, false)
  assert.equal(module.created.length, 1)
})

test('reduced motion, a missing worker, or a spawn error all go straight inline', async () => {
  const { module } = fakeRendererModule()
  const noWorker = createRendererLink(canvas(), { reducedMotion: false, spawnWorker: () => null, loadRenderer: () => Promise.resolve(module) })
  const reduced = createRendererLink(canvas(), { reducedMotion: true, spawnWorker: () => fakeWorker(), loadRenderer: () => Promise.resolve(module) })
  const threw = createRendererLink(canvas(), { reducedMotion: false, spawnWorker: () => { throw new Error('csp') }, loadRenderer: () => Promise.resolve(module) })
  assert.deepEqual([noWorker.worker, reduced.worker, threw.worker], [false, false, false])
  await flush()
  assert.equal(module.created.length, 3)
  assert.equal(module.created[1].options.reducedMotion, true)
})

test('disposing before the inline module arrives leaves no renderer behind', async () => {
  const { module } = fakeRendererModule()
  const link = createRendererLink(canvas(), { reducedMotion: true, spawnWorker: () => null, loadRenderer: () => Promise.resolve(module) })
  link.dispose()
  await flush()
  assert.equal(module.created.length, 0)
})

test('acquire returns the same link for the same canvas until a release is allowed to settle', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const target = canvas()
    const worker = fakeWorker()
    const options = { reducedMotion: false, spawnWorker: () => worker, loadRenderer: () => Promise.reject(new Error('unused')) }
    const first = acquireLink(target, options)
    releaseLink(target)
    const second = acquireLink(target, options)
    assert.equal(second, first, 'a remount before the tick reuses the link')
    assert.equal(worker.terminated, false)
    releaseLink(target)
    mock.timers.tick(1)
    assert.equal(worker.terminated, true, 'a real unmount disposes on the next tick')
    const third = acquireLink(target, { ...options, spawnWorker: () => fakeWorker() })
    assert.notEqual(third, first)
  } finally {
    mock.timers.reset()
  }
})
