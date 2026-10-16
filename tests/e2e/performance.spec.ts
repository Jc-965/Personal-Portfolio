import { expect, test } from '@playwright/test'

test('smooth scrolling wakes after idle for wheel input and navigation links', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Touch devices keep native scrolling.')
  await page.goto('/')
  await expect(page.locator('html')).toHaveClass(/lenis-active/)
  await page.waitForTimeout(1200)
  await page.mouse.wheel(0, 450)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300)
  await page.waitForTimeout(1500)
  const resting = await page.evaluate(() => window.scrollY)
  await page.mouse.wheel(0, 300)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(resting + 200)
  await page.waitForTimeout(1500)
  await page.mouse.wheel(0, -150)
  await page.locator('.nav a[href="#top"]').click()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(2)
})

test('the cursor uses a small backing store and stops painting after leaving', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Touch devices use the native pointer.')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.clearRect
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      const canvas = this.canvas as HTMLCanvasElement
      if (canvas.className === 'cursor-canvas') canvas.dataset.paints = String(Number(canvas.dataset.paints || 0) + 1)
      return Reflect.apply(original, this, args)
    }
  })
  await page.goto('/')
  await page.mouse.move(400, 300)
  const cursor = page.locator('.cursor-canvas')
  await expect.poll(() => cursor.evaluate((c: HTMLCanvasElement) => c.width * c.height)).toBeGreaterThan(100)
  await expect.poll(() => cursor.evaluate((c: HTMLCanvasElement) => c.width * c.height)).toBeLessThan(100_000)
  // A quick crossing must keep the lagging ring and trail inside the crop.
  await page.mouse.move(900, 450)
  await page.waitForTimeout(600)
  await expect.poll(() => cursor.evaluate((c: HTMLCanvasElement) => c.width * c.height)).toBeLessThan(100_000)
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseleave')))
  await page.waitForTimeout(1200)
  const paints = await cursor.getAttribute('data-paints')
  await page.waitForTimeout(400)
  expect(await cursor.getAttribute('data-paints')).toBe(paints)
  // Re-entering still starts the rotating reticle.
  await page.mouse.move(420, 320)
  await expect.poll(() => cursor.getAttribute('data-paints')).not.toBe(paints)
})

for (const [id, journeyArt] of [
  ['parkiwell', '/ParkiWell/hd/log.webp'],
  ['agoriai', '/Agoriai/chapter/screens/feed.webp'],
] as const) {
  test(`${id} defers journey artwork and fetches it on entry`, async ({ page }) => {
    test.setTimeout(60_000)
    const requested: string[] = []
    page.on('request', request => requested.push(new URL(request.url()).pathname))
    await page.goto('/')
    await page.locator('#projects').scrollIntoViewIfNeeded()
    const chapter = page.locator(`#project-${id}`)
    await chapter.evaluate(el => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: 'instant' }))
    await expect(chapter).toHaveClass(/is-gl/, { timeout: 30_000 })
    expect(requested).not.toContain(journeyArt)
    await chapter.locator('.teardown__open').click()
    await expect(page).toHaveURL(new RegExp(`/${id}$`))
    await expect.poll(() => requested).toContain(journeyArt)
    await expect(chapter).toHaveClass(/is-gl/)
  })
}

test('ParkiWell releases its distant canvas and rebuilds when approached again', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.locator('#projects').scrollIntoViewIfNeeded()
  const chapter = page.locator('#project-parkiwell')
  const approach = () => chapter.evaluate(el => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: 'instant' }))
  await approach()
  await expect(chapter).toHaveClass(/is-gl/, { timeout: 30_000 })
  await expect(chapter.locator('canvas')).toHaveCount(1)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await expect(chapter.locator('canvas')).toHaveCount(0)
  await approach()
  await expect(chapter.locator('canvas')).toHaveCount(1)
  await expect.poll(() => chapter.locator('canvas').evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(300)
  await expect(chapter).not.toHaveClass(/is-loading|is-dom/)
})
