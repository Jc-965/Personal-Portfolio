import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

// Run against a production preview. Keep viewport, sampling time and browser
// identical between builds; this is a local benchmark, not a Lighthouse score.
const baseURL = process.env.PERF_URL || 'http://127.0.0.1:4397'
const output = process.argv[2] || 'output/playwright/performance/current'
const runs = Number(process.env.PERF_RUNS || 3)
await mkdir(output, { recursive: true })
const browser = await chromium.launch()
const results = []

function instrument() {
  const stats = { raf: 0, clears: 0, clearPixels: 0, draws: 0, longTasks: 0, longTaskMs: 0 }
  window.__perf = stats
  const raf = window.requestAnimationFrame
  window.requestAnimationFrame = (callback) => raf.call(window, (time) => { stats.raf++; callback(time) })
  const clear = CanvasRenderingContext2D.prototype.clearRect
  CanvasRenderingContext2D.prototype.clearRect = function (...args) {
    if (this.canvas.className === 'cursor-canvas') {
      stats.clears++
      const transform = this.getTransform()
      stats.clearPixels += Math.abs(args[2] * args[3] * (transform.a * transform.d - transform.b * transform.c))
    }
    return Reflect.apply(clear, this, args)
  }
  for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
    const original = WebGL2RenderingContext.prototype[method]
    WebGL2RenderingContext.prototype[method] = function (...args) {
      stats.draws++
      return Reflect.apply(original, this, args)
    }
  }
  new PerformanceObserver((list) => {
    for (const task of list.getEntries()) { stats.longTasks++; stats.longTaskMs += task.duration }
  }).observe({ type: 'longtask', buffered: true })
}

async function sample(page, cdp, name, run, device, readyMs = null) {
  await cdp.send('HeapProfiler.collectGarbage')
  const before = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]))
  const start = await page.evaluate(() => ({ ...window.__perf, time: performance.now() }))
  await page.waitForTimeout(2000)
  const after = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]))
  const info = await page.evaluate(() => ({
    ...window.__perf,
    time: performance.now(),
    canvases: [...document.querySelectorAll('canvas')].map(c => ({ class: c.className, width: c.width, height: c.height })),
    resources: performance.getEntriesByType('resource').map(r => ({ url: r.name.replace(location.origin, ''), bytes: r.encodedBodySize })),
    paints: performance.getEntriesByType('paint').map(p => ({ name: p.name, ms: p.startTime })),
  }))
  const duration = (info.time - start.time) / 1000
  const result = {
    name, run, device, readyMs,
    heapMiB: before.JSHeapUsedSize / 1048576,
    taskMsPerSecond: (after.TaskDuration - before.TaskDuration) * 1000 / duration,
    layoutMsPerSecond: (after.LayoutDuration - before.LayoutDuration) * 1000 / duration,
    rafPerSecond: (info.raf - start.raf) / duration,
    drawsPerSecond: (info.draws - start.draws) / duration,
    cursorClearPixelsPerSecond: (info.clearPixels - start.clearPixels) / duration,
    longTasks: info.longTasks,
    longTaskMs: info.longTaskMs,
    resourceBytes: info.resources.reduce((sum, r) => sum + r.bytes, 0),
    ...Object.fromEntries(['canvases', 'resources', 'paints'].map(k => [k, info[k]])),
  }
  results.push(result)
  if (run === 0) await page.screenshot({ path: `${output}/${device}-${name}.png` })
  console.log(JSON.stringify({ ...result, canvases: undefined, resources: undefined, paints: undefined }))
  await writeFile(`${output}/results.json`, JSON.stringify({ browser: browser.version(), baseURL, results }, null, 2))
}

try {
  for (const device of ['desktop', 'mobile']) {
    for (let run = 0; run < runs; run++) {
      const context = await browser.newContext(device === 'desktop'
        ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
        : { viewport: { width: 393, height: 851 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
      // Never write visitor data during measurement, and make external services
      // deterministic. Font responses remain real and are allowed to finish.
      await context.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.addInitScript(instrument)
      const cdp = await context.newCDPSession(page)
      await cdp.send('Performance.enable')
      await page.goto(baseURL)
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(3500)
      await sample(page, cdp, 'landing', run, device)
      const previewStarted = performance.now()
      await page.locator('#projects').scrollIntoViewIfNeeded()
      await page.locator('#project-parkiwell').evaluate(el => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: 'instant' }))
      await page.waitForFunction(() => document.querySelector('#project-parkiwell')?.classList.contains('is-gl'), null, { timeout: 30000 })
      const previewReadyMs = performance.now() - previewStarted
      await page.waitForTimeout(3500)
      if (device === 'desktop') await page.mouse.move(1100, 700)
      await page.waitForTimeout(3000)
      await sample(page, cdp, 'project-preview', run, device, previewReadyMs)
      if (device === 'desktop') {
        await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseleave')))
        await page.waitForTimeout(1500)
        await sample(page, cdp, 'pointer-away', run, device)
      }
      if (errors.length) throw new Error(errors.join('\n'))
      await context.close()
    }
  }
} finally {
  await browser.close()
}
