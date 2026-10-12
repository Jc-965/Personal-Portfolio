import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const expectNoSeriousAxeViolations = async (page: Page) => {
  const results = await new AxeBuilder({ page }).analyze()
  const blocking = results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')
  expect(blocking, blocking.map(({ id, help }) => `${id}: ${help}`).join('\n')).toEqual([])
}

/**
 * Puts the top of the ParkiWell track at the top of the viewport. The chapter
 * heading is in the arrival act, which is visible only at the start of the
 * track, and scrollIntoViewIfNeeded centres the tall #projects section deep
 * inside the track.
 */
const showTeardownStart = async (page: Page) => {
  await page.locator('#projects').scrollIntoViewIfNeeded()
  const chapter = page.locator('#project-parkiwell')
  await chapter.evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: 'instant' }))
  return chapter
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
  expect(requested.some((url) => /Sketchbook|three-sketchbook|firebase|Constellation|TeardownCanvas|ChapterCanvas|\/ParkiWell\/hd\/|\/(Agoriai|Tarocchi|MyCommunity)\/chapter\//.test(url))).toBe(false)
})

test('every project is told as a chapter without case-study links', async ({ page }) => {
  await page.goto('/')
  const chapter = await showTeardownStart(page)
  const projects = page.locator('#projects')
  await expect(chapter.getByRole('heading', { name: 'ParkiWell', exact: true })).toBeVisible()
  await expect(projects.locator('a[href^="/projects/"]')).toHaveCount(0)
  for (const id of ['parkiwell', 'agoriai', 'tarocchi', 'mycommunity']) await expect(projects.locator(`#project-${id}`)).toHaveClass(/teardown/)
})

test('the toolkit terminal keeps its height while the opening command types', async ({ page }) => {
  await page.goto('/')
  await page.locator('#skills').scrollIntoViewIfNeeded()
  const terminal = page.locator('.toolkit__terminal')
  await expect(terminal).toBeVisible()
  const before = (await terminal.boundingBox())!.height
  // The prompt appears once the intro has typed and printed the skills tree.
  await expect(page.locator('.toolkit__form')).toBeVisible({ timeout: 10_000 })
  const after = (await terminal.boundingBox())!.height
  expect(Math.abs(after - before)).toBeLessThanOrEqual(1)
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

test('the ParkiWell teardown keeps its whole story in the DOM', async ({ page }) => {
  await page.goto('/')
  const chapter = await showTeardownStart(page)
  await expect(chapter.getByRole('heading', { name: 'ParkiWell', exact: true })).toBeVisible()
  for (const text of [
    'An app for managing everyday life with Parkinson’s.',
    'Large controls with room to tap',
    'Keep track of doses',
    'Saved changes sync when you reconnect',
    'Offline symptom and dose tracking',
    'Motion coach, in development',
    'Coming to iPhone and Android.',
  ]) await expect(chapter).toContainText(text)
  await expect(chapter.getByRole('link', { name: /parkiwell\.com/ })).toHaveAttribute('href', 'https://parkiwell.com')
})

test('the phone opens the ParkiWell journey and Back returns to the home preview', async ({ page }) => {
  await page.goto('/')
  const chapter = await showTeardownStart(page)
  await chapter.getByRole('button', { name: /open the teardown/ }).click()
  await expect(page).toHaveURL(/\/parkiwell$/)
  await expect(page.locator('html')).toHaveClass(/journey-open/)
  await expect(chapter).toHaveClass(/teardown--journey/)
  await expect(page.locator('#journey')).toBeHidden()
  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('html')).not.toHaveClass(/journey-open/)
  await expect(chapter).toHaveClass(/teardown--preview/)
})

test('a direct load of /parkiwell opens the journey with only the chapter shown', async ({ page }) => {
  await page.goto('/parkiwell')
  await expect(page.locator('html')).toHaveClass(/journey-open/)
  await expect(page.locator('#project-parkiwell')).toHaveClass(/teardown--journey/)
  await expect(page.locator('.hero')).toBeHidden()
  await expect(page.getByRole('button', { name: /back/ })).toBeVisible()
})

test('focus on a teardown link scrolls the journey to its close act', async ({ page }) => {
  await page.goto('/parkiwell')
  const chapter = page.locator('#project-parkiwell')
  const link = chapter.getByRole('link', { name: /parkiwell\.com/ })
  await link.focus()
  await expect(chapter).toHaveAttribute('data-act', 'close')
  await expect(link).toBeInViewport()
})

test('without WebGL2 the teardown keeps its pin and shows the DOM stage', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === 'webgl2') return null
      return Reflect.apply(getContext, this, [type, ...args])
    } as typeof getContext
  })
  await page.goto('/')
  await page.locator('#projects').scrollIntoViewIfNeeded()
  const chapter = page.locator('#project-parkiwell')
  await chapter.scrollIntoViewIfNeeded()
  await expect(chapter).toHaveClass(/is-dom/)
  await expect(chapter.locator('.teardown__dom-stage .phone-frame.is-active img')).toBeVisible()
  expect(await chapter.locator('.teardown__stage').evaluate((el) => getComputedStyle(el).position)).toBe('sticky')
})

test('reduced motion stacks the teardown with every act reachable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.locator('#projects').scrollIntoViewIfNeeded()
  const chapter = page.locator('#project-parkiwell')
  await expect(chapter).toHaveClass(/teardown--static/)
  expect(await chapter.locator('.teardown__stage').evaluate((el) => getComputedStyle(el).position)).not.toBe('sticky')
  // The home preview stacks the arrival alone, and the open button leads to the stack of every act.
  await chapter.getByRole('button', { name: /open the teardown/ }).click()
  await expect(page).toHaveURL(/\/parkiwell$/)
  const close = chapter.getByText('Coming to iPhone and Android.')
  await close.scrollIntoViewIfNeeded()
  await expect(close).toBeInViewport()
})

test('the teardown chapter passes serious accessibility checks', async ({ page }) => {
  await page.goto('/')
  await page.locator('#projects').scrollIntoViewIfNeeded()
  await page.locator('#project-parkiwell').scrollIntoViewIfNeeded()
  const results = await new AxeBuilder({ page }).include('#project-parkiwell').analyze()
  const blocking = results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')
  expect(blocking, blocking.map(({ id, help }) => `${id}: ${help}`).join('\n')).toEqual([])
})
