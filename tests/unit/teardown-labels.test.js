import assert from 'node:assert/strict'
import test from 'node:test'
import { actWindows } from '../../src/components/teardown/timeline.ts'
import { poseAt } from '../../src/components/teardown/rig.ts'
import { cardShots, layoutCardLabels } from '../../src/components/teardown/labels.ts'
import { PARKIWELL } from '../../src/content/teardown/parkiwell.ts'

const windows = actWindows(PARKIWELL.acts)
const backdrops = PARKIWELL.acts.map((a) => a.backdrop)
const day = windows.find((w) => w.key === 'day')
const still = { dragYaw: 0, tiltX: 0, tiltY: 0 }

/**
 * A card label's box as teardown.css sizes it: 0.8rem JetBrains Mono at 0.6em a glyph, the "// " prefix, 11 px of
 * padding and a 1 px border each side, and a 1.35 line height. Past its max-width the label wraps to two lines at
 * that width. The max-width is 160px on wide stages under 1280px, none from 1280px, where labels never wrap, and
 * 100vw - 40px on phones.
 */
const labelSize = (text, width, narrow) => {
  const natural = (3 + text.length) * 0.6 * 12.8 + 24
  const max = narrow ? width - 40 : width >= 1280 ? Infinity : 160
  return natural > max ? { w: max, h: 2 * 1.35 * 12.8 + 12 } : { w: natural, h: 1.35 * 12.8 + 12 }
}

/** The day act at `local` on a `width` by `height` stage: each card's shot, each label's size, and the layout. */
const frame = (local, width, height, narrow = false) => {
  const aspect = width / height
  const pose = poseAt({ progress: day.start + (day.end - day.start) * local, windows, backdrops, narrow, aspect, interaction: still, poseFrames: PARKIWELL.pose.frames })
  const shots = cardShots(pose, aspect, width, height)
  const sizes = PARKIWELL.cards.map((card) => labelSize(card.label, width, narrow))
  return { pose, shots, sizes, places: layoutCardLabels(shots, sizes, { width, height }) }
}

/** 1024x768, 1280x800, 1440x900, and 1920x1080, which span aspects 1.33 to 1.78. */
const VIEWPORTS = [[1024, 768], [1280, 800], [1440, 900], [1920, 1080]]
/** Day act local at `wnd` of wide card `i`'s window, which opens at 0.06 + 0.14 i and lasts 0.28 of the act. */
const inCard = (i, wnd) => 0.06 + i * 0.14 + wnd * 0.28
const offset = ({ shots, sizes, places }, k) => places[k].left + sizes[k].w / 2 - shots[k].anchor.x
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
const boxOf = ({ sizes, places }, k) => ({ left: places[k].left, top: places[k].top, right: places[k].left + sizes[k].w, bottom: places[k].top + sizes[k].h })

/** Every shown label sits under its own card, overlaps no other shown label, and draws over no nearer card. */
const assertCoherent = (f, where) => {
  const shown = f.places.flatMap((place, k) => (place?.on ? [k] : []))
  for (const k of shown) {
    const centre = f.places[k].left + f.sizes[k].w / 2
    const rect = f.shots[k].rect
    assert.ok(centre > rect.left && centre < rect.right, `${where}: label ${k} at ${centre} is not under its card, ${rect.left} to ${rect.right}`)
    for (const j of shown) if (j > k) assert.ok(!overlaps(boxOf(f, k), boxOf(f, j)), `${where}: labels ${k} and ${j} overlap`)
    f.shots.forEach((other, j) => {
      if (j === k || other.opacity < 0.5 || other.depth >= f.shots[k].depth - 0.1) return
      assert.ok(!overlaps(boxOf(f, k), other.rect), `${where}: label ${k} draws over card ${j}, which is in front of its own`)
    })
  }
}

test('a held card shows its label centred under it, whatever is settling behind it', () => {
  for (const [width, height] of VIEWPORTS) {
    for (let i = 0; i < 4; i++) {
      for (const wnd of [0.3, 0.45, 0.6]) {
        const f = frame(inCard(i, wnd), width, height)
        const where = `${width}x${height} card ${i} at ${wnd} of its window`
        assert.equal(f.places[i].on, true, `${where}: the held card's label is hidden`)
        assert.ok(Math.abs(offset(f, i)) < 0.5, `${where}: the held card's label is pushed ${offset(f, i)} px`)
        assertCoherent(f, where)
      }
    }
  }
})

test('card 3 held in front of card 2 hides card 2\'s label and leaves the labels of cards 0 and 1', () => {
  // Card 2's slot is behind the spotlight, so while card 3 is held its label would hang under the wrong card.
  for (const [width, height] of VIEWPORTS) {
    for (const wnd of [0.3, 0.45, 0.6]) {
      const { places } = frame(inCard(3, wnd), width, height)
      assert.deepEqual(places.map((place) => place.on), [true, true, false, true], `${width}x${height} at ${wnd} of card 3's window`)
    }
  }
})

test('the finished row shows all four labels, each centred under its card', () => {
  for (const [width, height] of VIEWPORTS) {
    for (const local of [0.76, 0.88, 1]) {
      const f = frame(local, width, height)
      f.places.forEach((place, k) => {
        assert.equal(place.on, true, `${width}x${height} label ${k} at day ${local}`)
        assert.ok(Math.abs(offset(f, k)) < 0.5, `${width}x${height} label ${k} is pushed ${offset(f, k)} px at day ${local}`)
      })
    }
  }
})

test('through the whole wide day act every shown label names the card it sits under', () => {
  for (const [width, height] of VIEWPORTS) {
    for (let s = 0; s <= 200; s++) assertCoherent(frame(s / 200, width, height), `${width}x${height} at day ${s / 200}`)
  }
})

test('each narrow deck card shows its label only while it holds at the centre, centred under it', () => {
  // The deck window opens at 0.04 + 0.22 i and lasts 0.3 of the act, and the card is centred from 0.3 to 0.7 of it.
  // A deck card stays opaque until it reaches the frame's edge, so its label leaves once the card is no longer
  // whole in frame.
  // A sampled frame at the hold's start can land a hair short of a develop of 1, so 0.3 - 1e-6 is sampled too.
  for (let i = 0; i < 4; i++) {
    for (const wnd of [0.3 - 1e-6, 0.3, 0.5, 0.7]) {
      const f = frame(0.04 + i * 0.22 + wnd * 0.3, 390, 844, true)
      assert.deepEqual(f.places.map((place) => !!place?.on), [0, 1, 2, 3].map((k) => k === i), `deck card ${i} at ${wnd} of its window`)
      assert.ok(Math.abs(offset(f, i)) < 0.5, `deck card ${i} label is pushed ${offset(f, i)} px at ${wnd}`)
    }
    for (const wnd of [0.2, 0.8]) {
      assert.equal(frame(0.04 + i * 0.22 + wnd * 0.3, 390, 844, true).places[i]?.on ?? false, false, `deck card ${i} shows a label off the centre at ${wnd}`)
    }
  }
})
