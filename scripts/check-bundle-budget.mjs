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

const budgets = {
  initialJs: 145 * 1024,
  initialCss: 20 * 1024,
  lazyChunk: 300 * 1024,
}
const failures = []

if (initialJsBytes > budgets.initialJs) failures.push(`initial JS is ${(initialJsBytes / 1024).toFixed(1)} KiB gzip (budget: 145 KiB)`)
if (initialCssBytes > budgets.initialCss) failures.push(`initial CSS is ${(initialCssBytes / 1024).toFixed(1)} KiB gzip (budget: 20 KiB)`)
if (largestChunk.bytes > budgets.lazyChunk) failures.push(`${largestChunk.name} is ${(largestChunk.bytes / 1024).toFixed(1)} KiB gzip (budget: 300 KiB)`)
if (initialAssets.some((path) => /Sketchbook|Constellation|firebase|three/i.test(path))) {
  failures.push('an interactive feature chunk was added to the initial HTML')
}

console.log(`Bundle budgets: initial JS ${(initialJsBytes / 1024).toFixed(1)} KiB, initial CSS ${(initialCssBytes / 1024).toFixed(1)} KiB, largest lazy chunk ${(largestChunk.bytes / 1024).toFixed(1)} KiB.`)

if (failures.length > 0) {
  console.error(`Bundle budget failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
