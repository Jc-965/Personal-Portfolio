import assert from 'node:assert/strict'
import test from 'node:test'
import { applyMessage, createBackgroundRenderer } from '../../src/components/background/renderer.ts'

const METHODS = ['fillRect', 'beginPath', 'moveTo', 'lineTo', 'arc', 'fill', 'stroke', 'save', 'restore', 'setTransform', 'scale']
const PROPS = ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'globalAlpha', 'globalCompositeOperation']

// Records every call and property write so a test can read a frame back as a
// list of operations, the same way a real context would receive them.
function fakeContext(log) {
  const ctx = {}
  for (const name of METHODS) ctx[name] = (...args) => { log.push([name, ...args]) }
  for (const prop of PROPS) {
    let value = null
    Object.defineProperty(ctx, prop, { get: () => value, set: (next) => { value = next; log.push([`set:${prop}`, next]) } })
  }
  ctx.createLinearGradient = (...args) => { log.push(['createLinearGradient', ...args]); return { addColorStop() {} } }
  ctx.createRadialGradient = (...args) => { log.push(['createRadialGradient', ...args]); return { addColorStop() {} } }
  ctx.createPattern = (image, repetition) => {
    log.push(['createPattern', image, repetition])
    return { kind: 'pattern', setTransform(matrix) { log.push(['pattern.setTransform', matrix]) } }
  }
  return ctx
}

function fakeClock() {
  let now = 1000
  let nextId = 1
  let pending = []
  return {
    now: () => now,
    request(cb) { const id = nextId++; pending.push({ id, cb }); return id },
    cancel(id) { pending = pending.filter((entry) => entry.id !== id) },
    pendingCount: () => pending.length,
    tick(dt = 16.67) {
      now += dt
      const due = pending
      pending = []
      for (const { cb } of due) cb(now)
    },
  }
}

const DESKTOP = { isTouch: false, isMobile: false, isCompact: false, isActualMobile: false, isLowPower: false, useSimpleGrid: false, dpr: 2, targetFps: 60, noiseAlpha: 0.4 }
const PHONE = { isTouch: true, isMobile: true, isCompact: true, isActualMobile: true, isLowPower: false, useSimpleGrid: true, dpr: 1.28, targetFps: 56, noiseAlpha: 0.18 }

function setup(profile = DESKTOP, { reducedMotion = false, width = 1440, height = 900 } = {}) {
  const log = []
  const ctx = fakeContext(log)
  const canvas = { width: 300, height: 150, getContext: () => ctx }
  const clock = fakeClock()
  const renderer = createBackgroundRenderer(canvas, { reducedMotion, clock })
  assert.ok(renderer)
  renderer.resize(width, height, profile)
  return { log, canvas, clock, renderer, frame: () => { log.length = 0; clock.tick(); return log.slice() } }
}

const count = (ops, name) => ops.filter((op) => op[0] === name).length
const gridSection = (ops) => ops.slice(ops.findIndex((op) => op[0] === 'save') + 1, ops.findIndex((op) => op[0] === 'restore'))
const edgeSection = (ops) => {
  const start = ops.findIndex((op) => op[0] === 'set:lineCap')
  const end = ops.findIndex((op, index) => index > start && op[0] === 'createRadialGradient')
  return ops.slice(start + 1, end === -1 ? undefined : end)
}

test('a covered frame advances the simulation but never touches the canvas', () => {
  const { log, clock, renderer } = setup()
  const before = renderer.inspect().nodes.map((node) => [node.x, node.y])
  renderer.setCovered(true)
  log.length = 0
  for (let i = 0; i < 30; i++) clock.tick()
  assert.equal(log.length, 0, 'no drawing while covered')
  const after = renderer.inspect().nodes.map((node) => [node.x, node.y])
  assert.notDeepEqual(before, after, 'nodes kept drifting')
  renderer.setCovered(false)
  clock.tick()
  assert.ok(log.length > 0, 'painting resumes')
})

test('an idle desktop grid is two strokes of straight two-point lines', () => {
  const { frame } = setup()
  const grid = gridSection(frame())
  assert.equal(count(grid, 'stroke'), 2)
  assert.equal(count(grid, 'moveTo'), count(grid, 'lineTo'))
  assert.ok(count(grid, 'moveTo') > 60, `expected one moveTo per grid line, got ${count(grid, 'moveTo')}`)
})

