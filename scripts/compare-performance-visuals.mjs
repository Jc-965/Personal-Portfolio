import { chromium } from '@playwright/test'
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
// Compare settled production pages. Animated content may differ in phase; retain
// screenshots and layout state for review rather than treating them as baselines.
const output = process.argv[2] || 'output/playwright/performance/visuals'
const urls = process.argv.slice(3)
if (urls.length !== 2) throw new Error('Provide before and after production URLs after the output directory.')
await mkdir(output, { recursive: true })
const browser = await chromium.launch()
const cases = [
  { name: 'parkiwell-preview', path: '/', selector: '#project-parkiwell', progress: 0.7 },
  { name: 'parkiwell-journey', path: '/parkiwell', selector: '#project-parkiwell', progress: 0.55 },
  { name: 'agoriai-journey', path: '/agoriai', selector: '#project-agoriai', progress: 0.55 },
  { name: 'tarocchi-preview', path: '/', selector: '#project-tarocchi', progress: 0.7 },
  { name: 'tarocchi-journey', path: '/tarocchi', selector: '#project-tarocchi', progress: 0.55 },
  { name: 'mycommunity-preview', path: '/', selector: '#project-mycommunity', progress: 0.7 },
  { name: 'mycommunity-journey', path: '/mycommunity', selector: '#project-mycommunity', progress: 0.55 },
  { name: 'role-journey', path: '/blue-shield', selector: '.role-journey', progress: 0.3 },
]
const selectedCases = new Set((process.env.PERF_CASES || '').split(',').filter(Boolean))
const results = []
try {
  for (const device of ['desktop', 'mobile']) {
    for (const scenario of cases) {
      if (selectedCases.size && !selectedCases.has(scenario.name)) continue
      const images = []
      const states = []
      for (const [version, url] of urls.entries()) {
        const context = await browser.newContext(device === 'desktop'
          ? { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }
          : { viewport: { width: 393, height: 851 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
        await context.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
        const page = await context.newPage()
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        await page.goto(new URL(scenario.path, url).href)
        await page.evaluate(() => document.fonts.ready)
        if (scenario.path === '/') await page.locator('#projects').scrollIntoViewIfNeeded()
        const section = page.locator(scenario.selector)
        await section.evaluate((el, progress) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + (el.clientHeight - innerHeight) * progress, behavior: 'instant' }), scenario.progress)
        if (scenario.selector.startsWith('#project-')) {
          await page.waitForFunction(selector => document.querySelector(selector)?.classList.contains('is-gl'), scenario.selector, { timeout: 60000 })
        }
        await page.waitForTimeout(8000)
        // Re-land after font/content layout has settled, identically in both builds.
        await section.evaluate((el, progress) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + (el.clientHeight - innerHeight) * progress, behavior: 'instant' }), scenario.progress)
        await page.waitForTimeout(2500)
        states.push(await section.evaluate(el => ({ y: scrollY, height: el.clientHeight, classes: el.className, act: el.dataset.act })))
        const path = `${output}/${device}-${scenario.name}-${version === 0 ? 'before' : 'after'}.png`
        await page.screenshot({ path, animations: 'disabled' })
        images.push(await sharp(path).raw().toBuffer({ resolveWithObject: true }))
        if (errors.length) throw new Error(errors.join('\n'))
        await context.close()
      }
      let sum = 0, changed = 0
      for (let i = 0; i < images[0].data.length; i++) {
        const delta = Math.abs(images[0].data[i] - images[1].data[i])
        sum += delta
        if (delta > 16) changed++
      }
      const result = { device, scenario: scenario.name, meanAbsoluteChannelDifference: sum / images[0].data.length, channelsDifferingByMoreThan16Percent: changed * 100 / images[0].data.length, states }
      results.push(result)
      console.log(JSON.stringify(result))
    }
  }
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2))
  await browser.close()
}
