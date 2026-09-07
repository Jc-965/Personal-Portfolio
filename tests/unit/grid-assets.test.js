import { Blob, Buffer } from 'node:buffer'
import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
const compiled = await build({ entryPoints: ['src/components/TheGrid/gridAssets.ts'], bundle: true, write: false, format: 'esm', platform: 'node' })
const { preloadGridAssets, GRID_SURFACE_URLS } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)

test('boot prefetch survives missing compressed textures using WebP without loading districts', async t => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async url => {
    requests.push(url)
    if (url.endsWith('.ktx2')) return { ok: false }
    return { ok: true, blob: async () => new Blob() }
  })
  const progress = []
  await preloadGridAssets(value => progress.push(value))
  assert.equal(requests.length, 1 + GRID_SURFACE_URLS.length * 2)
  assert.equal(progress.at(-1), 1)
  assert.ok(requests.every(url => !/facade|Metal|rust|tile|velvet/.test(url)))
  for (const url of GRID_SURFACE_URLS) assert.ok(requests.includes(url.replace('.ktx2', '.webp')))
})

test('boot propagates errors when both texture formats fail', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('.hdr')) return { ok: true, blob: async () => new Blob() }
    throw new Error('Network unavailable')
  })
  await assert.rejects(preloadGridAssets(), /Network unavailable/)
})