test('with the pointer over the page, near lines stroke alone and every line keeps its full polyline', () => {
  const { frame, renderer } = setup()
  renderer.setPointer(720, 450)
  const grid = gridSection(frame())
  const lines = count(grid, 'moveTo')
  const strokes = count(grid, 'stroke')
  assert.ok(strokes > 2 && strokes < lines, `expected batching, got ${strokes} strokes for ${lines} lines`)
  assert.ok(count(grid, 'lineTo') > lines * 50, 'lines are still subdivided for the pointer pull')
})

test('idle nodes share one radial gradient and lit nodes get their own until the halo fades', () => {
  const { frame, renderer, clock } = setup()
  for (let i = 0; i < 120; i++) clock.tick()
  assert.equal(count(frame(), 'createRadialGradient'), 1, 'one shared glow gradient when nothing is lit')
  const node = renderer.inspect().nodes[0]
  renderer.setPointer(node.x + 4, node.y + 4)
  assert.ok(count(frame(), 'createRadialGradient') > 1, 'a lit node builds its own gradient')
  renderer.pointerLeave()
  for (let i = 0; i < 200; i++) clock.tick()
  assert.equal(count(frame(), 'createRadialGradient'), 1, 'halos snap back to zero')
})

test('edge colour is assigned once per frame while every edge is idle', () => {
  const { frame, clock } = setup()
  for (let i = 0; i < 120; i++) clock.tick()
  const edges = edgeSection(frame())
  assert.ok(count(edges, 'stroke') > 100, 'edges are still stroked one by one')
  assert.equal(count(edges, 'set:strokeStyle'), 1)
  assert.equal(count(edges, 'set:lineWidth'), 1)
})

test('the noise tile is blended last with overlay at the profile alpha', () => {
  const { frame, renderer, log } = setup()
  const tile = { kind: 'tile' }
  renderer.setNoise(tile, 2)
  assert.deepEqual(log.find((op) => op[0] === 'pattern.setTransform')?.[1], { a: 0.5, b: 0, c: 0, d: 0.5, e: 0, f: 0 })
  const ops = frame()
  const tail = ops.slice(-6)
  assert.deepEqual(tail.map((op) => op[0]), ['save', 'set:globalCompositeOperation', 'set:globalAlpha', 'set:fillStyle', 'fillRect', 'restore'])
  assert.equal(tail[1][1], 'overlay')
  assert.equal(tail[2][1], 0.4)
  assert.deepEqual(tail[4].slice(1), [0, 0, 1440, 900])
})

test('reduced motion paints one black frame with noise and schedules nothing', () => {
  const { log, clock, renderer } = setup(DESKTOP, { reducedMotion: true })
  assert.equal(clock.pendingCount(), 0)
  assert.ok(log.some((op) => op[0] === 'set:fillStyle' && op[1] === '#000000'))
  assert.equal(count(log, 'fillRect'), 1)
  log.length = 0
  renderer.setNoise({ kind: 'tile' }, 2)
  assert.equal(count(log, 'fillRect'), 2, 'repaints black plus noise')
  assert.equal(clock.pendingCount(), 0)
})

test('phones draw the simple grid as one stroke with flat node fills', () => {
  const { frame } = setup(PHONE, { width: 390, height: 844 })
  const ops = frame()
  assert.equal(count(gridSection(ops), 'stroke'), 1)
  assert.equal(count(ops, 'createRadialGradient'), 0)
  assert.ok(count(ops, 'arc') > 50)
})

test('hiding the tab stops the loop and showing it restarts', () => {
  const { clock, renderer } = setup()
  renderer.setHidden(true)
  assert.equal(clock.pendingCount(), 0)
  renderer.setHidden(false)
  assert.equal(clock.pendingCount(), 1)
  renderer.dispose()
  assert.equal(clock.pendingCount(), 0)
})

test('applyMessage routes the worker protocol onto the renderer', () => {
  const log = []
  const canvas = { width: 300, height: 150, getContext: () => fakeContext(log) }
  const clock = fakeClock()
  const renderer = createBackgroundRenderer(canvas, { reducedMotion: false, clock })
  applyMessage(renderer, { type: 'resize', width: 1440, height: 900, profile: DESKTOP })
  assert.ok(renderer.inspect().nodes.length > 50)
  applyMessage(renderer, { type: 'covered', covered: true })
  log.length = 0
  clock.tick()
  assert.equal(log.length, 0)
  applyMessage(renderer, { type: 'covered', covered: false })
  applyMessage(renderer, { type: 'scroll', progress: 0.5 })
  applyMessage(renderer, { type: 'pointer', x: 10, y: 10 })
  clock.tick()
  assert.ok(log.length > 0)
  applyMessage(renderer, { type: 'hidden', hidden: true })
  assert.equal(clock.pendingCount(), 0)
})
