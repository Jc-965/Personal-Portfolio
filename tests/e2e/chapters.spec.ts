import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { CHAPTERS } from '../../src/content/chapters/index.ts'

/**
 * Every generic chapter (src/content/chapters) behaves as the ParkiWell teardown does: the home page holds its
 * arrival as a preview that opens the journey at /<id>, Back returns to the preview, a direct load opens the
 * journey alone, reduced motion stacks the acts, and a missing WebGL2 context shows the story's poster.
 */

/** Puts the top of the chapter's track at the top of the viewport, where its arrival copy is shown. */
const showChapterStart = async (page: Page, id: string) => {
  await page.locator('#projects').scrollIntoViewIfNeeded()
  const chapter = page.locator(`#project-${id}`)
  await chapter.evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: 'instant' }))
  return chapter
}

const withoutWebGL2 = async (page: Page) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === 'webgl2') return null
      return Reflect.apply(getContext, this, [type, ...args])
    } as typeof getContext
  })
}

for (const story of Object.values(CHAPTERS)) {
  const { id, name } = story
  const close = story.acts[story.acts.length - 1]
  const closeLine = close.lines[0]
  /** The arrival's first line is the heading, which can differ from the name (Agoriai prints its lowercase wordmark). */
  const title = story.acts[0].lines[0]

  test(`the ${name} chapter keeps its whole story in the DOM`, async ({ page }) => {
    await page.goto('/')
    const chapter = await showChapterStart(page, id)
    await expect(chapter.getByRole('heading', { name: title, exact: true })).toBeVisible()
    for (const act of story.acts.slice(1)) {
      for (const line of act.lines) await expect(chapter).toContainText(line)
    }
    for (const link of story.links) await expect(chapter.getByRole('link', { name: new RegExp(link.label) })).toHaveAttribute('href', link.href)
  })

  test(`the ${name} centrepiece opens its journey and Back returns to the home preview`, async ({ page }) => {
    await page.goto('/')
    const chapter = await showChapterStart(page, id)
    await chapter.getByRole('button', { name: /step inside/ }).click()
    await expect(page).toHaveURL(new RegExp(`/${id}$`))
    await expect(page.locator('html')).toHaveClass(/journey-open/)
    await expect(chapter).toHaveClass(/teardown--journey/)
    await expect(page.locator('#journey')).toBeHidden()
    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('html')).not.toHaveClass(/journey-open/)
    await expect(chapter).toHaveClass(/teardown--preview/)
  })

  test(`a direct load of /${id} opens the ${name} journey with only the chapter shown`, async ({ page }) => {
    await page.goto(`/${id}`)
    await expect(page.locator('html')).toHaveClass(/journey-open/)
    await expect(page.locator(`#project-${id}`)).toHaveClass(/teardown--journey/)
    await expect(page.locator('.hero')).toBeHidden()
    await expect(page).toHaveTitle(new RegExp(name))
    await expect(page.getByRole('button', { name: /back/ })).toBeVisible()
  })

  if (story.links.length > 0) {
    test(`focus on a ${name} link scrolls the journey to its close act`, async ({ page }) => {
      await page.goto(`/${id}`)
      const chapter = page.locator(`#project-${id}`)
      const link = chapter.getByRole('link', { name: new RegExp(story.links[0].label) })
      await link.focus()
      await expect(chapter).toHaveAttribute('data-act', close.key)
      await expect(link).toBeInViewport()
    })
  }

  test(`reduced motion stacks the ${name} chapter with every act reachable`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.locator('#projects').scrollIntoViewIfNeeded()
    const chapter = page.locator(`#project-${id}`)
    await expect(chapter).toHaveClass(/teardown--static/)
    expect(await chapter.locator('.teardown__stage').evaluate((el) => getComputedStyle(el).position)).not.toBe('sticky')
    await chapter.getByRole('button', { name: /step inside/ }).click()
    await expect(page).toHaveURL(new RegExp(`/${id}$`))
    const last = chapter.getByText(closeLine)
    await last.scrollIntoViewIfNeeded()
    await expect(last).toBeInViewport()
  })

  test(`without WebGL2 the ${name} chapter keeps its pin and shows its poster`, async ({ page }) => {
    await withoutWebGL2(page)
    await page.goto('/')
    const chapter = await showChapterStart(page, id)
    await chapter.evaluate((el) => window.scrollBy({ top: el.querySelector('.teardown__stage')!.clientHeight * 0.3, behavior: 'instant' }))
    await expect(chapter.locator('.story__poster img')).toBeVisible()
    expect(await chapter.locator('.teardown__stage').evaluate((el) => getComputedStyle(el).position)).toBe('sticky')
  })

  test(`the ${name} chapter passes serious accessibility checks`, async ({ page }) => {
    await page.goto('/')
    await showChapterStart(page, id)
    const results = await new AxeBuilder({ page }).include(`#project-${id}`).analyze()
    const blocking = results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')
    expect(blocking, blocking.map(({ id: rule, help }) => `${rule}: ${help}`).join('\n')).toEqual([])
  })
}
