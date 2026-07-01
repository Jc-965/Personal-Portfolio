// Convert every JPG under public/ to WebP and delete the JPG original —
// the site references .webp directly (WindowFrame et al.), so JPGs are only
// a temporary drop-in format. Workflow for new screenshots:
//   1. drop the .jpg/.jpeg export into public/<project>/
//   2. npm run images:webp
//   3. reference the .webp path in the component
import { readdirSync, statSync, unlinkSync } from 'node:fs'
import { join, extname } from 'node:path'
import sharp from 'sharp'

const ROOT = 'public'

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.jpe?g$/i.test(extname(full))) out.push(full)
  }
  return out
}

const jpgs = walk(ROOT)
if (jpgs.length === 0) {
  console.log('No JPGs under public/ — nothing to convert.')
  process.exit(0)
}

let originalTotal = 0
let webpTotal = 0

await Promise.all(
  jpgs.map(async (src) => {
    const dest = src.replace(/\.jpe?g$/i, '.webp')
    await sharp(src).webp({ quality: 80, effort: 6 }).toFile(dest)
    const before = statSync(src).size
    const after = statSync(dest).size
    originalTotal += before
    webpTotal += after
    unlinkSync(src) // webp verified written above; original no longer needed
    console.log(`${src} → ${dest}  (${(before / 1024) | 0}KB → ${(after / 1024) | 0}KB, jpg removed)`)
  }),
)

const pct = originalTotal ? Math.round((1 - webpTotal / originalTotal) * 100) : 0
console.log(`\nConverted ${jpgs.length} images. ${(originalTotal / 1024) | 0}KB → ${(webpTotal / 1024) | 0}KB (−${pct}%)`)
