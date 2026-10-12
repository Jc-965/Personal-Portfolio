import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'

/**
 * Every role in the Journey section is a row with an island that opens the role's journey at /<id>. Back returns
 * to the row, a direct load opens the journey alone, the stops rail moves between roles without growing the
 * history, reduced motion stacks the acts with the poster, and a missing WebGL2 context leaves posters in the rows.
 */
const portfolio = JSON.parse(readFileSync(new URL('../../src/content/portfolio.json', import.meta.url), 'utf8')) as {
  experiences: { id: string; company: string }[]
}
const roles = portfolio.experiences

const showRow = async (page: Page, id: string) => {
  await page.locator('#journey').scrollIntoViewIfNeeded()
  const row = page.locator(`#role-${id}`)
  await row.scrollIntoViewIfNeeded()
  return row
}

for (const { id, company } of roles) {
  test(`the ${company} row opens its journey and Back returns to the row`, async ({ page }) => {
    await page.goto('/')
    const row = await showRow(page, id)
    await expect(row.getByRole('heading', { name: company })).toBeVisible()
    await row.getByRole('button', { name: /explore the journey/i }).click()
    await expect(page).toHaveURL(new RegExp(`/${id}$`))
    await expect(page.locator('html')).toHaveClass(/roles-open/)
    await expect(page.locator(`.role-journey--${id}`)).toBeVisible()
    await expect(page.locator('.hero')).toBeHidden()
    await expect(page).toHaveTitle(new RegExp(company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('html')).not.toHaveClass(/roles-open/)
    await expect(page.locator(`#role-${id}`)).toBeInViewport()
  })

  test(`a direct load of /${id} opens the ${company} journey alone`, async ({ page }) => {
    await page.goto(`/${id}`)
    await expect(page.locator('html')).toHaveClass(/roles-open/)
    await expect(page.locator(`.role-journey--${id}`)).toBeVisible()
    await expect(page.locator('.roles__list')).toBeHidden()
    await expect(page.locator('#projects')).toBeHidden()
    await expect(page.getByRole('button', { name: /back/ })).toBeVisible()
  })
}

test('the stops rail moves between roles without adding history entries', async ({ page }) => {
  const [first, second] = roles
  await page.goto('/')
  const row = await showRow(page, first.id)
  await row.getByRole('button', { name: /explore the journey/i }).click()
  await expect(page).toHaveURL(new RegExp(`/${first.id}$`))
  await page.getByRole('navigation', { name: 'Other roles' }).getByRole('button', { name: second.company }).click()
  await expect(page).toHaveURL(new RegExp(`/${second.id}$`))
  await expect(page.locator(`.role-journey--${second.id}`)).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('html')).not.toHaveClass(/roles-open/)
})

test('scrolling on past a role leads to the next role, and past the last role leads home', async ({ page }) => {
  for (let i = 0; i < roles.length; i++) {
    await page.goto(`/${roles[i].id}`)
    const hint = page.locator(`.role-journey--${roles[i].id} .teardown__return`)
    if (i < roles.length - 1) await expect(hint).toContainText(roles[i + 1].company)
    else await expect(hint).toContainText('return home')
  }
})

test('Escape closes a role journey', async ({ page }) => {
  const { id } = roles[3]
  await page.goto('/')
  const row = await showRow(page, id)
  await row.getByRole('button', { name: /explore the journey/i }).click()
  await expect(page.locator('html')).toHaveClass(/roles-open/)
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('html')).not.toHaveClass(/roles-open/)
})

test('reduced motion shows posters in the rows and stacks a journey with every act reachable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const { id } = roles[0]
  await page.goto('/')
  const row = await showRow(page, id)
  await expect(page.locator('.roles')).toHaveClass(/roles--static/)
  await expect(row.locator('.roles__island img')).toBeVisible()
  await row.getByRole('button', { name: /explore the journey/i }).click()
  const journey = page.locator(`.role-journey--${id}`)
  await expect(journey).toHaveClass(/teardown--static/)
  const last = journey.locator('.teardown__act--close .teardown__tags')
  await last.scrollIntoViewIfNeeded()
  await expect(last).toBeInViewport()
})

test('without WebGL2 the rows keep their posters', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === 'webgl2') return null
      return Reflect.apply(getContext, this, [type, ...args])
    } as typeof getContext
  })
  await page.goto('/')
  const row = await showRow(page, roles[0].id)
  await expect(page.locator('.roles')).toHaveClass(/roles--static/)
  await expect(row.locator('.roles__island img')).toBeVisible()
})

test('the Journey section and a role journey pass serious accessibility checks', async ({ page }) => {
  await page.goto('/')
  // The header fades in as it enters the viewport, and a check mid-fade measures its text at partial opacity.
  await page.locator('#journey').scrollIntoViewIfNeeded()
  const header = page.locator('#journey > .section__header')
  await header.scrollIntoViewIfNeeded()
  await expect(header).toHaveCSS('opacity', '1')
  await showRow(page, roles[0].id)
  let results = await new AxeBuilder({ page }).include('#journey').analyze()
  let blocking = results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')
  expect(blocking, blocking.map(({ id, help }) => `${id}: ${help}`).join('\n')).toEqual([])
  await page.goto(`/${roles[3].id}`)
  await expect(page.locator('.role-journey')).toBeVisible()
  results = await new AxeBuilder({ page }).include('.role-journey').analyze()
  blocking = results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')
  expect(blocking, blocking.map(({ id, help }) => `${id}: ${help}`).join('\n')).toEqual([])
})
