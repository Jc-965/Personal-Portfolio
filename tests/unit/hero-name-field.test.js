import assert from 'node:assert/strict'
import test from 'node:test'
import { signedDistanceField, encodeField, nameSlab, inkAnchor, NAME_SPREAD, NAME_TEXTURE } from '../../src/components/hero/nameField.ts'
import { project } from '../../src/components/hero/world.ts'

/** A 32x32 mask with a filled square covering x,y in [11, 20]. */
function squareMask() {
  const size = 32
  const mask = new Uint8Array(size * size)
  for (let y = 11; y <= 20; y++) for (let x = 11; x <= 20; x++) mask[y * size + x] = 1
  return { mask, size }
}

test('signedDistanceField is negative inside, zero at the boundary band, positive outside', () => {
  const { mask, size } = squareMask()
  const field = signedDistanceField(mask, size, size)
  assert.ok(Math.abs(field[15 * size + 15] + 5) < 1e-9, `centre should sit 5 texels inside, got ${field[15 * size + 15]}`)
  assert.equal(field[15 * size + 25], 5, 'five texels right of the square')
  assert.equal(field[15 * size + 21], 1, 'immediately outside the right edge')
  assert.equal(field[15 * size + 20], -1, 'the edge texel itself is one step inside')
  assert.ok(Math.abs(field[5 * size + 5] - Math.hypot(6, 6)) < 1e-5, 'diagonal distance to the corner')
})

test('signedDistanceField of an empty mask is far outside everywhere', () => {
  const field = signedDistanceField(new Uint8Array(16), 4, 4)
  for (const d of field) assert.ok(d > 100)
})

test('encodeField maps the surface to mid grey and clamps beyond the spread', () => {
  const bytes = encodeField(new Float32Array([0, NAME_SPREAD, -NAME_SPREAD, NAME_SPREAD * 4, -NAME_SPREAD * 4, NAME_SPREAD / 2]))
  assert.equal(bytes[0], 128)
  assert.equal(bytes[1], 255)
  assert.equal(bytes[2], 0)
  assert.equal(bytes[3], 255)
  assert.equal(bytes[4], 0)
  assert.ok(bytes[5] > 180 && bytes[5] < 200)
})

/** A 1440x900 rest pose: copy 86px from the left, its top 652px down, 40px of clearance. */
const anchorFor = (width, height, copyLeft, copyTop, narrow = false) => ({
  narrow,
  aspect: width / height,
  left: (copyLeft / width * 2 - 1) * (width / height),
  top: 1 - 2 * copyTop / height,
  gap: 2 * 40 / height,
  ink: { left: 10, bottom: 160 },
})
const FOCAL = 1.65
const DEPTH = 6

test('nameSlab lands the ink on the copy edge', () => {
  const anchor = anchorFor(1440, 900, 86, 652)
  const slab = nameSlab(anchor)
  assert.ok(slab)
  const [w, h] = slab.size
  assert.ok(Math.abs(w / h - NAME_TEXTURE.width / NAME_TEXTURE.height) < 1e-9, 'slab keeps the texture aspect')
  assert.ok(w > 5 && w <= 6.5)
  // The ink's left edge projects back onto the copy's left edge.
  const inkLeftX = slab.pos[0] - w / 2 + (anchor.ink.left / NAME_TEXTURE.width) * w
  assert.ok(Math.abs(inkLeftX * FOCAL / DEPTH - anchor.left) < 1e-9)
  // The last baseline projects to the copy's top plus the clearance.
  const inkBottomY = slab.pos[1] + h / 2 - (anchor.ink.bottom / NAME_TEXTURE.height) * h
  assert.ok(Math.abs((FOCAL * (inkBottomY - 2) / DEPTH + 0.05) - (anchor.top + anchor.gap)) < 1e-9)
  // The plate ends near centre screen so the gateway stays clear.
  const rightUv = (slab.pos[0] + w / 2) * FOCAL / DEPTH
  assert.ok(rightUv <= 0.15 * anchor.aspect + 1e-9)
})

test('nameSlab shrinks the plate on squarer viewports but never below its floor', () => {
  const square = nameSlab(anchorFor(800, 900, 48, 650))
  const wide = nameSlab(anchorFor(1440, 900, 86, 652))
  assert.ok(square.size[0] < wide.size[0])
  assert.ok(square.size[0] >= 2.2)
})

test('on a phone the plate spans the width under the raised gateway and stays on screen', () => {
  const width = 390, height = 844
  const anchor = anchorFor(width, height, 24, 700, true)
  const slab = nameSlab(anchor)
  const point = inkAnchor(slab, anchor.ink)
  const rest = project(point, 0, width / height, true)
  assert.ok(rest)
  assert.ok(Math.abs(rest.x * width - 24) < 1e-6, `left ${rest.x * width}`)
  assert.ok(Math.abs(rest.y * height - (700 - 40)) < 1e-6, `bottom ${rest.y * height}`)
  const rightUv = (slab.pos[0] + slab.size[0] / 2) * 1.65 / 6
  assert.ok(rightUv <= 0.9 * anchor.aspect + 1e-9, 'right edge inside the phone width')
  const topPx = (project([point[0], point[1] + slab.size[1] * 0.9, point[2]], 0, width / height, true)?.y ?? 0) * height
  assert.ok(topPx > 80, `plate top ${topPx} clears the header`)
})

test('the ink anchor projects back onto the copy at rest and vanishes once the camera passes', () => {
  const width = 1440, height = 900, copyLeft = 86, copyTop = 652
  const anchor = anchorFor(width, height, copyLeft, copyTop)
  const slab = nameSlab(anchor)
  const point = inkAnchor(slab, anchor.ink)
  const rest = project(point, 0, width / height)
  assert.ok(rest)
  assert.ok(Math.abs(rest.x * width - copyLeft) < 1e-6, `left ${rest.x * width}`)
  assert.ok(Math.abs(rest.y * height - (copyTop - 40)) < 1e-6, `top ${rest.y * height}`)
  assert.ok(Math.abs(rest.depth - 6) < 1e-9)
  // Flying forward brings the plate closer and lower on screen, then past the camera.
  const mid = project(point, 0.2, width / height)
  assert.ok(mid && mid.depth < rest.depth && mid.y > rest.y)
  assert.equal(project(point, 0.6, width / height), null)
})
