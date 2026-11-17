import { readdir, readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const dist = new URL('../dist/', import.meta.url)
const html = await readFile(new URL('index.html', dist), 'utf8')
const assetPaths = [...html.matchAll(/(?:src|href)="\/(assets\/[^\"]+\.(?:js|css))"/g)]
  .map((match) => match[1])
const initialAssets = [...new Set(assetPaths)]

const gzipBytes = async (relativePath) => gzipSync(await readFile(new URL(relativePath, dist))).byteLength
const initialJs = initialAssets.filter((path) => path.endsWith('.js'))
const initialCss = initialAssets.filter((path) => path.endsWith('.css'))
const initialJsBytes = (await Promise.all(initialJs.map(gzipBytes))).reduce((sum, size) => sum + size, 0)
const initialCssBytes = (await Promise.all(initialCss.map(gzipBytes))).reduce((sum, size) => sum + size, 0)

const allJs = (await readdir(new URL('assets/', dist))).filter((name) => name.endsWith('.js'))
const allJsSizes = await Promise.all(allJs.map(async (name) => ({ name, bytes: await gzipBytes(`assets/${name}`) })))
const largestChunk = allJsSizes.sort((a, b) => b.bytes - a.bytes)[0]

// Early chunks are requested on every desktop visit before any scroll, and the
// HTML references none of them: the lazy components App mounts without a
// viewport gate (the analytics wrapper builds as a lazy react-* chunk, and
// Journey mounts at load on viewports under about 1,140 px tall) and the
// background worker. Each name is the chunk name before its content hash.
const earlyChunkNames = ['TargetCursor', 'ScrollProvider', 'react', 'Journey', 'background.worker']
const initialJsNames = new Set(initialJs.map((path) => path.replace('assets/', '')))
const gzipSizeOf = new Map(allJsSizes.map(({ name, bytes }) => [name, bytes]))
const staticImportsOf = async (name) =>
  [...(await readFile(new URL(`assets/${name}`, dist), 'utf8')).matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)]
    .map((match) => match[1])
const earlyJs = new Set()
// A chunk's static imports load with it. Chunks the HTML already references
// count toward initial JS and are left out here.
const collectEarly = async (name) => {
  if (earlyJs.has(name) || initialJsNames.has(name)) return
  earlyJs.add(name)
  for (const dependency of await staticImportsOf(name)) await collectEarly(dependency)
}
const missingEarly = []
for (const chunkName of earlyChunkNames) {
  const matches = allJs.filter((name) => name.startsWith(`${chunkName}-`) && !initialJsNames.has(name))
  if (matches.length === 0) missingEarly.push(chunkName)
  for (const name of matches) await collectEarly(name)
}
const earlyJsBytes = [...earlyJs].reduce((sum, name) => sum + (gzipSizeOf.get(name) ?? 0), 0)

const budgets = {
  // 124 KiB since 2026-09-13: BeyondBuild and Toolkit ship in the initial
  // bundle (about 5 KiB gzipped) so their sections never mount late and shift
  // the page. Anything else that grows this number needs its own reason.
  initialJs: 124 * 1024,
  initialCss: 18 * 1024,
  lazyChunk: 220 * 1024,
  // 62.1 KiB in the build of 2026-10-16. The limit leaves room for small
  // changes and fails a build that adds a library to an early chunk.
  earlyJs: 70 * 1024,
}
const failures = []

if (initialJsBytes > budgets.initialJs) failures.push(`initial JS is ${(initialJsBytes / 1024).toFixed(1)} KiB gzip (budget: ${budgets.initialJs / 1024} KiB)`)
if (initialCssBytes > budgets.initialCss) failures.push(`initial CSS is ${(initialCssBytes / 1024).toFixed(1)} KiB gzip (budget: ${budgets.initialCss / 1024} KiB)`)
if (largestChunk.bytes > budgets.lazyChunk) failures.push(`${largestChunk.name} is ${(largestChunk.bytes / 1024).toFixed(1)} KiB gzip (budget: ${budgets.lazyChunk / 1024} KiB)`)
if (earlyJsBytes > budgets.earlyJs) failures.push(`early lazy JS is ${(earlyJsBytes / 1024).toFixed(1)} KiB gzip (budget: ${budgets.earlyJs / 1024} KiB)`)
if (initialAssets.some((path) => /Sketchbook|Constellation|firebase|three/i.test(path))) {
  failures.push('an interactive feature chunk was added to the initial HTML')
}

console.log(`Bundle budgets: initial JS ${(initialJsBytes / 1024).toFixed(1)} KiB, initial CSS ${(initialCssBytes / 1024).toFixed(1)} KiB, early lazy JS ${(earlyJsBytes / 1024).toFixed(1)} KiB, largest lazy chunk ${(largestChunk.bytes / 1024).toFixed(1)} KiB.`)
// A renamed or removed early chunk leaves the early total too low, so the gap is printed with the totals.
if (missingEarly.length > 0) console.warn(`Bundle budgets: no early chunk matched ${missingEarly.join(', ')}. Update earlyChunkNames in scripts/check-bundle-budget.mjs.`)

if (failures.length > 0) {
  console.error(`Bundle budget failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
