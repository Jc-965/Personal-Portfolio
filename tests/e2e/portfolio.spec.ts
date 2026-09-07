import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const expectNoSeriousAxeViolations = async (page: Page) => {
  const results = await new AxeBuilder({ page }).analyze()
  const blocking = results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')
  expect(blocking, blocking.map(({ id, help }) => `${id}: ${help}`).join('\n')).toEqual([])
}

test('portfolio renders immediately with recruiter contact paths', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1.hero__title-sr')).toContainText('Building technology')
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

test('Grid exposes every landmark through reduced-motion travel and contextual panels', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'The Grid targets the desktop fidelity tier.')
  test.slow()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?grid=1')

  const grid = page.getByRole('dialog', { name: 'The Grid — interactive 3D portfolio' })
  await expect(grid).toHaveAttribute('data-grid-phase', 'active', { timeout: 20_000 })

  const destinationButtons = page.locator('.grid-hud__document button')
  expect(await destinationButtons.count()).toBeGreaterThan(20)
  await page.evaluate(() => (window as typeof window & { __grid: { travel: (id: string) => void } }).__grid.travel('platform:blue-shield'))
  await page.evaluate(() => (window as typeof window & { __grid: { session: { interact: (id: string) => void } } }).__grid.session.interact('platform:blue-shield'))
  await expect(page.getByRole('navigation', { name: 'Career timeline' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Blue Shield of California' })).toBeVisible()
  await page.getByRole('button', { name: /02\s+ScottyLabs/ }).click()
  await expect(page.getByRole('heading', { name: 'ScottyLabs AI · CMUGPT' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'fly to stop' })).toBeVisible()
  await page.getByRole('button', { name: 'fly to stop' }).click()
  await expect(page.getByRole('button', { name: 'release camera' })).toBeVisible()
  await page.getByRole('button', { name: /stop 3/i }).click()
  await expect(page.getByRole('button', { name: 'release camera' })).toBeVisible()

  await page.evaluate(() => (window as typeof window & { __grid: { travel: (id: string) => void } }).__grid.travel('interior:agoriai'))
  await page.evaluate(() => (window as typeof window & { __grid: { session: { interact: (id: string) => void } } }).__grid.session.interact('interior:agoriai'))
  await expect(page.getByRole('region', { name: 'Agoriai' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'open case study ↗' })).toHaveAttribute(
    'href',
    '/projects/agoriai/',
  )

  await page.evaluate(() => (window as typeof window & { __grid: { travel: (id: string) => void } }).__grid.travel('sky'))
  const skyPanel = page.locator('.grid-hud__panel--sky')
  await skyPanel.getByRole('button', { name: /choose sky position|reposition in sky/ }).click()
  await expect(grid).toHaveAttribute('data-grid-sky-placing', 'true')
  await expect(skyPanel.getByRole('button', { name: 'cancel placement' })).toBeVisible()
})

test('Grid suppresses movement while typing and restores the pose after photo mode', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'The Grid targets the desktop fidelity tier.')
  test.slow()
  await page.goto('/?grid=1')
  await expect(page.locator('.grid-overlay')).toHaveAttribute('data-grid-phase', 'active', { timeout: 20_000 })
  await page.evaluate(() => {
    const input = document.createElement('input')
    input.id = 'grid-navigation-focus-test'
    document.querySelector('.grid-overlay')?.append(input)
    input.focus()
  })
  const beforeTyping = await page.evaluate(() => (window as typeof window & { __grid: { session: { position: { x: number; z: number } } } }).__grid.session.position)
  await page.keyboard.down('w'); await page.waitForTimeout(250); await page.keyboard.up('w')
  const afterTyping = await page.evaluate(() => (window as typeof window & { __grid: { session: { position: { x: number; z: number } } } }).__grid.session.position)
  expect(afterTyping).toEqual(beforeTyping)
  await page.keyboard.press('Escape')
  const pose = await page.evaluate(() => { const grid = (window as typeof window & { __grid: { session: { position: unknown; togglePhoto: () => void } } }).__grid; grid.session.togglePhoto(); return grid.session.position })
  await page.waitForTimeout(100)
  await page.evaluate(() => (window as typeof window & { __grid: { session: { togglePhoto: () => void } } }).__grid.session.togglePhoto())
  expect(await page.evaluate(() => (window as typeof window & { __grid: { session: { position: unknown } } }).__grid.session.position)).toEqual(pose)
})
