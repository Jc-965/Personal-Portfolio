import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const expectNoSeriousAxeViolations = async (page: Page) => {
  const results = await new AxeBuilder({ page }).analyze()
  const blocking = results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')
  expect(blocking, blocking.map(({ id, help }) => `${id}: ${help}`).join('\n')).toEqual([])
}

test('portfolio renders immediately with recruiter contact paths', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1.hero__name')).toContainText('Jesse Chen')
  // Recruiter contact paths live in the footer (hero quick links were removed).
  await expect(page.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', /github\.com/)
  await expect(page.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute('href', /linkedin\.com/)
  await expect(page.getByRole('button', { name: 'Send an email' })).toBeVisible()

  await page.locator('#projects').scrollIntoViewIfNeeded()
  await expect(page.getByRole('heading', { name: 'Agoriai' })).toBeVisible()
})

test('keyboard navigation and the main page pass serious accessibility checks', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await expectNoSeriousAxeViolations(page)
})

test('case-study pages render canonical project content and pass accessibility checks', async ({ page }) => {
  await page.goto('/projects/agoriai/')
  await expect(page.getByRole('heading', { level: 1, name: 'Agoriai' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'What had to be solved' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', 'mailto:jcchen54@gmail.com')
  await expectNoSeriousAxeViolations(page)
})

test('first load does not fetch constellation or sketchbook feature chunks', async ({ page }) => {
  const requested: string[] = []
  page.on('request', (request) => requested.push(request.url()))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)

  // The hero's tree-shaken renderer is expected; the full Three.js engine and
  // below-the-fold feature chunks must remain gated behind user intent.
  expect(requested.some((url) => /Sketchbook|three-sketchbook|firebase|Constellation/.test(url))).toBe(false)
})

test('projects retain their gallery presentation without case-study links', async ({ page }) => {
  await page.goto('/')
  await page.locator('#projects').scrollIntoViewIfNeeded()
  const projects = page.locator('#projects')
  await expect(projects.getByRole('heading', { name: 'ParkiWell', exact: true })).toBeVisible()
  await expect(projects.locator('a[href^="/projects/"]')).toHaveCount(0)
  const gallery = projects.locator('.gallery').first()
  await gallery.getByRole('button', { name: 'Next screenshot' }).click()
  await expect(gallery.locator('.gallery__count')).toContainText('02 /')
  await gallery.getByRole('button', { name: 'Previous screenshot' }).click()
  await expect(gallery.locator('.gallery__count')).toContainText('01 /')
})

test('short landscape keeps the hero introduction in the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/')
  // The claim is the last line of hero copy, so if it fits, all of it fits.
  const claim = page.locator('.hero__claim')
  await expect(claim).toBeInViewport()
  const bounds = await claim.boundingBox()
  expect(bounds!.y).toBeGreaterThan(76)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(390)
  await expect(page.locator('.hero__copy')).not.toHaveAttribute('inert')
})

test('reduced motion uses a single-screen opening and reachable content', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const height = await page.locator('.hero').evaluate(el => el.getBoundingClientRect().height)
  expect(height).toBeLessThanOrEqual(Math.max(page.viewportSize()!.height, 620))
  await expect(page.locator('.hero__claim')).toBeInViewport()
  await page.locator('#journey').scrollIntoViewIfNeeded()
  await expect(page.getByRole('heading', { name: 'From research labs to shipped products' })).toBeVisible()
})

test('a missing WebGL context leaves a readable, usable landing page', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === 'webgl2') return null
      return Reflect.apply(getContext, this, [type, ...args])
    } as typeof getContext
  })
  await page.goto('/')
  await expect(page.locator('.hero')).toHaveClass(/hero--fallback/)
  await expect(page.locator('.hero__claim')).toBeInViewport()
  await expect(page.locator('.hero__copy')).not.toHaveAttribute('inert')
})
